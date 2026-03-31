import Dexie, { type Table } from 'dexie'
import { toRaw } from 'vue'
import type { ClientProfile, CompanyProfile } from '../../domain/invoice/types'

class TiiDatabase extends Dexie {
  settings!: Table<CompanyProfile, string>
  clients!: Table<ClientProfile, string>

  constructor() {
    super('tii-db')
    this.version(1).stores({
      settings: 'id',
      invoices: 'id,number,syncStatus,issueDate',
      artifacts: 'id',
    })
    this.version(2).stores({
      settings: 'id',
      invoices: 'id,number,syncStatus,issueDate',
      artifacts: 'id',
      clients: 'id,legalName',
    })
    this.version(3).stores({
      settings: 'id',
      invoices: null,   // drop table
      artifacts: null,  // drop table
      clients: 'id,legalName',
    })
  }
}

export const db = new TiiDatabase()

export const loadCompanyProfile = (): Promise<CompanyProfile | undefined> =>
  db.settings.get('company-profile')

// Strip Vue reactive proxies before writing to IndexedDB (structured clone can't handle Proxy objects)
const toPlain = <T>(obj: T): T => JSON.parse(JSON.stringify(toRaw(obj)))

export const saveCompanyProfile = async (companyProfile: CompanyProfile): Promise<void> => {
  await db.settings.put(toPlain(companyProfile))
}

export const listClients = (): Promise<ClientProfile[]> => db.clients.toArray()

export const saveClient = async (client: ClientProfile): Promise<void> => {
  await db.clients.put(toPlain(client))
}

export const deleteClientById = async (id: string): Promise<void> => {
  await db.clients.delete(id)
}

export const loadSelectedClientId = async (): Promise<string | null> => {
  const record = await db.settings.get('selected-client-id') as { id: string; value: string } | undefined
  return record?.value ?? null
}

export const saveSelectedClientId = async (clientId: string | null): Promise<void> => {
  if (clientId) {
    await db.settings.put({ id: 'selected-client-id', value: clientId } as any)
  } else {
    await db.settings.delete('selected-client-id')
  }
}

// --- Output directory handle (File System Access API) ---

export const saveOutputDirHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  await db.settings.put({ id: 'output-dir-handle', handle } as any)
}

export const loadOutputDirHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  const record = await db.settings.get('output-dir-handle') as { id: string; handle: FileSystemDirectoryHandle } | undefined
  return record?.handle ?? null
}

export const clearOutputDirHandle = async (): Promise<void> => {
  await db.settings.delete('output-dir-handle')
}

// --- Quote output directory handle ---

export const saveQuoteDirHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  await db.settings.put({ id: 'quote-dir-handle', handle } as any)
}

export const loadQuoteDirHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  const record = await db.settings.get('quote-dir-handle') as { id: string; handle: FileSystemDirectoryHandle } | undefined
  return record?.handle ?? null
}

export const clearQuoteDirHandle = async (): Promise<void> => {
  await db.settings.delete('quote-dir-handle')
}
