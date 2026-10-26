// Cliente HTTP único: guarda o token no localStorage e o envia (Bearer) em toda chamada.
// API_URL vazio = mesma origem; o Apache faz o proxy de /api para o backend.
const API_URL = import.meta.env.VITE_API_URL || ''

export function getToken() {
  return localStorage.getItem('token')
}

export async function apiFetch(endpoint, options = {}) {
  const token = getToken()
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    throw new Error(data?.error || data || 'Erro ao comunicar com o servidor.')
  }

  return data
}
