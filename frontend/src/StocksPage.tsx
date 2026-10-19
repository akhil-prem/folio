import { type FormEvent, useMemo, useState } from 'react'
import { BriefcaseBusiness, Download, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { BusyButton } from './BusyButton'
import { StockDetailPage } from './StockDetailPage'
import { SECTORS, SECTOR_TREE } from './sectors'
import type { Broker, Holding, MarketCap, Member } from './types'
import { BROKERS } from './types'

type RemoveHolding = (holding: Holding) => void | Promise<void>
type UpdateHolding = (id: string, updates: Partial<Holding>) => Promise<void>

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
  onUpdate: UpdateHolding
  onRemove: RemoveHolding
}

export function StocksPage({ holdings, members, selectedMember, canEdit, onAdd, onUpdate, onRemove }: Props) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<HoldingSort>('invested-desc')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editHolding, setEditHolding] = useState<Holding | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const deleteHolding = async (holding: Holding) => {
    if (pendingDeleteId) return
    if (!window.confirm(`Remove ${holding.symbol} from this portfolio?`)) return
    setPendingDeleteId(holding.id)
    try {
      await onRemove(holding)
      if (detailId === holding.id) setDetailId(null)
      if (editHolding?.id === holding.id) setEditHolding(null)
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
  const editingHolding = editHolding
    ? holdings.find((holding) => holding.id === editHolding.id) ?? editHolding
    : null

  if (detailHolding) {
    return (
      <>
        <StockDetailPage
          holding={detailHolding}
          members={members}
          canEdit={canEdit}
          onBack={() => setDetailId(null)}
          onEdit={canEdit ? () => setEditHolding(detailHolding) : undefined}
          onRemove={deleteHolding}
          removing={pendingDeleteId === detailHolding.id}
        />
        {editingHolding && (
          <EditHoldingModal
            holding={editingHolding}
            members={members}
            onClose={() => setEditHolding(null)}
            onSave={async (updates) => {
              await onUpdate(editingHolding.id, updates)
              setEditHolding(null)
            }}
          />
        )}
      </>
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
                          <div className="holding-row-actions">
                            <button
                              className="icon-button"
                              title="Edit holding"
                              onClick={() => setEditHolding(holding)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-button danger"
                              title="Delete holding"
                              disabled={pendingDeleteId === holding.id}
                              onClick={() => void deleteHolding(holding)}
                            >
                              {pendingDeleteId === holding.id ? <Loader2 size={15} className="spinning" /> : <Trash2 size={15} />}
                            </button>
                          </div>
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

      {editingHolding && (
        <EditHoldingModal
          holding={editingHolding}
          members={members}
          onClose={() => setEditHolding(null)}
          onSave={async (updates) => {
            await onUpdate(editingHolding.id, updates)
            setEditHolding(null)
          }}
        />
      )}
    </div>
  )
}

function EditHoldingModal({
  holding,
  members,
  onClose,
  onSave,
}: {
  holding: Holding
  members: Member[]
  onClose: () => void
  onSave: (updates: Partial<Holding>) => Promise<void>
}) {
  const [memberId, setMemberId] = useState(holding.memberId)
  const [broker, setBroker] = useState<Broker>(holding.broker || 'Groww')
  const [sector, setSector] = useState(holding.sector)
  const [subSector, setSubSector] = useState(holding.subSector)
  const [cap, setCap] = useState<MarketCap>(holding.cap || 'Large')
  const [quantity, setQuantity] = useState(String(holding.quantity))
  const [avgPrice, setAvgPrice] = useState(String(holding.avgPrice))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const sectorOptions = SECTORS.includes(sector) || !sector ? SECTORS : [sector, ...SECTORS]
  const subSectorOptions = sector
    ? (SECTOR_TREE[sector]?.includes(subSector) || !subSector
      ? SECTOR_TREE[sector] ?? []
      : [subSector, ...(SECTOR_TREE[sector] ?? [])])
    : []

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const qty = Number(quantity)
    const price = Number(avgPrice)
    if (!memberId) {
      setError('Pick a member.')
      return
    }
    if (!qty || qty <= 0) {
      setError('Enter a valid quantity.')
      return
    }
    if (!price || price <= 0) {
      setError('Enter a valid average price.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        memberId,
        broker,
        sector,
        subSector,
        cap,
        quantity: qty,
        avgPrice: price,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update holding.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{holding.symbol}</p>
            <h2>Edit holding</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving}><X size={20} /></button>
        </div>
        <p className="member-owner-note">{holding.company}</p>
        <div className="form-grid">
          <label>Member
            <select required value={memberId} onChange={(event) => setMemberId(event.target.value)}>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <label>Broker
            <select required value={broker} onChange={(event) => setBroker(event.target.value as Broker)}>
              {BROKERS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Sector
            <select required value={sector} onChange={(event) => {
              const next = event.target.value
              setSector(next)
              setSubSector(SECTOR_TREE[next]?.[0] ?? '')
            }}>
              {sectorOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Sub-sector
            <select required value={subSector} onChange={(event) => setSubSector(event.target.value)} disabled={!sector}>
              {subSectorOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Market cap
            <select required value={cap} onChange={(event) => setCap(event.target.value as MarketCap)}>
              <option value="Large">Large</option>
              <option value="Mid">Mid</option>
              <option value="Small">Small</option>
            </select>
          </label>
          <label>Quantity
            <input required min={0.01} step="0.01" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label>Average price (₹)
            <input required min={0.01} step="0.01" type="number" value={avgPrice} onChange={(event) => setAvgPrice(event.target.value)} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <BusyButton type="submit" className="button primary" busy={saving} busyLabel="Saving…">
            Save changes
          </BusyButton>
        </div>
      </form>
    </div>
  )
}
