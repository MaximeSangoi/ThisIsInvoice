import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { computeQuoteTotals } from '../../domain/quote/calculations'
import { formatCurrency, formatDate } from '../../domain/invoice/calculations'
import type { QuoteInput } from '../../domain/quote/types'
import { drawSection, drawText, type PdfRenderContext } from './invoice-pdf.layout'
import logoURL from '../../assets/logo-entreprise.png'

export const generateQuotePdf = async (quote: QuoteInput): Promise<Uint8Array> => {
  const totals = computeQuoteTotals(quote)

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const pngBytes = await fetch(logoURL).then(r => r.arrayBuffer())
  const pngImage = await pdfDoc.embedPng(pngBytes)

  const ctx: PdfRenderContext = { page, font, fontBold }

  // ------------ HEADER ------------
  page.drawRectangle({
    x: 0, y: 812, width: 595, height: 30,
    color: rgb(15 / 255, 97 / 255, 122 / 255),
  })
  drawText(ctx, { text: 'DEVIS', x: 60, y: 750, size: 18, bold: true })

  drawSection(ctx, {
    title: 'NUMERO DE DEVIS',
    x: 60, topY: 700,
    lines: [quote.number],
  })

  drawSection(ctx, {
    title: "DATE D'EMISSION",
    x: 60, topY: 655,
    lines: [quote.issueDate],
  })

  page.drawLine({
    start: { x: 260, y: 770 }, end: { x: 260, y: 580 },
    thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
  })

  drawSection(ctx, {
    title: `${quote.seller.firstName.toUpperCase()} ${quote.seller.lastName.toUpperCase()}`,
    x: 320, topY: 754,
    lines: [
      quote.seller.address.line1,
      `${quote.seller.address.postalCode} ${quote.seller.address.city}`,
      quote.seller.address.country,
      `SIRET: ${quote.seller.siret}`,
    ],
  })

  page.drawImage(pngImage, { x: 500, y: 720, width: 40, height: 40 })

  drawSection(ctx, {
    title: quote.buyer.legalName.toUpperCase(),
    x: 320, topY: 650,
    lines: [
      quote.buyer.address.line1,
      `${quote.buyer.address.postalCode} ${quote.buyer.address.city}`,
      quote.buyer.address.country,
      `SIRET: ${quote.buyer.siret}`,
    ],
  })

  // ------------ LINE ITEMS TABLE ------------
  page.drawLine({
    start: { x: 60, y: 450 }, end: { x: 595 - 60, y: 450 },
    thickness: 1, color: rgb(15 / 255, 97 / 255, 122 / 255),
  })

  drawText(ctx, { text: 'Désignation', x: 60, y: 460, size: 10, bold: true })
  drawText(ctx, { text: 'Quantité (jours)', x: 270, y: 460, size: 10, bold: true })
  drawText(ctx, { text: 'Prix unitaire (€)', x: 380, y: 460, size: 10, bold: true })
  drawText(ctx, { text: 'Montant HT', x: 480, y: 460, size: 10, bold: true })

  drawText(ctx, { text: 'Développement Angular / .NET', x: 60, y: 430, size: 9 })
  drawText(ctx, { text: `${quote.workedDays}`, x: 270, y: 430, size: 9 })
  drawText(ctx, { text: `${quote.dailyRate.toFixed(2)}`, x: 380, y: 430, size: 9 })
  const netAmountTextWidth = font.widthOfTextAtSize(`${formatCurrency(totals.netAmount)}`, 9)
  drawText(ctx, {
    text: `${formatCurrency(totals.netAmount)}`,
    x: 595 - 60 - netAmountTextWidth, y: 430, size: 9,
  })

  page.drawLine({
    start: { x: 60, y: 420 }, end: { x: 595 - 60, y: 420 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  })

  // ------------ TOTALS ------------
  page.drawLine({
    start: { x: 60, y: 350 }, end: { x: 595 - 60, y: 350 },
    thickness: 1, color: rgb(15 / 255, 97 / 255, 122 / 255),
  })

  drawText(ctx, { text: 'Total HT', x: 380, y: 330, size: 9 })
  const htWidth = font.widthOfTextAtSize(`${formatCurrency(totals.netAmount)}`, 9)
  drawText(ctx, {
    text: `${formatCurrency(totals.netAmount)}`,
    x: 595 - 60 - htWidth, y: 330, size: 9,
  })

  page.drawLine({
    start: { x: 380, y: 320 }, end: { x: 595 - 60, y: 320 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  })

  drawText(ctx, { text: 'TVA (20%)', x: 380, y: 300, size: 9 })
  const vatWidth = font.widthOfTextAtSize(`${formatCurrency(totals.vatAmount)}`, 9)
  drawText(ctx, {
    text: `${formatCurrency(totals.vatAmount)}`,
    x: 595 - 60 - vatWidth, y: 300, size: 9,
  })

  page.drawLine({
    start: { x: 380, y: 290 }, end: { x: 595 - 60, y: 290 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  })

  // ------------ PERIOD BOX ------------
  const x = 60, y = 210, w = 595 - 120, h = 40
  const dash = { dashArray: [3, 5], dashPhase: 0, thickness: 1, color: rgb(0.5, 0.5, 0.5) }

  page.drawLine({ start: { x, y }, end: { x: x + w, y }, ...dash })
  page.drawLine({ start: { x, y: y + h }, end: { x: x + w, y: y + h }, ...dash })
  page.drawLine({ start: { x, y }, end: { x, y: y + h }, ...dash })
  page.drawLine({ start: { x: x + w, y }, end: { x: x + w, y: y + h }, ...dash })

  drawText(ctx, { text: 'Période :', x: 70, y: 225, size: 9 })
  drawText(ctx, {
    text: `${formatDate(quote.periodStartDate)} – ${formatDate(quote.periodEndDate)}`,
    x: 120, y: 225, size: 14, bold: false,
  })

  drawText(ctx, { text: 'Total TTC :', x: 380, y: 225, size: 9 })
  const ttcWidth = font.widthOfTextAtSize(`${formatCurrency(totals.grossAmount)}`, 16)
  drawText(ctx, {
    text: `${formatCurrency(totals.grossAmount)}`,
    x: 595 - 60 - 5 - ttcWidth, y: 225, size: 16, bold: false,
  })

  // ------------ FOOTER ------------
  page.drawRectangle({
    x: 0, y: 0, width: 595, height: 150,
    color: rgb(240 / 255, 240 / 255, 240 / 255),
  })

  drawText(ctx, { text: 'SIRET - N° TVA :', x: 60, y: 120, size: 10, bold: true })
  drawText(ctx, {
    text: `${quote.seller.siret} - ${quote.seller.vatNumber}`,
    x: 60, y: 106, size: 9,
  })
  drawText(ctx, { text: 'IBAN - BIC :', x: 60, y: 79, size: 10, bold: true })
  drawText(ctx, {
    text: `${quote.seller.iban} - ${quote.seller.bic}`,
    x: 60, y: 65, size: 9,
  })

  page.drawLine({
    start: { x: 300, y: 130 }, end: { x: 300, y: 65 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  })

  const validityText = `Devis valable jusqu'au : ${formatDate(quote.validUntilDate)}`
  const validityWidth = font.widthOfTextAtSize(validityText, 8)
  drawText(ctx, { text: validityText, x: 595 - 60 - validityWidth, y: 120, size: 8 })

  const acceptText = 'Bon pour accord — Signature du client :'
  const acceptWidth = font.widthOfTextAtSize(acceptText, 8)
  drawText(ctx, { text: acceptText, x: 595 - 60 - acceptWidth, y: 100, size: 8 })

  page.drawLine({
    start: { x: 60, y: 45 }, end: { x: 595 - 60, y: 45 },
    thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
  })

  return pdfDoc.save()
}
