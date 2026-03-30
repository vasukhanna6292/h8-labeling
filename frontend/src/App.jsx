import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import LeadDashboard from './pages/LeadDashboard'
import AnnotatorQueue from './pages/AnnotatorQueue'
import AnnotationCanvas from './pages/AnnotationCanvas'
import RegisterWithInvite from './pages/RegisterWithInvite'

function RequireAuth({ children, role }) {
  const { user } = useAuth()
  if (user === undefined) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return children
}

function RoleRouter() {
  const { user } = useAuth()
  if (user === undefined) return null
  if (!user) return <Navigate to="/login" replace />
  return user.role === 'lead'
    ? <Navigate to="/lead" replace />
    : <Navigate to="/queue" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite/:token" element={<RegisterWithInvite />} />
          <Route path="/" element={<RoleRouter />} />
          <Route path="/lead" element={
            <RequireAuth role="lead"><LeadDashboard /></RequireAuth>
          } />
          <Route path="/queue" element={
            <RequireAuth role="annotator"><AnnotatorQueue /></RequireAuth>
          } />
          <Route path="/annotate/:taskId" element={
            <RequireAuth><AnnotationCanvas /></RequireAuth>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
