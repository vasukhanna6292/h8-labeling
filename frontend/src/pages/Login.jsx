import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { apiGet } from '../api/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      const me = await apiGet('/users/me')
      setUser(me)
      navigate(me.role === 'lead' ? '/lead' : '/queue')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-gray-700">

        {/* Logo mark */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center shrink-0">
            <span className="text-gray-100 font-bold text-sm">H8</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-100 leading-tight">H8 Labeling</h1>
            <p className="text-gray-400 text-xs">OBB Annotation Platform</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition"
            />
          </div>
          {error && (
            <p className="text-red-300 text-sm bg-red-950 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-gray-100 font-medium rounded-lg py-2.5 transition text-sm mt-2"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      {/* Ownership footer */}
      <p className="mt-6 text-gray-500 text-xs">
        © 2026 Vasu Khanna · All rights reserved
      </p>
    </div>
  )
}
