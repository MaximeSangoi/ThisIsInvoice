import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { InvoiceRecord, InvoicePaymentInfo } from '../domain/accounting/types'
import type { InvoiceMeta } from '../services/facturx/facturx-reader.service'
import { scanInvoiceDirectory } from '../services/invoice/invoice-scanner.service'
import { listInvoicePayments, saveInvoicePayment, deleteInvoicePayment } from '../services/storage/local-db'

/** Derive dueDate = issueDate + 30 days */
const dueDateFrom = (issueDate: string): string => {
  const d = new Date(`${issueDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 30)
  return d.toISOString().slice(0, 10)
}

/** Convert InvoiceMeta (from PDF scan) → InvoiceRecord, merging optional payment info */
const toRecord = (meta: InvoiceMeta, payment?: InvoicePaymentInfo): InvoiceRecord => ({
  number: meta.number,
  issueDate: meta.issueDate,
  dueDate: dueDateFrom(meta.issueDate),
  periodMonth: meta.issueDate.slice(0, 7),
  clientName: meta.buyerName,
  netAmount: meta.netAmount,
  vatAmount: meta.vatAmount,
  grossAmount: meta.grossAmount,
  ...(payment ? { paidAt: payment.paidAt, paidAmount: payment.paidAmount, paymentNote: payment.paymentNote } : {}),
})

/**
 * Extract the version-group key from an invoice number.
 * e.g. "202601-ACME-002" → "202601-ACME"
 */
const versionGroupKey = (invoiceNumber: string): string => {
  const lastDash = invoiceNumber.lastIndexOf('-')
  return lastDash > 0 ? invoiceNumber.slice(0, lastDash) : invoiceNumber
}

/**
 * Mark older versions as archived within each version group.
 * The latest version (highest number) is kept as current.
 */
const markArchived = (records: InvoiceRecord[]): void => {
  const groups = new Map<string, InvoiceRecord[]>()
  for (const r of records) {
    const key = versionGroupKey(r.number)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  for (const members of groups.values()) {
    if (members.length <= 1) continue
    members.sort((a, b) => b.number.localeCompare(a.number))
    // First is latest → current; rest are archived
    for (let i = 1; i < members.length; i++) {
      members[i]!.archived = true
    }
  }
}

export const useInvoicesStore = defineStore('invoices', () => {
  const records = ref<InvoiceRecord[]>([])
  const initialized = ref(false)

  /**
   * Scan the PDF directory to build the invoice list (source of truth).
   * Payment metadata is merged from IndexedDB.
   */
  const initialize = async (dirHandle: FileSystemDirectoryHandle | null, force = false): Promise<void> => {
    if (initialized.value && !force) return
    if (!dirHandle) {
      records.value = []
      initialized.value = true
      return
    }

    const [metas, payments] = await Promise.all([
      scanInvoiceDirectory(dirHandle),
      listInvoicePayments(),
    ])

    const paymentMap = new Map(payments.map(p => [p.invoiceNumber, p]))
    const built = metas.map(m => toRecord(m, paymentMap.get(m.number)))
    markArchived(built)
    records.value = built
    initialized.value = true
  }

  const markAsPaid = async (invoiceNumber: string, paidAmount: number, paymentNote?: string): Promise<void> => {
    const payment: InvoicePaymentInfo = {
      invoiceNumber,
      paidAt: new Date().toISOString(),
      paidAmount,
      paymentNote,
    }
    await saveInvoicePayment(payment)
    records.value = records.value.map(r =>
      r.number === invoiceNumber
        ? { ...r, paidAt: payment.paidAt, paidAmount: payment.paidAmount, paymentNote: payment.paymentNote }
        : r,
    )
  }

  const markAsUnpaid = async (invoiceNumber: string): Promise<void> => {
    await deleteInvoicePayment(invoiceNumber)
    records.value = records.value.map(r => {
      if (r.number !== invoiceNumber) return r
      const { paidAt, paidAmount, paymentNote, ...rest } = r
      return rest as InvoiceRecord
    })
  }

  const getByMonth = (periodMonth: string): InvoiceRecord[] =>
    records.value.filter(r => r.periodMonth === periodMonth)

  const revenueByYearMonth = computed(() => {
    // Group invoices by version group, pick the paid one or the latest
    const groups = new Map<string, InvoiceRecord[]>()
    for (const r of records.value) {
      const key = versionGroupKey(r.number)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const map = new Map<string, number>()
    for (const members of groups.values()) {
      // Prefer the paid version; otherwise take the latest (non-archived)
      const paid = members.find(m => m.paidAt)
      const representative = paid ?? members.find(m => !m.archived) ?? members[0]!
      const ym = representative.periodMonth.replace('-', '')
      map.set(ym, (map.get(ym) ?? 0) + representative.netAmount)
    }
    return map
  })

  const unpaidRecords = computed(() =>
    records.value.filter(r => !r.paidAt && !r.archived).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  )

  const overdueRecords = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    return unpaidRecords.value.filter(r => r.dueDate < today)
  })

  return {
    records,
    initialized,
    initialize,
    markAsPaid,
    markAsUnpaid,
    getByMonth,
    revenueByYearMonth,
    unpaidRecords,
    overdueRecords,
  }
})
