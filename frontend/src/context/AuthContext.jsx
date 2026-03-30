import { createContext, useContext, useEffect, useState } from 'react'
import { apiGet, logout as doLogout } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { setUser(null); return }
    apiGet('/users/me')
      .then(setUser)
      .catch(() => { localStorage.removeItem('token'); setUser(null) })
  }, [])

  function logout() {
    doLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
