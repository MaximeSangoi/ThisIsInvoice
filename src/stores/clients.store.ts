import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ClientProfile } from '../domain/invoice/types'
import { deleteClientById, listClients, loadSelectedClientId, saveClient, saveSelectedClientId } from '../services/storage/local-db'

export const useClientsStore = defineStore('clients', () => {
  const clients = ref<ClientProfile[]>([])
  const initialized = ref(false)
  const selectedClientId = ref<string | null>(null)

  const selectedClient = computed(
    () => clients.value.find((c) => c.id === selectedClientId.value) ?? null,
  )

  const initialize = async (): Promise<void> => {
    if (initialized.value) return
    clients.value = await listClients()
    selectedClientId.value = await loadSelectedClientId()
    initialized.value = true
  }

  const upsertClient = async (client: ClientProfile): Promise<void> => {
    // Dexie uses the structured clone algorithm — Vue reactive proxies can't be cloned.
    // JSON round-trip strips the Proxy wrapper before writing to IndexedDB.
    const plain: ClientProfile = JSON.parse(JSON.stringify(client))
    await saveClient(plain)
    const idx = clients.value.findIndex((c) => c.id === plain.id)
    if (idx === -1) {
      clients.value = [...clients.value, plain]
    } else {
      clients.value = clients.value.map((c) => (c.id === plain.id ? plain : c))
    }
  }

  const selectClient = async (id: string | null): Promise<void> => {
    selectedClientId.value = id
    await saveSelectedClientId(id)
  }

  const removeClient = async (id: string): Promise<void> => {
    await deleteClientById(id)
    clients.value = clients.value.filter((c) => c.id !== id)
    if (selectedClientId.value === id) await selectClient(null)
  }

  return {
    clients,
    initialized,
    selectedClientId,
    selectedClient,
    initialize,
    selectClient,
    upsertClient,
    removeClient,
  }
})
