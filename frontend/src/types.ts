export type MarketCap = 'Large' | 'Mid' | 'Small'
export type MemberAccess = 'full' | 'readonly'

/** Optional filter applied when opening Stocks from a dashboard widget. */
export type StockListFilter = {
  sector?: string
  subSector?: string
  cap?: MarketCap
  broker?: string
}

export const BROKERS = [
  'Groww',
  'Zerodha',
  'Upstox',
  'Angel One',
  'ICICI Direct',
  'HDFC Securities',
  'Kotak Securities',
  'Motilal Oswal',
  'Paytm Money',
  '5paisa',
  'Other',
] as const

export type Broker = (typeof BROKERS)[number]

export type Account = {
  name: string
  email: string
  phone: string
  role: string
  image: string | null
  isAdmin: boolean
  canEdit: boolean
  canManageMembers: boolean
  access: MemberAccess
  memberId: string | null
}

export type Member = {
  id: string
  name: string
  email: string
  color: string
  joined: string
  isDefault: boolean
  canLogin: boolean
  access: MemberAccess
  isOwner: boolean
  image: string | null
}

export type MemberInput = {
  name: string
  email: string
  isDefault?: boolean
  canLogin?: boolean
  access?: MemberAccess
  password?: string
}

export type Holding = {
  id: string
  memberId: string
  symbol: string
  company: string
  sector: string
  subSector: string
  broker: Broker
  quantity: number
  avgPrice: number
}

export type StockDetail = {
  symbol: string
  searchId: string
  name: string
  shortName: string
  isin: string
  industry: string
  logoUrl: string
  exchange: string
  ltp: number | null
  change: number | null
  changePct: number | null
  open: number | null
  high: number | null
  low: number | null
  prevClose: number | null
  volume: number | null
  yearHigh: number | null
  yearLow: number | null
  upperCircuit: number | null
  lowerCircuit: number | null
  ceo: string
  foundedYear: string
  summary: string
  fundamentals: { name: string; value: string }[]
  shareholding: { name: string; value: number }[]
  financials: {
    quarters: string[]
    rows: { title: string; values: (number | null)[] }[]
  }
  fundsInvested: {
    name: string
    searchId: string
    aumPercent: number | null
    return3y: number | null
  }[]
}

export type StockPricePoint = {
  t: number
  price: number
}

export type StockPriceHistory = {
  symbol: string
  points: StockPricePoint[]
}

export type FundCategory = 'Equity' | 'Hybrid' | 'Debt' | 'Index' | 'Other'

export type SipEntry = {
  id: string
  mutualFundId: string
  year: number
  month: number
  amount: number
  note: string
}

export type MutualFund = {
  id: string
  memberId: string
  name: string
  amc: string
  folioNumber: string
  category: FundCategory
  broker: Broker
  schemeCode: string
  searchId: string
  color: string
  totalInvested: number
  sipCount: number
  sips: SipEntry[]
}

export type MutualFundInput = {
  memberId: string
  name: string
  amc?: string
  folioNumber?: string
  category?: FundCategory
  broker?: Broker
  schemeCode?: string
  searchId?: string
}

export type MfSuggestion = {
  searchId: string
  schemeCode: string
  name: string
  plan: string
  label: string
}

export type MfSchemeHolding = {
  name: string
  sector: string
  instrument: string
  assets: number
  searchId: string
}

export type MfSchemeManager = {
  name: string
  education: string
  experience: string
  since: string
}

export type MfSchemeDetail = {
  searchId: string
  schemeCode: string
  name: string
  fundName: string
  amc: string
  fundHouse: string
  category: FundCategory
  categoryLabel: string
  subCategory: string
  nav: number | null
  navDate: string
  aum: number | null
  expenseRatio: number | null
  rating: number | null
  minSip: number | null
  minLumpsum: number | null
  benchmark: string
  launchDate: string
  exitLoad: string
  description: string
  returns: {
    '1d': number | null
    '1w': number | null
    '1m': number | null
    '3m': number | null
    '6m': number | null
    '1y': number | null
    '3y': number | null
    '5y': number | null
    all: number | null
  }
  holdings: MfSchemeHolding[]
  managers: MfSchemeManager[]
  pros: string[]
  cons: string[]
  logoUrl: string
  planType: string
  schemeType: string
}

export type MfNavPoint = {
  t: number
  nav: number
}

export type MfNavHistory = {
  schemeCode: string
  name: string
  points: MfNavPoint[]
}

export type SipEntryInput = {
  mutualFundId: string
  year: number
  month: number
  amount: number
  note?: string
}
