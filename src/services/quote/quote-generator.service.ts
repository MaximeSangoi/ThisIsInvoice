import { computeQuoteTotals } from '../../domain/quote/calculations'
import type { QuoteInput } from '../../domain/quote/types'
import type { QuoteTotals } from '../../domain/quote/types'
import { assembleFacturXPdf } from '../facturx/facturx-assembler.service'
import { generateQuoteFacturXXml } from '../facturx/quote-facturx-xml.service'
import { generateQuotePdf } from '../pdf/quote-pdf.service'

export interface GeneratedQuoteArtifacts {
  pdfBytes: Uint8Array
  xmlText: string
  totals: QuoteTotals
}

export const generateQuoteArtifacts = async (quote: QuoteInput): Promise<GeneratedQuoteArtifacts> => {
  const pdf = await generateQuotePdf(quote)
  const xml = generateQuoteFacturXXml(quote)
  const facturXPdf = await assembleFacturXPdf(pdf, xml)

  return {
    pdfBytes: facturXPdf,
    xmlText: xml,
    totals: computeQuoteTotals(quote),
  }
}
