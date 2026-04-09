import * as pdfjs from 'pdfjs-dist'
import type { Expense, ExpenseCategory } from '../../domain/accounting/types'

// Use the bundled worker from pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).href

/**
 * Keyword-based auto-categorization rules.
 * Each rule: [regex pattern on label, category].
 * First match wins — order matters (more specific first).
 */
const CATEGORY_RULES: [RegExp, ExpenseCategory][] = [
  // Transport
  [/\bASF\b/i, 'Transport'],
  [/\bVINCI\b/i, 'Transport'],
  [/\bSNCF\b/i, 'Transport'],
  [/\bTOTALENERGIES?\b/i, 'Transport'],
  [/\bSHELL\b/i, 'Transport'],
  [/\bNORAUTO\b/i, 'Transport'],
  [/\bHYUNDAI CAPITAL\b/i, 'Transport'],
  [/\bPEAGE\b/i, 'Transport'],
  [/\bIZIVIA\b/i, 'Transport'],
  [/\bINDIGO\b/i, 'Transport'],
  [/\bTISSEO\b/i, 'Transport'],
  [/\bAUTO SERVICES\b/i, 'Transport'],
  [/\bAREAS\s+A\d/i, 'Transport'],
  [/\bEURODATACAR\b/i, 'Transport'],

  // Assurance
  [/\bLEOCARE\b/i, 'Assurance'],
  [/\bAXA\b/i, 'Assurance'],
  [/\bMACIF\b/i, 'Assurance'],
  [/\bMATMUT\b/i, 'Assurance'],
  [/\bGIEPS\b/i, 'Assurance'],
  [/\bPREVOYANCE\b/i, 'Assurance'],

  // Repas
  [/\bMC\s*DONALD/i, 'Repas'],
  [/\bFOURNIL\b/i, 'Repas'],
  [/\bDEJBOX\b/i, 'Repas'],
  [/\bUBER\s*EATS\b/i, 'Repas'],
  [/\bDELIVEROO\b/i, 'Repas'],
  [/\bREST(?:AURANT)?\b/i, 'Repas'],
  [/\bBOULANG/i, 'Repas'],
  [/\bBOUL\b/i, 'Repas'],
  [/\bBURGER\s*KING\b/i, 'Repas'],
  [/\bKFC\b/i, 'Repas'],
  [/\bPIZZA\b/i, 'Repas'],
  [/\bWOK\b/i, 'Repas'],
  [/\bLEE\s+IN\b/i, 'Repas'],
  [/\bOKINAWA\b/i, 'Repas'],
  [/\bAU\s+BUREAU\b/i, 'Repas'],
  [/AU\s*BUREAU/i, 'Repas'],
  [/\bPRIMA\s+BONHEUR\b/i, 'Repas'],
  [/\bLA\s+T'ART\b/i, 'Repas'],
  [/\bCAFE\s+OPERA\b/i, 'Repas'],
  [/\bMOJI\b/i, 'Repas'],
  [/\bCHEEMA\b/i, 'Repas'],
  [/\bJARDINS\s+DE\b/i, 'Repas'],
  [/\bTETENLAIR\b/i, 'Repas'],
  [/\bRAVIOLI\b/i, 'Repas'],
  [/\bHIPPI\s*CURIEN\b/i, 'Repas'],
  [/\bNEWDELHI\b/i, 'Repas'],

  // Abonnement
  [/\bORANGE\b/i, 'Abonnement'],
  [/\bFREE\s/i, 'Abonnement'],
  [/\bSFR\b/i, 'Abonnement'],
  [/\bBOUYGUES\b/i, 'Abonnement'],
  [/\bNETFLIX\b/i, 'Abonnement'],
  [/\bSPOTIFY\b/i, 'Abonnement'],
  [/\bDEEZER\b/i, 'Abonnement'],
  [/\bPROTON\s+AG\b/i, 'Abonnement'],

  // Logiciel
  [/\bGOOGLE\b/i, 'Logiciel'],
  [/\bMICROSOFT\b/i, 'Logiciel'],
  [/\bADOBE\b/i, 'Logiciel'],
  [/\bGITHUB\b/i, 'Logiciel'],
  [/\bOVH\b/i, 'Logiciel'],
  [/\bAMAZON\s*WEB\b/i, 'Logiciel'],
  [/\bAWS\b/i, 'Logiciel'],
  [/\bCURSOR\b/i, 'Logiciel'],
  [/\bILOVEPDF\b/i, 'Logiciel'],
  [/\bN2F\b/i, 'Logiciel'],

  // Matériel
  [/\bAMAZON\b/i, 'Matériel'],
  [/\bLDLC\b/i, 'Matériel'],
  [/\bDARTY\b/i, 'Matériel'],
  [/\bFNAC\b/i, 'Matériel'],
  [/\bANKER\b/i, 'Matériel'],
  [/\bMAXICOFFEE\b/i, 'Matériel'],
  [/\bAAWIRELESS\b/i, 'Matériel'],
  [/\bKQUEO\b/i, 'Matériel'],
  [/\bLOGITEC/i, 'Matériel'],
  [/\bTARGUS\b/i, 'Matériel'],
  [/\bREPRO\s+MINUTE\b/i, 'Matériel'],

  // Banque
  [/\bCOTIS/i, 'Banque'],
  [/\bFRAIS\b/i, 'Banque'],
  [/\bAGIOS?\b/i, 'Banque'],
  [/\bCOMMISSION\b/i, 'Banque'],
  [/\bVIR\s+(INST\s+)?vers\s+Boursorama\b/i, 'Banque'],
  [/\bVIR\s+CA\b/i, 'Banque'],

  // Autre — DGFIP / URSSAF / impôts / salaire / admin
  [/\bDGFIP\b/i, 'Autre'],
  [/\bURSSAF\b/i, 'Autre'],
  [/\bIMPOT/i, 'Autre'],
  [/\bFINANCES\s*PUBLIQUE/i, 'Autre'],
  [/\bSIE\s+IMPOTS\b/i, 'Autre'],
  [/\bSAISIE\s+ADMIN\b/i, 'Autre'],
  [/\bVIR\s+(INST\s+)?vers\s+MAXIME\s+SANGOI\b/i, 'Autre'],
  [/\bCOGEC\b/i, 'Autre'],
]

/** Auto-categorize an expense label using keyword rules. */
export function categorizeByKeywords(label: string): ExpenseCategory | undefined {
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(label)) return category
  }
  return undefined
}

interface ExtractedLine {
  text: string
  isCredit: boolean
}

/**
 * Extract all visible text lines from a PDF file.
 * Detects "Débit" / "Crédit" column headers and uses x-coordinates
 * to determine whether each line's amount falls in the credit column.
 */
async function extractLinesFromPdf(file: File): Promise<ExtractedLine[]> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const result: ExtractedLine[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()

    // First pass: locate "Débit" and "Crédit" column header x-positions
    let debitX: number | null = null
    let creditX: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = item.str.trim()
      const x = (item as any).transform?.[4] ?? 0
      if (/^d[ée]bit$/i.test(str)) debitX = x
      if (/^cr[ée]dit$/i.test(str)) creditX = x
    }

    // Second pass: build lines (same grouping logic) + track rightmost numeric x
    let currentLine = ''
    let lastY: number | null = null
    let rightmostNumericX = 0

    const flush = () => {
      if (currentLine.trim()) {
        let isCredit = false
        if (debitX !== null && creditX !== null) {
          const midpoint = (debitX + creditX) / 2
          isCredit = rightmostNumericX > midpoint
        }
        result.push({ text: currentLine.trim(), isCredit })
      }
      currentLine = ''
      rightmostNumericX = 0
    }

    for (const item of content.items) {
      if (!('str' in item)) continue
      const x = (item as any).transform?.[4] ?? 0
      const y = (item as any).transform?.[5] ?? 0
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        flush()
      }
      currentLine += item.str
      if (/\d/.test(item.str) && x > rightmostNumericX) {
        rightmostNumericX = x
      }
      lastY = y
    }
    flush()
  }

  return result
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
      category: categorizeByKeywords(label),
    })
  }

  return expenses
}

/**
 * Build a fingerprint for an expense to detect duplicates.
 * Uses date + amount + normalized label (lowercased, trimmed).
 */
function expenseFingerprint(e: Pick<Expense, 'date' | 'amount' | 'label'>): string {
  return `${e.date}|${e.amount}|${e.label.toLowerCase().trim()}`
}

/**
 * Filter out expenses that already exist in the given month.
 * Returns { newExpenses, duplicateCount }.
 */
export function filterDuplicateExpenses(
  incoming: Expense[],
  existing: Expense[],
): { newExpenses: Expense[]; duplicateCount: number } {
  const existingFingerprints = new Set(existing.map(expenseFingerprint))
  const newExpenses: Expense[] = []
  let duplicateCount = 0

  for (const expense of incoming) {
    if (existingFingerprints.has(expenseFingerprint(expense))) {
      duplicateCount++
    } else {
      newExpenses.push(expense)
    }
  }

  return { newExpenses, duplicateCount }
}

export async function parseBankStatementPdf(file: File): Promise<Expense[]> {
  const extracted = await extractLinesFromPdf(file)
  // Only keep debit lines (expenses). Credit lines are income, not expenses.
  const debitLines = extracted.filter(l => !l.isCredit).map(l => l.text)
  return parseBankStatementLines(debitLines)
}
