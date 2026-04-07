import * as pdfjs from 'pdfjs-dist'
import type { Expense } from '../../domain/accounting/types'

// Use the bundled worker from pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href

/** Extract all visible text lines from a PDF file. */
async function extractTextFromPdf(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const lines: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let currentLine = ''
    let lastY: number | null = null

    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = (item as any).transform?.[5] ?? 0
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.trim()) lines.push(currentLine.trim())
        currentLine = ''
      }
      currentLine += item.str
      lastY = y
    }
    if (currentLine.trim()) lines.push(currentLine.trim())
  }

  return lines
}

/**
 * AXA bank statement line format:
 *   DD/MM DD/MM/YYYY DESCRIPTION AMOUNT
 * Amount in French format: 1 532,00 or -12,50
 * Ignore "ANCIEN SOLDE" and "NOUVEAU SOLDE" lines.
 * Continuation lines (IBANs, references) don't start with a date pair — skip them.
 */
const LINE_RE = /^(\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?[\d\s]+,\d{2})\s*$/

function parseFrenchAmount(raw: string): number {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.')
  return parseFloat(cleaned)
}

function parseDate(dateStr: string): string {
  const [dd, mm, yyyy] = dateStr.split('/')
  return `${yyyy}-${mm}-${dd}`
}

export function parseBankStatementLines(lines: string[]): Expense[] {
  const expenses: Expense[] = []

  for (const line of lines) {
    if (/ANCIEN SOLDE|NOUVEAU SOLDE/i.test(line)) continue
    const match = LINE_RE.exec(line)
    if (!match) continue

    const label = match[3]!.trim()
    const amount = parseFrenchAmount(match[4]!)
    const date = parseDate(match[2]!)

    expenses.push({
      id: crypto.randomUUID(),
      date,
      label,
      amount,
      justified: false,
    })
  }

  return expenses
}

export async function parseBankStatementPdf(file: File): Promise<Expense[]> {
  const lines = await extractTextFromPdf(file)
  return parseBankStatementLines(lines)
}
