import { toRaw } from 'vue'
import type { InvoiceMeta } from '../facturx/facturx-reader.service'
import { extractXmlFromPdf, parseFacturXXml } from '../facturx/facturx-reader.service'

/**
 * Scan a directory handle for PDF files, extract Factur-X metadata from each.
 * Returns a list of InvoiceMeta sorted by issueDate descending.
 */
export const scanInvoiceDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
): Promise<InvoiceMeta[]> => {
  const raw = toRaw(dirHandle)
  const results: InvoiceMeta[] = []
  for await (const [name, handle] of (raw as any).entries()) {
    if (handle.kind !== 'file' || !name.toLowerCase().endsWith('.pdf')) continue

    try {
      const file: File = await (handle as FileSystemFileHandle).getFile()
      const buffer = await file.arrayBuffer()
      const pdfBytes = new Uint8Array(buffer)

      const xml = await extractXmlFromPdf(pdfBytes)
      if (!xml) continue

      const meta = parseFacturXXml(xml)
      results.push({ ...meta, fileName: name })
    } catch {
      // skip unreadable / non-Factur-X files
    }
  }

  results.sort((a, b) => b.issueDate.localeCompare(a.issueDate))
  return results
}
