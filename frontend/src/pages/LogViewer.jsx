// Visualizador de logs: busca só o trecho novo usando "offset" e acompanha
// (tail) enquanto o ambiente estiver em execução.
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../services/api'

function LogViewer({ ambiente, onClose }) {
  const [content, setContent] = useState('')
  const [auto, setAuto] = useState(true)
  const [error, setError] = useState('')
  const offsetRef = useRef(0)
  const boxRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/ambientes/${ambiente.id}/logs?offset=${offsetRef.current}`)
      if (data.content) {
        setContent((prev) => prev + data.content)
        offsetRef.current = data.offset
      }
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [ambiente.id])

  useEffect(() => {
    const first = setTimeout(load, 0)
    return () => clearTimeout(first)
  }, [load])

  useEffect(() => {
    if (!auto) return undefined
    const timer = setInterval(load, 2000)
    return () => clearInterval(timer)
  }, [auto, load])

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [content])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Logs – {ambiente.nome} (#{ambiente.id})</h3>
          <button onClick={onClose}>Fechar</button>
        </div>
        <pre className="log-box" ref={boxRef}>{content || '(sem saída ainda)'}</pre>
        {error && <p className="msg error">{error}</p>}
        <div className="modal-actions">
          <button onClick={load}>Atualizar</button>
          <label>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Atualizar automaticamente
          </label>
        </div>
      </div>
    </div>
  )
}

export default LogViewer
