// Testa o proprio cliente sem acessar VMs, banco ou executar cargas.
// node --test tests/stress-test.test.mjs
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

async function exercise(mode) {
  const environments = new Map()
  const removed = []
  let nextId = 0
  let serviceReads = 0
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : {}
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    if (req.url === '/api/register') {
      if (mode === 'registration-error') return send(500, { error: 'unavailable' })
      return send(201, { usuario: { id: 1 } })
    }
    if (req.url === '/api/login') return send(200, { token: 'test-token' })
    if (req.headers.authorization !== 'Bearer test-token') return send(401, { error: 'auth' })
    if (req.url === '/api/ambientes' && req.method === 'GET') {
      return send(200, [...environments.values()])
    }
    if (req.url === '/api/ambientes' && req.method === 'POST') {
      const id = ++nextId
      // Simula criacoes ainda em voo quando outra ja falhou.
      if (mode === 'creation-error' && id === 2) {
        environments.set(id, { id, ...body, status: 'erro' })
        return send(502, { error: 'runner' })
      }
      if (mode === 'creation-error') await new Promise((resolve) => setTimeout(resolve, 100))
      environments.set(id, { id, ...body, status: 'em_execucao' })
      return send(201, { id })
    }
    const match = req.url.match(/^\/api\/ambientes\/(\d+)(?:\/(logs|parar))?$/)
    if (!match) return send(404, { error: 'route' })
    const id = Number(match[1])
    const env = environments.get(id)
    if (!env) return send(404, { error: 'missing' })
    if (req.method === 'DELETE') {
      environments.delete(id)
      removed.push(id)
      return send(200, { message: 'removed' })
    }
    if (match[2] === 'parar') {
      env.status = 'terminado'
      return send(200, env)
    }
    if (match[2] === 'logs') {
      if (mode === 'invalid-logs') return send(200, {})
      const content = id === 3 ? 'tick\n'.repeat(++serviceReads)
        : id === 5 ? `PID=1 HOST=env-${id}\n` : 'ola\n'
      return send(200, { content })
    }
    if (id !== 3) env.status = [2, 4].includes(id) ? 'erro' : 'terminado'
    env.resultado = id === 4
      ? (mode === 'false-oom' ? 'Python indisponivel' : 'Encerrado por falta de memoria (OOM)')
      : `Código de saída: ${id === 2 ? 1 : 0}`
    return send(200, env)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('./stress-test.mjs', import.meta.url)),
    ], {
      env: { ...process.env, BASE: `http://127.0.0.1:${server.address().port}/api` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (data) => { output += data })
    child.stderr.on('data', (data) => { output += data })
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    return { code, output, removed, remaining: environments.size }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

for (const mode of ['success', 'false-oom', 'invalid-logs', 'creation-error', 'registration-error']) {
  test(`cliente da API: ${mode}`, { timeout: 20000 }, async () => {
    const result = await exercise(mode)
    assert.equal(result.code, mode === 'success' ? 0 : 1, result.output)
    assert.equal(result.remaining, 0, result.output)
    assert.equal(result.removed.length,
      mode === 'registration-error' ? 0 : 5,
      result.output)
    if (mode === 'false-oom') assert.match(result.output, /erro sem confirmacao de OOM/)
    if (mode === 'invalid-logs') assert.match(result.output, /logs sem campo content/)
  })
}
