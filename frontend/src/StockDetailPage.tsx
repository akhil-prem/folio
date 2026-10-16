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
import { ArrowLeft, Trash2 } from 'lucide-react'
import { fetchStockDetail, fetchStockHistory } from './api'
import { BusyButton } from './BusyButton'
import type { Holding, Member, StockDetail, StockPricePoint } from './types'

const CHART_COLORS = ['#244d3c', '#3d6853', '#6c8b7c', '#e8995d', '#d9ba59', '#7a9e8a', '#b08d57', '#4f6f62']

const money = (amount: number, digits = 2) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: digits }).format(amount)

const compact = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(amount)

const pct = (value: number | null | undefined, digits = 2) =>
  value == null || Number.isNaN(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`

const num = (value: number | null | undefined, digits = 2) =>
  value == null || Number.isNaN(value) ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: digits })

const cr = (value: number | null | undefined) =>
  value == null ? '—' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`

const MS = {
  '1M': 30 * 24 * 60 * 60 * 1000,
  '3M': 91 * 24 * 60 * 60 * 1000,
  '6M': 182 * 24 * 60 * 60 * 1000,
  '1Y': 365 * 24 * 60 * 60 * 1000,
  '3Y': 3 * 365 * 24 * 60 * 60 * 1000,
  '5Y': 5 * 365 * 24 * 60 * 60 * 1000,
  All: Number.POSITIVE_INFINITY,
} as const

type RangeKey = keyof typeof MS

type Props = {
  holding: Holding
  members: Member[]
  canEdit: boolean
  onBack: () => void
  onRemove: (holding: Holding) => void | Promise<void>
  removing?: boolean
}

function filterPoints(points: StockPricePoint[], range: RangeKey) {
  if (!points.length) return []
  const end = points[points.length - 1].t
  const start = range === 'All' ? points[0].t : end - MS[range]
  return points.filter((point) => point.t >= start)
}

function formatAxisDate(ts: number, range: RangeKey) {
  const date = new Date(ts)
  if (range === '1M' || range === '3M' || range === '6M') {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }
  if (range === '1Y') {
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
  }
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export function StockDetailPage({ holding, members, canEdit, onBack, onRemove, removing = false }: Props) {
  const [detail, setDetail] = useState<StockDetail | null>(null)
  const [points, setPoints] = useState<StockPricePoint[]>([])
  const [range, setRange] = useState<RangeKey>('1Y')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const owner = members.find((member) => member.id === holding.memberId)
  const invested = holding.quantity * holding.avgPrice

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setDetail(null)
    setPoints([])

    const load = async () => {
      try {
        const [scheme, history] = await Promise.all([
          fetchStockDetail(holding.symbol, controller.signal),
          fetchStockHistory(holding.symbol, controller.signal).catch(() => ({ symbol: holding.symbol, points: [] as StockPricePoint[] })),
        ])
        if (controller.signal.aborted) return
        setDetail(scheme)
        setPoints(history.points)
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Could not load stock details.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [holding.id, holding.symbol])

  const chartPoints = useMemo(() => filterPoints(points, range), [points, range])
  const chartData = useMemo(
    () => chartPoints.map((point) => ({ t: point.t, price: point.price })),
    [chartPoints],
  )
  const rangeReturn = useMemo(() => {
    if (chartPoints.length < 2) return null
    const first = chartPoints[0].price
    const last = chartPoints[chartPoints.length - 1].price
    if (!first) return null
    return ((last - first) / first) * 100
  }, [chartPoints])

  const current = detail?.ltp ?? null
  const pnl = current == null ? null : (current - holding.avgPrice) * holding.quantity
  const pnlPct = current == null || !holding.avgPrice ? null : ((current - holding.avgPrice) / holding.avgPrice) * 100

  return (
    <div className="page mf-detail-page stock-detail-page">
      <div className="mf-detail-top">
        <button type="button" className="button ghost mf-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back to stocks
        </button>
        <div className="mf-detail-actions">
          {canEdit && (
            <BusyButton
              className="button secondary"
              busy={removing}
              busyLabel="Removing…"
              idleIcon={<Trash2 size={16} />}
              onClick={() => void onRemove(holding)}
            >
              Remove holding
            </BusyButton>
          )}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><h3>Loading stock details…</h3><p>Fetching price, chart and fundamentals.</p></div>
      ) : error ? (
        <div className="empty-state"><h3>Could not load details</h3><p>{error}</p></div>
      ) : detail ? (
        <>
          <section className="mf-detail-hero panel">
            <div className="mf-detail-hero-main">
              {detail.logoUrl ? (
                <img className="mf-logo" src={detail.logoUrl} alt="" />
              ) : (
                <span className="avatar mf-logo-fallback">{detail.shortName.slice(0, 2)}</span>
              )}
              <div>
                <div className="mf-detail-badges">
                  <span>{detail.shortName} · {detail.exchange}</span>
                  <span>{holding.broker || 'Groww'}</span>
                  {detail.industry && <span>{detail.industry}</span>}
                  <span>{holding.cap} cap</span>
                  {holding.sector && <span>{holding.sector}</span>}
                </div>
                <h2>{detail.name}</h2>
                <p>{detail.isin ? `ISIN ${detail.isin}` : holding.company}{detail.ceo ? ` · CEO ${detail.ceo}` : ''}</p>
              </div>
            </div>
            <div className="mf-detail-hero-stats">
              <div>
                <span>Last price</span>
                <strong>{detail.ltp != null ? money(detail.ltp) : '—'}</strong>
                <em className={(detail.changePct ?? 0) >= 0 ? 'up' : 'down'}>
                  {detail.change != null ? money(detail.change) : '—'} ({pct(detail.changePct)})
                </em>
              </div>
              <div>
                <span>Day range</span>
                <strong>{detail.low != null && detail.high != null ? `${money(detail.low, 0)} – ${money(detail.high, 0)}` : '—'}</strong>
              </div>
              <div>
                <span>52W range</span>
                <strong>{detail.yearLow != null && detail.yearHigh != null ? `${money(detail.yearLow, 0)} – ${money(detail.yearHigh, 0)}` : '—'}</strong>
              </div>
              <div>
                <span>Volume</span>
                <strong>{detail.volume != null ? num(detail.volume, 0) : '—'}</strong>
              </div>
            </div>
          </section>

          <section className="mf-your-sip panel">
            <div>
              <span>Your holding{owner ? ` · ${owner.name}` : ''}</span>
              <strong>{compact(invested)}</strong>
              <em>{holding.quantity} shares @ {money(holding.avgPrice)}</em>
            </div>
            <div className="stock-holding-pnl">
              <span>Unrealized P&amp;L</span>
              <strong className={(pnl ?? 0) >= 0 ? 'up' : 'down'}>
                {pnl == null ? '—' : `${money(pnl, 0)} (${pct(pnlPct)})`}
              </strong>
            </div>
          </section>

          <section className="panel mf-nav-panel">
            <div className="mf-section-head">
              <div>
                <h3>Price chart</h3>
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
              <div className="modal-empty"><p>Price history is unavailable for this stock.</p></div>
            ) : (
              <div className="mf-nav-chart">
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="stockPriceFill" x1="0" y1="0" x2="0" y2="1">
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
                      width={64}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      tickFormatter={(value) => `₹${Number(value).toFixed(0)}`}
                    />
                    <Tooltip
                      labelFormatter={(value) => new Date(Number(value)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      formatter={(value) => [money(Number(value), 2), 'Price']}
                    />
                    <Area type="monotone" dataKey="price" stroke="#244d3c" strokeWidth={2} fill="url(#stockPriceFill)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="mf-section-head">
              <h3>Performance</h3>
              <span>Session levels</span>
            </div>
            <div className="mf-return-grid stock-perf-grid">
              {[
                ['Open', detail.open != null ? money(detail.open) : '—'],
                ['Prev close', detail.prevClose != null ? money(detail.prevClose) : '—'],
                ['Upper circuit', detail.upperCircuit != null ? money(detail.upperCircuit) : '—'],
                ['Lower circuit', detail.lowerCircuit != null ? money(detail.lowerCircuit) : '—'],
                ['52W high', detail.yearHigh != null ? money(detail.yearHigh) : '—'],
                ['52W low', detail.yearLow != null ? money(detail.yearLow) : '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="chart-grid">
            <article className="panel">
              <div className="mf-section-head">
                <h3>Fundamentals</h3>
                <span>Key ratios</span>
              </div>
              <div className="stock-fundamentals">
                {detail.fundamentals.map((row) => (
                  <div key={row.name}>
                    <span>{row.name}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="mf-section-head">
                <h3>Shareholding</h3>
                <span>Latest pattern</span>
              </div>
              {detail.shareholding.length === 0 ? (
                <div className="modal-empty"><p>Shareholding data unavailable.</p></div>
              ) : (
                <div className="donut-layout">
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={detail.shareholding} dataKey="value" nameKey="name" innerRadius={72} outerRadius={99} paddingAngle={3} stroke="none">
                          {detail.shareholding.map((entry, index) => (
                            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${Number(value).toFixed(2)}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center"><strong>{detail.shareholding.length}</strong><span>groups</span></div>
                  </div>
                  <div className="legend-list">
                    {detail.shareholding.map((row, index) => (
                      <div className="legend-row" key={row.name}>
                        <span className="legend-dot" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                        <span>{row.name}</span>
                        <strong>{row.value.toFixed(1)}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </section>

          {detail.financials.quarters.length > 0 && (
            <section className="panel">
              <div className="mf-section-head">
                <h3>Financials (quarterly)</h3>
                <span>Consolidated · ₹ Cr</span>
              </div>
              <div className="table-scroll">
                <table className="stock-financials-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      {detail.financials.quarters.map((quarter) => <th key={quarter}>{quarter}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.financials.rows.map((row) => (
                      <tr key={row.title}>
                        <td><strong>{row.title}</strong></td>
                        {row.values.map((value, index) => (
                          <td key={`${row.title}-${detail.financials.quarters[index]}`}>{cr(value)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {detail.fundsInvested.length > 0 && (
            <section className="panel">
              <div className="mf-section-head">
                <h3>Mutual funds invested</h3>
                <span>Top fund exposure</span>
              </div>
              <div className="stock-funds-list">
                {detail.fundsInvested.map((fund) => (
                  <div key={fund.searchId || fund.name}>
                    <strong>{fund.name}</strong>
                    <span>{fund.aumPercent != null ? `${fund.aumPercent.toFixed(2)}% of AUM` : '—'}</span>
                    <em className={(fund.return3y ?? 0) >= 0 ? 'up' : 'down'}>{pct(fund.return3y)} 3Y</em>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(detail.summary || detail.foundedYear) && (
            <section className="panel">
              <div className="mf-section-head">
                <h3>About</h3>
                {detail.foundedYear && <span>Founded {detail.foundedYear}</span>}
              </div>
              {detail.summary && <p className="mf-objective">{detail.summary}</p>}
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}
