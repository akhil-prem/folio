import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ArrowLeft, CalendarDays, Plus, Star } from 'lucide-react'
import { fetchMutualFundNav, fetchMutualFundScheme, searchMutualFunds } from './api'
import type { MfNavPoint, MfSchemeDetail, MutualFund } from './types'

const CHART_COLORS = ['#244d3c', '#3d6853', '#6c8b7c', '#e8995d', '#d9ba59', '#7a9e8a', '#b08d57', '#4f6f62']

const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

const pct = (value: number | null | undefined, digits = 2) =>
  value == null || Number.isNaN(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`

const aumLabel = (value: number | null | undefined) =>
  value == null ? '—' : `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)} Cr`

const MS = {
  '1M': 30 * 24 * 60 * 60 * 1000,
  '6M': 182 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
  '3Y': 3 * 365 * 24 * 60 * 60 * 1000,
  '5Y': 5 * 365 * 24 * 60 * 60 * 1000,
  All: Number.POSITIVE_INFINITY,
} as const

type RangeKey = keyof typeof MS

type Props = {
  fund: MutualFund
  canEdit: boolean
  onBack: () => void
  onViewHistory: () => void
  onAddSip: () => void
}

function sectorBreakdown(holdings: MfSchemeDetail['holdings']) {
  const map = new Map<string, number>()
  for (const row of holdings) {
    if (row.assets <= 0) continue
    const key = row.sector || 'Other'
    map.set(key, (map.get(key) ?? 0) + row.assets)
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
}

function filterNav(points: MfNavPoint[], range: RangeKey) {
  if (!points.length) return []
  const end = points[points.length - 1].t
  const start = range === 'All' ? points[0].t : end - MS[range]
  return points.filter((point) => point.t >= start)
}

function formatAxisDate(ts: number, range: RangeKey) {
  const date = new Date(ts)
  if (range === '1M' || range === '6M') {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }
  if (range === '1Y') {
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  }
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export function MutualFundDetailPage({ fund, canEdit, onBack, onViewHistory, onAddSip }: Props) {
  const [detail, setDetail] = useState<MfSchemeDetail | null>(null)
  const [navPoints, setNavPoints] = useState<MfNavPoint[]>([])
  const [range, setRange] = useState<RangeKey>('1Y')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAllHoldings, setShowAllHoldings] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setDetail(null)
    setNavPoints([])

    const load = async () => {
      try {
        let searchId = fund.searchId
        if (!searchId) {
          const matches = await searchMutualFunds(fund.name, controller.signal)
          searchId = matches[0]?.searchId || ''
        }
        if (!searchId) throw new Error('Scheme details are not linked for this fund.')
        const scheme = await fetchMutualFundScheme(searchId, controller.signal)
        if (controller.signal.aborted) return
        setDetail(scheme)
        if (scheme.schemeCode) {
          const history = await fetchMutualFundNav(scheme.schemeCode, controller.signal)
          if (!controller.signal.aborted) setNavPoints(history.points)
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Could not load fund details.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [fund.id, fund.name, fund.searchId])

  const chartPoints = useMemo(() => filterNav(navPoints, range), [navPoints, range])
  const chartData = useMemo(
    () => chartPoints.map((point) => ({
      t: point.t,
      nav: point.nav,
      label: formatAxisDate(point.t, range),
    })),
    [chartPoints, range],
  )

  const rangeReturn = useMemo(() => {
    if (chartPoints.length < 2) return null
    const first = chartPoints[0].nav
    const last = chartPoints[chartPoints.length - 1].nav
    if (!first) return null
    return ((last - first) / first) * 100
  }, [chartPoints])

  const sectors = useMemo(() => (detail ? sectorBreakdown(detail.holdings) : []), [detail])
  const holdings = detail?.holdings ?? []
  const visibleHoldings = showAllHoldings ? holdings : holdings.slice(0, 20)
  const maxHolding = holdings[0]?.assets || 1

  return (
    <div className="page mf-detail-page">
      <div className="mf-detail-top">
        <button type="button" className="button ghost mf-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back to funds
        </button>
        <div className="mf-detail-actions">
          <button type="button" className="button secondary" onClick={onViewHistory}>
            <CalendarDays size={16} /> SIP history
          </button>
          {canEdit && (
            <button type="button" className="button primary" onClick={onAddSip}>
              <Plus size={16} /> Add SIP
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><h3>Loading scheme details…</h3><p>Fetching NAV, holdings and allocation.</p></div>
      ) : error ? (
        <div className="empty-state"><h3>Could not load details</h3><p>{error}</p></div>
      ) : detail ? (
        <>
          <section className="mf-detail-hero panel">
            <div className="mf-detail-hero-main">
              {detail.logoUrl ? <img className="mf-logo" src={detail.logoUrl} alt="" /> : <span className="avatar mf-logo-fallback" style={{ background: fund.color }}>{fund.name.slice(0, 2).toUpperCase()}</span>}
              <div>
                <div className="mf-detail-badges">
                  <span>{detail.categoryLabel || detail.category}</span>
                  {detail.subCategory && <span>{detail.subCategory}</span>}
                  {(detail.planType || detail.schemeType) && <span>{[detail.planType, detail.schemeType].filter(Boolean).join(' ')}</span>}
                  {detail.rating != null && (
                    <span className="mf-rating"><Star size={12} /> {detail.rating}/5</span>
                  )}
                </div>
                <h2>{detail.name}</h2>
                <p>{detail.fundHouse || detail.amc}{detail.benchmark ? ` · Benchmark ${detail.benchmark}` : ''}</p>
              </div>
            </div>
            <div className="mf-detail-hero-stats">
              <div>
                <span>NAV{detail.navDate ? ` · ${detail.navDate}` : ''}</span>
                <strong>{detail.nav != null ? `₹${detail.nav.toFixed(2)}` : '—'}</strong>
                <em className={(detail.returns['1d'] ?? 0) >= 0 ? 'up' : 'down'}>{pct(detail.returns['1d'])} 1D</em>
              </div>
              <div>
                <span>3Y annualised</span>
                <strong className={(detail.returns['3y'] ?? 0) >= 0 ? 'up' : 'down'}>{pct(detail.returns['3y'])}</strong>
              </div>
              <div>
                <span>AUM</span>
                <strong>{aumLabel(detail.aum)}</strong>
              </div>
              <div>
                <span>Expense ratio</span>
                <strong>{detail.expenseRatio != null ? `${detail.expenseRatio}%` : '—'}</strong>
              </div>
            </div>
          </section>

          <section className="mf-your-sip panel">
            <div>
              <span>Your investment</span>
              <strong>{money(fund.totalInvested)}</strong>
              <em>{fund.sipCount} SIP months logged</em>
            </div>
            <div className="mf-detail-actions">
              <button type="button" className="button secondary" onClick={onViewHistory}>View SIP history</button>
              {canEdit && <button type="button" className="button primary" onClick={onAddSip}><Plus size={16} /> Add month</button>}
            </div>
          </section>

          <section className="panel mf-nav-panel">
            <div className="mf-section-head">
              <div>
                <h3>NAV performance</h3>
                <p>
                  {range} change{' '}
                  <strong className={(rangeReturn ?? 0) >= 0 ? 'up' : 'down'}>{pct(rangeReturn)}</strong>
                </p>
              </div>
              <div className="mf-range-tabs">
                {(Object.keys(MS) as RangeKey[]).map((key) => (
                  <button key={key} type="button" className={range === key ? 'active' : ''} onClick={() => setRange(key)}>
                    {key}
                  </button>
                ))}
              </div>
            </div>
            {chartData.length < 2 ? (
              <div className="modal-empty"><p>NAV history is unavailable for this scheme.</p></div>
            ) : (
              <div className="mf-nav-chart">
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mfNavFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3d6853" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#3d6853" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) => formatAxisDate(Number(value), range)}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={48}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      tickFormatter={(value) => `₹${Number(value).toFixed(0)}`}
                    />
                    <Tooltip
                      labelFormatter={(value) => new Date(Number(value)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      formatter={(value) => [`₹${Number(value).toFixed(4)}`, 'NAV']}
                    />
                    <Area type="monotone" dataKey="nav" stroke="#244d3c" strokeWidth={2} fill="url(#mfNavFill)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="mf-section-head">
              <h3>Returns</h3>
              <span>Annualised where applicable</span>
            </div>
            <div className="mf-return-grid">
              {([
                ['1D', detail.returns['1d']],
                ['1W', detail.returns['1w']],
                ['1M', detail.returns['1m']],
                ['3M', detail.returns['3m']],
                ['6M', detail.returns['6m']],
                ['1Y', detail.returns['1y']],
                ['3Y', detail.returns['3y']],
                ['5Y', detail.returns['5y']],
                ['All', detail.returns.all],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className={(value ?? 0) >= 0 ? 'up' : 'down'}>{pct(value)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="chart-grid">
            <article className="panel">
              <div className="mf-section-head">
                <h3>Sector allocation</h3>
                <span>By portfolio weight</span>
              </div>
              {sectors.length === 0 ? (
                <div className="modal-empty"><p>No sector data available.</p></div>
              ) : (
                <div className="donut-layout">
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={sectors.slice(0, 8)} dataKey="value" nameKey="name" innerRadius={72} outerRadius={99} paddingAngle={3} stroke="none">
                          {sectors.slice(0, 8).map((entry, index) => (
                            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center"><strong>{sectors.length}</strong><span>sectors</span></div>
                  </div>
                  <div className="legend-list">
                    {sectors.slice(0, 8).map((sector, index) => (
                      <div className="legend-row" key={sector.name}>
                        <span className="legend-dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span>{sector.name}</span>
                        <strong>{sector.value.toFixed(1)}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>

            <article className="panel">
              <div className="mf-section-head">
                <h3>Key facts</h3>
                <span>Scheme snapshot</span>
              </div>
              <div className="mf-facts">
                <div><span>Min SIP</span><strong>{detail.minSip != null ? money(detail.minSip) : '—'}</strong></div>
                <div><span>Min lumpsum</span><strong>{detail.minLumpsum != null ? money(detail.minLumpsum) : '—'}</strong></div>
                <div><span>Launch</span><strong>{detail.launchDate || '—'}</strong></div>
                <div><span>Fund house</span><strong>{detail.fundHouse || detail.amc || '—'}</strong></div>
              </div>
              {detail.description && <p className="mf-objective">{detail.description}</p>}
              {detail.exitLoad && (
                <div className="mf-exit-load">
                  <span>Exit load</span>
                  <p>{detail.exitLoad}</p>
                </div>
              )}
            </article>
          </section>

          {(detail.pros.length > 0 || detail.cons.length > 0) && (
            <section className="chart-grid">
              <article className="panel">
                <div className="mf-section-head"><h3>Pros</h3></div>
                <ul className="mf-analysis-list pros">
                  {detail.pros.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
              <article className="panel">
                <div className="mf-section-head"><h3>Cons</h3></div>
                <ul className="mf-analysis-list cons">
                  {detail.cons.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </article>
            </section>
          )}

          <section className="panel">
            <div className="mf-section-head">
              <h3>Holdings ({holdings.length})</h3>
              <span>Stock / instrument allocation</span>
            </div>
            <div className="mf-holdings-table">
              <div className="mf-holdings-head">
                <span>Name</span>
                <span>Sector</span>
                <span>Instrument</span>
                <span>Assets</span>
              </div>
              {visibleHoldings.map((row) => (
                <div className="mf-holdings-row" key={`${row.name}-${row.instrument}-${row.assets}`}>
                  <div>
                    <strong>{row.name}</strong>
                    <div className="mf-alloc-track"><i style={{ width: `${Math.min(100, Math.max(0, (row.assets / maxHolding) * 100))}%` }} /></div>
                  </div>
                  <span>{row.sector}</span>
                  <span>{row.instrument}</span>
                  <strong>{row.assets.toFixed(2)}%</strong>
                </div>
              ))}
            </div>
            {holdings.length > 20 && (
              <button type="button" className="button ghost mf-holdings-more" onClick={() => setShowAllHoldings((value) => !value)}>
                {showAllHoldings ? 'Show top holdings' : `Show all ${holdings.length} holdings`}
              </button>
            )}
          </section>

          {detail.managers.length > 0 && (
            <section className="panel">
              <div className="mf-section-head">
                <h3>Fund managers</h3>
                <span>{detail.managers.length} managers</span>
              </div>
              <div className="mf-manager-grid">
                {detail.managers.map((manager) => (
                  <article key={`${manager.name}-${manager.since}`}>
                    <strong>{manager.name}</strong>
                    {manager.since && <span>Since {manager.since}</span>}
                    {manager.education && <p>{manager.education}</p>}
                    {manager.experience && <p>{manager.experience}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}
