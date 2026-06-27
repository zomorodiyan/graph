import { useState, useEffect } from 'react'

const DISMISSED_KEY = 'ios-install-dismissed'

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !((navigator as { standalone?: boolean }).standalone)
}

export default function IosInstallBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isIosBrowser() && !localStorage.getItem(DISMISSED_KEY)) {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="ios-install-banner">
      <span className="ios-install-text">
        To install: tap <strong>Share</strong> <span className="ios-share-icon">⎙</span> then <strong>Add to Home Screen</strong>
      </span>
      <button className="ios-install-close" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  )
}
