import type { Account, Holding, Member } from './types'

const TOKEN_KEY = 'folio-token'

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Token ${token}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(input, { ...init, headers })
  if (response.status === 401 && !input.includes('/api/auth/login')) {
    setToken(null)
  }
  return response
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`)
  }
  return payload
}

export async function loginRequest(email: string, password: string) {
  const response = await apiFetch('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const payload = await readJson<{ token: string; account: Account }>(response)
  setToken(payload.token)
  return payload.account
}

export async function logoutRequest() {
  try {
    await apiFetch('/api/auth/logout/', { method: 'POST' })
  } finally {
    setToken(null)
  }
}

export async function fetchAccount() {
  const response = await apiFetch('/api/auth/me/')
  if (response.status === 401) return null
  return readJson<Account>(response)
}

export async function saveAccount(account: Account) {
  const response = await apiFetch('/api/auth/me/', {
    method: 'PATCH',
    body: JSON.stringify(account),
  })
  return readJson<Account>(response)
}

export async function changePassword(current: string, next: string) {
  const response = await apiFetch('/api/auth/password/', {
    method: 'POST',
    body: JSON.stringify({ current, next }),
  })
  const payload = await readJson<{ token: string; account: Account }>(response)
  setToken(payload.token)
  return payload.account
}

export async function fetchMembers() {
  const response = await apiFetch('/api/members/')
  return readJson<Member[]>(response)
}

export async function createMember(member: Pick<Member, 'name' | 'email'>) {
  const response = await apiFetch('/api/members/', {
    method: 'POST',
    body: JSON.stringify(member),
  })
  return readJson<Member>(response)
}

export async function deleteMember(id: string) {
  const response = await apiFetch(`/api/members/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    throw new Error('Could not remove member')
  }
}

export async function fetchHoldings() {
  const response = await apiFetch('/api/holdings/')
  return readJson<Holding[]>(response)
}

export async function createHolding(holding: Omit<Holding, 'id'>) {
  const response = await apiFetch('/api/holdings/', {
    method: 'POST',
    body: JSON.stringify(holding),
  })
  return readJson<Holding>(response)
}

export async function patchHolding(id: string, holding: Partial<Holding>) {
  const response = await apiFetch(`/api/holdings/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(holding),
  })
  return readJson<Holding>(response)
}

export async function deleteHolding(id: string) {
  const response = await apiFetch(`/api/holdings/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    throw new Error('Could not remove holding')
  }
}
