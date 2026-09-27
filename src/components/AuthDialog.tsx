import { FormEvent, useState } from 'react'
import { supabase } from '../lib/supabase'

type AuthMode = 'login' | 'register'

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      })

    setLoading(false)
    if (result.error) return setMessage(result.error.message)
    if (mode === 'register' && !result.data.session) {
      setMessage('Check your email to confirm your account, then sign in.')
      return
    }
    onClose()
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="close-button" type="button" onClick={onClose} aria-label="Close authentication dialog">×</button>
      <p className="dialog-kicker">YOUR PRIVATE ARCHIVE</p>
      <h2 id="auth-title">{mode === 'login' ? 'Welcome back.' : 'Keep every frame.'}</h2>
      <p className="dialog-intro">{mode === 'login' ? 'Sign in to reach your film diary on every device.' : 'Create an account to sync your diary and watchlist.'}</p>
      <form className="auth-form" onSubmit={submit}>
        <label><span>EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus /></label>
        <label><span>PASSWORD</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></label>
        {message && <p className="status-message" role="status">{message}</p>}
        <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'PLEASE WAIT…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
      </form>
      <button className="auth-switch" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage('') }}>
        {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
      </button>
    </section>
  </div>
}
