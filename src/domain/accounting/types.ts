export const EXPENSE_CATEGORIES = [
  'Logiciel',
  'Transport',
  'Repas',
  'Abonnement',
  'Matériel',
  'Formation',
  'Assurance',
  'Banque',
  'Autre',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense {
  id: string
  date: string        // ISO YYYY-MM-DD
  label: string
  amount: number
  justified: boolean
  category?: ExpenseCategory
}

export interface AccountingMonth {
  yearMonth: string   // YYYYMM
  expenses: Expense[]
  revenue?: MonthlyRevenue[]
  importedAt?: string // ISO datetime
}

export interface MonthlyRevenue {
  invoiceNumber: string
  clientName: string
  netAmount: number    // HT
  grossAmount: number  // TTC
  issueDate: string
}

export interface InvoiceRecord {
  number: string
  issueDate: string
  dueDate: string
  periodMonth: string  // YYYY-MM
  clientName: string
  netAmount: number
  vatAmount: number
  grossAmount: number
  archived?: boolean    // true if not the latest version in its group
  paidAt?: string       // ISO datetime when marked as paid
  paidAmount?: number
  paymentNote?: string
}

/** Payment info stored in IndexedDB, keyed by invoice number */
export interface InvoicePaymentInfo {
  invoiceNumber: string
  paidAt: string
  paidAmount: number
  paymentNote?: string
}
