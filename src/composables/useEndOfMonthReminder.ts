import { h, onMounted } from 'vue'
import { NButton, NSpace } from 'naive-ui'
import type { NotificationApiInjection } from 'naive-ui/es/notification/src/NotificationProvider'
import type { Router } from 'vue-router'
import { loadMonthlyInvoiceStatus, saveMonthlyInvoiceStatus } from '../services/storage/local-db'

const PERIODIC_SYNC_TAG = 'check-month-end-invoice'
const MIN_INTERVAL_MS = 12 * 60 * 60 * 1000 // 12 hours

/** Returns true if `date` is the last day of its month. */
function isLastDayOfMonth(date: Date): boolean {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next.getMonth() !== date.getMonth()
}

function currentYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(date: Date): string {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  const result = await Notification.requestPermission()
  return result === 'granted'
}

async function registerPeriodicSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const periodicSync = (reg as any).periodicSync
    if (!periodicSync) return
    const tags: string[] = await periodicSync.getTags()
    if (!tags.includes(PERIODIC_SYNC_TAG)) {
      await periodicSync.register(PERIODIC_SYNC_TAG, { minInterval: MIN_INTERVAL_MS })
    }
  } catch {
    // Periodic Background Sync not supported or permission denied — graceful degradation
  }
}

/**
 * Shows an in-app notification on the last day of the month when no invoice
 * has been generated yet for the current month.
 *
 * Also registers a Periodic Background Sync so the browser can notify the
 * user even when the app is not open (Chrome/Edge installed PWA only).
 */
export function useEndOfMonthReminder(
  notification: NotificationApiInjection,
  router: Router,
): void {
  onMounted(async () => {
    await requestNotificationPermission()
    await registerPeriodicSync()

    const today = new Date()
    if (!isLastDayOfMonth(today)) return

    const yearMonth = currentYearMonth(today)
    const status = await loadMonthlyInvoiceStatus(yearMonth)

    if (status?.generated) return

    // Check if already dismissed today
    if (status?.dismissedAt) {
      const todayIso = today.toISOString().slice(0, 10)
      if (status.dismissedAt.slice(0, 10) === todayIso) return
    }

    notification.warning({
      title: 'Rappel de facturation',
      content: `Dernier jour du mois ! Votre facture de ${getMonthLabel(today)} n'a pas encore été générée.`,
      duration: 0,         // stays until dismissed
      closable: true,
      action: () =>
        h(NSpace, null, {
          default: () => [
            h(
              NButton,
              {
                size: 'small',
                type: 'primary',
                onClick: () => router.push('/invoices/new'),
              },
              { default: () => 'Créer la facture' },
            ),
            h(
              NButton,
              {
                size: 'small',
                quaternary: true,
                onClick: async () => {
                  await saveMonthlyInvoiceStatus({
                    yearMonth,
                    generated: false,
                    dismissedAt: new Date().toISOString(),
                  })
                },
              },
              { default: () => 'Plus tard' },
            ),
          ],
        }),
    })
  })
}
