import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Info,
  Landmark,
  Loader2,
  Radio,
  Search,
  X,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { apiFetch } from './api'
import { KpiSkeleton, Skel, TableSkeleton } from './loading'

type FyMap = Partial<Record<'fy23' | 'fy24' | 'fy25' | 'fy26', number | null>>

type IpoSubscription = {
  total?: number | string | null
  retail?: string | number | null
  shni?: string | number | null
  nii?: string | number | null
  qib?: string | number | null
  day?: number | null
  isFinal?: boolean
}

type LiveIpo = {
  id: number
  name: string
  slug: string
  logoUrl?: string | null
  exchange?: string | null
  sector?: string | null
  openDate?: string | null
  closeDate?: string | null
  allotmentDate?: string | null
  listDate?: string | null
  priceMin?: number | null
  priceMax?: number | null
  lotSize?: number | null
  issueSize?: string | number | null
  issueSizeCr?: number | null
  gmp?: number | null
  gmpPercent?: number | null
  gmpLastUpdated?: string | null
  subscription?: IpoSubscription | null
  status?: string | null
  issueDetails?: { totalIssueSizeCr?: number } | null
}

type ListedIpo = {
  slug: string
  year: number
  name: string
  listingDate?: string | null
  sector?: string | null
  issuePriceUpper?: number | null
  listingPrice?: number | null
  listingGainPct?: number | null
  day3Sub?: number | null
  qibDay3?: number | null
  hniDay3?: number | null
  retailDay3?: number | null
  issueSizeCr?: number | null
  gmpPctD1?: number | null
  gmpPctD2?: number | null
  gmpPctD3?: number | null
  gmpPctD4?: number | null
  gmpPctD5?: number | null
  gmpD1?: number | null
  gmpD2?: number | null
  gmpD3?: number | null
  gmpD4?: number | null
  gmpD5?: number | null
}

type IpoFinancials = {
  revenue?: FyMap
  pat?: FyMap
  ebitda?: FyMap
  borrowing?: FyMap
  assets?: FyMap
  roe?: FyMap
  roce?: FyMap
}

type IpoDetail = LiveIpo & {
  aboutCompany?: string | null
  financials?: IpoFinancials | null
  kpi?: {
    dated?: {
      dateLabels?: string[]
      roe?: number[]
      roce?: number[]
      debtEquity?: number[]
      patMargin?: number[]
      ebitdaMargin?: number[]
      priceToBook?: number
    }
    prePost?: {
      eps?: { pre?: number; post?: number }
      pe?: { pre?: number; post?: number }
      promoterHolding?: { pre?: number; post?: number }
      marketCap?: number
    }
    promoters?: string
    disclaimer?: string
  } | null
  issueDetails?: {
    totalIssueSizeCr?: number
    freshIssueCr?: number
    ofsCr?: number
    retailQuotaPercent?: number
    niiQuotaPercent?: number
    qibQuotaPercent?: number
    ipoObjectives?: string[]
  } | null
  marketCap?: number | null
  peRatio?: number | null
  registrar?: string | null
  leadManager?: string | null
  faceValue?: number | null
}

type Selection =
  | { kind: 'live'; slug: string }
  | { kind: 'listed'; slug: string; year: number; preview: ListedIpo }

const FY_LABELS: Array<[keyof FyMap, string]> = [
  ['fy23', 'FY23'],
  ['fy24', 'FY24'],
  ['fy25', 'FY25'],
  ['fy26', 'FY26'],
]

const inr = (value: number, digits = 2) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

const rupee = (value: number | null | undefined, digits = 0) =>
  value == null || Number.isNaN(value) ? '—' : `₹${inr(value, digits)}`

const crore = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? '—' : `₹${inr(value, 2)} Cr`

const signedPct = (value: number | null | undefined, digits = 1) => {
  if (value == null || Number.isNaN(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

const times = (value: number | string | null | undefined) => {
  if (value == null || value === '' || value === '-') return '—'
  if (typeof value === 'number') return `${inr(value, 2)}x`
  const numeric = Number(String(value).replace(/x$/i, ''))
  if (Number.isFinite(numeric)) return `${inr(numeric, 2)}x`
  return String(value)
}

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const gmpPercentOf = (ipo: { gmp?: number | null; gmpPercent?: number | null; priceMax?: number | null }) => {
  if (typeof ipo.gmpPercent === 'number' && ipo.gmpPercent !== 0) return ipo.gmpPercent
  if (ipo.gmp && ipo.priceMax) return (ipo.gmp / ipo.priceMax) * 100
  return typeof ipo.gmpPercent === 'number' ? ipo.gmpPercent : null
}

const issueSizeOf = (ipo: {
  issueSizeCr?: number | null
  issueSize?: string | number | null
  issueDetails?: { totalIssueSizeCr?: number } | null
}) => {
  if (ipo.issueSizeCr && ipo.issueSizeCr > 0) return ipo.issueSizeCr
  if (ipo.issueDetails?.totalIssueSizeCr && ipo.issueDetails.totalIssueSizeCr > 0) return ipo.issueDetails.totalIssueSizeCr
  const parsed = Number(ipo.issueSize)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const lastGmpPct = (ipo?: Pick<ListedIpo, 'gmpPctD1' | 'gmpPctD2' | 'gmpPctD3' | 'gmpPctD4' | 'gmpPctD5'> | null) =>
  ipo ? [ipo.gmpPctD5, ipo.gmpPctD4, ipo.gmpPctD3, ipo.gmpPctD2, ipo.gmpPctD1].find((value) => value != null) ?? null : null

const fySeries = (map?: FyMap) =>
  FY_LABELS.flatMap(([key, period]) => {
    const value = map?.[key]
    return value == null ? [] : [{ period, value }]
  })

function toneClass(value: number | null | undefined) {
  if (value == null || Number.isNaN(value) || value === 0) return ''
  return value > 0 ? 'text-positive' : 'text-negative'
}

export function IposPage({ refreshKey, onBusy }: { refreshKey: number; onBusy?: (busy: boolean) => void }) {
  const [live, setLive] = useState<LiveIpo[]>([])
  const [listed, setListed] = useState<ListedIpo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'all' | 'open' | 'upcoming'>('all')
  const [board, setBoard] = useState<'all' | 'Mainboard' | 'SME'>('all')
  const [listedQuery, setListedQuery] = useState('')
  const [listedLimit, setListedLimit] = useState(12)
  const [paging, setPaging] = useState(false)
  const [filterBusy, setFilterBusy] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)

  const flashFilters = (action: () => void) => {
    setFilterBusy(true)
    action()
    window.setTimeout(() => setFilterBusy(false), 280)
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    onBusy?.(true)
    setError('')
    Promise.all([
      apiFetch('/api/ipos', { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('Live IPO list unavailable')
        return response.json() as Promise<LiveIpo[]>
      }),
      apiFetch(`/api/ipos-listed?year=${new Date().getFullYear()}`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('Listed IPO archive unavailable')
        return response.json() as Promise<{ rows: ListedIpo[] }>
      }),
    ])
      .then(([ipos, archive]) => {
        setLive(Array.isArray(ipos) ? ipos : [])
        const rows = [...(archive.rows ?? [])].sort((a, b) => String(b.listingDate ?? '').localeCompare(String(a.listingDate ?? '')))
        setListed(rows)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        setError(caught instanceof Error ? caught.message : 'Could not load IPO data')
      })
      .finally(() => {
        setLoading(false)
        onBusy?.(false)
      })
    return () => {
      controller.abort()
      onBusy?.(false)
    }
  }, [refreshKey, onBusy])

  const filteredLive = useMemo(() => {
    return live.filter((ipo) => {
      if (tab === 'open' && ipo.status !== 'open') return false
      if (tab === 'upcoming' && ipo.status !== 'upcoming') return false
      if (board !== 'all' && ipo.exchange !== board) return false
      return true
    })
  }, [live, tab, board])

  const openCount = live.filter((ipo) => ipo.status === 'open').length
  const upcomingCount = live.filter((ipo) => ipo.status === 'upcoming').length

  const filteredListed = useMemo(() => {
    const query = listedQuery.trim().toLowerCase()
    const rows = query
      ? listed.filter((ipo) => `${ipo.name} ${ipo.sector ?? ''}`.toLowerCase().includes(query))
      : listed
    return rows.slice(0, listedLimit)
  }, [listed, listedQuery, listedLimit])

  if (selection) {
    return (
      <IpoAnalysis
        selection={selection}
        refreshKey={refreshKey}
        onBusy={onBusy}
        onBack={() => setSelection(null)}
      />
    )
  }

  return (
    <div className="page ipos-page">
      {error && !live.length && !listed.length ? (
        <section className="market-error"><span>{error}</span></section>
      ) : (
        <>
          <section className="panel markets-hero">
            <div className="markets-hero-copy">
              <div className="market-title-row">
                <p className="eyebrow"><Landmark size={12} /> Indian primary market</p>
                {openCount > 0 && <span className="market-status live"><i />{openCount} live</span>}
              </div>
              <h2>Live issues, grey-market premium, and recent listings</h2>
              <p>Price band, subscription, issue size and GMP for current IPOs, plus listing-day results for recently listed names. GMP is unofficial grey-market colour, not an exchange quote.</p>
            </div>
            <div className="markets-kpis">
              {loading && !live.length ? <KpiSkeleton /> : (
                <>
                  <div><span>Live now</span><strong>{openCount}</strong></div>
                  <div><span>Upcoming</span><strong>{upcomingCount}</strong></div>
                  <div><span>Listed in {listed[0]?.year ?? new Date().getFullYear()}</span><strong>{listed.length}</strong></div>
                </>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="ipo-toolbar">
              <div>
                <h3>Current IPOs</h3>
                <p>Open for bidding and issues that open next.</p>
              </div>
              <div className="ipo-filters">
                <div className={`ipo-pills${loading || filterBusy ? ' loading' : ''}`}>
                  {([
                    ['all', `All (${live.length})`],
                    ['open', `Live (${openCount})`],
                    ['upcoming', `Upcoming (${upcomingCount})`],
                  ] as const).map(([id, label]) => (
                    <button key={id} className={tab === id ? 'active' : ''} disabled={loading} onClick={() => flashFilters(() => setTab(id))}>{label}</button>
                  ))}
                </div>
                <div className={`ipo-pills${loading || filterBusy ? ' loading' : ''}`}>
                  {(['all', 'Mainboard', 'SME'] as const).map((id) => (
                    <button key={id} className={board === id ? 'active' : ''} disabled={loading} onClick={() => flashFilters(() => setBoard(id))}>
                      {id === 'all' ? 'All boards' : id}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading && !live.length ? (
              <div className="ipo-card-grid">
                {Array.from({ length: 4 }, (_, index) => <IpoCardSkeleton key={index} />)}
              </div>
            ) : filteredLive.length === 0 ? (
              <p className="ipo-empty">No IPOs match this filter.</p>
            ) : (
              <div className={`ipo-card-grid${loading || filterBusy ? ' is-busy' : ''}`}>
                {filteredLive.map((ipo) => (
                  <button type="button" className="ipo-card" key={ipo.slug} onClick={() => setSelection({ kind: 'live', slug: ipo.slug })}>
                    <div className="ipo-card-head">
                      <IpoLogo name={ipo.name} src={ipo.logoUrl} />
                      <div>
                        <strong>{ipo.name}</strong>
                        <span>{ipo.exchange || 'IPO'}{ipo.sector ? ` · ${ipo.sector}` : ''}</span>
                      </div>
                      <em className={`ipo-status ${ipo.status === 'open' ? 'live' : ''}`}>
                        {ipo.status === 'open' ? <Radio size={11} /> : <CalendarDays size={11} />}
                        {ipo.status === 'open' ? 'Live' : 'Upcoming'}
                      </em>
                    </div>
                    <p className="ipo-dates">{formatDate(ipo.openDate)} – {formatDate(ipo.closeDate)}</p>
                    <div className="ipo-metrics">
                      <div><span>Price band</span><strong>{rupee(ipo.priceMin)}–{rupee(ipo.priceMax)}</strong></div>
                      <div><span>Issue size</span><strong>{crore(issueSizeOf(ipo))}</strong></div>
                      <div>
                        <span>GMP</span>
                        <strong className={toneClass(gmpPercentOf(ipo))}>{signedPct(gmpPercentOf(ipo))}{ipo.gmp ? ` · ${rupee(ipo.gmp)}` : ''}</strong>
                      </div>
                      <div><span>Subscription</span><strong>{times(ipo.subscription?.total)}</strong></div>
                    </div>
                    <span className="ipo-card-cta">View analysis</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="ipo-toolbar">
              <div>
                <h3>Recently listed</h3>
                <p>Listing price, gain, issue size, last GMP and subscription.</p>
              </div>
              <div className={`search-box holdings-search${loading ? ' loading' : ''}`}>
                <Search size={16} />
                <input
                  value={listedQuery}
                  disabled={loading}
                  onChange={(event) => { setListedQuery(event.target.value); setListedLimit(12) }}
                  placeholder="Search listed IPOs..."
                  aria-label="Search listed IPOs"
                />
                {listedQuery && <button className="clear-search" onClick={() => { setListedQuery(''); setListedLimit(12) }} aria-label="Clear listed IPO search"><X size={14} /></button>}
              </div>
            </div>
            <div className={`table-scroll${loading || paging ? ' is-busy' : ''}`}>
              <table>
                <thead>
                  <tr>
                    <th>IPO</th>
                    <th>List date</th>
                    <th>Issue price</th>
                    <th>List price</th>
                    <th>Listing gain</th>
                    <th>GMP</th>
                    <th>Subscription</th>
                    <th>Issue size</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !listed.length ? (
                    <TableSkeleton cols={8} rows={8} />
                  ) : filteredListed.length === 0 ? (
                    <tr><td className="holdings-no-results" colSpan={8}>No listed IPOs match this search.</td></tr>
                  ) : filteredListed.map((ipo) => (
                    <tr
                      key={`${ipo.year}-${ipo.slug}`}
                      className="ipo-listed-row"
                      tabIndex={0}
                      onClick={() => setSelection({ kind: 'listed', slug: ipo.slug, year: ipo.year, preview: ipo })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelection({ kind: 'listed', slug: ipo.slug, year: ipo.year, preview: ipo })
                        }
                      }}
                    >
                      <td>
                        <strong>{ipo.name}</strong>
                        {ipo.sector && <span className="ipo-listed-sector">{ipo.sector}</span>}
                      </td>
                      <td>{formatDate(ipo.listingDate)}</td>
                      <td>{rupee(ipo.issuePriceUpper)}</td>
                      <td>{rupee(ipo.listingPrice)}</td>
                      <td className={toneClass(ipo.listingGainPct)}>{signedPct(ipo.listingGainPct, 1)}</td>
                      <td className={toneClass(lastGmpPct(ipo))}>{signedPct(lastGmpPct(ipo))}</td>
                      <td>{times(ipo.day3Sub)}</td>
                      <td>{crore(ipo.issueSizeCr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {listed.length > listedLimit && !listedQuery && (
              <button
                className={`button secondary ipo-more${paging ? ' loading' : ''}`}
                disabled={paging}
                onClick={() => {
                  setPaging(true)
                  window.setTimeout(() => {
                    setListedLimit((value) => value + 20)
                    setPaging(false)
                  }, 280)
                }}
              >
                {paging ? <Loader2 size={16} className="spinning" /> : null}
                {paging ? 'Loading…' : 'Show more listings'}
              </button>
            )}
          </section>

          <p className="ipo-disclaimer">
            <Info size={14} />
            Grey-market premium (GMP) is an unofficial indication from the grey market. It is not exchange data and is shown for information only, not as investment advice.
          </p>
        </>
      )}
    </div>
  )
}

function IpoAnalysis({
  selection,
  refreshKey,
  onBusy,
  onBack,
}: {
  selection: Selection
  refreshKey: number
  onBusy?: (busy: boolean) => void
  onBack: () => void
}) {
  const [detail, setDetail] = useState<IpoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams({ slug: selection.slug })
    if (selection.kind === 'listed') params.set('year', String(selection.year))
    const controller = new AbortController()
    setLoading(true)
    onBusy?.(true)
    setError('')
    apiFetch(`/api/ipo-detail?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load IPO analysis')
        const payload = await response.json() as { ipo?: IpoDetail }
        setDetail(payload.ipo ?? null)
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return
        if (selection.kind === 'listed') return
        setError(caught instanceof Error ? caught.message : 'Could not load IPO analysis')
      })
      .finally(() => {
        setLoading(false)
        onBusy?.(false)
      })
    return () => {
      controller.abort()
      onBusy?.(false)
    }
  }, [selection, refreshKey, onBusy])

  const preview = selection.kind === 'listed' ? selection.preview : null
  const ipo = detail
  const subscription = ipo?.subscription
  const charts = [
    { title: 'Total income', subtitle: 'Restated revenue, ₹ Cr', color: '#244d3c', data: fySeries(ipo?.financials?.revenue) },
    { title: 'Net profit', subtitle: 'Profit after tax, ₹ Cr', color: '#3f85a6', data: fySeries(ipo?.financials?.pat) },
    { title: 'EBITDA', subtitle: 'Operating profit, ₹ Cr', color: '#e8995d', data: fySeries(ipo?.financials?.ebitda) },
    { title: 'Borrowing', subtitle: 'Total borrowings, ₹ Cr', color: '#d76868', data: fySeries(ipo?.financials?.borrowing) },
    { title: 'Assets', subtitle: 'Total assets, ₹ Cr', color: '#7267d9', data: fySeries(ipo?.financials?.assets) },
  ]
  const hasCharts = charts.some((chart) => chart.data.length > 0)
  const gmpPct = gmpPercentOf(ipo ?? {})
  const title = ipo?.name || preview?.name || selection.slug

  if (loading && !preview && !ipo) {
    return <IpoAnalysisSkeleton onBack={onBack} />
  }

  return (
    <div className="page ipos-page ipo-analysis">
      <button type="button" className="text-link ipo-back" onClick={onBack}><ArrowLeft size={15} /> Back to IPOs</button>

      {error && !ipo && !preview ? (
        <section className="market-error"><span>{error}</span></section>
      ) : (
        <>
          <section className="panel ipo-hero">
            <div className="ipo-hero-copy">
              <div className="ipo-card-head">
                <IpoLogo name={title} src={ipo?.logoUrl} />
                <div>
                  <p className="eyebrow">{ipo?.exchange || preview?.sector || 'IPO analysis'}</p>
                  <h2>{title}</h2>
                  <p>{ipo?.sector || preview?.sector || 'Issue details, financials and grey-market premium.'}</p>
                </div>
              </div>
            </div>
            <div className="ipo-hero-stats">
              <div><span>Price band</span><strong>{rupee(ipo?.priceMin ?? preview?.issuePriceUpper)}–{rupee(ipo?.priceMax ?? preview?.issuePriceUpper)}</strong></div>
              <div><span>Issue size</span><strong>{crore(issueSizeOf(ipo ?? {}) ?? preview?.issueSizeCr)}</strong></div>
              <div>
                <span>GMP</span>
                <strong className={toneClass(gmpPct ?? lastGmpPct(preview))}>
                  {signedPct(gmpPct ?? lastGmpPct(preview))}
                  {ipo?.gmp ? ` · ${rupee(ipo.gmp)}` : ''}
                </strong>
              </div>
              <div><span>Subscription</span><strong>{times(subscription?.total ?? preview?.day3Sub)}</strong></div>
            </div>
          </section>

          <section className="ipo-kpi-grid">
            <article className="panel"><span>Open – close</span><strong>{formatDate(ipo?.openDate)} – {formatDate(ipo?.closeDate)}</strong></article>
            <article className="panel"><span>Allotment</span><strong>{formatDate(ipo?.allotmentDate)}</strong></article>
            <article className="panel"><span>Listing</span><strong>{formatDate(ipo?.listDate ?? preview?.listingDate)}</strong></article>
            <article className="panel"><span>Lot size</span><strong>{ipo?.lotSize ? `${ipo.lotSize} shares` : '—'}</strong></article>
            {preview && (
              <>
                <article className="panel"><span>Issue price</span><strong>{rupee(preview.issuePriceUpper)}</strong></article>
                <article className="panel">
                  <span>Listing price</span>
                  <strong className={toneClass(preview.listingGainPct)}>{rupee(preview.listingPrice)} · {signedPct(preview.listingGainPct)}</strong>
                </article>
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div><h3>Subscription</h3><p>{subscription?.day ? `Day ${subscription.day}${subscription.isFinal ? ' · final' : ''}` : 'Category-wise demand, where published'}</p></div>
            </div>
            <div className="ipo-sub-grid">
              <SubStat label="Total" value={times(subscription?.total ?? preview?.day3Sub)} />
              <SubStat label="QIB" value={times(subscription?.qib ?? preview?.qibDay3)} />
              <SubStat label="NII / HNI" value={times(subscription?.nii ?? preview?.hniDay3)} />
              <SubStat label="Retail" value={times(subscription?.retail ?? preview?.retailDay3)} />
            </div>
          </section>

          {loading && !hasCharts && !preview ? (
            <section className="ipo-chart-grid">
              {Array.from({ length: 4 }, (_, index) => (
                <article className="panel" key={index}>
                  <Skel className="skel-line mid" />
                  <Skel className="skel-chart" />
                </article>
              ))}
            </section>
          ) : hasCharts ? (
            <section className="ipo-chart-grid">
              {charts.map((chart) => (
                <article className="panel" key={chart.title}>
                  <div className="panel-header">
                    <div><h3>{chart.title}</h3><p>{chart.subtitle}</p></div>
                  </div>
                  {chart.data.length === 0 ? (
                    <p className="ipo-empty">No figures published for this series.</p>
                  ) : (
                    <IpoBarChart title={chart.title} color={chart.color} data={chart.data} unit="₹ Cr" />
                  )}
                </article>
              ))}
            </section>
          ) : preview ? (
            <section className="ipo-chart-grid">
              <article className="panel">
                <div className="panel-header"><div><h3>Listing vs issue</h3><p>Issue price and listing price, ₹</p></div></div>
                <IpoBarChart
                  title="Price"
                  color="#244d3c"
                  data={[
                    { period: 'Issue', value: preview.issuePriceUpper ?? 0 },
                    { period: 'Listing', value: preview.listingPrice ?? 0 },
                  ].filter((row) => row.value > 0)}
                  unit=""
                />
              </article>
              {lastGmpPct(preview) != null && (
                <article className="panel">
                  <div className="panel-header"><div><h3>GMP through the window</h3><p>Unofficial grey-market premium, %</p></div></div>
                  <IpoBarChart
                    title="GMP"
                    color="#e8995d"
                    data={[
                      ['D1', preview.gmpPctD1],
                      ['D2', preview.gmpPctD2],
                      ['D3', preview.gmpPctD3],
                      ['D4', preview.gmpPctD4],
                      ['D5', preview.gmpPctD5],
                    ].flatMap(([period, value]) => (value == null ? [] : [{ period: String(period), value: Number(value) }]))}
                    unit="%"
                  />
                </article>
              )}
            </section>
          ) : !loading && (
            <section className="panel"><p className="ipo-empty">Restated financial charts are not published for this issue yet.</p></section>
          )}

          {(ipo?.kpi?.prePost || ipo?.financials?.roe) && (
            <section className="panel">
              <div className="panel-header"><div><h3>Key ratios</h3><p>Valuation and profitability snapshots from the offer document</p></div></div>
              <div className="ipo-ratio-grid">
                <Ratio label="P/E (post)" value={ipo.kpi?.prePost?.pe?.post != null ? `${ipo.kpi.prePost.pe.post.toFixed(1)}x` : ipo.peRatio != null ? `${ipo.peRatio.toFixed(1)}x` : '—'} />
                <Ratio label="Market cap" value={crore(ipo.kpi?.prePost?.marketCap ?? ipo.marketCap)} />
                <Ratio label="ROE (FY26)" value={ipo.financials?.roe?.fy26 != null ? `${ipo.financials.roe.fy26.toFixed(1)}%` : '—'} />
                <Ratio label="ROCE (FY26)" value={ipo.financials?.roce?.fy26 != null ? `${ipo.financials.roce.fy26.toFixed(1)}%` : '—'} />
                <Ratio label="Promoter holding" value={ipo.kpi?.prePost?.promoterHolding ? `${ipo.kpi.prePost.promoterHolding.pre}% → ${ipo.kpi.prePost.promoterHolding.post}%` : '—'} />
                <Ratio label="Fresh / OFS" value={ipo.issueDetails ? `${crore(ipo.issueDetails.freshIssueCr)} / ${crore(ipo.issueDetails.ofsCr)}` : '—'} />
              </div>
            </section>
          )}

          {ipo?.aboutCompany && (
            <section className="panel">
              <div className="panel-header"><div><h3>About the company</h3><p>{ipo.registrar ? `Registrar: ${ipo.registrar}` : 'Offer document summary'}</p></div></div>
              <p className="ipo-about">{ipo.aboutCompany}</p>
              {ipo.issueDetails?.ipoObjectives?.length ? (
                <ul className="ipo-objectives">
                  {ipo.issueDetails.ipoObjectives.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </section>
          )}

          <p className="ipo-disclaimer">
            <Info size={14} />
            GMP is an unofficial grey-market indication. Financials are restated figures from the offer path and are for information only — not investment advice.
          </p>
        </>
      )}
    </div>
  )
}

function IpoCardSkeleton() {
  return (
    <article className="ipo-card skeleton">
      <div className="ipo-card-head">
        <Skel className="skel-logo" />
        <div>
          <Skel className="skel-line wide" />
          <Skel className="skel-line short" />
        </div>
      </div>
      <Skel className="skel-line mid" />
      <div className="ipo-metrics">
        <div><Skel className="skel-line short" /><Skel className="skel-value" /></div>
        <div><Skel className="skel-line short" /><Skel className="skel-value" /></div>
        <div><Skel className="skel-line short" /><Skel className="skel-value" /></div>
        <div><Skel className="skel-line short" /><Skel className="skel-value" /></div>
      </div>
    </article>
  )
}

function IpoAnalysisSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="page ipos-page ipo-analysis">
      <button type="button" className="text-link ipo-back" onClick={onBack}><ArrowLeft size={15} /> Back to IPOs</button>
      <section className="panel ipo-hero">
        <div className="ipo-card-head">
          <Skel className="skel-logo" />
          <div>
            <Skel className="skel-line short" />
            <Skel className="skel-line wide" h="28px" />
            <Skel className="skel-line mid" />
          </div>
        </div>
        <div className="ipo-hero-stats"><KpiSkeleton count={4} /></div>
      </section>
      <section className="ipo-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="panel" key={index}><Skel className="skel-line short" /><Skel className="skel-value" /></article>
        ))}
      </section>
      <section className="ipo-chart-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="panel" key={index}>
            <Skel className="skel-line mid" />
            <Skel className="skel-chart" />
          </article>
        ))}
      </section>
    </div>
  )
}

function IpoBarChart({
  title,
  color,
  data,
  unit,
}: {
  title: string
  color: string
  data: Array<{ period: string; value: number }>
  unit: string
}) {
  if (data.length === 0) return <p className="ipo-empty">No figures published for this series.</p>
  return (
    <div className="ipo-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barSize={28}>
          <CartesianGrid stroke="#ece9e1" vertical={false} />
          <XAxis dataKey="period" tick={{ fill: '#8a8d87', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#8a8d87', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(value) => [`${unit === '₹ Cr' ? `₹${inr(Number(value), 2)} Cr` : unit === '%' ? `${Number(value).toFixed(1)}%` : rupee(Number(value))}`, title]} />
          <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function IpoLogo({ name, src }: { name: string; src?: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <span className="ipo-logo fallback">{name.slice(0, 2).toUpperCase()}</span>
  }
  return <img className="ipo-logo" src={src} alt="" onError={() => setFailed(true)} />
}

function SubStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ipo-sub-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Ratio({ label, value }: { label: string; value: string }) {
  return (
    <div className="ipo-ratio">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
