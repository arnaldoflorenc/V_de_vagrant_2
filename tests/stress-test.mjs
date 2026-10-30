// Teste de integracao concorrente (nao eh benchmark de carga).
// Node.js 20+: node tests/stress-test.mjs
// BASE=http://localhost:5173/api por padrao. Use somente ambiente de testes:
// cria uma conta persistente e cinco ambientes, removidos ao final.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const BASE = (process.env.BASE || 'http://localhost:5173/api').replace(/\/$/, '')
const runName = `integration-${randomUUID()}`
const created = new Set()
let token
let failed = 0

const api = async (method, path, body, expected = 200, authenticated = true) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  assert.equal(res.status, expected, `${method} ${path}: HTTP ${res.status}; esperado ${expected}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${method} ${path}: resposta nao e JSON valido`)
  }
}

const check = async (name, run) => {
  try {
    await run()
    console.log(`PASS ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL ${name}: ${error.message}`)
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (id, expected) => {
  const deadline = Date.now() + 30000
  let env
  do {
    env = await api('GET', `/ambientes/${id}`)
    if (env.status === expected) return env
    assert.ok(!['terminado', 'erro'].includes(env.status),
      `ambiente ${id}: esperado ${expected}, recebido ${env.status}; ${env.resultado}`)
    await sleep(250)
  } while (Date.now() < deadline)
  throw new Error(`ambiente ${id}: timeout esperando ${expected}; ultimo estado ${env.status}`)
}
const novo = async (comando, extra = {}) => {
  const env = await api('POST', '/ambientes', {
    nome: runName, cpu: 50, memoria: 128, io: 10, tipo: 'bash', comando, ...extra,
  }, 201)
  assert.ok(Number.isInteger(env.id) && env.id > 0, 'criacao sem id valido')
  created.add(env.id)
  return env
}
const logs = async (id) => {
  const data = await api('GET', `/ambientes/${id}/logs`)
  assert.equal(typeof data.content, 'string', 'logs sem campo content')
  return data.content
}

try {
  const email = `integration-${randomUUID()}@test.com`
  const senha = randomUUID()
  await api('POST', '/register', { nome: 'Integration Test', email, senha }, 201, false)
  const login = await api('POST', '/login', { email, senha }, 200, false)
  assert.ok(typeof login.token === 'string' && login.token.length > 0, 'login sem token')
  token = login.token
  console.log('PASS cadastro e login')

  await check('sem token -> 401', () => api('GET', '/ambientes', undefined, 401, false))

  // allSettled garante que toda criacao termine antes da limpeza, mesmo com falhas.
  const results = await Promise.allSettled([
    novo('echo ola; sleep 1'),
    novo('exit 1'),
    novo('while true; do echo tick; sleep 1; done'),
    novo('import time\nx = bytearray(300 * 1024 * 1024)\ntime.sleep(1)', {
      memoria: 32, tipo: 'python',
    }),
    novo('echo PID=$$ HOST=$(hostname)'),
  ])
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason
  }
  const [ok, fail, svc, oom, iso] = results.map((result) => result.value)

  await check('programa curto -> terminado', async () => {
    const env = await waitFor(ok.id, 'terminado')
    assert.match(env.resultado, /Código de saída: 0(?:\s|$)/)
    assert.match(await logs(ok.id), /^ola\r?$/m)
  })
  await check('exit 1 -> erro com codigo 1', async () => {
    const env = await waitFor(fail.id, 'erro')
    assert.match(env.resultado, /Código de saída: 1(?:\s|$)/)
  })
  await check('estouro de memoria -> OOM confirmado', async () => {
    const env = await waitFor(oom.id, 'erro')
    assert.match(env.resultado, /\bOOM\b/, 'erro sem confirmacao de OOM')
  })
  await check('servico continua executando e produz novos logs', async () => {
    await waitFor(svc.id, 'em_execucao')
    const before = await logs(svc.id)
    await sleep(2200)
    const after = await logs(svc.id)
    assert.equal((await api('GET', `/ambientes/${svc.id}`)).status, 'em_execucao')
    assert.ok(after.startsWith(before) && after.length > before.length, 'logs nao cresceram')
    assert.match(after, /^tick\r?$/m)
  })
  await check('namespaces: PID 1 e hostname proprio', async () => {
    await waitFor(iso.id, 'terminado')
    assert.match(await logs(iso.id), new RegExp(`^PID=1 HOST=env-${iso.id}\\r?$`, 'm'))
  })
  await check('parar -> terminado', async () => {
    await api('POST', `/ambientes/${svc.id}/parar`)
    await waitFor(svc.id, 'terminado')
  })
} catch (error) {
  failed++
  console.error(`FAIL execucao: ${error.message}`)
} finally {
  // O backend pode persistir um ambiente antes de responder 502 na criacao.
  if (token) {
    await check('localizar ambientes desta execucao para limpeza', async () => {
      const environments = await api('GET', '/ambientes')
      assert.ok(Array.isArray(environments), 'listagem de ambientes invalida')
      for (const env of environments) {
        if (env.nome === runName) {
          assert.ok(Number.isInteger(env.id) && env.id > 0, 'listagem com id invalido')
          created.add(env.id)
        }
      }
    })
  }
  for (const id of created) {
    await check(`remover ambiente ${id} -> 404`, async () => {
      await api('DELETE', `/ambientes/${id}`)
      await api('GET', `/ambientes/${id}`, undefined, 404)
    })
  }
}

console.log(`Resultado: ${failed} falha(s)`)
process.exitCode = failed ? 1 : 0
