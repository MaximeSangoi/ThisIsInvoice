export interface Expense {
  id: string
  date: string        // ISO YYYY-MM-DD
  label: string
  amount: number
  justified: boolean
}

export interface AccountingMonth {
  yearMonth: string   // YYYYMM
  expenses: Expense[]
  importedAt?: string // ISO datetime
}
