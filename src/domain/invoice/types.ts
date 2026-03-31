export interface Address {
  line1: string
  postalCode: string
  city: string
  country: string
}

export interface CompanyProfile {
  id: 'company-profile'
  firstName: string
  lastName: string
  address: Address
  siret: string
  iban: string
  bic: string
  vatNumber: string
}

export interface ClientProfile {
  id: string
  legalName: string
  address: Address
  siret: string
}

export interface InvoiceInput {
  id: string
  number: string
  issueDate: string
  dueDate: string
  periodLabel: string
  seller: CompanyProfile
  buyer: ClientProfile
  workedDays: number
  dailyRate: number
  vatRate: number
  currency: 'EUR'
}

export interface InvoiceTotals {
  netAmount: number
  vatAmount: number
  grossAmount: number
}
