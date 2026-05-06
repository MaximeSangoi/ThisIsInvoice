/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] }

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ─── Periodic Background Sync ────────────────────────────────────────────────

self.addEventListener('periodicsync', (event: Event) => {
  const syncEvent = event as any
  if (syncEvent.tag === 'check-month-end-invoice') {
    syncEvent.waitUntil(checkAndNotify())
  }
})

// ─── Notification click → open / focus app ───────────────────────────────────

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const targetUrl = (event.notification.data?.url as string | undefined) ?? '/invoices/new'
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.focus()
            return
          }
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLastDayOfMonth(date: Date): boolean {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  return next.getMonth() !== date.getMonth()
}

function getMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date)
}

function currentYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Open tii-db and run a readonly callback against it. */
function withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tii-db')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      fn(req.result).then(resolve, reject)
    }
  })
}

function dbGet<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve(undefined)
      return
    }
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

async function checkCurrentMonthGenerated(yearMonth: string): Promise<boolean> {
  try {
    const record = await withDb((db) =>
      dbGet<{ yearMonth: string; generated: boolean }>(db, 'monthlyInvoiceStatus', yearMonth),
    )
    return record?.generated === true
  } catch {
    return false
  }
}

async function wasReminderDismissedToday(yearMonth: string): Promise<boolean> {
  try {
    const record = await withDb((db) =>
      dbGet<{ yearMonth: string; dismissedAt: string | null }>(db, 'monthlyInvoiceStatus', yearMonth),
    )
    if (!record?.dismissedAt) return false
    const today = new Date().toISOString().slice(0, 10)
    return record.dismissedAt.slice(0, 10) === today
  } catch {
    return false
  }
}

async function checkAndNotify(): Promise<void> {
  const today = new Date()
  if (!isLastDayOfMonth(today)) return

  const yearMonth = currentYearMonth(today)

  const [generated, dismissed] = await Promise.all([
    checkCurrentMonthGenerated(yearMonth),
    wasReminderDismissedToday(yearMonth),
  ])

  if (generated || dismissed) return

  await self.registration.showNotification('ThisIsInvoice — Rappel facturation', {
    body: `C'est le dernier jour du mois ! Votre facture de ${getMonthLabel(today)} n'a pas encore été générée.`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'month-end-invoice-reminder',
    renotify: false,
    data: { url: '/invoices/new' },
  } as NotificationOptions)
}
