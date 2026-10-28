// Scripts salvos: o navegador lê o arquivo e envia o texto em JSON (sem multipart);
// ficam guardados para reuso em novos ambientes. Cada script tem um tipo
// (Bash ou Python), sugerido pela extensão do arquivo e ajustável no seletor.
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../services/api'

const TIPOS = [
  { value: 'bash', label: 'Bash (.sh)' },
  { value: 'python', label: 'Python 3 (.py)' },
]

const tipoPelaExtensao = (nomeArquivo) => {
  if (/\.py$/i.test(nomeArquivo)) return 'python'
  if (/\.sh$/i.test(nomeArquivo)) return 'bash'
  return null
}

function ScriptsPanel() {
  const [scripts, setScripts] = useState([])
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('bash')
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
    const sugerido = tipoPelaExtensao(file.name)
    if (sugerido) setTipo(sugerido)
  }

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await apiFetch('/api/scripts', { method: 'POST', body: JSON.stringify({ nome, tipo, conteudo }) })
      setNome('')
      setTipo('bash')
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
          Tipo do script
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
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
          <tr><th>#</th><th>Nome</th><th>Tipo</th><th>Tamanho</th><th>Criado em</th><th /></tr>
        </thead>
        <tbody>
          {scripts.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.nome}</td>
              <td><span className={`badge ${s.tipo}`}>{s.tipo}</span></td>
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
