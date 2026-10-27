// Scripts salvos: o navegador lê o arquivo e envia o texto em JSON (sem multipart);
// ficam guardados para reuso em novos ambientes.
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../services/api'

function ScriptsPanel() {
  const [scripts, setScripts] = useState([])
  const [nome, setNome] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setScripts(await apiFetch('/api/scripts'))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    const first = setTimeout(load, 0)
    return () => clearTimeout(first)
  }, [load])

  const handleFile = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    setConteudo(await file.text())
    if (!nome) setNome(file.name)
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await apiFetch('/api/scripts', { method: 'POST', body: JSON.stringify({ nome, conteudo }) })
      setNome('')
      setConteudo('')
      event.target.reset()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (script) => {
    if (!window.confirm(`Remover script "${script.nome}"?`)) return
    try {
      await apiFetch(`/api/scripts/${script.id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section>
      <h2>Scripts</h2>
      <form className="env-form" onSubmit={submit}>
        <label>
          Arquivo de script
          <input type="file" onChange={handleFile} />
        </label>
        <label>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          Conteúdo
          <textarea rows="6" value={conteudo} onChange={(e) => setConteudo(e.target.value)} required />
        </label>
        <button type="submit">Salvar script</button>
      </form>
      {error && <p className="msg error">{error}</p>}
      <table>
        <thead>
          <tr><th>#</th><th>Nome</th><th>Tamanho</th><th>Criado em</th><th /></tr>
        </thead>
        <tbody>
          {scripts.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.nome}</td>
              <td>{s.tamanho} B</td>
              <td>{new Date(s.criado_em).toLocaleString()}</td>
              <td><button className="danger" onClick={() => remove(s)}>Remover</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default ScriptsPanel
