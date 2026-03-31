import type { QuoteInput, QuoteTotals } from './types'

const round2 = (value: number): number => Math.round(value * 100) / 100

export const computeQuoteTotals = (quote: QuoteInput): QuoteTotals => {
  const netAmount = round2(quote.workedDays * quote.dailyRate)
  const vatAmount = round2((netAmount * quote.vatRate) / 100)
  const grossAmount = round2(netAmount + vatAmount)

  return { netAmount, vatAmount, grossAmount }
}

// --- French public holidays cache ---

const holidayCache = new Map<number, Set<string>>()

const fetchHolidaysForYear = async (year: number): Promise<Set<string>> => {
  const cached = holidayCache.get(year)
  if (cached) return cached

  const response = await fetch(`https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`)
  if (!response.ok) {
    // Graceful fallback: no holidays if API unavailable
    return new Set()
  }

  const data: Record<string, string> = await response.json()
  const dates = new Set(Object.keys(data))
  holidayCache.set(year, dates)
  return dates
}

const fetchHolidaysForRange = async (startIso: string, endIso: string): Promise<Set<string>> => {
  const startYear = Number(startIso.slice(0, 4))
  const endYear = Number(endIso.slice(0, 4))

  const fetches: Promise<Set<string>>[] = []
  for (let y = startYear; y <= endYear; y++) {
    fetches.push(fetchHolidaysForYear(y))
  }

  const results = await Promise.all(fetches)
  const merged = new Set<string>()
  for (const set of results) {
    for (const d of set) merged.add(d)
  }
  return merged
}

/**
 * Count business days (Mon–Fri, excluding French public holidays) between two ISO dates, inclusive.
 */
export const countBusinessDays = async (startIso: string, endIso: string): Promise<number> => {
  const start = new Date(`${startIso}T00:00:00`)
  const end = new Date(`${endIso}T00:00:00`)

  if (end < start) return 0

  const holidays = await fetchHolidaysForRange(startIso, endIso)

  let count = 0
  const cursor = new Date(start)

  while (cursor <= end) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      if (!holidays.has(iso)) {
        count++
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return count
}
