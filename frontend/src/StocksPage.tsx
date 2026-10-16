import { useMemo, useState } from 'react'
import { BriefcaseBusiness, Download, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { StockDetailPage } from './StockDetailPage'
import type { Holding, Member } from './types'

type RemoveHolding = (holding: Holding) => void | Promise<void>

type HoldingSort = 'invested-desc' | 'invested-asc' | 'symbol-asc' | 'quantity-desc' | 'sector-asc'

const investedOf = (holding: Holding) => holding.quantity * holding.avgPrice

const shortMoney = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount)

const csvCell = (value: string | number) => {
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

const downloadFile = (content: string, filename: string, type: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

type Props = {
  holdings: Holding[]
  members: Member[]
  selectedMember: string
  canEdit: boolean
  onAdd: (memberId?: string) => void
  onRemove: RemoveHolding
}

export function StocksPage({ holdings, members, selectedMember, canEdit, onAdd, onRemove }: Props) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<HoldingSort>('invested-desc')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const deleteHolding = async (holding: Holding) => {
    if (pendingDeleteId) return
    if (!window.confirm(`Remove ${holding.symbol} from this portfolio?`)) return
    setPendingDeleteId(holding.id)
    try {
      await onRemove(holding)
      if (detailId === holding.id) setDetailId(null)
    } finally {
      setPendingDeleteId(null)
    }
  }

  const visible = useMemo(
    () => selectedMember === 'all' ? holdings : holdings.filter((holding) => holding.memberId === selectedMember),
    [holdings, selectedMember],
  )

  const sorted = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = query
      ? visible.filter((holding) => {
          const owner = members.find((member) => member.id === holding.memberId)?.name ?? ''
          return `${holding.symbol} ${holding.company} ${holding.sector} ${holding.subSector} ${holding.broker} ${owner}`.toLowerCase().includes(query)
        })
      : visible
    return [...filtered].sort((a, b) => {
      if (sort === 'invested-asc') return investedOf(a) - investedOf(b)
      if (sort === 'symbol-asc') return a.symbol.localeCompare(b.symbol)
      if (sort === 'quantity-desc') return b.quantity - a.quantity
      if (sort === 'sector-asc') return `${a.sector} ${a.subSector}`.localeCompare(`${b.sector} ${b.subSector}`)
      return investedOf(b) - investedOf(a)
    })
  }, [visible, members, search, sort])

  const total = visible.reduce((sum, holding) => sum + investedOf(holding), 0)
  const detailHolding = holdings.find((holding) => holding.id === detailId) ?? null

  if (detailHolding) {
    return (
      <StockDetailPage
        holding={detailHolding}
        members={members}
        canEdit={canEdit}
        onBack={() => setDetailId(null)}
        onRemove={deleteHolding}
        removing={pendingDeleteId === detailHolding.id}
      />
    )
  }

  const exportHoldings = (format: 'csv' | 'json') => {
    const rows = sorted.map((holding) => ({
      member: members.find((member) => member.id === holding.memberId)?.name ?? '',
      symbol: holding.symbol,
      company: holding.company,
      sector: holding.sector,
      subSector: holding.subSector,
      marketCap: holding.cap,
      broker: holding.broker || 'Groww',
      quantity: holding.quantity,
      averagePrice: holding.avgPrice,
      amountInvested: investedOf(holding),
    }))
    const date = new Date().toISOString().slice(0, 10)
    if (format === 'json') {
      downloadFile(JSON.stringify(rows, null, 2), `folio-holdings-${date}.json`, 'application/json')
      return
    }
    const headers = ['Member', 'Broker', 'Symbol', 'Company', 'Sector', 'Sub-sector', 'Market cap', 'Quantity', 'Average price', 'Amount invested']
    const csv = [
      headers.map(csvCell).join(','),
      ...rows.map((row) => [
        row.member, row.broker, row.symbol, row.company, row.sector, row.subSector, row.marketCap,
        row.quantity, row.averagePrice, row.amountInvested,
      ].map(csvCell).join(',')),
    ].join('\r\n')
    downloadFile(csv, `folio-holdings-${date}.csv`, 'text/csv;charset=utf-8')
  }

  return (
    <div className="page members-page">
      <section className="members-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setShowAll(false)
            }}
            placeholder="Search symbol, company, sector..."
          />
          {search && <button className="clear-search" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
        </div>
        <div className="mf-toolbar-meta">
          <span>{visible.length} stocks · {shortMoney(total)} invested</span>
          {canEdit && (
            <button
              className="button secondary"
              onClick={() => onAdd(selectedMember === 'all' ? undefined : selectedMember)}
            >
              <Plus size={18} /> Add stock
            </button>
          )}
        </div>
      </section>

      {visible.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><BriefcaseBusiness size={28} /></div>
          <h3>No stocks yet</h3>
          <p>{canEdit ? 'Add stocks for any member. Charts on Overview update automatically.' : 'No stocks to show for this filter.'}</p>
          {canEdit && (
            <button className="button primary" onClick={() => onAdd(selectedMember === 'all' ? undefined : selectedMember)}>
              <Plus size={17} /> Add stock
            </button>
          )}
        </div>
      ) : (
        <section className="panel holdings-table-panel stocks-page-panel">
          <div className="holdings-toolbar">
            <div className={`select-shell${busy ? ' loading' : ''}`}>
              <select
                className="holdings-sort"
                value={sort}
                disabled={busy}
                onChange={(event) => {
                  setBusy(true)
                  setSort(event.target.value as HoldingSort)
                  setShowAll(false)
                  window.setTimeout(() => setBusy(false), 220)
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
              <button className="button secondary" onClick={() => exportHoldings('csv')} disabled={sorted.length === 0}><Download size={15} /> CSV</button>
              <button className="button secondary" onClick={() => exportHoldings('json')} disabled={sorted.length === 0}><Download size={15} /> JSON</button>
            </div>
          </div>

          <div className={`table-scroll${busy ? ' is-busy' : ''}`}>
            <table>
              <thead><tr><th>Stock</th><th>Broker</th><th>Member</th><th>Quantity</th><th>Avg price</th><th>Invested</th><th /></tr></thead>
              <tbody>
                {(showAll ? sorted : sorted.slice(0, 12)).map((holding) => {
                  const owner = members.find((member) => member.id === holding.memberId)
                  return (
                    <tr
                      key={holding.id}
                      className="stock-row-clickable"
                      onClick={() => setDetailId(holding.id)}
                    >
                      <td>
                        <div className="holding-stock-cell">
                          <strong>{holding.symbol}</strong>
                          <span>{holding.company}</span>
                          <small className="holding-sector-line">{holding.sector} · {holding.subSector} · {holding.cap}</small>
                        </div>
                      </td>
                      <td>{holding.broker || 'Groww'}</td>
                      <td>{owner?.name.split(' ')[0] ?? '—'}</td>
                      <td>{holding.quantity}</td>
                      <td>{shortMoney(holding.avgPrice)}</td>
                      <td>{shortMoney(investedOf(holding))}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {canEdit ? (
                          <button
                            className="icon-button danger"
                            title="Delete holding"
                            disabled={pendingDeleteId === holding.id}
                            onClick={() => void deleteHolding(holding)}
                          >
                            {pendingDeleteId === holding.id ? <Loader2 size={15} className="spinning" /> : <Trash2 size={15} />}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {sorted.length === 0 && (
                  <tr><td className="holdings-no-results" colSpan={7}>No stocks match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {sorted.length > 12 && (
            <div className="holdings-list-footer">
              <span>Showing {showAll ? sorted.length : 12} of {sorted.length} stocks</span>
              <button
                className={`button secondary${busy ? ' loading' : ''}`}
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setShowAll(!showAll)
                  window.setTimeout(() => setBusy(false), 220)
                }}
              >
                {busy ? <Loader2 size={15} className="spinning" /> : null}
                {showAll ? 'Show fewer' : `View all ${sorted.length} stocks`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
