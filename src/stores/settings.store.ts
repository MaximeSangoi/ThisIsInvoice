import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { CompanyProfile } from '../domain/invoice/types'
import { loadCompanyProfile, saveCompanyProfile, loadOutputDirHandle, saveOutputDirHandle, clearOutputDirHandle, loadQuoteDirHandle, saveQuoteDirHandle, clearQuoteDirHandle } from '../services/storage/local-db'

const defaultCompanyProfile = (): CompanyProfile => ({
  id: 'company-profile',
  firstName: '',
  lastName: '',
  address: {
    line1: '',
    postalCode: '',
    city: '',
    country: 'FR',
  },
  siret: '',
  iban: '',
  bic: '',
  vatNumber: '',
})

export const useSettingsStore = defineStore('settings', () => {
  const companyProfile = ref<CompanyProfile>(defaultCompanyProfile())
  const initialized = ref(false)
  const outputDirHandle = ref<FileSystemDirectoryHandle | null>(null)
  const outputDirName = ref<string | null>(null)
  const quoteDirHandle = ref<FileSystemDirectoryHandle | null>(null)
  const quoteDirName = ref<string | null>(null)

  const isConfigured = computed(
    () =>
      Boolean(
          companyProfile.value.siret &&
          companyProfile.value.iban &&
          companyProfile.value.vatNumber,
      ),
  )

  const initialize = async (): Promise<void> => {
    if (initialized.value) {
      return
    }

    const savedProfile = await loadCompanyProfile()
    if (savedProfile) {
      companyProfile.value = savedProfile
    }

    const savedHandle = await loadOutputDirHandle()
    if (savedHandle) {
      outputDirHandle.value = savedHandle
      outputDirName.value = savedHandle.name
    }

    const savedQuoteHandle = await loadQuoteDirHandle()
    if (savedQuoteHandle) {
      quoteDirHandle.value = savedQuoteHandle
      quoteDirName.value = savedQuoteHandle.name
    }

    initialized.value = true
  }

  const save = async (): Promise<void> => {
    await saveCompanyProfile(JSON.parse(JSON.stringify(companyProfile.value)))
  }

  const pickOutputDir = async (): Promise<void> => {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    console.log('Selected output directory handle:', handle)
    outputDirHandle.value = handle
    outputDirName.value = handle.name
    await saveOutputDirHandle(handle)
  }

  const removeOutputDir = async (): Promise<void> => {
    outputDirHandle.value = null
    outputDirName.value = null
    await clearOutputDirHandle()
  }

  /**
   * Verify the saved handle still has write permission (required each browser session).
   * Returns the handle if granted, null otherwise.
   */
  const verifyOutputDir = async (): Promise<FileSystemDirectoryHandle | null> => {
    const handle = toRaw(outputDirHandle.value)
    if (!handle) return null

    const permission = await (handle as any).requestPermission({ mode: 'readwrite' })
    if (permission === 'granted') return handle

    return null
  }

  const pickQuoteDir = async (): Promise<void> => {
    const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    quoteDirHandle.value = handle
    quoteDirName.value = handle.name
    await saveQuoteDirHandle(handle)
  }

  const removeQuoteDir = async (): Promise<void> => {
    quoteDirHandle.value = null
    quoteDirName.value = null
    await clearQuoteDirHandle()
  }

  const verifyQuoteDir = async (): Promise<FileSystemDirectoryHandle | null> => {
    const handle = toRaw(quoteDirHandle.value)
    if (!handle) return null

    const permission = await (handle as any).requestPermission({ mode: 'readwrite' })
    if (permission === 'granted') return handle

    return null
  }

  return {
    companyProfile,
    initialized,
    isConfigured,
    outputDirHandle,
    outputDirName,
    quoteDirHandle,
    quoteDirName,
    initialize,
    save,
    pickOutputDir,
    removeOutputDir,
    verifyOutputDir,
    pickQuoteDir,
    removeQuoteDir,
    verifyQuoteDir,
  }
})
