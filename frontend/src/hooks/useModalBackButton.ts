import { useEffect, useRef } from 'react'

export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const modalOpenRef = useRef(false)
  const ignoreNextCloseRef = useRef(false)

  useEffect(() => {
    const handlePopState = () => {
      if (!modalOpenRef.current) return

      modalOpenRef.current = false
      ignoreNextCloseRef.current = true
      onClose()
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [onClose])

  useEffect(() => {
    if (isOpen && !modalOpenRef.current) {
      window.history.pushState({ modal: true }, '')
      modalOpenRef.current = true
      return
    }

    if (!isOpen && modalOpenRef.current) {
      modalOpenRef.current = false
      window.history.back()
      return
    }

    if (!isOpen && ignoreNextCloseRef.current) {
      ignoreNextCloseRef.current = false
    }
  }, [isOpen])
}