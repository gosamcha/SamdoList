import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('이메일과 비밀번호를 입력해줘.')
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

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <h1>SamdoList</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleLogin()
            }
          }}
        />

        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        {errorMessage && (
          <p
            style={{
              margin: 0,
              fontSize: '14px',
            }}
          >
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  )
}