import type { MarketCap } from './types'

/** Classify by market cap in ₹ Cr (AMFI-style buckets). */
export function capFromMcap(mcap: number | null | undefined, universe = ''): MarketCap | null {
  if (mcap != null && mcap > 0) {
    if (mcap >= 80_000) return 'Large'
    if (mcap >= 25_000) return 'Mid'
    return 'Small'
  }
  const token = universe.toLowerCase()
  if (token.includes('small')) return 'Small'
  if (token.includes('mid')) return 'Mid'
  if (token.includes('nifty50') || token.includes('nifty100')) return 'Large'
  return null
}

/** Parse Groww / NSE style values like "₹8,91,135Cr" or "₹5,23,456.12 Cr". */
export function parseMcapCr(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const lower = text
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/₹/g, '')
    .replace(/rs\.?/g, '')
  const match = lower.match(/([\d.]+)(cr|crore)?/)
  if (!match) return null
  let n = Number(match[1])
  if (!Number.isFinite(n) || n <= 0) return null
  if (!match[2] && n > 10_000_000) n = n / 10_000_000
  return n
}

export function mcapFromFundamentals(rows: { name: string; value: string }[]): number | null {
  const row = rows.find((item) => /market\s*cap|market\s*capitali[sz]ation/i.test(item.name))
  return row ? parseMcapCr(row.value) : null
}

export function resolveLiveCap(
  symbol: string,
  liveCaps?: Map<string, MarketCap>,
): MarketCap | null {
  return liveCaps?.get(symbol.toUpperCase()) ?? null
}
