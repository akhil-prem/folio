import type {
  Account,
  Holding,
  Member,
  MemberInput,
  MfNavHistory,
  MfSchemeDetail,
  MfSuggestion,
  MutualFund,
  MutualFundInput,
  SipEntry,
  SipEntryInput,
  StockDetail,
  StockPriceHistory,
} from './types'

const TOKEN_KEY = 'folio-token'
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

function apiUrl(path: string) {
  return `${API_URL}${path}`
}

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
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(apiUrl(input), { ...init, headers })
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

export async function createMember(member: MemberInput) {
  const response = await apiFetch('/api/members/', {
    method: 'POST',
    body: JSON.stringify(member),
  })
  return readJson<Member>(response)
}

export async function updateMember(id: string, member: Partial<MemberInput>) {
  const response = await apiFetch(`/api/members/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(member),
  })
  return readJson<Member>(response)
}

export async function uploadMemberImage(id: string, file: File) {
  const body = new FormData()
  body.append('image', file)
  const response = await apiFetch(`/api/members/${id}/image/`, {
    method: 'POST',
    body,
  })
  return readJson<Member>(response)
}

export async function deleteMember(id: string) {
  const response = await apiFetch(`/api/members/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error || 'Could not remove member')
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

export async function fetchMutualFunds() {
  const response = await apiFetch('/api/mutual-funds/')
  return readJson<MutualFund[]>(response)
}

export async function searchMutualFunds(query: string, signal?: AbortSignal) {
  const q = query.trim()
  if (q.length < 2) return [] as MfSuggestion[]
  const response = await apiFetch(`/api/mf-search?q=${encodeURIComponent(q)}`, { signal })
  const payload = await readJson<{ results: MfSuggestion[] }>(response)
  return payload.results ?? []
}

export async function fetchMutualFundScheme(searchId: string, signal?: AbortSignal) {
  const id = searchId.trim()
  if (!id) throw new Error('Missing scheme id')
  const response = await apiFetch(`/api/mf-scheme?id=${encodeURIComponent(id)}`, { signal })
  return readJson<MfSchemeDetail>(response)
}

export async function fetchMutualFundNav(schemeCode: string, signal?: AbortSignal) {
  const code = schemeCode.trim()
  if (!code) throw new Error('Missing scheme code')
  const response = await apiFetch(`/api/mf-nav?code=${encodeURIComponent(code)}`, { signal })
  return readJson<MfNavHistory>(response)
}

export async function fetchStockDetail(symbol: string, signal?: AbortSignal) {
  const value = symbol.trim()
  if (!value) throw new Error('Missing symbol')
  const response = await apiFetch(`/api/stock-detail?symbol=${encodeURIComponent(value)}`, { signal })
  return readJson<StockDetail>(response)
}

export async function fetchStockHistory(symbol: string, signal?: AbortSignal) {
  const value = symbol.trim()
  if (!value) throw new Error('Missing symbol')
  const response = await apiFetch(`/api/stock-history?symbol=${encodeURIComponent(value)}`, { signal })
  return readJson<StockPriceHistory>(response)
}

export async function createMutualFund(fund: MutualFundInput) {
  const response = await apiFetch('/api/mutual-funds/', {
    method: 'POST',
    body: JSON.stringify(fund),
  })
  return readJson<MutualFund>(response)
}

export async function updateMutualFund(id: string, fund: Partial<MutualFundInput>) {
  const response = await apiFetch(`/api/mutual-funds/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(fund),
  })
  return readJson<MutualFund>(response)
}

export async function deleteMutualFund(id: string) {
  const response = await apiFetch(`/api/mutual-funds/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    throw new Error('Could not remove mutual fund')
  }
}

export async function createSipEntry(entry: SipEntryInput) {
  const response = await apiFetch('/api/sip-entries/', {
    method: 'POST',
    body: JSON.stringify(entry),
  })
  return readJson<SipEntry>(response)
}

export async function updateSipEntry(id: string, entry: Partial<SipEntryInput>) {
  const response = await apiFetch(`/api/sip-entries/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(entry),
  })
  return readJson<SipEntry>(response)
}

export async function deleteSipEntry(id: string) {
  const response = await apiFetch(`/api/sip-entries/${id}/`, { method: 'DELETE' })
  if (!response.ok && response.status !== 204) {
    throw new Error('Could not remove SIP entry')
  }
}
