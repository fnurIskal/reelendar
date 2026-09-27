import { useEffect, useState } from 'react'
import App from './App'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

function currentPath() {
  return window.location.pathname.replace(/\/+$/, '') || '/'
}

export default function Root() {
  const [path, setPath] = useState(currentPath)

  useEffect(() => {
    const updatePath = () => setPath(currentPath())
    window.addEventListener('popstate', updatePath)
    return () => window.removeEventListener('popstate', updatePath)
  }, [])

  if (path === '/app') return <App />
  if (path === '/login') return <LoginPage />
  if (path === '/reset-password') return <ResetPasswordPage />
  return <LandingPage />
}
