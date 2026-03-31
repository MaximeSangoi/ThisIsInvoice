import { computeInvoiceTotals } from '../../domain/invoice/calculations'
import type { InvoiceInput } from '../../domain/invoice/types'
import { assembleFacturXPdf } from '../facturx/facturx-assembler.service'
import { generateFacturXXml } from '../facturx/facturx-xml.service'
import { generateInvoicePdf } from '../pdf/invoice-pdf.service'

export interface GeneratedInvoiceArtifacts {
  pdfBytes: Uint8Array
  xmlText: string
  totals: ReturnType<typeof computeInvoiceTotals>
}

export const generateInvoiceArtifacts = async (invoice: InvoiceInput): Promise<GeneratedInvoiceArtifacts> => {
  const pdf = await generateInvoicePdf(invoice)
  const xml = generateFacturXXml(invoice)
  const facturXPdf = await assembleFacturXPdf(pdf, xml)

  return {
    pdfBytes: facturXPdf,
    xmlText: xml,
    totals: computeInvoiceTotals(invoice),
  }
}
