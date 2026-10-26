// Raiz da aplicação: sem token -> tela de login/cadastro; com token -> painel.
import { useState } from 'react'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem('usuario'))
  } catch {
    return null
  }
}

function App() {
  const [usuario, setUsuario] = useState(loadSession)

  const handleLogin = (user, token) => {
    localStorage.setItem('usuario', JSON.stringify(user))
    localStorage.setItem('token', token)
    setUsuario(user)
  }

  const handleLogout = () => {
    localStorage.removeItem('usuario')
    localStorage.removeItem('token')
    setUsuario(null)
  }

  if (usuario && localStorage.getItem('token')) {
    return <DashboardPage usuario={usuario} onLogout={handleLogout} />
  }

  return <HomePage onLogin={handleLogin} />
}

export default App
