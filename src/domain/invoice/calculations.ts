import type { InvoiceInput, InvoiceTotals } from './types'

const round2 = (value: number): number => Math.round(value * 100) / 100

export const computeInvoiceTotals = (invoice: InvoiceInput): InvoiceTotals => {
  const netAmount = round2(invoice.workedDays * invoice.dailyRate)
  const vatAmount = round2((netAmount * invoice.vatRate) / 100)
  const grossAmount = round2(netAmount + vatAmount)

  return { netAmount, vatAmount, grossAmount }
}

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value).replace(/\u202F/g, ' ').replace(/\u00A0/g, ' ')


export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}