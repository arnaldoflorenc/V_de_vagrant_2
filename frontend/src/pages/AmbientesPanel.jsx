// Lista os ambientes com status, limites e ações (parar, remover, ver logs).
// Recarrega sozinha a cada poucos segundos; o backend sincroniza o status com o runner.
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../services/api'
import LogViewer from './LogViewer'

const STATUS_LABEL = {
  pendente: 'Pendente',
  em_execucao: 'Em execução',
  terminado: 'Terminado',
  erro: 'Erro',
}

function AmbientesPanel() {
  const [ambientes, setAmbientes] = useState([])
  const [error, setError] = useState('')
  const [logAmbiente, setLogAmbiente] = useState(null)

  const load = useCallback(async () => {
    try {
      setAmbientes(await apiFetch('/api/ambientes'))
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(load, 0)
    const timer = setInterval(load, 5000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  const act = async (endpoint, options, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return
    try {
      await apiFetch(endpoint, options)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section>
      <h2>Ambientes</h2>
      {error && <p className="msg error">{error}</p>}
      {ambientes.length === 0 ? (
        <p>Nenhum ambiente criado ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>CPU</th>
              <th>Memória</th>
              <th>IO</th>
              <th>Detalhe</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {ambientes.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.nome}</td>
                <td><span className={`badge ${a.tipo}`}>{a.tipo}</span></td>
                <td><span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span></td>
                <td>{a.cpu_limit}%</td>
                <td>{a.memory_limit} MB</td>
                <td>{a.io_limit} MB/s</td>
                <td>{a.resultado || '-'}</td>
                <td className="actions">
                  <button onClick={() => setLogAmbiente(a)}>Logs</button>
                  {a.status === 'em_execucao' && (
                    <button onClick={() => act(`/api/ambientes/${a.id}/parar`, { method: 'POST' }, `Parar "${a.nome}"?`)}>
                      Parar
                    </button>
                  )}
                  <button className="danger" onClick={() => act(`/api/ambientes/${a.id}`, { method: 'DELETE' }, `Remover "${a.nome}"?`)}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {logAmbiente && <LogViewer ambiente={logAmbiente} onClose={() => setLogAmbiente(null)} />}
    </section>
  )
}

export default AmbientesPanel
