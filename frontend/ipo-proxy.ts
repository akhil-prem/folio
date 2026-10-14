import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { extractIpoDetail, extractListedRows } from './ipo-flight.ts'

const ORIGIN = 'https://ipogyani.com'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'en-IN,en;q=0.9',
  Referer: `${ORIGIN}/`,
}

type CacheEntry = { at: number; body: string; status: number }
const cache = new Map<string, CacheEntry>()

function cached(key: string, ttlMs: number): CacheEntry | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > ttlMs) {
    cache.delete(key)
    return null
  }
  return hit
}

function remember(key: string, status: number, body: string) {
  cache.set(key, { at: Date.now(), status, body })
}

async function upstream(path: string): Promise<{ status: number; body: string; contentType: string }> {
  const response = await fetch(`${ORIGIN}${path}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(20_000),
  })
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type') ?? '',
  }
}

function send(res: ServerResponse, status: number, payload: unknown) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

function readUrl(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://localhost')
}

async function handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = readUrl(req)
  const path = url.pathname
  if (!path.startsWith('/api/ipo')) {
    next()
    return
  }
  if (req.method !== 'GET') {
    send(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    if (path === '/api/ipos') {
      const hit = cached('ipos', 45_000)
      if (hit) {
        send(res, hit.status, hit.body)
        return
      }
      const remote = await upstream('/api/ipos')
      remember('ipos', remote.status, remote.body)
      send(res, remote.status, remote.body)
      return
    }

    if (path === '/api/ipos-listed') {
      const year = Number(url.searchParams.get('year') || new Date().getFullYear())
      const key = `listed-${year}`
      const hit = cached(key, 5 * 60_000)
      if (hit) {
        send(res, hit.status, hit.body)
        return
      }
      const remote = await upstream(`/listed-ipo/${year}`)
      if (remote.status >= 400) {
        send(res, remote.status, { error: 'Listed IPO archive unavailable' })
        return
      }
      const rows = extractListedRows(remote.body)
      const body = JSON.stringify({ year, rows })
      remember(key, 200, body)
      send(res, 200, body)
      return
    }

    if (path === '/api/ipo-detail') {
      const slug = (url.searchParams.get('slug') ?? '').trim()
      const year = url.searchParams.get('year')
      if (!slug) {
        send(res, 400, { error: 'Missing slug' })
        return
      }
      const key = `detail-${year ?? 'live'}-${slug}`
      const hit = cached(key, 2 * 60_000)
      if (hit) {
        send(res, hit.status, hit.body)
        return
      }
      const candidates = [
        year ? `/listed-ipo/${year}/${slug}` : '',
        `/ipo/${slug}`,
        slug.endsWith('-ipo') ? '' : `/ipo/${slug}-ipo`,
      ].filter(Boolean)
      for (const candidate of candidates) {
        const remote = await upstream(candidate)
        if (remote.status >= 400) continue
        const ipo = extractIpoDetail(remote.body)
        if (ipo?.name) {
          const body = JSON.stringify({ ipo, path: candidate })
          remember(key, 200, body)
          send(res, 200, body)
          return
        }
      }
      send(res, 404, { error: 'IPO details unavailable' })
      return
    }

    if (path === '/api/ipo-subscription') {
      const id = (url.searchParams.get('id') ?? '').trim()
      if (!id) {
        send(res, 400, { error: 'Missing id' })
        return
      }
      const key = `sub-${id}`
      const hit = cached(key, 30_000)
      if (hit) {
        send(res, hit.status, hit.body)
        return
      }
      const remote = await upstream(`/api/public/ipo-subscription/${encodeURIComponent(id)}`)
      remember(key, remote.status, remote.body)
      send(res, remote.status, remote.body)
      return
    }

    next()
  } catch (error) {
    send(res, 502, { error: error instanceof Error ? error.message : 'IPO data unavailable' })
  }
}

export function ipoProxyPlugin(): Plugin {
  return {
    name: 'ipo-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next)
      })
    },
  }
}
