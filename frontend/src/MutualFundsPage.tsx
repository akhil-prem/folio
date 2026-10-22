import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Loader2, PiggyBank, Plus, Search, Trash2, X } from 'lucide-react'
import { fetchMutualFundScheme, searchMutualFunds } from './api'
import { BusyButton } from './BusyButton'
import { MutualFundDetailPage } from './MutualFundDetailPage'
import type {
  Broker,
  FundCategory,
  Member,
  MfSchemeDetail,
  MfSuggestion,
  MutualFund,
  MutualFundInput,
  SipEntry,
  SipEntryInput,
} from './types'
import { BROKERS } from './types'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const money = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

const monthLabel = (month: number, year: number) => `${MONTHS[month - 1].slice(0, 3)} ${year}`

/** e.g. 8 → "8 mo"; 14 → "1 yr 2 mo"; 24 → "2 yr" */
const formatSipSpan = (months: number) => {
  if (months <= 11) return `${months} mo`
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (rem === 0) return `${years} yr`
  return `${years} yr ${rem} mo`
}

type Props = {
  funds: MutualFund[]
  members: Member[]
  selectedMember: string
  canEdit: boolean
  onCreateFund: (fund: MutualFundInput) => Promise<void>
  onDeleteFund: (fund: MutualFund) => Promise<void>
  onAddSip: (entry: SipEntryInput) => Promise<void>
  onDeleteSip: (fundId: string, sipId: string) => Promise<void>
}

export function MutualFundsPage({
  funds,
  members,
  selectedMember,
  canEdit,
  onCreateFund,
  onDeleteFund,
  onAddSip,
  onDeleteSip,
}: Props) {
  const [search, setSearch] = useState('')
  const [fundModal, setFundModal] = useState(false)
  const [sipFundId, setSipFundId] = useState<string | null>(null)
  const [historyFundId, setHistoryFundId] = useState<string | null>(null)
  const [detailFundId, setDetailFundId] = useState<string | null>(null)
  const [pendingFundDeleteId, setPendingFundDeleteId] = useState<string | null>(null)
  const [pendingSipDeleteId, setPendingSipDeleteId] = useState<string | null>(null)

  const deleteFund = async (fund: MutualFund) => {
    if (pendingFundDeleteId) return
    if (!window.confirm(`Remove ${fund.name} and all SIP months?`)) return
    setPendingFundDeleteId(fund.id)
    try {
      await onDeleteFund(fund)
      if (detailFundId === fund.id) setDetailFundId(null)
      if (historyFundId === fund.id) setHistoryFundId(null)
    } finally {
      setPendingFundDeleteId(null)
    }
  }

  const deleteSip = async (fundId: string, sipId: string) => {
    if (pendingSipDeleteId) return
    setPendingSipDeleteId(sipId)
    try {
      await onDeleteSip(fundId, sipId)
    } finally {
      setPendingSipDeleteId(null)
    }
  }

  const visible = useMemo(() => {
    const scoped = selectedMember === 'all' ? funds : funds.filter((fund) => fund.memberId === selectedMember)
    const q = search.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((fund) =>
      `${fund.name} ${fund.amc} ${fund.folioNumber} ${fund.category} ${fund.broker}`.toLowerCase().includes(q),
    )
  }, [funds, selectedMember, search])

  const total = visible.reduce((sum, fund) => sum + fund.totalInvested, 0)
  const sipFund = funds.find((fund) => fund.id === sipFundId) ?? null
  const historyFund = funds.find((fund) => fund.id === historyFundId) ?? null
  const detailFund = funds.find((fund) => fund.id === detailFundId) ?? null

  if (detailFund) {
    return (
      <>
        <MutualFundDetailPage
          fund={detailFund}
          canEdit={canEdit}
          onBack={() => setDetailFundId(null)}
          onViewHistory={() => setHistoryFundId(detailFund.id)}
          onAddSip={() => setSipFundId(detailFund.id)}
        />
        {historyFund && (
          <SipHistoryModal
            fund={historyFund}
            canEdit={canEdit}
            onClose={() => setHistoryFundId(null)}
            onAddSip={() => setSipFundId(historyFund.id)}
          onDeleteSip={deleteSip}
          pendingSipDeleteId={pendingSipDeleteId}
        />
      )}
      {sipFund && (
        <SipModal
          fund={sipFund}
          nested={Boolean(historyFund)}
          onClose={() => setSipFundId(null)}
          onSave={async (payload) => {
            await onAddSip(payload)
            setSipFundId(null)
          }}
        />
      )}
      </>
    )
  }

  return (
    <div className="page members-page">
      <section className="members-toolbar">
        <div className="search-box">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mutual funds..." />
        </div>
        <div className="mf-toolbar-meta">
          <span>{visible.length} funds · {money(total)} invested</span>
          {canEdit && (
            <button className="button secondary" onClick={() => setFundModal(true)}><Plus size={18} /> Add fund</button>
          )}
        </div>
      </section>

      {visible.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><PiggyBank size={28} /></div>
          <h3>No mutual funds yet</h3>
          <p>{canEdit ? 'Search and pick a scheme, then log each SIP month.' : 'No mutual funds to show for this filter.'}</p>
          {canEdit && <button className="button primary" onClick={() => setFundModal(true)}><Plus size={17} /> Add fund</button>}
        </div>
      ) : (
        <section className="member-grid mf-grid">
          {visible.map((fund) => {
            const owner = members.find((member) => member.id === fund.memberId)
            const latest = fund.sips[0]
            const yearSpan = fund.sips.length
              ? `${Math.min(...fund.sips.map((sip) => sip.year))}–${Math.max(...fund.sips.map((sip) => sip.year))}`
              : null
            return (
              <article
                className="member-card mf-card mf-card-clickable"
                key={fund.id}
                onClick={() => setDetailFundId(fund.id)}
              >
                <div className="member-card-head">
                  <span className="avatar" style={{ background: fund.color }}>{fund.name.slice(0, 2).toUpperCase()}</span>
                  <div className="member-card-actions" onClick={(event) => event.stopPropagation()}>
                    {canEdit && (
                      <button
                        className="icon-button danger"
                        title="Delete fund"
                        disabled={pendingFundDeleteId === fund.id}
                        onClick={() => void deleteFund(fund)}
                      >
                        {pendingFundDeleteId === fund.id ? <Loader2 size={16} className="spinning" /> : <Trash2 size={16} />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="member-badges">
                  <span className="member-badge default">{fund.category}</span>
                  <span className="member-badge">{fund.broker || 'Groww'}</span>
                  {owner && <span className="member-badge">{owner.name.split(' ')[0]}</span>}
                </div>
                <h3>{fund.name}</h3>
                <p>{fund.amc || 'AMC not set'}{fund.folioNumber ? ` · Folio ${fund.folioNumber}` : ''}</p>
                <div className="member-stat-row">
                  <div><span>Total invested</span><strong>{money(fund.totalInvested)}</strong></div>
                  <div><span>SIP span</span><strong>{formatSipSpan(fund.sipCount)}</strong></div>
                </div>
                <div className="mf-card-summary">
                  {latest ? (
                    <>
                      <span>Latest SIP</span>
                      <strong>{monthLabel(latest.month, latest.year)} · {money(latest.amount)}</strong>
                      {yearSpan && <small>{formatSipSpan(fund.sipCount)} across {yearSpan}</small>}
                    </>
                  ) : (
                    <em>No SIP months logged yet</em>
                  )}
                </div>
                <div className="mf-card-actions-row" onClick={(event) => event.stopPropagation()}>
                  <button className="member-add" onClick={() => setHistoryFundId(fund.id)}>
                    <CalendarDays size={16} /> View SIP history
                  </button>
                  {canEdit && (
                    <button className="member-add mf-add-sip" onClick={() => setSipFundId(fund.id)}>
                      <Plus size={16} /> Add month
                    </button>
                  )}
                </div>
              </article>
            )
          })}
          {canEdit && (
            <button className="new-member-card" onClick={() => setFundModal(true)}>
              <span><Plus size={25} /></span>
              <strong>Add mutual fund</strong>
              <small>Search a scheme and track SIPs</small>
            </button>
          )}
        </section>
      )}

      {fundModal && (
        <FundModal
          members={members}
          initialMemberId={selectedMember === 'all' ? members.find((item) => item.isDefault)?.id : selectedMember}
          onClose={() => setFundModal(false)}
          onSave={async (payload) => {
            await onCreateFund(payload)
            setFundModal(false)
          }}
        />
      )}
      {historyFund && (
        <SipHistoryModal
          fund={historyFund}
          canEdit={canEdit}
          onClose={() => setHistoryFundId(null)}
          onAddSip={() => {
            setSipFundId(historyFund.id)
          }}
          onDeleteSip={deleteSip}
          pendingSipDeleteId={pendingSipDeleteId}
        />
      )}
      {sipFund && (
        <SipModal
          fund={sipFund}
          nested={Boolean(historyFund || detailFund)}
          onClose={() => setSipFundId(null)}
          onSave={async (payload) => {
            await onAddSip(payload)
            setSipFundId(null)
          }}
        />
      )}
    </div>
  )
}

function groupSipsByYear(sips: SipEntry[]) {
  const groups = new Map<number, SipEntry[]>()
  for (const sip of sips) {
    const list = groups.get(sip.year) ?? []
    list.push(sip)
    groups.set(sip.year, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, entries]) => ({
      year,
      entries: [...entries].sort((a, b) => b.month - a.month),
      total: entries.reduce((sum, sip) => sum + sip.amount, 0),
    }))
}

function SipHistoryModal({
  fund,
  canEdit,
  onClose,
  onAddSip,
  onDeleteSip,
  pendingSipDeleteId = null,
}: {
  fund: MutualFund
  canEdit: boolean
  onClose: () => void
  onAddSip: () => void
  onDeleteSip: (fundId: string, sipId: string) => Promise<void>
  pendingSipDeleteId?: string | null
}) {
  const years = useMemo(() => groupSipsByYear(fund.sips), [fund.sips])
  const [yearFilter, setYearFilter] = useState<'all' | number>('all')
  const filtered = yearFilter === 'all' ? years : years.filter((group) => group.year === yearFilter)

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal wide mf-history-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">{fund.name}</p>
            <h2>SIP history</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="mf-history-summary">
          <div><span>Total invested</span><strong>{money(fund.totalInvested)}</strong></div>
          <div><span>Months logged</span><strong>{fund.sipCount}</strong></div>
          <div><span>Years covered</span><strong>{years.length || '—'}</strong></div>
        </div>

        <div className="mf-history-toolbar">
          <label>
            Year
            <select value={yearFilter === 'all' ? 'all' : String(yearFilter)} onChange={(event) => {
              const value = event.target.value
              setYearFilter(value === 'all' ? 'all' : Number(value))
            }}>
              <option value="all">All years</option>
              {years.map((group) => <option key={group.year} value={group.year}>{group.year}</option>)}
            </select>
          </label>
          {canEdit && (
            <button className="button secondary" onClick={onAddSip}><Plus size={16} /> Add SIP month</button>
          )}
        </div>

        {fund.sips.length === 0 ? (
          <div className="modal-empty"><p>No SIP months yet. Add the first month to start tracking.</p></div>
        ) : (
          <div className="mf-history-scroll">
            {filtered.map((group) => (
              <section className="mf-year-group" key={group.year}>
                <div className="mf-year-head">
                  <strong>{group.year}</strong>
                  <span>{group.entries.length} months · {money(group.total)}</span>
                </div>
                <div className="mf-sip-list mf-history-list">
                  {group.entries.map((sip) => (
                    <div className="mf-sip-row" key={sip.id}>
                      <span>{MONTHS[sip.month - 1]}</span>
                      <strong>{money(sip.amount)}</strong>
                      {sip.note ? <small className="mf-sip-note">{sip.note}</small> : <span />}
                      {canEdit ? (
                        <button
                          className="icon-button danger"
                          title="Remove month"
                          disabled={pendingSipDeleteId === sip.id}
                          onClick={() => void onDeleteSip(fund.id, sip.id)}
                        >
                          {pendingSipDeleteId === sip.id ? <Loader2 size={14} className="spinning" /> : <Trash2 size={14} />}
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function FundModal({
  members,
  initialMemberId,
  onClose,
  onSave,
}: {
  members: Member[]
  initialMemberId?: string
  onClose: () => void
  onSave: (fund: MutualFundInput) => Promise<void>
}) {
  const [memberId, setMemberId] = useState(initialMemberId ?? members[0]?.id ?? '')
  const [broker, setBroker] = useState<Broker>('Groww')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<MfSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [selected, setSelected] = useState<MfSuggestion | null>(null)
  const [scheme, setScheme] = useState<MfSchemeDetail | null>(null)
  const [loadingScheme, setLoadingScheme] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedIdRef = useRef('')

  useEffect(() => {
    if (selected) return
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      setOpen(false)
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchMutualFunds(q, controller.signal)
        .then((results) => {
          setSuggestions(results)
          setActiveIndex(0)
          setOpen(true)
          setSearching(false)
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([])
            setSearching(false)
          }
        })
    }, 280)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, selected])

  const applySuggestion = async (suggestion: MfSuggestion) => {
    selectedIdRef.current = suggestion.searchId
    setSelected(suggestion)
    setQuery(suggestion.label)
    setOpen(false)
    setSuggestions([])
    setLoadingScheme(true)
    setError('')
    try {
      const detail = await fetchMutualFundScheme(suggestion.searchId)
      if (selectedIdRef.current !== suggestion.searchId) return
      setScheme(detail)
      setQuery(detail.name)
    } catch (caught) {
      if (selectedIdRef.current !== suggestion.searchId) return
      setScheme(null)
      setError(caught instanceof Error ? caught.message : 'Could not load scheme details.')
    } finally {
      if (selectedIdRef.current === suggestion.searchId) setLoadingScheme(false)
    }
  }

  const clearSelection = () => {
    selectedIdRef.current = ''
    setSelected(null)
    setScheme(null)
    setQuery('')
    setSuggestions([])
    setOpen(false)
    setError('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (!memberId || !selected) {
      setError('Pick a mutual fund scheme from the suggestions.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        memberId,
        name: scheme?.name || selected.label || selected.name,
        amc: scheme?.amc || scheme?.fundHouse || '',
        category: (scheme?.category || 'Equity') as FundCategory,
        broker,
        schemeCode: scheme?.schemeCode || selected.schemeCode,
        searchId: scheme?.searchId || selected.searchId,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create fund.')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-head">
          <div><p className="eyebrow">Mutual fund</p><h2>Add a fund</h2></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving}><X size={20} /></button>
        </div>
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
        </div>
        <div className="stock-combobox-wrap">
          <span className="field-label">Scheme name</span>
          <div className="stock-combobox-anchor">
          <div className={`stock-combobox${open ? ' open' : ''}${searching || loadingScheme ? ' loading' : ''}`}>
            <Search size={16} />
            <input
              autoFocus
              required
              value={query}
              disabled={loadingScheme}
              placeholder="Search e.g. Parag Parikh Flexi Cap"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-busy={searching || loadingScheme}
              aria-controls="mf-suggestions"
              onChange={(event) => {
                setQuery(event.target.value)
                setSelected(null)
                setScheme(null)
                if (event.target.value.trim().length >= 2) setOpen(true)
              }}
              onFocus={() => (suggestions.length > 0 || searching) && setOpen(true)}
              onKeyDown={(event) => {
                if (!open || suggestions.length === 0) return
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActiveIndex((index) => (index + 1) % suggestions.length)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length)
                } else if (event.key === 'Enter' && suggestions[activeIndex]) {
                  event.preventDefault()
                  void applySuggestion(suggestions[activeIndex])
                } else if (event.key === 'Escape') {
                  setOpen(false)
                }
              }}
            />
            {(searching || loadingScheme) && <Loader2 className="spin" size={16} />}
            {selected && !loadingScheme && (
              <button type="button" className="stock-combobox-clear" onClick={clearSelection}>Clear</button>
            )}
          </div>
          {open && query.trim().length >= 2 && !selected && (
            <ul className="stock-suggestions mf-suggestions" id="mf-suggestions" role="listbox">
              {searching && suggestions.length === 0 ? (
                <li className="stock-suggestion-empty stock-suggestion-loading"><Loader2 className="spin" size={14} /> Searching schemes…</li>
              ) : suggestions.length === 0 ? (
                <li className="stock-suggestion-empty">No matching schemes</li>
              ) : suggestions.map((item, index) => (
                <li key={item.searchId} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    className={index === activeIndex ? 'active' : ''}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => void applySuggestion(item)}
                  >
                    <strong>{item.plan || 'Scheme'}</strong>
                    <span>{item.name}</span>
                    <small>{item.schemeCode || 'MF'}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          </div>
          <p className="stock-lookup-hint">
            {loadingScheme
              ? 'Loading scheme details…'
              : searching
                ? 'Searching schemes…'
                : selected
                  ? 'Scheme selected — AMC and category fill in automatically.'
                  : 'Type at least 2 characters and pick a suggestion.'}
          </p>
        </div>
        {scheme && (
          <div className="mf-selected-scheme">
            <div><span>AMC</span><strong>{scheme.amc || scheme.fundHouse || '—'}</strong></div>
            <div><span>Category</span><strong>{scheme.subCategory || scheme.categoryLabel || scheme.category}</strong></div>
            <div><span>NAV</span><strong>{scheme.nav != null ? `₹${scheme.nav.toFixed(2)}` : '—'}</strong></div>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <BusyButton
            type="submit"
            className="button primary"
            busy={saving || loadingScheme}
            disabled={!selected}
            busyLabel={loadingScheme ? 'Loading…' : 'Adding…'}
          >
            Add fund
          </BusyButton>
        </div>
      </form>
    </div>
  )
}

function SipModal({
  fund,
  nested = false,
  onClose,
  onSave,
}: {
  fund: MutualFund
  nested?: boolean
  onClose: () => void
  onSave: (entry: SipEntryInput) => Promise<void>
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    const value = Number(amount)
    if (!value || value <= 0) {
      setError('Enter a valid SIP amount.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave({
        mutualFundId: fund.id,
        year,
        month,
        amount: value,
        note: note.trim(),
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save SIP month.')
      setSaving(false)
    }
  }

  return (
    <div
      className={`modal-backdrop${nested ? ' modal-backdrop--nested' : ''}`}
      onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}
    >
      <form className="modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-head">
          <div><p className="eyebrow">{fund.name}</p><h2>Add SIP month</h2></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={saving}><X size={20} /></button>
        </div>
        <p className="member-owner-note">Log each month separately. Amounts can differ when you change SIP.</p>
        <div className="form-grid">
          <label>Month
            <select required value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </select>
          </label>
          <label>Year
            <input required type="number" min={1990} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} />
          </label>
        </div>
        <label>Amount invested<input autoFocus required type="number" min={1} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="e.g. 5000" /></label>
        <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional — e.g. increased SIP" /></label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <BusyButton type="submit" className="button primary" busy={saving} busyLabel="Saving…">
            Save month
          </BusyButton>
        </div>
      </form>
    </div>
  )
}
