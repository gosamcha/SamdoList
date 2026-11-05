import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Enter your email and password.')
      return
    }

    setLoading(true)
    setErrorMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setErrorMessage(error.message)
    }

    setLoading(false)
  }

  return <main className="entry-screen"><form className="entry-card" onSubmit={event => {
    event.preventDefault()
    if (!loading) void handleLogin()
  }}>
    <img src="/favicon.png" alt="" className="entry-icon" />
    <h1>SamdoList</h1>
    <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
    {errorMessage && <p role="alert">{errorMessage}</p>}
    <button className="primary-action" disabled={loading}>{loading ? 'Signing in…' : 'SIGN IN'}</button>
  </form></main>
}
