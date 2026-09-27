import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Checking your recovery link…')

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setReady(Boolean(data.session))
      setMessage(data.session ? '' : 'This recovery link is invalid or has expired. Request a new one from the sign-in page.')
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || (event !== 'PASSWORD_RECOVERY' && !session)) return
      setReady(true)
      setMessage('')
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  async function updatePassword(event: FormEvent) {
    event.preventDefault()
    if (password !== confirmation) {
      setMessage('Passwords do not match.')
      return
    }
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setMessage(error.message)
      return
    }
    setMessage('Password updated. Opening your diary…')
    window.setTimeout(() => window.location.replace('/app'), 700)
  }

  return <main className="login-page reset-page">
    <header className="login-header">
      <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">R</span><span>REELENDAR</span></a>
      <a href="/login" className="back-home">BACK TO SIGN IN</a>
    </header>
    <section className="reset-layout" aria-labelledby="reset-title">
      <div className="reset-card">
        <p className="dialog-kicker">ACCOUNT RECOVERY</p>
        <h1 id="reset-title">Choose a new<br /><em>password.</em></h1>
        <p className="dialog-intro">Use at least eight characters. Your active sessions remain protected by Supabase Auth.</p>
        {ready && <form className="auth-form" onSubmit={updatePassword}>
          <label><span>NEW PASSWORD</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required autoFocus /></label>
          <label><span>CONFIRM PASSWORD</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
          <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'UPDATING…' : 'UPDATE PASSWORD'}</button>
        </form>}
        {message && <p className="status-message" role="status">{message}</p>}
      </div>
    </section>
  </main>
}
