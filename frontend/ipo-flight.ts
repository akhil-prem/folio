export function extractBalanced(source: string, startIndex: number): string | null {
  const open = source[startIndex]
  if (open !== '{' && open !== '[') return null
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]
    if (inStr) {
      if (esc) {
        esc = false
        continue
      }
      if (char === '\\') {
        esc = true
        continue
      }
      if (char === '"') inStr = false
      continue
    }
    if (char === '"') {
      inStr = true
      continue
    }
    if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return source.slice(startIndex, index + 1)
    }
  }
  return null
}

function decodeFlightChunks(html: string): string {
  const chunks: string[] = []
  const pattern = /self\.__next_f\.push\(\[\d+,("(?:\\.|[^"\\])*")\]\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html))) {
    try {
      chunks.push(JSON.parse(match[1]) as string)
    } catch {
      chunks.push(match[1])
    }
  }
  return chunks.join('')
}

function decodeLayers(value: string, times = 4): string {
  let current = value
  for (let step = 0; step < times; step += 1) {
    const next = current.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\u0026/g, '&')
    if (next === current) break
    current = next
  }
  return current
}

export function flightSource(html: string): string {
  const decoded = decodeFlightChunks(html)
  return decoded ? decodeLayers(decoded) : decodeLayers(html)
}

export function extractJsonValue(source: string, key: string): unknown {
  const marker = `"${key}":`
  let from = 0
  while (from < source.length) {
    const hit = source.indexOf(marker, from)
    if (hit < 0) return null
    let cursor = hit + marker.length
    while (source[cursor] === ' ' || source[cursor] === '\n') cursor += 1
    const raw = extractBalanced(source, cursor)
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch {
        from = hit + marker.length
        continue
      }
    }
    from = hit + marker.length
  }
  return null
}

export function extractIpoDetail(html: string): Record<string, unknown> | null {
  const source = flightSource(html)
  const ipo = extractJsonValue(source, 'ipo')
  if (ipo && typeof ipo === 'object' && ipo !== null && 'name' in ipo) {
    return ipo as Record<string, unknown>
  }
  return null
}

export function extractListedRows(html: string): Record<string, unknown>[] {
  const source = flightSource(html)
  const marker = '"rows":'
  let from = 0
  while (from < source.length) {
    const hit = source.indexOf(marker, from)
    if (hit < 0) return []
    let cursor = hit + marker.length
    while (source[cursor] === ' ' || source[cursor] === '\n') cursor += 1
    const raw = extractBalanced(source, cursor)
    from = hit + marker.length
    if (!raw) continue
    try {
      const rows = JSON.parse(raw) as unknown
      if (!Array.isArray(rows)) continue
      const listed = rows.filter((row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === 'object' && 'name' in row && 'slug' in row && 'listingGainPct' in row,
      )
      if (listed.length > 0) return listed
    } catch {
      continue
    }
  }
  return []
}
