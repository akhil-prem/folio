import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LineChart,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  apiFetch,
  changePassword,
  createHolding,
  createMember,
  deleteHolding as deleteHoldingRequest,
  deleteMember as deleteMemberRequest,
  fetchAccount,
  fetchHoldings,
  fetchMembers,
  loginRequest,
  logoutRequest,
  patchHolding,
  saveAccount,
  setToken,
} from './api'
import { IposPage } from './IposPage'
import { KpiSkeleton, TableSkeleton } from './loading'
import { SECTORS, SECTOR_TREE, classifyStock } from './sectors'
import type { Account, Holding, MarketCap, Member } from './types'

type View = 'dashboard' | 'members' | 'markets' | 'ipos' | 'profile' | 'password'
type ModalState = { type: 'member' } | { type: 'holding'; memberId?: string } | null
type HoldingSort = 'invested-desc' | 'invested-asc' | 'symbol-asc' | 'quantity-desc' | 'sector-asc'

type MarketQuote = {
  price: number
  change: number
  changeAbs: number
  isLive?: boolean
  marketTime?: string
}

type MarketExtra = {
  name: string
  unit: string
  price: number
  change: number
  marketTime?: string
}

type MarketSector = {
  name: string
  ticker: string
  icon: string
  price: number
  change: number
  changeAbs: number
}

type MarketNews = {
  title: string
  link: string
  source: string
  pubDate: string
}

type MarketOverview = {
  success: boolean
  indices: {
    nse: MarketQuote
    bse: MarketQuote
    giftnifty?: MarketQuote
  }
  extras: MarketExtra[]
  sectors?: MarketSector[]
  news?: MarketNews[]
  timestamp: string
  cached?: boolean
}

type MarketMover = {
  symbol: string
  name: string
  ltp: number
  changePct: number
}

type StockQuote = {
  symbol: string
  name: string
  sector: string
  cmp: number | null
  pe: number | null
  mcap: number | null
  universe: string
}

type StockSuggestion = {
  symbol: string
  name: string
  sector: string
  industry: string
  mcap: number | null
  searchId?: string
  summary?: string
}

const CHART_COLORS = ['#244d3c', '#e8995d', '#7267d9', '#e0ba4c', '#d76868', '#3f85a6', '#77a87a']
const emptyAccount: Account = { name: '', email: '', phone: '', role: '' }

const money = (amount: number, compact = false) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(amount)

const shortMoney = (amount: number) => money(amount, true)
const compactCount = (value: number) =>
  new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const inrPrice = (price: number) => price.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const signedPercent = (change: number) => `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`
const initials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()

function parseStockQuote(payload: unknown): StockQuote | null {
  if (!payload || typeof payload !== 'object') return null
  const data = payload as {
    success?: boolean
    sector?: string
    stock?: { symbol: string; name: string }
    fundamentals?: { cmp?: number; pe?: number; mcap?: number; universe?: string }
  }
  if (!data.success || !data.stock) return null
  return {
    symbol: data.stock.symbol,
    name: data.stock.name,
    sector: typeof data.sector === 'string' && data.sector.toLowerCase() !== 'unknown' ? data.sector : '',
    cmp: data.fundamentals?.cmp ?? null,
    pe: data.fundamentals?.pe ?? null,
    mcap: data.fundamentals?.mcap ?? null,
    universe: data.fundamentals?.universe ?? '',
  }
}

function classifyFromSuggestion(item: Pick<StockSuggestion, 'industry' | 'sector' | 'name' | 'symbol' | 'summary'>): ReturnType<typeof classifyStock> {
  return classifyStock({
    industry: item.industry,
    sector: item.sector,
    name: item.name,
    symbol: item.symbol,
    summary: item.summary,
  })
}

function normalizeHolding(holding: Holding): Holding {
  if (holding.subSector && SECTOR_TREE[holding.sector]?.includes(holding.subSector)) return holding
  const classified = classifyStock({
    industry: holding.subSector,
    sector: holding.sector,
    name: holding.company,
    symbol: holding.symbol,
  })
  return { ...holding, sector: classified.sector, subSector: classified.subSector }
}

function capFromMcap(mcap: number | null, universe = ''): MarketCap | '' {
  if (mcap != null && mcap > 0) {
    if (mcap >= 80_000) return 'Large'
    if (mcap >= 25_000) return 'Mid'
    return 'Small'
  }
  const token = universe.toLowerCase()
  if (token.includes('small')) return 'Small'
  if (token.includes('mid')) return 'Mid'
  if (token.includes('nifty50') || token.includes('nifty100')) return 'Large'
  return ''
}

function nseSymbolFromYahoo(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/i, '').toUpperCase()
}

function parseEquityCsv(csv: string): StockSuggestion[] {
  const rows: StockSuggestion[] = []
  const seen = new Set<string>()
  for (const line of csv.split(/\r?\n/).slice(1)) {
    const match = line.match(/^"?([^",]+)"?,\s*"?(.+?)"?,\s*"?([A-Z]{2,3})"?,/i)
    if (!match) continue
    const symbol = match[1].trim().toUpperCase()
    const name = match[2].trim()
    const series = match[3].trim().toUpperCase()
    if (!symbol || !name || seen.has(symbol)) continue
    if (!['EQ', 'BE', 'SM', 'BZ'].includes(series)) continue
    if (/-(RE|PP|W\d+)$/i.test(symbol)) continue
    seen.add(symbol)
    rows.push({ symbol, name, sector: '', industry: '', mcap: null })
  }
  return rows
}

function parseYahooSuggestions(payload: unknown): StockSuggestion[] {
  if (!payload || typeof payload !== 'object') return []
  const data = payload as {
    quotes?: Array<{
      exchange?: string
      quoteType?: string
      symbol?: string
      shortname?: string
      longname?: string
      sector?: string
      sectorDisp?: string
      industry?: string
      industryDisp?: string
    }>
  }
  const seen = new Set<string>()
  const rows: StockSuggestion[] = []
  for (const quote of data.quotes ?? []) {
    if (quote.quoteType && quote.quoteType !== 'EQUITY') continue
    if (quote.exchange && !['NSI', 'BSE'].includes(quote.exchange)) continue
    const symbol = nseSymbolFromYahoo(String(quote.symbol ?? ''))
    if (!symbol || seen.has(symbol) || /-(RE|PP|W\d+)$/i.test(symbol)) continue
    seen.add(symbol)
    rows.push({
      symbol,
      name: String(quote.longname || quote.shortname || symbol),
      sector: String(quote.sectorDisp || quote.sector || ''),
      industry: String(quote.industryDisp || quote.industry || ''),
      mcap: null,
    })
  }
  return rows
}

function parseGrowwSuggestions(payload: unknown): StockSuggestion[] {
  if (!payload || typeof payload !== 'object') return []
  const data = payload as {
    content?: Array<{
      entity_type?: string
      nse_scrip_code?: string
      title?: string
      company_short_name?: string
      search_id?: string
      id?: string
    }>
  }
  const seen = new Set<string>()
  const rows: StockSuggestion[] = []
  for (const item of data.content ?? []) {
    if (item.entity_type && item.entity_type !== 'Stocks') continue
    const symbol = String(item.nse_scrip_code ?? '').toUpperCase()
    if (!symbol || seen.has(symbol) || /-(RE|PP|W\d+)$/i.test(symbol)) continue
    seen.add(symbol)
    rows.push({
      symbol,
      name: String(item.title || item.company_short_name || symbol),
      sector: '',
      industry: '',
      mcap: null,
      searchId: item.search_id || item.id || '',
    })
  }
  return rows
}

function rankSuggestions(rows: StockSuggestion[], query: string): StockSuggestion[] {
  const needle = query.trim().toLowerCase()
  const upper = needle.toUpperCase()
  return [...rows]
    .map((row) => {
      const symbol = row.symbol.toLowerCase()
      const name = row.name.toLowerCase()
      let score = 80
      if (row.symbol === upper) score = 0
      else if (symbol.startsWith(needle)) score = 1
      else if (name.startsWith(needle)) score = 2
      else if (name.split(/[^a-z0-9]+/).some((part) => part.startsWith(needle))) score = 3
      else if (name.includes(needle)) score = 4
      else if (symbol.includes(needle)) score = 5
      return { row, score }
    })
    .filter((item) => item.score < 80)
    .sort((a, b) => a.score - b.score || a.row.symbol.localeCompare(b.row.symbol))
    .map((item) => item.row)
}

function mergeSuggestions(...lists: StockSuggestion[][]): StockSuggestion[] {
  const merged = new Map<string, StockSuggestion>()
  for (const list of lists) {
    for (const row of list) {
      const previous = merged.get(row.symbol)
      merged.set(row.symbol, {
        symbol: row.symbol,
        name: row.name || previous?.name || row.symbol,
        sector: row.sector || previous?.sector || '',
        industry: row.industry || previous?.industry || '',
        mcap: row.mcap ?? previous?.mcap ?? null,
        searchId: row.searchId || previous?.searchId,
        summary: row.summary || previous?.summary,
      })
    }
  }
  return [...merged.values()]
}

let nseEquityCache: StockSuggestion[] | null = null
let nseEquityPromise: Promise<StockSuggestion[]> | null = null

async function loadNseEquities(): Promise<StockSuggestion[]> {
  if (nseEquityCache) return nseEquityCache
  if (nseEquityPromise) return nseEquityPromise
  nseEquityPromise = apiFetch('/api/nse-equities')
    .then(async (response) => {
      if (!response.ok) throw new Error('nse list failed')
      nseEquityCache = parseEquityCsv(await response.text())
      return nseEquityCache
    })
    .catch(() => {
      nseEquityPromise = null
      return [] as StockSuggestion[]
    })
  return nseEquityPromise
}

async function searchStocks(query: string, signal?: AbortSignal): Promise<StockSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const [local, yahoo, groww] = await Promise.all([
    loadNseEquities().then((list) => rankSuggestions(list, q).slice(0, 20)),
    apiFetch(`/api/stock-search?q=${encodeURIComponent(q)}`, { signal })
      .then(async (response) => (response.ok ? parseYahooSuggestions(await response.json()) : []))
      .catch(() => [] as StockSuggestion[]),
    apiFetch(`/api/groww-search?q=${encodeURIComponent(q)}`, { signal })
      .then(async (response) => (response.ok ? parseGrowwSuggestions(await response.json()) : []))
      .catch(() => [] as StockSuggestion[]),
  ])
  return rankSuggestions(mergeSuggestions(local, groww, yahoo), q).slice(0, 12)
}

async function fetchStockQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const response = await apiFetch(`/api/stocks/${encodeURIComponent(symbol)}`)
    if (!response.ok) return null
    return parseStockQuote(await response.json())
  } catch {
    return null
  }
}

const profileCache = new Map<string, StockSuggestion>()

async function fetchYahooProfile(symbol: string): Promise<StockSuggestion | null> {
  const key = symbol.toUpperCase()
  const cached = profileCache.get(key)
  if (cached?.industry) return cached
  try {
    const response = await apiFetch(`/api/stock-search?q=${encodeURIComponent(key)}`)
    if (!response.ok) return cached ?? null
    const match = parseYahooSuggestions(await response.json()).find((row) => row.symbol === key)
    if (!match) return cached ?? null
    const merged = {
      ...match,
      searchId: match.searchId || cached?.searchId,
      summary: match.summary || cached?.summary,
    }
    profileCache.set(key, merged)
    return merged
  } catch {
    return cached ?? null
  }
}

async function fetchGrowwProfile(searchId: string): Promise<{ industry: string; summary: string } | null> {
  if (!searchId) return null
  try {
    const response = await apiFetch(`/api/groww-company?id=${encodeURIComponent(searchId)}`)
    if (!response.ok) return null
    const payload = await response.json() as {
      header?: { industryName?: string }
      details?: { businessSummary?: string }
    }
    return {
      industry: payload.header?.industryName || '',
      summary: payload.details?.businessSummary || '',
    }
  } catch {
    return null
  }
}

async function classifyListedStock(input: {
  symbol: string
  name?: string
  industry?: string
  sector?: string
  searchId?: string
  summary?: string
}) {
  const [yahoo, groww] = await Promise.all([
    fetchYahooProfile(input.symbol),
    fetchGrowwProfile(input.searchId || ''),
  ])
  return classifyStock({
    industry: yahoo?.industry || input.industry,
    sector: yahoo?.sector || input.sector,
    name: yahoo?.name || input.name,
    symbol: input.symbol,
    summary: groww?.summary || input.summary,
  })
}

function sectorTone(change: number) {
  if (change >= 1.5) return 'hot-up'
  if (change >= 0) return 'up'
  if (change > -1.5) return 'down'
  return 'hot-down'
}

function parseNseMovers(payload: unknown, direction: 'up' | 'down'): MarketMover[] {
  if (!payload || typeof payload !== 'object') return []
  const data = payload as Record<string, { data?: Array<Record<string, unknown>> }>
  const seen = new Set<string>()
  const rows: MarketMover[] = []
  for (const bucket of ['NIFTY', 'NIFTYNEXT50', 'BANKNIFTY', 'FOSec']) {
    for (const row of data[bucket]?.data ?? []) {
      const symbol = String(row.symbol ?? '')
      const series = String(row.series ?? 'EQ')
      const ltp = Number(row.ltp ?? 0)
      const changePct = Number(row.perChange ?? 0)
      if (!symbol || seen.has(symbol) || series !== 'EQ' || ltp < 50) continue
      if (/-(RE|PP|W\d+)$/i.test(symbol)) continue
      seen.add(symbol)
      rows.push({ symbol, name: symbol, ltp, changePct })
    }
  }
  rows.sort((a, b) => direction === 'up' ? b.changePct - a.changePct : a.changePct - b.changePct)
  return rows.slice(0, 10)
}

async function lookupStockNames(symbols: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(symbols)]
  const entries = await Promise.all(unique.map(async (symbol) => {
    try {
      const response = await apiFetch(`/api/stocks/${encodeURIComponent(symbol)}`)
      if (!response.ok) return [symbol, symbol] as const
      const quote = parseStockQuote(await response.json())
      return [symbol, quote?.name || symbol] as const
    } catch {
      return [symbol, symbol] as const
    }
  }))
  return new Map(entries)
}

function StockLabel({ symbol, name }: { symbol: string; name: string }) {
  return <><strong>{symbol}</strong><span>{name}</span></>
}

const investedOf = (holding: Holding) => holding.quantity * holding.avgPrice
const allocationBy = (holdings: Holding[], key: (holding: Holding) => string) => {
  const values = new Map<string, { value: number; count: number }>()
  holdings.forEach((holding) => {
    const name = key(holding) || 'Diversified'
    const current = values.get(name) ?? { value: 0, count: 0 }
    values.set(name, { value: current.value + investedOf(holding), count: current.count + 1 })
  })
  return [...values].map(([name, data]) => ({ name, ...data })).sort((a, b) => b.value - a.value)
}
const csvCell = (value: string | number) => {
  const text = String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

const downloadFile = (content: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function App() {
  const [account, setAccount] = useState<Account>(emptyAccount)
  const [authenticated, setAuthenticated] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [members, setMembers] = useState<Member[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])

  const loadWorkspace = async () => {
    const [nextMembers, nextHoldings] = await Promise.all([fetchMembers(), fetchHoldings()])
    const normalized = nextHoldings.map(normalizeHolding)
    setMembers(nextMembers)
    setHoldings(normalized)
    const symbols = [...new Set(normalized.map((item) => item.symbol.toUpperCase()))]
    const profiles = await Promise.all(symbols.map((symbol) => fetchYahooProfile(symbol)))
    const bySymbol = new Map(symbols.map((symbol, index) => [symbol, profiles[index]]))
    const enriched = normalized.map((holding) => {
      const profile = bySymbol.get(holding.symbol.toUpperCase())
      const classified = classifyStock({
        industry: profile?.industry,
        sector: profile?.sector,
        name: profile?.name || holding.company,
        symbol: holding.symbol,
      })
      return { ...holding, sector: classified.sector, subSector: classified.subSector }
    })
    setHoldings(enriched)
    await Promise.all(
      enriched.flatMap((holding, index) => {
        const previous = normalized[index]
        if (holding.sector === previous.sector && holding.subSector === previous.subSector) return []
        return [patchHolding(holding.id, { sector: holding.sector, subSector: holding.subSector }).catch(() => holding)]
      }),
    )
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const nextAccount = await fetchAccount()
        if (cancelled) return
        if (!nextAccount) {
          setToken(null)
          setAuthenticated(false)
          return
        }
        setAccount(nextAccount)
        await loadWorkspace()
        if (!cancelled) setAuthenticated(true)
      } catch {
        if (!cancelled) {
          setToken(null)
          setAuthenticated(false)
        }
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const [view, setView] = useState<View>('dashboard')
  const [ipoRefreshKey, setIpoRefreshKey] = useState(0)
  const [ipoBusy, setIpoBusy] = useState(false)
  const [uiBusy, setUiBusy] = useState(false)
  const flashUi = (action: () => void) => {
    setUiBusy(true)
    action()
    window.setTimeout(() => setUiBusy(false), 280)
  }
  const [selectedMember, setSelectedMember] = useState('all')
  const [modal, setModal] = useState<ModalState>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [showAllHoldings, setShowAllHoldings] = useState(false)
  const [holdingSearch, setHoldingSearch] = useState('')
  const [holdingSort, setHoldingSort] = useState<HoldingSort>('invested-desc')
  const [marketData, setMarketData] = useState<MarketOverview | null>(null)
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketError, setMarketError] = useState('')
  const [gainers, setGainers] = useState<MarketMover[]>([])
  const [losers, setLosers] = useState<MarketMover[]>([])
  const [stockQuotes, setStockQuotes] = useState<StockQuote[]>([])
  const [stockSearch, setStockSearch] = useState('')

  const uniqueSymbols = useMemo(
    () => [...new Set(holdings.map((holding) => holding.symbol.toUpperCase()))],
    [holdings],
  )

  const refreshMarket = useCallback(async () => {
    setMarketLoading(true)
    try {
      const [overviewRes, gainerRes, loserRes] = await Promise.all([
        apiFetch('/api/market-overview'),
        apiFetch('/api/nse-movers?index=gainers').catch(() => null),
        apiFetch('/api/nse-movers?index=loosers').catch(() => null),
      ])
      if (!overviewRes.ok) throw new Error(`Market service returned ${overviewRes.status}`)
      const data = await overviewRes.json() as MarketOverview
      if (!data.success) throw new Error('Market service returned an invalid response')
      setMarketData(data)
      setMarketError('')

      try {
        const gainerList = gainerRes?.ok ? parseNseMovers(await gainerRes.json(), 'up') : []
        const loserList = loserRes?.ok ? parseNseMovers(await loserRes.json(), 'down') : []
        const names = await lookupStockNames([...gainerList, ...loserList].map((item) => item.symbol))
        const withNames = (rows: MarketMover[]) => rows.map((row) => ({ ...row, name: names.get(row.symbol) ?? row.symbol }))
        setGainers(withNames(gainerList))
        setLosers(withNames(loserList))
      } catch {
        /* NSE sometimes returns an HTML challenge instead of JSON */
      }

      if (uniqueSymbols.length > 0) {
        const sectorBySymbol = new Map(holdings.map((holding) => [holding.symbol.toUpperCase(), holding.sector]))
        const quotes = await Promise.all(uniqueSymbols.map(async (symbol) => {
          try {
            const response = await apiFetch(`/api/stocks/${encodeURIComponent(symbol)}`)
            if (!response.ok) return null
            const quote = parseStockQuote(await response.json())
            if (!quote) return null
            if (quote.sector === 'Unknown') quote.sector = sectorBySymbol.get(symbol) ?? 'Unknown'
            return quote
          } catch {
            return null
          }
        }))
        setStockQuotes(quotes.filter((quote): quote is StockQuote => quote !== null))
      } else {
        setStockQuotes([])
      }
    } catch {
      setMarketError('Live market data is temporarily unavailable.')
    } finally {
      setMarketLoading(false)
    }
  }, [uniqueSymbols, holdings])

  useEffect(() => {
    if (!authenticated || (view !== 'dashboard' && view !== 'markets')) return
    void refreshMarket()
    const timer = window.setInterval(() => void refreshMarket(), 60_000)
    return () => window.clearInterval(timer)
  }, [authenticated, view, refreshMarket])

  const visibleHoldings = useMemo(
    () => selectedMember === 'all' ? holdings : holdings.filter((holding) => holding.memberId === selectedMember),
    [holdings, selectedMember],
  )

  const portfolio = useMemo(() => {
    const invested = visibleHoldings.reduce((sum, holding) => sum + investedOf(holding), 0)
    return { invested }
  }, [visibleHoldings])

  const sectorData = useMemo(() => allocationBy(visibleHoldings, (holding) => holding.sector), [visibleHoldings])
  const subSectorData = useMemo(
    () => allocationBy(visibleHoldings, (holding) => holding.subSector || holding.sector),
    [visibleHoldings],
  )

  const capData = useMemo(() => {
    const order: MarketCap[] = ['Large', 'Mid', 'Small']
    return order.map((cap) => ({ name: `${cap} cap`, count: visibleHoldings.filter((holding) => holding.cap === cap).length }))
  }, [visibleHoldings])

  const topHoldings = useMemo(
    () => [...visibleHoldings].sort((a, b) => investedOf(b) - investedOf(a)).slice(0, 5).map((holding) => ({
      symbol: holding.symbol,
      company: holding.company,
      value: investedOf(holding),
    })),
    [visibleHoldings],
  )

  const sortedHoldings = useMemo(() => {
    const query = holdingSearch.trim().toLowerCase()
    const filtered = visibleHoldings.filter((holding) => {
      const owner = members.find((member) => member.id === holding.memberId)?.name ?? ''
      return `${holding.symbol} ${holding.company} ${holding.sector} ${holding.subSector} ${holding.cap} ${owner}`.toLowerCase().includes(query)
    })

    return [...filtered].sort((a, b) => {
      if (holdingSort === 'invested-asc') return investedOf(a) - investedOf(b)
      if (holdingSort === 'symbol-asc') return a.symbol.localeCompare(b.symbol)
      if (holdingSort === 'quantity-desc') return b.quantity - a.quantity
      if (holdingSort === 'sector-asc') return a.sector.localeCompare(b.sector) || (a.subSector || '').localeCompare(b.subSector || '') || a.symbol.localeCompare(b.symbol)
      return investedOf(b) - investedOf(a)
    })
  }, [visibleHoldings, members, holdingSearch, holdingSort])

  if (bootstrapping) {
    return (
      <main className="auth-page">
        <section className="auth-form-side" style={{ display: 'grid', placeItems: 'center' }}>
          <Loader2 className="spinning" size={28} />
        </section>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <LoginScreen
        onLogin={async (email, password) => {
          const nextAccount = await loginRequest(email, password)
          setAccount(nextAccount)
          try {
            await loadWorkspace()
          } catch {
            setMembers([])
            setHoldings([])
          }
          setAuthenticated(true)
        }}
      />
    )
  }

  const selectedName = selectedMember === 'all'
    ? 'All members'
    : members.find((member) => member.id === selectedMember)?.name ?? 'Member'

  const pageMeta: Record<View, { eyebrow: string; title: string }> = {
    dashboard: { eyebrow: 'Portfolio intelligence', title: 'Good afternoon' },
    members: { eyebrow: 'Investor directory', title: 'Members' },
    markets: { eyebrow: 'Indian markets', title: 'Live market' },
    ipos: { eyebrow: 'Primary market', title: 'IPOs' },
    profile: { eyebrow: 'Account settings', title: 'My profile' },
    password: { eyebrow: 'Security', title: 'Change password' },
  }

  const addMember = async (member: Omit<Member, 'id' | 'joined' | 'color'>) => {
    const created = await createMember(member)
    setMembers([...members, created])
    setModal(null)
  }

  const addHolding = async (holding: Omit<Holding, 'id'>) => {
    const created = await createHolding(holding)
    setHoldings([...holdings, created])
    setModal(null)
  }

  const removeMember = async (member: Member) => {
    if (!window.confirm(`Remove ${member.name} and all their holdings?`)) return
    await deleteMemberRequest(member.id)
    setMembers(members.filter((item) => item.id !== member.id))
    setHoldings(holdings.filter((holding) => holding.memberId !== member.id))
    if (selectedMember === member.id) setSelectedMember('all')
  }

  const removeHolding = async (holding: Holding) => {
    if (!window.confirm(`Remove ${holding.symbol} from this portfolio?`)) return
    await deleteHoldingRequest(holding.id)
    setHoldings(holdings.filter((item) => item.id !== holding.id))
  }

  const exportHoldings = (format: 'csv' | 'json') => {
    const rows = sortedHoldings.map((holding) => ({
      member: members.find((member) => member.id === holding.memberId)?.name ?? '',
      symbol: holding.symbol,
      company: holding.company,
      sector: holding.sector,
      subSector: holding.subSector,
      marketCap: holding.cap,
      quantity: holding.quantity,
      averagePrice: holding.avgPrice,
      amountInvested: investedOf(holding),
    }))
    const date = new Date().toISOString().slice(0, 10)

    if (format === 'json') {
      downloadFile(JSON.stringify(rows, null, 2), `folio-holdings-${date}.json`, 'application/json')
      return
    }

    const headers = ['Member', 'Symbol', 'Company', 'Sector', 'Sub-sector', 'Market cap', 'Quantity', 'Average price', 'Amount invested']
    const csv = [
      headers.map(csvCell).join(','),
      ...rows.map((row) => [
        row.member,
        row.symbol,
        row.company,
        row.sector,
        row.subSector,
        row.marketCap,
        row.quantity,
        row.averagePrice,
        row.amountInvested,
      ].map(csvCell).join(',')),
    ].join('\r\n')
    downloadFile(csv, `folio-holdings-${date}.csv`, 'text/csv;charset=utf-8')
  }

  const logout = async () => {
    await logoutRequest()
    setAccount(emptyAccount)
    setMembers([])
    setHoldings([])
    setAuthenticated(false)
    setView('dashboard')
  }

  const filteredMembers = members.filter((member) =>
    `${member.name} ${member.email}`.toLowerCase().includes(memberSearch.toLowerCase()),
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><TrendingUp size={20} /></span><span>Folio</span></div>
        <nav className="side-nav">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}><LayoutDashboard size={19} /> Overview</button>
          <button className={view === 'markets' ? 'active' : ''} onClick={() => setView('markets')}><LineChart size={19} /> Live market</button>
          <button className={view === 'ipos' ? 'active' : ''} onClick={() => setView('ipos')}><Landmark size={19} /> IPOs</button>
          <button className={view === 'members' ? 'active' : ''} onClick={() => setView('members')}><UsersRound size={19} /> Members<span className="nav-count">{members.length}</span></button>
          <button className={view === 'profile' || view === 'password' ? 'active' : ''} onClick={() => setView('profile')}><UserRound size={19} /> Profile</button>
        </nav>
        <div className="sidebar-card">
          <div className="sparkle"><Sparkles size={18} /></div>
          <p className="eyebrow">Portfolio tip</p><strong>Stay diversified</strong>
          <span>Review sector concentration every month.</span>
        </div>
        <button className="sidebar-footer" onClick={() => setView('profile')}>
          <span className="avatar small">{initials(account.name)}</span>
          <div><strong>{account.name}</strong><span>{account.role}</span></div>
          <ChevronDown size={14} />
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><p className="eyebrow">{pageMeta[view].eyebrow}</p><h1>{pageMeta[view].title}</h1></div>
          <div className="top-actions">
            {(view === 'dashboard' || view === 'members') ? (
              <>
                <div className={`member-select${uiBusy || marketLoading ? ' loading' : ''}`}>
                  <UserRound size={17} />
                  <select
                    aria-label="Filter dashboard by member"
                    value={selectedMember}
                    disabled={uiBusy}
                    onChange={(event) => {
                      const value = event.target.value
                      flashUi(() => {
                        setSelectedMember(value)
                        setShowAllHoldings(false)
                        setHoldingSearch('')
                      })
                    }}
                  >
                    <option value="all">All members</option>
                    {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                  <ChevronDown size={15} />
                </div>
                <button className="button primary" onClick={() => setModal({ type: 'holding', memberId: selectedMember === 'all' ? undefined : selectedMember })}><Plus size={18} /> Add stock</button>
              </>
            ) : view === 'markets' ? (
              <button className={`button secondary${marketLoading ? ' loading' : ''}`} disabled={marketLoading} onClick={() => void refreshMarket()}><RefreshCw size={16} className={marketLoading ? 'spinning' : undefined} /> Refresh</button>
            ) : view === 'ipos' ? (
              <button className={`button secondary${ipoBusy ? ' loading' : ''}`} disabled={ipoBusy} onClick={() => setIpoRefreshKey((value) => value + 1)}><RefreshCw size={16} className={ipoBusy ? 'spinning' : undefined} /> Refresh</button>
            ) : (
              <button className="button secondary" onClick={logout}><LogOut size={17} /> Log out</button>
            )}
          </div>
        </header>

        {view === 'dashboard' && (
          <div className="page">
            <section className="hero-card">
              <div>
                <p className="hero-label"><Activity size={15} /> Investment snapshot</p>
                <h2>{money(portfolio.invested)}</h2>
                <p>Total amount invested for <strong>{selectedName}</strong></p>
              </div>
              <div className="return-pill positive">
                <BriefcaseBusiness size={20} />
                <div><strong>{visibleHoldings.length}</strong><span>stock holdings</span></div>
              </div>
              <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
            </section>

            <MarketPulse
              data={marketData}
              loading={marketLoading}
              error={marketError}
              onRefresh={refreshMarket}
              onOpenMarkets={() => setView('markets')}
            />

            <section className="metrics-grid">
              <Metric icon={<WalletCards size={20} />} color="green" label="Amount invested" value={shortMoney(portfolio.invested)} meta="Capital" />
              <Metric icon={<Trophy size={20} />} color="orange" label="Largest holding" value={topHoldings[0]?.symbol ?? '—'} meta={topHoldings[0] ? shortMoney(topHoldings[0].value) : 'No stocks'} />
              <Metric icon={<BriefcaseBusiness size={20} />} color="violet" label="Stocks owned" value={String(visibleHoldings.length)} meta={`${sectorData.length} sectors · ${subSectorData.length} sub-sectors`} />
              <Metric icon={<UsersRound size={20} />} color="blue" label="Active members" value={String(selectedMember === 'all' ? members.length : 1)} meta="Profiles" />
            </section>

            {visibleHoldings.length === 0 ? <EmptyState onAdd={() => setModal({ type: 'holding' })} /> : (
              <>
                <section className="chart-grid">
                  <article className="panel">
                    <PanelHeader title="Sector allocation" subtitle="Invested amount by main sector" />
                    <div className="donut-layout">
                      <div className="donut-wrap">
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie data={sectorData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={99} paddingAngle={3} stroke="none">
                              {sectorData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(value) => money(Number(value))} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="donut-center"><strong>{sectorData.length}</strong><span>sectors</span></div>
                      </div>
                      <div className="legend-list">
                        {sectorData.slice(0, 6).map((sector, index) => (
                          <div className="legend-row" key={sector.name}>
                            <span className="legend-dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span>{sector.name}<small>{sector.count} {sector.count === 1 ? 'stock' : 'stocks'}</small></span>
                            <strong>{portfolio.invested ? ((sector.value / portfolio.invested) * 100).toFixed(1) : 0}%</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                  <article className="panel">
                    <PanelHeader title="Sub-sector allocation" subtitle="Invested amount by sub-sector" />
                    <div className="donut-layout">
                      <div className="donut-wrap">
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie data={subSectorData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={99} paddingAngle={3} stroke="none">
                              {subSectorData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(value) => money(Number(value))} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="donut-center"><strong>{subSectorData.length}</strong><span>sub-sectors</span></div>
                      </div>
                      <div className="legend-list">
                        {subSectorData.slice(0, 6).map((sector, index) => (
                          <div className="legend-row" key={sector.name}>
                            <span className="legend-dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span>{sector.name}<small>{sector.count} {sector.count === 1 ? 'stock' : 'stocks'}</small></span>
                            <strong>{portfolio.invested ? ((sector.value / portfolio.invested) * 100).toFixed(1) : 0}%</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </section>

                <section className="chart-grid sector-count-panel">
                  <article className="panel">
                    <PanelHeader title="Stock count by size" subtitle="Large, mid and small cap mix" />
                    <div className="bar-chart">
                      <ResponsiveContainer width="100%" height={272}>
                        <BarChart data={capData} margin={{ top: 15, right: 5, left: -22, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="#eceae4" strokeDasharray="4 4" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#77766f', fontSize: 12 }} />
                          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9a9993', fontSize: 11 }} />
                          <Tooltip cursor={{ fill: '#f5f3ed' }} />
                          <Bar dataKey="count" radius={[8, 8, 2, 2]} maxBarSize={62}>
                            {capData.map((entry, index) => <Cell key={entry.name} fill={['#244d3c', '#e8995d', '#d9ba59'][index]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                  <article className="panel">
                    <PanelHeader title="Stocks by sector" subtitle="Holdings in each main sector" />
                    <div className="sector-count-chart" style={{ height: Math.max(240, sectorData.length * 42) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sectorData} layout="vertical" margin={{ top: 16, right: 22, left: 8, bottom: 0 }}>
                          <CartesianGrid horizontal={false} stroke="#eceae4" strokeDasharray="4 4" />
                          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#9a9993', fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={118} axisLine={false} tickLine={false} tick={{ fill: '#686c67', fontSize: 11 }} />
                          <Tooltip formatter={(value) => [`${Number(value)} ${Number(value) === 1 ? 'stock' : 'stocks'}`, 'Holdings']} cursor={{ fill: '#f5f3ed' }} />
                          <Bar dataKey="count" radius={[0, 7, 7, 0]} maxBarSize={22}>
                            {sectorData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                </section>

                <section className="panel sector-count-panel">
                  <PanelHeader title="Invested by sub-sector" subtitle="Capital allocated across sub-sectors" />
                  <div className="sector-count-chart" style={{ height: Math.max(240, subSectorData.length * 42) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subSectorData} layout="vertical" margin={{ top: 16, right: 22, left: 8, bottom: 0 }}>
                        <CartesianGrid horizontal={false} stroke="#eceae4" strokeDasharray="4 4" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#9a9993', fontSize: 11 }} tickFormatter={(value) => shortMoney(Number(value))} />
                        <YAxis type="category" dataKey="name" width={150} axisLine={false} tickLine={false} tick={{ fill: '#686c67', fontSize: 11 }} />
                        <Tooltip formatter={(value) => money(Number(value))} cursor={{ fill: '#f5f3ed' }} />
                        <Bar dataKey="value" radius={[0, 7, 7, 0]} maxBarSize={22}>
                          {subSectorData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="holdings-section">
                  <article className="panel top-holdings-panel">
                    <PanelHeader title="Top 5 holdings" subtitle="Ranked by amount invested" />
                    <div className="top-holdings-grid">
                      {topHoldings.map((holding, index) => {
                        const max = topHoldings[0]?.value || 1
                        return (
                          <div className="top-holding-card" key={holding.symbol}>
                            <div className="holding-rank">0{index + 1}</div>
                            <span className="holding-symbol">{holding.symbol}</span>
                            <span className="holding-company">{holding.company}</span>
                            <strong>{shortMoney(holding.value)}</strong>
                            <div className="track"><span style={{ width: `${(holding.value / max) * 100}%`, background: CHART_COLORS[index % CHART_COLORS.length] }} /></div>
                          </div>
                        )
                      })}
                    </div>
                  </article>
                  <article className="panel holdings-table-panel">
                    <PanelHeader
                      title="Stock holdings"
                      subtitle={holdingSearch ? `${sortedHoldings.length} of ${visibleHoldings.length} stocks match` : `${visibleHoldings.length} stocks in this view`}
                    />
                    <div className="holdings-toolbar">
                      <div className="search-box holdings-search">
                        <Search size={16} />
                        <input
                          value={holdingSearch}
                          onChange={(event) => {
                            setHoldingSearch(event.target.value)
                            setShowAllHoldings(false)
                          }}
                          placeholder="Search symbol, company, sector, sub-sector..."
                          aria-label="Search stock holdings"
                        />
                        {holdingSearch && <button className="clear-search" onClick={() => setHoldingSearch('')} aria-label="Clear holdings search"><X size={14} /></button>}
                      </div>
                      <div className={`select-shell${uiBusy ? ' loading' : ''}`}>
                      <select
                        className="holdings-sort"
                        value={holdingSort}
                        disabled={uiBusy}
                        onChange={(event) => {
                          const value = event.target.value as HoldingSort
                          flashUi(() => {
                            setHoldingSort(value)
                            setShowAllHoldings(false)
                          })
                        }}
                        aria-label="Sort stock holdings"
                      >
                        <option value="invested-desc">Invested: high to low</option>
                        <option value="invested-asc">Invested: low to high</option>
                        <option value="symbol-asc">Symbol: A to Z</option>
                        <option value="quantity-desc">Quantity: high to low</option>
                        <option value="sector-asc">Sector / sub-sector: A to Z</option>
                      </select>
                      </div>
                      <div className="export-actions">
                        <button className="button secondary" onClick={() => exportHoldings('csv')} disabled={sortedHoldings.length === 0}><Download size={15} /> CSV</button>
                        <button className="button secondary" onClick={() => exportHoldings('json')} disabled={sortedHoldings.length === 0}><Download size={15} /> JSON</button>
                      </div>
                    </div>
                    <div className={`table-scroll${uiBusy ? ' is-busy' : ''}`}>
                      <table>
                        <thead><tr><th>Stock</th><th>Member</th><th>Quantity</th><th>Invested</th><th /></tr></thead>
                        <tbody>
                          {(showAllHoldings ? sortedHoldings : sortedHoldings.slice(0, 6)).map((holding) => {
                            const owner = members.find((member) => member.id === holding.memberId)
                            return (
                              <tr key={holding.id}>
                                <td>
                                  <StockLabel symbol={holding.symbol} name={holding.company} />
                                  <small className="holding-sector-line">{holding.sector} · {holding.subSector}</small>
                                </td>
                                <td>{owner?.name.split(' ')[0] ?? '—'}</td>
                                <td>{holding.quantity}</td>
                                <td>{shortMoney(investedOf(holding))}</td>
                                <td><button className="icon-button danger" title="Delete holding" onClick={() => removeHolding(holding)}><Trash2 size={15} /></button></td>
                              </tr>
                            )
                          })}
                          {sortedHoldings.length === 0 && (
                            <tr><td className="holdings-no-results" colSpan={5}>No stocks match your search.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {sortedHoldings.length > 6 && (
                      <div className="holdings-list-footer">
                        <span>
                          Showing {showAllHoldings ? sortedHoldings.length : 6} of {sortedHoldings.length} stocks
                        </span>
                        <button
                          className={`button secondary${uiBusy ? ' loading' : ''}`}
                          disabled={uiBusy}
                          onClick={() => flashUi(() => setShowAllHoldings(!showAllHoldings))}
                        >
                          {uiBusy ? <Loader2 size={15} className="spinning" /> : null}
                          {showAllHoldings ? 'Show fewer' : `View all ${sortedHoldings.length} stocks`}
                        </button>
                      </div>
                    )}
                  </article>
                </section>
              </>
            )}
          </div>
        )}

        {view === 'ipos' && (
          <IposPage refreshKey={ipoRefreshKey} onBusy={setIpoBusy} />
        )}

        {view === 'markets' && (
          <MarketsPage
            data={marketData}
            loading={marketLoading}
            error={marketError}
            gainers={gainers}
            losers={losers}
            stockQuotes={stockQuotes}
            stockSearch={stockSearch}
            onStockSearch={setStockSearch}
            onRefresh={refreshMarket}
          />
        )}

        {view === 'members' && (
          <div className="page members-page">
            <section className="members-toolbar">
              <div className="search-box"><Search size={17} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search members..." /></div>
              <button className="button secondary" onClick={() => setModal({ type: 'member' })}><Plus size={18} /> New member</button>
            </section>
            <section className="member-grid">
              {filteredMembers.map((member) => {
                const memberHoldings = holdings.filter((holding) => holding.memberId === member.id)
                const invested = memberHoldings.reduce((sum, holding) => sum + investedOf(holding), 0)
                return (
                  <article className="member-card" key={member.id}>
                    <div className="member-card-head"><span className="avatar" style={{ background: member.color }}>{initials(member.name)}</span><button className="icon-button danger" title="Delete member" onClick={() => removeMember(member)}><Trash2 size={16} /></button></div>
                    <h3>{member.name}</h3><p>{member.email}</p>
                    <div className="member-stat-row">
                      <div><span>Amount invested</span><strong>{shortMoney(invested)}</strong></div>
                      <div><span>Holdings</span><strong>{memberHoldings.length}</strong></div>
                    </div>
                    <div className="member-stock-list">
                      {memberHoldings.slice(0, 3).map((holding) => <span key={holding.id}>{holding.symbol}<small>{holding.cap[0]}</small></span>)}
                      {memberHoldings.length > 3 && <span className="more-stock">+{memberHoldings.length - 3}</span>}
                      {memberHoldings.length === 0 && <em>No stocks added</em>}
                    </div>
                    <button className="member-add" onClick={() => setModal({ type: 'holding', memberId: member.id })}><Plus size={16} /> Add stock</button>
                  </article>
                )
              })}
              <button className="new-member-card" onClick={() => setModal({ type: 'member' })}><span><Plus size={25} /></span><strong>Add new member</strong><small>Create another portfolio</small></button>
            </section>
          </div>
        )}

        {view === 'profile' && (
          <ProfileScreen
            account={account}
            onSave={async (next) => setAccount(await saveAccount(next))}
            onChangePassword={() => setView('password')}
            onLogout={logout}
          />
        )}

        {view === 'password' && (
          <ChangePasswordScreen
            onSave={async (current, next) => { await changePassword(current, next) }}
            onBack={() => setView('profile')}
          />
        )}

        <nav className="mobile-nav">
          <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}><LayoutDashboard size={20} /><span>Overview</span></button>
          <button className={view === 'markets' ? 'active' : ''} onClick={() => setView('markets')}><LineChart size={20} /><span>Markets</span></button>
          <button className={view === 'ipos' ? 'active' : ''} onClick={() => setView('ipos')}><Landmark size={20} /><span>IPOs</span></button>
          <button className={view === 'members' ? 'active' : ''} onClick={() => setView('members')}><UsersRound size={20} /><span>Members</span></button>
          <button className={view === 'profile' || view === 'password' ? 'active' : ''} onClick={() => setView('profile')}><UserRound size={20} /><span>Profile</span></button>
        </nav>
      </main>

      {modal?.type === 'member' && <MemberModal onClose={() => setModal(null)} onSave={addMember} />}
      {modal?.type === 'holding' && <HoldingModal members={members} initialMemberId={modal.memberId} onClose={() => setModal(null)} onSave={addHolding} />}
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSigningIn(true)
    setError('')
    try {
      await onLogin(email.trim(), password)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Incorrect email or password. Please try again.')
      setSigningIn(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-brand"><span className="brand-mark"><TrendingUp size={20} /></span><span>Folio</span></div>
        <div className="auth-message">
          <p className="eyebrow">Portfolio intelligence</p>
          <h1>One clear view of every member’s wealth.</h1>
          <p>Track holdings, understand allocation, and make confident decisions from one beautifully simple dashboard.</p>
        </div>
        <div className="auth-quote"><ShieldCheck size={20} /><span>Your portfolio is stored on the Folio server.</span></div>
        <div className="auth-ring ring-a" /><div className="auth-ring ring-b" />
      </section>
      <section className="auth-form-side">
        <form className="auth-card" onSubmit={(event) => void submit(event)}>
          <p className="eyebrow">Welcome back</p>
          <h2>Sign in to Folio</h2>
          <p className="auth-intro">Enter your account details to continue.</p>
          {error && <div className="form-alert">{error}</div>}
          <label>Email address<div className="input-with-icon"><Mail size={17} /><input autoFocus required type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} placeholder="you@example.com" /></div></label>
          <label>Password<div className="input-with-icon"><LockKeyhole size={17} /><input required type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          <button className={`button primary auth-submit${signingIn ? ' loading' : ''}`} disabled={signingIn}>
            {signingIn ? <Loader2 size={17} className="spinning" /> : <ArrowUpRight size={17} />}
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}

function ProfileScreen({ account, onSave, onChangePassword, onLogout }: {
  account: Account
  onSave: (account: Account) => Promise<void>
  onChangePassword: () => void
  onLogout: () => void
}) {
  const [form, setForm] = useState(account)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key: 'name' | 'email' | 'phone', value: string) => setForm({ ...form, [key]: value })
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page settings-page">
      <section className="profile-summary panel">
        <span className="profile-avatar">{initials(account.name)}</span>
        <div><p className="eyebrow">Signed in as</p><h2>{account.name}</h2><span>{account.role}</span></div>
        <span className="account-badge"><ShieldCheck size={14} /> Verified account</span>
      </section>
      <div className="settings-grid">
        <form className="settings-card panel" onSubmit={(event) => void submit(event)}>
          <PanelHeader title="Personal information" subtitle="Update your account details" />
          {saved && <div className="success-alert">Profile updated successfully.</div>}
          {error && <div className="form-alert">{error}</div>}
          <div className="settings-fields">
            <label>Full name<input required value={form.name} onChange={(event) => set('name', event.target.value)} /></label>
            <label>Email address<input required type="email" value={form.email} onChange={(event) => set('email', event.target.value)} /></label>
            <label>Phone number<input value={form.phone} onChange={(event) => set('phone', event.target.value)} /></label>
            <label>Account role<input disabled value={form.role} /></label>
          </div>
          <div className="settings-actions">
            <button className={`button primary${saving ? ' loading' : ''}`} disabled={saving}>
              {saving ? <Loader2 size={17} className="spinning" /> : <Save size={17} />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
        <aside className="security-card panel">
          <span className="security-icon"><KeyRound size={23} /></span>
          <h3>Password & security</h3>
          <p>Use a strong password and update it regularly to keep your account secure.</p>
          <button className="button secondary" onClick={onChangePassword}>Change password</button>
          <hr />
          <button className="logout-link" onClick={onLogout}><LogOut size={16} /> Log out of this device</button>
        </aside>
      </div>
    </div>
  )
}

function ChangePasswordScreen({ onSave, onBack }: {
  onSave: (current: string, next: string) => Promise<void>
  onBack: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (next.length < 8) return setMessage({ type: 'error', text: 'New password must be at least 8 characters.' })
    if (next !== confirm) return setMessage({ type: 'error', text: 'New passwords do not match.' })
    setSaving(true)
    try {
      await onSave(current, next)
      setCurrent(''); setNext(''); setConfirm('')
      setMessage({ type: 'success', text: 'Password changed successfully.' })
    } catch (caught) {
      setMessage({ type: 'error', text: caught instanceof Error ? caught.message : 'Could not update password.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page settings-page">
      <div className="password-layout">
        <section className="password-card panel">
          <span className="security-icon"><LockKeyhole size={24} /></span>
          <h2>Set a new password</h2>
          <p>Choose a unique password with at least 8 characters.</p>
          {message && <div className={`${message.type}-alert`}>{message.text}</div>}
          <form onSubmit={(event) => void submit(event)}>
            <label>Current password<input autoFocus required type="password" value={current} onChange={(event) => { setCurrent(event.target.value); setMessage(null) }} /></label>
            <label>New password<input required minLength={8} type="password" value={next} onChange={(event) => { setNext(event.target.value); setMessage(null) }} /></label>
            <label>Confirm new password<input required minLength={8} type="password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setMessage(null) }} /></label>
            <div className="settings-actions">
              <button type="button" className="button ghost" onClick={onBack} disabled={saving}>Cancel</button>
              <button className={`button primary${saving ? ' loading' : ''}`} disabled={saving}>
                {saving ? <Loader2 size={16} className="spinning" /> : null}
                {saving ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>
        <aside className="password-tips panel">
          <h3>A strong password</h3>
          <ul><li>Has at least 8 characters</li><li>Uses numbers and symbols</li><li>Is not used on another account</li></ul>
        </aside>
      </div>
    </div>
  )
}

function MarketsPage({
  data,
  loading,
  error,
  gainers,
  losers,
  stockQuotes,
  stockSearch,
  onStockSearch,
  onRefresh,
}: {
  data: MarketOverview | null
  loading: boolean
  error: string
  gainers: MarketMover[]
  losers: MarketMover[]
  stockQuotes: StockQuote[]
  stockSearch: string
  onStockSearch: (value: string) => void
  onRefresh: () => void | Promise<void>
}) {
  const [lookup, setLookup] = useState('')
  const [lookupQuote, setLookupQuote] = useState<StockQuote | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)

  const sectors = useMemo(
    () => [...(data?.sectors ?? [])].sort((a, b) => b.change - a.change),
    [data],
  )
  const extras = data?.extras?.slice(0, 8) ?? []
  const news = data?.news?.slice(0, 6) ?? []
  const marketIsLive = Boolean(data?.indices.nse?.isLive || data?.indices.bse?.isLive)
  const updatedAt = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : ''
  const filteredQuotes = useMemo(() => {
    const query = stockSearch.trim().toLowerCase()
    const list = [...stockQuotes].sort((a, b) => a.symbol.localeCompare(b.symbol))
    if (!query) return list
    return list.filter((quote) =>
      [quote.symbol, quote.name, quote.sector].some((field) =>
        field.toLowerCase().split(/[^a-z0-9]+/).some((part) => part.startsWith(query)),
      ),
    )
  }, [stockQuotes, stockSearch])
  const indices = data ? [
    { name: 'NIFTY 50', quote: data.indices.nse },
    { name: 'SENSEX', quote: data.indices.bse },
    { name: 'GIFT Nifty', quote: data.indices.giftnifty },
  ].flatMap((item) => (
    item.quote && Number.isFinite(item.quote.price)
      ? [{ name: item.name, price: item.quote.price, change: item.quote.change, changeAbs: item.quote.changeAbs }]
      : []
  )) : []
  const advancing = sectors.filter((sector) => sector.change >= 0).length
  const declining = sectors.length - advancing

  const lookupStock = async (event: FormEvent) => {
    event.preventDefault()
    const symbol = lookup.trim().toUpperCase()
    if (!symbol) return
    setLookupLoading(true)
    setLookupError('')
    try {
      const response = await apiFetch(`/api/stocks/${encodeURIComponent(symbol)}`)
      if (!response.ok) throw new Error('not found')
      const quote = parseStockQuote(await response.json())
      if (!quote) throw new Error('not found')
      setLookupQuote(quote)
    } catch {
      setLookupQuote(null)
      setLookupError(`No quote found for ${symbol}. Try an NSE symbol like INFY or HDFCBANK.`)
    } finally {
      setLookupLoading(false)
    }
  }

  return (
    <div className="page markets-page">
      {error && !data ? (
        <section className="market-error"><span>{error}</span><button onClick={() => void onRefresh()}>Try again</button></section>
      ) : (
        <>
          <section className="panel markets-hero">
            <div className="markets-hero-copy">
              <div className="market-title-row">
                <p className="eyebrow"><Radio size={12} /> India cash market</p>
                {data && <span className={`market-status ${marketIsLive ? 'live' : ''}`}><i />{marketIsLive ? 'Live market' : 'Market closed'}</span>}
              </div>
              <h2>Benchmarks, sectors, and stock quotes</h2>
              <p>Auto-refreshes every minute. Stock CMPs are the latest exchange prices, not tick-by-tick prices.</p>
            </div>
            <div className="markets-kpis">
              {loading && !data ? <KpiSkeleton /> : (
                <>
                  <div><span>Sectors up</span><strong className="text-positive">{advancing}</strong></div>
                  <div><span>Sectors down</span><strong className="text-negative">{declining}</strong></div>
                  <div><span>Updated</span><strong>{updatedAt || '—'}</strong></div>
                </>
              )}
            </div>
          </section>

          <section className="panel">
            <PanelHeader title="Benchmark indices" subtitle="NIFTY 50, Sensex and GIFT Nifty" />
            <div className="market-strip markets-index-strip">
              {(loading && !data ? Array.from({ length: 3 }, () => ({ skeleton: true })) : indices).map((item, index) => (
                'name' in item ? (
                  <div className="market-tile" key={item.name}>
                    <span>{item.name}</span>
                    <strong>{inrPrice(item.price)}</strong>
                    <small className={item.change >= 0 ? 'up' : 'down'}>
                      {item.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {signedPercent(item.change)} · {item.changeAbs >= 0 ? '+' : ''}{inrPrice(item.changeAbs)}
                    </small>
                  </div>
                ) : <div className="market-tile skeleton" key={index}><span /><strong /><small /></div>
              ))}
            </div>
            {extras.length > 0 && (
              <div className="extras-strip">
                {extras.map((item) => (
                  <div className="extra-chip" key={item.name}>
                    <span>{item.name}{item.unit ? ` · ${item.unit}` : ''}</span>
                    <strong>{inrPrice(item.price)}</strong>
                    <small className={item.change >= 0 ? 'up' : 'down'}>{signedPercent(item.change)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <PanelHeader title="Sector performance" subtitle="Nifty sectoral indices, strongest to weakest" />
            <div className="sector-heat">
              {(loading && !data ? Array.from({ length: 8 }, () => null) : sectors).map((sector, index) => (
                sector ? (
                  <article className={`sector-tile ${sectorTone(sector.change)}`} key={sector.ticker}>
                    <span className="sector-icon">{sector.icon}</span>
                    <h4>{sector.name}</h4>
                    <strong>{inrPrice(sector.price)}</strong>
                    <small className={sector.change >= 0 ? 'up' : 'down'}>
                      {sector.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {signedPercent(sector.change)} · {sector.changeAbs >= 0 ? '+' : ''}{inrPrice(sector.changeAbs)}
                    </small>
                  </article>
                ) : <article className="sector-tile skeleton" key={index}><span /><h4 /><strong /><small /></article>
              ))}
            </div>
          </section>

          <section className="markets-split">
            <article className="panel movers-panel gainers-panel">
              <PanelHeader title="Top gainers" subtitle="Nifty 50, Next 50, Bank Nifty and F&O names" />
              <MoverTable rows={gainers} loading={loading} empty="No gainer data right now." positive />
            </article>
            <article className="panel movers-panel losers-panel">
              <PanelHeader title="Top losers" subtitle="Nifty 50, Next 50, Bank Nifty and F&O names" />
              <MoverTable rows={losers} loading={loading} empty="No loser data right now." />
            </article>
          </section>

          <section className="panel">
              <PanelHeader title="Portfolio stocks" subtitle="Last available CMP, sector and valuation for holdings" />
              <div className="markets-toolbar">
                <div className="search-box holdings-search">
                  <Search size={16} />
                  <input
                    value={stockSearch}
                    onChange={(event) => onStockSearch(event.target.value)}
                    placeholder="Search symbol, company, sector..."
                    aria-label="Search portfolio stock quotes"
                  />
                  {stockSearch && <button className="clear-search" onClick={() => onStockSearch('')} aria-label="Clear stock search"><X size={14} /></button>}
                </div>
              </div>
              <div className={`table-scroll${loading ? ' is-busy' : ''}`}>
                <table>
                  <thead>
                    <tr><th>Stock</th><th>Sector</th><th>CMP</th><th>P/E</th><th>Mcap</th><th>Universe</th></tr>
                  </thead>
                  <tbody>
                    {loading && stockQuotes.length === 0 ? (
                      <TableSkeleton cols={6} rows={6} />
                    ) : filteredQuotes.length === 0 ? (
                      <tr><td className="holdings-no-results" colSpan={6}>{stockQuotes.length === 0 ? 'Add holdings to see stock quotes here, or look up a symbol below.' : 'No stocks match this search.'}</td></tr>
                    ) : filteredQuotes.map((quote) => (
                      <tr key={quote.symbol}>
                        <td><StockLabel symbol={quote.symbol} name={quote.name} /></td>
                        <td>{quote.sector}</td>
                        <td>{quote.cmp == null ? '—' : `₹${inrPrice(quote.cmp)}`}</td>
                        <td>{quote.pe == null ? '—' : quote.pe.toFixed(1)}</td>
                        <td>{quote.mcap == null ? '—' : `₹${compactCount(quote.mcap)} Cr`}</td>
                        <td>{quote.universe ? quote.universe.replaceAll('nifty', 'Nifty ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </section>

          <section className="panel">
            <PanelHeader title="Look up a stock" subtitle="Fetch CMP and fundamentals for any NSE symbol" />
            <form className="lookup-form" onSubmit={(event) => void lookupStock(event)}>
              <div className="search-box">
                <Search size={16} />
                <input
                  value={lookup}
                  onChange={(event) => { setLookup(event.target.value); setLookupError('') }}
                  placeholder="e.g. INFY, HDFCBANK, ITC"
                  aria-label="Stock symbol lookup"
                />
              </div>
              <button className={`button primary${lookupLoading ? ' loading' : ''}`} disabled={lookupLoading || !lookup.trim()}>
                {lookupLoading ? <Loader2 size={16} className="spinning" /> : null}
                {lookupLoading ? 'Looking up…' : 'Get quote'}
              </button>
            </form>
            {lookupError && <p className="lookup-error">{lookupError}</p>}
            {lookupQuote && (
              <div className="lookup-result">
                <div><strong>{lookupQuote.symbol}</strong><span>{lookupQuote.name}</span></div>
                <div><span>Sector</span><strong>{lookupQuote.sector}</strong></div>
                <div><span>CMP</span><strong>{lookupQuote.cmp == null ? '—' : `₹${inrPrice(lookupQuote.cmp)}`}</strong></div>
                <div><span>P/E</span><strong>{lookupQuote.pe == null ? '—' : lookupQuote.pe.toFixed(1)}</strong></div>
                <div><span>Mcap</span><strong>{lookupQuote.mcap == null ? '—' : `₹${compactCount(lookupQuote.mcap)} Cr`}</strong></div>
              </div>
            )}
          </section>

          {news.length > 0 && (
            <section className="panel">
              <PanelHeader title="Market headlines" subtitle="Latest stories bundled with the market overview" />
              <ul className="news-list">
                {news.map((item) => (
                  <li key={item.link}>
                    <a href={item.link} target="_blank" rel="noreferrer">
                      <strong>{item.title}</strong>
                      <span>{item.source} · {new Date(item.pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function MoverTable({ rows, loading, empty, positive = false }: {
  rows: MarketMover[]
  loading: boolean
  empty: string
  positive?: boolean
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr><th>Stock</th><th>LTP</th><th>Change</th></tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <TableSkeleton cols={3} rows={6} />
          ) : rows.length === 0 ? (
            <tr><td className="holdings-no-results" colSpan={3}>{empty}</td></tr>
          ) : rows.map((stock) => (
            <tr key={stock.symbol}>
              <td><StockLabel symbol={stock.symbol} name={stock.name} /></td>
              <td>₹{inrPrice(stock.ltp)}</td>
              <td>
                <span className={`mover-change ${positive || stock.changePct >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {signedPercent(stock.changePct)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MarketPulse({ data, loading, error, onRefresh, onOpenMarkets }: {
  data: MarketOverview | null
  loading: boolean
  error: string
  onRefresh: () => void | Promise<void>
  onOpenMarkets: () => void
}) {
  const indiaVix = data?.extras.find((item) => item.name === 'India VIX')
  const usdInr = data?.extras.find((item) => item.name === 'USD/INR')
  const items = data ? [
    { name: 'NIFTY 50', quote: data.indices.nse },
    { name: 'SENSEX', quote: data.indices.bse },
    { name: 'GIFT Nifty', quote: data.indices.giftnifty },
    ...(indiaVix ? [{ name: 'India VIX', quote: indiaVix }] : []),
    ...(usdInr ? [{ name: 'USD / INR', quote: usdInr }] : []),
  ].flatMap((item) => (
    item.quote && Number.isFinite(item.quote.price)
      ? [{ name: item.name, price: item.quote.price, change: item.quote.change }]
      : []
  )) : []
  const marketIsLive = Boolean(data?.indices.nse?.isLive || data?.indices.bse?.isLive)
  const updatedAt = data?.timestamp
    ? new Date(data.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : ''

  return (
    <section className="panel market-pulse">
      <div className="market-pulse-head">
        <div>
          <div className="market-title-row">
            <h3>Market pulse</h3>
            {data && <span className={`market-status ${marketIsLive ? 'live' : ''}`}><i />{marketIsLive ? 'Live market' : 'Market closed'}</span>}
          </div>
          <p>Indian indices and key market indicators</p>
        </div>
        <div className="market-head-actions">
          {updatedAt && <span>Updated {updatedAt} IST</span>}
          <button className="text-link" onClick={onOpenMarkets}>View full market</button>
          <button className={`icon-button refresh-market ${loading ? 'loading' : ''}`} disabled={loading} onClick={() => void onRefresh()} aria-label="Refresh market data" title="Refresh market data"><RefreshCw size={16} className={loading ? 'spinning' : undefined} /></button>
        </div>
      </div>

      {error && !data ? (
        <div className="market-error"><span>{error}</span><button onClick={() => void onRefresh()}>Try again</button></div>
      ) : (
        <div className="market-strip">
          {(loading && !data ? Array.from({ length: 5 }, () => ({ skeleton: true })) : items).map((item, index) => (
            'name' in item ? (
              <div className="market-tile" key={item.name}>
                <span>{item.name}</span>
                <strong>{inrPrice(item.price)}</strong>
                <small className={item.change >= 0 ? 'up' : 'down'}>
                  {item.change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {signedPercent(item.change)}
                </small>
              </div>
            ) : <div className="market-tile skeleton" key={index}><span /><strong /><small /></div>
          ))}
        </div>
      )}
      <div className="market-source">
        Auto-refreshes every minute · Data for information only · <a href="https://www.nseindia.com/" target="_blank" rel="noreferrer">NSE</a>
      </div>
    </section>
  )
}

function Metric({ icon, color, label, value, meta, valueClass = '' }: { icon: React.ReactNode; color: string; label: string; value: string; meta: string; valueClass?: string }) {
  return <article className="metric-card"><span className={`metric-icon ${color}`}>{icon}</span><div><p>{label}</p><h3 className={valueClass}>{value}</h3></div><span className="metric-meta">{meta}</span></article>
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="empty-state"><div className="empty-icon"><BarChart3 size={28} /></div><h3>No holdings yet</h3><p>Add a stock to start seeing portfolio insights.</p><button className="button primary" onClick={onAdd}><Plus size={17} /> Add stock</button></div>
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="panel-header"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="panel-menu">•••</span></div>
}

function MemberModal({ onClose, onSave }: { onClose: () => void; onSave: (member: Omit<Member, 'id' | 'joined' | 'color'>) => Promise<void> }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() && email.trim()) await onSave({ name: name.trim(), email: email.trim() })
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-head"><div><p className="eyebrow">Investor profile</p><h2>Add a member</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <label>Full name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ananya Rao" /></label>
        <label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ananya@example.com" /></label>
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary">Create member</button></div>
      </form>
    </div>
  )
}

function HoldingModal({ members, initialMemberId, onClose, onSave }: {
  members: Member[]
  initialMemberId?: string
  onClose: () => void
  onSave: (holding: Omit<Holding, 'id'>) => Promise<void>
}) {
  const [form, setForm] = useState({
    memberId: initialMemberId ?? members[0]?.id ?? '',
    symbol: '',
    company: '',
    sector: '',
    subSector: '',
    cap: '' as MarketCap | '',
    quantity: '',
    avgPrice: '',
  })
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const selectedSymbolRef = useRef('')
  const lookupRef = useRef(0)
  const sectorOptions = SECTORS.includes(form.sector) || !form.sector ? SECTORS : [form.sector, ...SECTORS]
  const subSectorOptions = form.sector
    ? (SECTOR_TREE[form.sector]?.includes(form.subSector) || !form.subSector
      ? SECTOR_TREE[form.sector] ?? []
      : [form.subSector, ...(SECTOR_TREE[form.sector] ?? [])])
    : []
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))

  const applySuggestion = useCallback(async (suggestion: StockSuggestion) => {
    const requestId = ++lookupRef.current
    selectedSymbolRef.current = suggestion.symbol
    setSearch(suggestion.symbol)
    setOpen(false)
    setSuggestions([])
    const initial = classifyFromSuggestion(suggestion)
    setForm((current) => ({
      ...current,
      symbol: suggestion.symbol,
      company: suggestion.name,
      sector: initial.sector,
      subSector: initial.subSector,
      cap: capFromMcap(suggestion.mcap) || current.cap,
    }))
    setLookingUp(true)
    const [quote, classified] = await Promise.all([
      fetchStockQuote(suggestion.symbol),
      classifyListedStock(suggestion),
    ])
    if (requestId !== lookupRef.current) return
    selectedSymbolRef.current = quote?.symbol || suggestion.symbol
    setForm((current) => ({
      ...current,
      symbol: quote?.symbol || suggestion.symbol,
      company: quote?.name || suggestion.name,
      sector: classified.sector,
      subSector: classified.subSector,
      cap: capFromMcap(quote?.mcap ?? suggestion.mcap, quote?.universe ?? '') || current.cap || 'Large',
    }))
    setSearch(quote?.symbol || suggestion.symbol)
    setLookingUp(false)
  }, [])

  useEffect(() => {
    void loadNseEquities()
  }, [])

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2 || query.toUpperCase() === selectedSymbolRef.current) {
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchStocks(query, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return
          setSuggestions(rows)
          setActiveIndex(0)
          setOpen(true)
        })
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === 'AbortError') return
          setSuggestions([])
        })
        .finally(() => setSearching(false))
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [search])

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (event.key === 'Escape') setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      void applySuggestion(suggestions[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const lookupTypedSymbol = async () => {
    const symbol = search.trim().toUpperCase()
    if (!symbol || /\s/.test(symbol) || symbol === selectedSymbolRef.current) return
    const exact = suggestions.find((item) => item.symbol === symbol)
    if (exact) {
      void applySuggestion(exact)
      return
    }
    if (symbol.length < 3) return
    const requestId = ++lookupRef.current
    setLookingUp(true)
    const quote = await fetchStockQuote(symbol)
    if (requestId !== lookupRef.current) return
    const extras = await searchStocks(symbol).catch(() => [] as StockSuggestion[])
    const match = extras.find((item) => item.symbol === symbol)
    if (quote) {
      selectedSymbolRef.current = quote.symbol
      const classified = await classifyListedStock({
        symbol,
        name: quote.name || match?.name,
        industry: match?.industry,
        sector: match?.sector || quote.sector,
        searchId: match?.searchId,
      })
      if (requestId !== lookupRef.current) return
      setForm((current) => ({
        ...current,
        symbol: quote.symbol,
        company: quote.name || match?.name || current.company,
        sector: classified.sector,
        subSector: classified.subSector,
        cap: capFromMcap(quote.mcap ?? match?.mcap ?? null, quote.universe) || current.cap || 'Large',
      }))
      setSearch(quote.symbol)
    } else if (match) {
      void applySuggestion(match)
      return
    }
    setLookingUp(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const symbol = (form.symbol || search).trim().toUpperCase()
    if (!symbol || !form.company.trim()) return
    await onSave({
      memberId: form.memberId,
      symbol,
      company: form.company.trim(),
      sector: form.sector,
      subSector: form.subSector,
      cap: form.cap || 'Large',
      quantity: Number(form.quantity),
      avgPrice: Number(form.avgPrice),
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="modal wide" onSubmit={(event) => void submit(event)}>
        <div className="modal-head"><div><p className="eyebrow">New holding</p><h2>Add a stock</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
        {members.length === 0 ? <div className="modal-empty"><Building2 size={24} /><p>Create a member before adding a stock.</p></div> : (
          <>
            <label className="full-field">Member
              <div className={`select-shell${lookingUp ? ' loading' : ''}`}>
                <select required value={form.memberId} onChange={(event) => set('memberId', event.target.value)}>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select>
              </div>
            </label>
            <div className="form-grid">
              <div className="stock-search-field" ref={searchBoxRef}>
                <label htmlFor="stock-search">Search stock</label>
                <div className="stock-combobox-wrap">
                  <div className={`stock-combobox${open ? ' open' : ''}`}>
                    <Search size={16} />
                    <input
                      id="stock-search"
                      autoFocus
                      required
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={open}
                      aria-controls="stock-suggestions"
                      value={search}
                      onChange={(event) => {
                        selectedSymbolRef.current = ''
                        setSearch(event.target.value)
                        setForm((current) => ({ ...current, symbol: event.target.value.toUpperCase() }))
                        setOpen(true)
                      }}
                      onFocus={() => suggestions.length > 0 && setOpen(true)}
                      onBlur={() => void lookupTypedSymbol()}
                      onKeyDown={onSearchKeyDown}
                      placeholder="Type a symbol or company, e.g. INFY"
                      autoComplete="off"
                    />
                    {(searching || lookingUp) && <Loader2 className="spin" size={16} />}
                  </div>
                  {open && search.trim().length >= 2 && search.trim().toUpperCase() !== selectedSymbolRef.current && (
                    <ul className="stock-suggestions" id="stock-suggestions" role="listbox">
                      {suggestions.length === 0 && !searching ? (
                        <li className="stock-suggestion-empty">No matching stocks</li>
                      ) : suggestions.map((item, index) => (
                        <li key={item.symbol} role="option" aria-selected={index === activeIndex}>
                          <button
                            type="button"
                            className={index === activeIndex ? 'active' : ''}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => void applySuggestion(item)}
                          >
                            <strong>{item.symbol}</strong>
                            <span>{item.name}</span>
                            <small>{classifyFromSuggestion(item).sector}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="stock-lookup-hint">Pick a suggestion to fill symbol, sector, sub-sector and market cap.</p>
              </div>
              <label className="full-field">Company name<input required value={form.company} onChange={(event) => set('company', event.target.value)} placeholder="Filled from the selected stock" /></label>
              <label>Sector
                <div className={`select-shell${lookingUp || searching ? ' loading' : ''}`}>
                <select required value={form.sector} disabled={lookingUp} onChange={(event) => {
                  const sector = event.target.value
                  setForm((current) => ({ ...current, sector, subSector: SECTOR_TREE[sector]?.[0] ?? '' }))
                }}>
                  <option value="" disabled>Filled automatically</option>
                  {sectorOptions.map((sector) => <option key={sector}>{sector}</option>)}
                </select>
                </div>
              </label>
              <label>Sub-sector
                <div className={`select-shell${lookingUp || searching ? ' loading' : ''}`}>
                <select required value={form.subSector} onChange={(event) => set('subSector', event.target.value)} disabled={!form.sector || lookingUp}>
                  <option value="" disabled>Filled automatically</option>
                  {subSectorOptions.map((subSector) => <option key={subSector}>{subSector}</option>)}
                </select>
                </div>
              </label>
              <label>Market cap
                <div className={`select-shell${lookingUp || searching ? ' loading' : ''}`}>
                <select required value={form.cap} disabled={lookingUp} onChange={(event) => set('cap', event.target.value)}>
                  <option value="" disabled>Filled automatically</option>
                  <option>Large</option>
                  <option>Mid</option>
                  <option>Small</option>
                </select>
                </div>
              </label>
              <label>Quantity<input required min="0.01" step="0.01" type="number" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} placeholder="50" /></label>
              <label>Average price (₹)<input required min="0.01" step="0.01" type="number" value={form.avgPrice} onChange={(event) => set('avgPrice', event.target.value)} placeholder="1,250" /></label>
            </div>
          </>
        )}
        <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button>{members.length > 0 && <button className="button primary">Add to portfolio</button>}</div>
      </form>
    </div>
  )
}

export default App
