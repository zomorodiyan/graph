import { useCallback, useEffect, useRef, useState } from 'react'

// Browser speech in and out for the chat's voice mode — the Web Speech API
// (SpeechRecognition for listening, speechSynthesis for reading replies
// aloud), both built into Chrome/Edge/Safari and free: nothing leaves the
// device except the text the recognizer produced, which goes to the model
// like a typed message. Not every browser has recognition (Firefox doesn't),
// so the mic button is hidden where `supported` is false.

type RecognitionCtor = new () => SpeechRecognitionLike
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function recognitionCtor(): RecognitionCtor | null {
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && recognitionCtor() !== null && 'speechSynthesis' in window
}

// Chrome's synthesis silently stops partway through long utterances, so a
// reply is read as a queue of sentence-sized pieces instead of one block.
const MAX_CHUNK = 180
function chunkForSpeech(text: string): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + sentence).length > MAX_CHUNK && current) {
      chunks.push(current.trim())
      current = ''
    }
    current += sentence
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

interface UseVoiceOptions {
  // A finished utterance, ready to send.
  onTranscript: (text: string) => void
  // Live partial text while the user is still talking.
  onInterim: (text: string) => void
  // Listening ended without any words (silence, mic closed by the browser).
  onNoSpeech: () => void
  onError: (message: string) => void
}

export function useVoice({ onTranscript, onInterim, onNoSpeech, onError }: UseVoiceOptions) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  // Callbacks are read through refs so a recognition started in one render
  // calls the latest handlers, not the ones captured when it started.
  const handlers = useRef({ onTranscript, onInterim, onNoSpeech, onError })
  handlers.current = { onTranscript, onInterim, onNoSpeech, onError }
  const speakResolveRef = useRef<(() => void) | null>(null)

  const stopListening = useCallback(() => {
    const rec = recRef.current
    recRef.current = null
    if (rec) {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      try { rec.abort() } catch { /* already stopped */ }
    }
    setListening(false)
  }, [])

  // One utterance per start: the recognizer stops itself at the end of a
  // phrase (continuous mode is unreliable on phones), and the caller
  // restarts it for the next turn once the reply has been spoken.
  const startListening = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    stopListening()
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 1
    let finalText = ''
    let sawWords = false
    rec.onresult = (e: any) => {
      let interim = ''
      finalText = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        const t = r[0]?.transcript ?? ''
        if (r.isFinal) finalText += t
        else interim += t
      }
      const shown = (finalText + interim).trim()
      if (shown) sawWords = true
      handlers.current.onInterim(shown)
    }
    rec.onerror = (e: any) => {
      // 'no-speech' and 'aborted' are normal ends of a turn, handled in onend.
      if (e?.error === 'no-speech' || e?.error === 'aborted') return
      recRef.current = null
      setListening(false)
      const why = e?.error === 'not-allowed' || e?.error === 'service-not-allowed'
        ? 'Microphone access was blocked — allow it for this site to use voice.'
        : `Speech recognition failed (${e?.error ?? 'unknown'}).`
      handlers.current.onError(why)
    }
    rec.onend = () => {
      if (recRef.current !== rec) return
      recRef.current = null
      setListening(false)
      const text = finalText.trim()
      if (text) handlers.current.onTranscript(text)
      else if (!sawWords) handlers.current.onNoSpeech()
      else handlers.current.onNoSpeech()
    }
    recRef.current = rec
    setListening(true)
    try {
      rec.start()
    } catch (err) {
      recRef.current = null
      setListening(false)
      handlers.current.onError(err instanceof Error ? err.message : String(err))
    }
  }, [stopListening])

  const stopSpeaking = useCallback(() => {
    try { window.speechSynthesis?.cancel() } catch { /* unavailable */ }
    setSpeaking(false)
    const resolve = speakResolveRef.current
    speakResolveRef.current = null
    resolve?.()
  }, [])

  // Resolves once the whole text has been read (or speech was cancelled).
  const speak = useCallback((text: string): Promise<void> => {
    stopSpeaking()
    const synth = window.speechSynthesis
    const chunks = chunkForSpeech(text)
    if (!synth || !chunks.length) return Promise.resolve()
    return new Promise<void>(resolve => {
      speakResolveRef.current = resolve
      setSpeaking(true)
      const finish = () => {
        if (speakResolveRef.current !== resolve) return
        speakResolveRef.current = null
        setSpeaking(false)
        resolve()
      }
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk)
        u.lang = navigator.language || 'en-US'
        if (i === chunks.length - 1) {
          u.onend = finish
          u.onerror = finish
        }
        synth.speak(u)
      })
    })
  }, [stopSpeaking])

  // Nothing keeps talking or listening after the component goes away.
  useEffect(() => () => { stopListening(); stopSpeaking() }, [stopListening, stopSpeaking])

  return { supported: speechSupported(), listening, speaking, startListening, stopListening, speak, stopSpeaking }
}
