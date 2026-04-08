import type { ClientProfile, CompanyProfile } from '../../domain/invoice/types'
import type { AccountingMonth } from '../../domain/accounting/types'
import { listClients, listAccountingMonths, loadCompanyProfile, saveClient, saveAccountingMonth, saveCompanyProfile } from './local-db'

export interface ExportPayload {
  version: 1
  exportedAt: string
  companyProfile?: CompanyProfile
  clients?: ClientProfile[]
  accountingMonths?: AccountingMonth[]
}

export interface ExportOptions {
  settings: boolean
  clients: boolean
  accounting: boolean
}

export type ImportSummary = {
  settings: boolean
  clients: number
  accountingMonths: number
}

export const exportData = async (options: ExportOptions): Promise<ExportPayload> => {
  const payload: ExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
  }

  if (options.settings) {
    const profile = await loadCompanyProfile()
    if (profile) payload.companyProfile = profile
  }

  if (options.clients) {
    payload.clients = await listClients()
  }

  if (options.accounting) {
    payload.accountingMonths = await listAccountingMonths()
  }

  return payload
}

const isValidPayload = (data: unknown): data is ExportPayload => {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (obj.version !== 1) return false
  if (typeof obj.exportedAt !== 'string') return false

  if (obj.companyProfile !== undefined) {
    const cp = obj.companyProfile as Record<string, unknown>
    if (typeof cp !== 'object' || cp === null) return false
    if (typeof cp.siret !== 'string' || typeof cp.iban !== 'string') return false
  }

  if (obj.clients !== undefined) {
    if (!Array.isArray(obj.clients)) return false
    for (const c of obj.clients) {
      if (typeof c !== 'object' || c === null) return false
      if (typeof (c as Record<string, unknown>).id !== 'string') return false
      if (typeof (c as Record<string, unknown>).legalName !== 'string') return false
    }
  }

  if (obj.accountingMonths !== undefined) {
    if (!Array.isArray(obj.accountingMonths)) return false
    for (const m of obj.accountingMonths) {
      if (typeof m !== 'object' || m === null) return false
      if (typeof (m as Record<string, unknown>).yearMonth !== 'string') return false
    }
  }

  return true
}

export const parseExportFile = (json: string): ExportPayload => {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('Le fichier n\'est pas un JSON valide.')
  }

  if (!isValidPayload(data)) {
    throw new Error('Le fichier ne correspond pas au format d\'export attendu.')
  }

  return data
}

export const importData = async (payload: ExportPayload, options: ExportOptions): Promise<ImportSummary> => {
  const summary: ImportSummary = { settings: false, clients: 0, accountingMonths: 0 }

  if (options.settings && payload.companyProfile) {
    await saveCompanyProfile(payload.companyProfile)
    summary.settings = true
  }

  if (options.clients && payload.clients) {
    for (const client of payload.clients) {
      await saveClient(client)
    }
    summary.clients = payload.clients.length
  }

  if (options.accounting && payload.accountingMonths) {
    for (const month of payload.accountingMonths) {
      await saveAccountingMonth(month)
    }
    summary.accountingMonths = payload.accountingMonths.length
  }

  return summary
}

export const downloadExportFile = (payload: ExportPayload): void => {
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `this-is-invoice-export.tii.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
