export type MarketCap = 'Large' | 'Mid' | 'Small'

export type Account = {
  name: string
  email: string
  phone: string
  role: string
}

export type Member = {
  id: string
  name: string
  email: string
  color: string
  joined: string
}

export type Holding = {
  id: string
  memberId: string
  symbol: string
  company: string
  sector: string
  subSector: string
  cap: MarketCap
  quantity: number
  avgPrice: number
}
