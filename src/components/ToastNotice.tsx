import { useCallback, useEffect, useRef, useState } from 'react'

export function ToastNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const close = useCallback(() => {
    setVisible(false)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(onDismiss, 180)
  }, [onDismiss])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true))
    const dismissTimer = window.setTimeout(close, 4800)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(dismissTimer)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [close, message])

  return <button
    className={`toast-notice ${visible ? 'is-visible' : ''}`}
    type="button"
    role="status"
    onClick={close}
    aria-label={`${message} Dismiss notification`}
  >
    <span aria-hidden="true">✓</span>
    <strong>{message}</strong>
    <small>CLICK TO DISMISS</small>
  </button>
}
