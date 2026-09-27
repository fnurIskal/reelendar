import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ToastNotice } from '../components/ToastNotice'
import { supabase } from '../lib/supabase'

type AuthMode = 'login' | 'register'

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isClapping, setIsClapping] = useState(false)
  const transitionTimers = useRef<number[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      if (data.session) window.location.replace('/app')
    })
  }, [])

  useEffect(() => () => transitionTimers.current.forEach(window.clearTimeout), [])

  function changeScene(event: ReactMouseEvent<HTMLButtonElement>) {
    if (isClapping) return
    const nextMode = mode === 'login' ? 'register' : 'login'
    setMessage('')

    if (event.detail === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMode(nextMode)
      return
    }

    transitionTimers.current.forEach(window.clearTimeout)
    transitionTimers.current = []
    setIsClapping(true)
    transitionTimers.current.push(window.setTimeout(() => setMode(nextMode), 330))
    transitionTimers.current.push(window.setTimeout(() => setIsClapping(false), 720))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        })

      if (result.error) return setMessage(result.error.message)
      if (mode === 'register') {
        const successMessage = result.data.session
          ? 'Account created. Your private film archive is ready.'
          : 'Account created. Check your email to confirm your address.'
        if (!result.data.session) {
          setToastMessage(successMessage)
          return
        }
        window.sessionStorage.setItem('reelendar.auth-toast', successMessage)
      }
      window.location.assign('/app')
    } catch {
      setMessage('Could not reach the account service. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function requestPasswordReset() {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setMessage('Enter your email address first.')
      return
    }
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    setMessage(error ? error.message : 'If an account exists for this email, a recovery link is on its way.')
  }

  async function signInWithGoogle() {
    setLoading(true)
    setMessage('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app` },
    })
    if (error) {
      setLoading(false)
      setMessage(error.message)
    }
  }

  return <main className="login-page">
    {toastMessage && <ToastNotice message={toastMessage} onDismiss={() => setToastMessage('')} />}
    <header className="login-header">
      <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">R</span><span>REELENDAR</span></a>
      <a href="/" className="back-home">← BACK HOME</a>
    </header>

    <section className="login-layout" aria-label="Reelendar account access">
      <div className={`clapperboard ${isClapping ? 'is-clapping' : ''}`} aria-busy={isClapping}>
        <button className="clapper-arm" type="button" onClick={changeScene} disabled={isClapping} aria-label={`Switch to ${mode === 'login' ? 'create account' : 'sign in'}`}>
          <span className="clapper-hinge" aria-hidden="true" />
          <span className="clapper-stripes" aria-hidden="true" />
          <span className="clapper-arm-meta"><i>SCENE</i><strong>{mode === 'login' ? '01' : '02'}</strong></span>
          <span className="clapper-arm-meta"><i>TAKE</i><strong>{mode === 'login' ? 'SIGN IN' : 'SIGN UP'}</strong></span>
          <span className="clapper-arm-meta clapper-roll"><i>YEAR</i><strong>{new Date().getFullYear()}</strong></span>
        </button>

        <div className="clapper-body">
          <div className="slate-metadata" aria-hidden="true">
            <span><i>PRODUCTION</i><strong>REELENDAR</strong></span>
            <span><i>FORMAT</i><strong>DIGITAL</strong></span>
            <span><i>DATE</i><strong>{new Date().getFullYear()}</strong></span>
          </div>

          <div className="clapper-scene" key={mode} aria-live="polite">
            <div className="clapper-scene-copy">
              <p>SCENE {mode === 'login' ? '01' : '02'} · {mode === 'login' ? 'RETURN' : 'FIRST TAKE'}</p>
              <h1>{mode === 'login' ? <>Welcome<br /><em>back.</em></> : <>Start your<br /><em>archive.</em></>}</h1>
              <span>{mode === 'login' ? 'Access saved films, ratings and notes.' : 'Create an account to sync films, ratings and notes.'}</span>
              <small>PRIVATE FILM DIARY</small>
            </div>

            <div className="clapper-form-panel">
              <form className="auth-form" onSubmit={submit}>
                <label><span>EMAIL</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required autoFocus /></label>
                <label><span>PASSWORD</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></label>
                {mode === 'login' && <button className="forgot-password" type="button" onClick={requestPasswordReset} disabled={loading}>FORGOT PASSWORD?</button>}
                {message && <p className="status-message" role="status">{message}</p>}
                <button className="auth-submit" type="submit" disabled={loading || isClapping}>{loading ? 'PLEASE WAIT…' : mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
              </form>
              <div className="auth-divider"><span>OR</span></div>
              <button className="oauth-button" type="button" onClick={signInWithGoogle} disabled={loading || isClapping}>CONTINUE WITH GOOGLE</button>
              <div className="clapper-switch">
                <span>{mode === 'login' ? 'NEED AN ACCOUNT?' : 'ALREADY HAVE AN ACCOUNT?'}</span>
                <button type="button" onClick={changeScene} disabled={isClapping}>{mode === 'login' ? 'CREATE ACCOUNT' : 'SIGN IN'} <i aria-hidden="true">↗</i></button>
              </div>
              <a className="guest-link" href="/app">CONTINUE AS GUEST →</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
}
