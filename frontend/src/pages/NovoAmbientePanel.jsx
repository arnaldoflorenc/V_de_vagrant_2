// Formulário de criação: nome, limites (CPU %, memória MB, IO MB/s) e o script
// (salvo, enviado do computador ou digitado). No texto digitado escolhe-se a
// linguagem (Bash ou Python); no script salvo vale o tipo com que ele foi guardado.
import { useEffect, useState } from 'react'
import { apiFetch } from '../services/api'

const INITIAL = { nome: '', cpu: 50, memoria: 128, io: 10, origem: 'comando', tipo: 'bash', script_id: '', comando: '' }

const PLACEHOLDER = {
  bash: 'while true; do date; sleep 2; done',
  python: 'import time\nwhile True:\n    print("ola do python", flush=True)\n    time.sleep(2)',
}

function NovoAmbientePanel({ onCreated }) {
  const [form, setForm] = useState(INITIAL)
  const [scripts, setScripts] = useState([])
  const [status, setStatus] = useState({ type: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    apiFetch('/api/scripts').then(setScripts).catch(() => setScripts([]))
  }, [])

  const change = (event) => setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setStatus({ type: '', message: '' })
    try {
      await apiFetch('/api/ambientes', {
        method: 'POST',
        body: JSON.stringify({
          nome: form.nome,
          cpu: Number(form.cpu),
          memoria: Number(form.memoria),
          io: Number(form.io),
          tipo: form.origem === 'comando' ? form.tipo : undefined,
          script_id: form.origem === 'script' ? form.script_id : null,
          comando: form.origem === 'comando' ? form.comando : '',
        }),
      })
      setForm(INITIAL)
      onCreated()
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <h2>Novo ambiente</h2>
      <form className="env-form" onSubmit={submit}>
        <label>
          Nome
          <input name="nome" value={form.nome} onChange={change} required />
        </label>
        <label>
          CPU (% de 1 core)
          <input type="number" name="cpu" min="1" max="100" value={form.cpu} onChange={change} required />
        </label>
        <label>
          Memória (MB)
          <input type="number" name="memoria" min="16" max="3072" value={form.memoria} onChange={change} required />
        </label>
        <label>
          IO (MB/s)
          <input type="number" name="io" min="1" max="1000" value={form.io} onChange={change} required />
        </label>
        <label>
          O que executar?
          <select name="origem" value={form.origem} onChange={change}>
            <option value="comando">Programa / comandos</option>
            <option value="script">Script salvo</option>
          </select>
        </label>
        {form.origem === 'script' ? (
          <label>
            Script
            <select name="script_id" value={form.script_id} onChange={change} required>
              <option value="">Selecione...</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>{s.nome} ({s.tipo})</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Linguagem
              <select name="tipo" value={form.tipo} onChange={change}>
                <option value="bash">Bash</option>
                <option value="python">Python 3</option>
              </select>
            </label>
            <label>
              {form.tipo === 'python'
                ? 'Código Python (executado com python3)'
                : 'Comandos (um ou mais programas, executados em bash)'}
              <textarea name="comando" rows="5" value={form.comando} onChange={change} placeholder={PLACEHOLDER[form.tipo]} required />
            </label>
          </>
        )}
        {status.message && <p className={`msg ${status.type}`}>{status.message}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Criando...' : 'Criar e executar'}</button>
      </form>
    </section>
  )
}

export default NovoAmbientePanel
