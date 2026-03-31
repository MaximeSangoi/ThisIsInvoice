import type { ClientProfile, CompanyProfile } from '../invoice/types'

export interface QuoteInput {
  id: string
  number: string
  issueDate: string
  validUntilDate: string
  periodStartDate: string
  periodEndDate: string
  seller: CompanyProfile
  buyer: ClientProfile
  workedDays: number
  dailyRate: number
  vatRate: number
  currency: 'EUR'
}

export interface QuoteTotals {
  netAmount: number
  vatAmount: number
  grossAmount: number
}
