'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F2EE' }}>
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm" style={{ border: '1px solid #E4DDD3' }}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-3" style={{ background: '#1F2937' }}>
            <span className="text-white font-bold text-lg" style={{ fontFamily: 'Cambria, Georgia, serif' }}>CTG</span>
          </div>
          <h1 className="text-xl font-semibold" style={{ color: '#1F2937', fontFamily: 'Cambria, Georgia, serif' }}>Supply Chain Portal</h1>
          <p className="text-sm mt-1" style={{ color: '#4B5563' }}>Sign in to your account</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#1F2937' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-[#E4DDD3] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E5C56] focus:border-[#0E5C56]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#1F2937' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-[#E4DDD3] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E5C56] focus:border-[#0E5C56]"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: '#FAEAEA', border: '1px solid #F5C6C4', color: '#C5453F' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
            style={{ background: '#0E5C56' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-xs mt-6" style={{ color: '#4B5563' }}>
          Access is managed by your Supply Chain team.<br/>
          Contact admin to request an account.
        </p>
      </div>
    </div>
  )
}
