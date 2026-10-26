import { useState } from 'react'
import { apiFetch } from '../services/api'
import './HomePage.css'

function HomePage({ onLogin }) {
  const [isRegister, setIsRegister] = useState(false)
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    confirmarSenha: '',
  })
  const [status, setStatus] = useState({
    type: '',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: '', message: '' })

    try {
      const data = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: formData.email,
          senha: formData.senha,
        }),
      })

      setStatus({
        type: 'success',
        message: `Bem-vindo(a), ${data.usuario.nome}!`,
      })
      onLogin(data.usuario, data.token)
      setFormData({ ...formData, senha: '' })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: '', message: '' })

    if (formData.senha !== formData.confirmarSenha) {
      setStatus({
        type: 'error',
        message: 'As senhas não coincidem.',
      })
      setIsSubmitting(false)
      return
    }

    try {
      await apiFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          nome: formData.nome,
          email: formData.email,
          senha: formData.senha,
        }),
      })

      setStatus({
        type: 'success',
        message: 'Cadastro realizado com sucesso! Faça login para continuar.',
      })
      setIsRegister(false)
      setFormData({
        nome: '',
        email: '',
        senha: '',
        confirmarSenha: '',
      })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error.message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-visual">
          <div className="brand-pill">Mini Container Runner</div>
          <h1>Crie ambientes isolados e execute seus programas.</h1>
          <p>
            Faça login ou cadastre-se para criar ambientes com namespaces e
            cgroups, definir CPU, memória e IO, e acompanhar a saída dos seus
            programas.
          </p>

          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-dot" />
              <p>Limites de CPU, memória e IO por ambiente</p>
            </div>
            <div className="feature-item">
              <span className="feature-dot" />
              <p>Scripts salvos para reutilização</p>
            </div>
            <div className="feature-item">
              <span className="feature-dot" />
              <p>Status e logs de cada execução</p>
            </div>
          </div>
        </section>

        <section className="login-card">
          <div className="card-header">
            <span className="mini-badge">Acesso</span>
            <h2>{isRegister ? 'Cadastrar-se' : 'Entrar'}</h2>
          </div>

          {status.message && (
            <div className={`status-message ${status.type}`}>
              {status.message}
            </div>
          )}

          {isRegister ? (
            <form className="login-form" onSubmit={handleRegister}>
              <label className="input-group">
                <span>Nome</span>
                <input
                  type="text"
                  name="nome"
                  placeholder="Seu nome completo"
                  value={formData.nome}
                  onChange={handleChange}
                />
              </label>

              <label className="input-group">
                <span>E-mail</span>
                <input
                  type="email"
                  name="email"
                  placeholder="cliente@email.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </label>

              <label className="input-group">
                <span>Senha</span>
                <input
                  type="password"
                  name="senha"
                  placeholder="••••••••"
                  value={formData.senha}
                  onChange={handleChange}
                />
              </label>

              <label className="input-group">
                <span>Confirmar senha</span>
                <input
                  type="password"
                  name="confirmarSenha"
                  placeholder="Repita a senha"
                  value={formData.confirmarSenha}
                  onChange={handleChange}
                />
              </label>

              <button type="submit" className="login-button" disabled={isSubmitting}>
                {isSubmitting ? 'Cadastrando...' : 'Cadastrar'}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleLogin}>
              <label className="input-group">
                <span>E-mail</span>
                <input
                  type="email"
                  name="email"
                  placeholder="cliente@email.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </label>

              <label className="input-group">
                <span>Senha</span>
                <input
                  type="password"
                  name="senha"
                  placeholder="••••••••"
                  value={formData.senha}
                  onChange={handleChange}
                />
              </label>

              <div className="form-row">
                <label className="checkbox">
                  <input type="checkbox" />
                  <span>Lembrar-me</span>
                </label>
                <a href="#" className="link-button">
                  Esqueci a senha
                </a>
              </div>

              <button type="submit" className="login-button" disabled={isSubmitting}>
                {isSubmitting ? 'Entrando...' : 'Fazer login'}
              </button>
            </form>
          )}

          <div className="signup-box">
            <span>{isRegister ? 'Já tem conta?' : 'Ainda não tem conta?'}</span>
            <button
              type="button"
              className="switch-button"
              onClick={() => {
                setIsRegister((prev) => !prev)
                setStatus({ type: '', message: '' })
              }}
            >
              {isRegister ? 'Entrar' : 'Cadastrar-se'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}

export default HomePage
