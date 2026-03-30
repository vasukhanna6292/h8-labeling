import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { login, registerWithInvite, validateInvite } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { apiGet } from '../api/client'

export default function RegisterWithInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { setUser } = useAuth()

  const [valid, setValid] = useState(null) // null=checking, true=ok, false=invalid
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    validateInvite(token)
      .then(() => setValid(true))
      .catch(() => setValid(false))
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await registerWithInvite(token, { name, email, password })
      // Auto-login after registration
      await login(email, password)
      const me = await apiGet('/users/me')
      setUser(me)
      navigate('/queue')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (valid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-400">Validating invite link...</p>
      </div>
    )
  }

  if (valid === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-xl border border-red-900 text-center">
          <p className="text-2xl mb-2">🔗</p>
          <h1 className="text-xl font-bold text-white mb-2">Invite Expired</h1>
          <p className="text-gray-400 text-sm">This invite link is no longer valid. Ask your lead to generate a new one.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-xl border border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-1">H8 Labeling</h1>
        <p className="text-gray-400 text-sm mb-6">Create your annotator account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Your name"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="yourname@asu.edu"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 transition"
          >
            {loading ? 'Creating account...' : 'Create Account & Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}