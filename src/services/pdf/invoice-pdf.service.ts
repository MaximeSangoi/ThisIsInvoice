import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { computeInvoiceTotals, formatCurrency, formatDate } from '../../domain/invoice/calculations'
import type { InvoiceInput } from '../../domain/invoice/types'
import { drawSection, drawText, type PdfRenderContext } from './invoice-pdf.layout'
import logoURL from '../../assets/logo-entreprise.png'

export const generateInvoicePdf = async (invoice: InvoiceInput): Promise<Uint8Array> => {
  const totals = computeInvoiceTotals(invoice)

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const pngBytes = await fetch(logoURL).then(r => r.arrayBuffer())
  const pngImage = await pdfDoc.embedPng(pngBytes)

  const ctx: PdfRenderContext = {
    page,
    font,
    fontBold,
  }

  // ------------ HEADER ------------
  page.drawRectangle({
    x: 0,
    y: 812,
    width: 595,
    height: 30,
    color: rgb(15/255, 97/255, 122/255),
  });
  drawText(ctx, {
    text: 'FACTURE',
    x: 60,
    y: 750,
    size: 18,
    bold: true,
  })

  drawSection(ctx, {
    title: 'NUMERO DE FACTURE', 
    x: 60,
    topY: 700,
    lines: [
      invoice.number,
    ],
  })

  drawSection(ctx, {
    title: 'DATE D\'EMISSION', 
    x: 60,
    topY: 655,
    lines: [
      invoice.issueDate,
    ],
  })

  page.drawLine({
    start: { x: 260, y: 770 },
    end: { x: 260, y: 580 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });

  drawSection(ctx, {
    title: `${invoice.seller.firstName.toUpperCase()} ${invoice.seller.lastName.toUpperCase()}`,
    x: 320,
    topY: 754,
    lines: [
      invoice.seller.address.line1,
      `${invoice.seller.address.postalCode} ${invoice.seller.address.city}`,
      invoice.seller.address.country,
      `SIRET: ${invoice.seller.siret}`
    ],
  })

  page.drawImage(pngImage, {
    x: 500,
    y: 720,
    width: 40,
    height: 40,
  })

  drawSection(ctx, {
    title: invoice.buyer.legalName.toUpperCase(),
    x: 320,
    topY: 650,
    lines: [
      invoice.buyer.address.line1,
      `${invoice.buyer.address.postalCode} ${invoice.buyer.address.city}`,
      invoice.buyer.address.country,
      `SIRET: ${invoice.buyer.siret}`,
    ],
  })


  // ------------ FACTURATION ------------
  page.drawLine({
    start: { x: 60, y: 450 },
    end: { x: 595-60, y: 450 },
    thickness: 1,
    color: rgb(15/255, 97/255, 122/255),
  });

  drawText(ctx, {
    text: 'Désignation',
    x: 60,
    y: 460,
    size: 10,
    bold: true,
  })
  drawText(ctx, {
    text: 'Quantité (jours)',
    x: 270,
    y: 460,
    size: 10,
    bold: true,
  })
  drawText(ctx, {
    text: 'Prix unitaire (€)',
    x: 380,
    y: 460,
    size: 10,
    bold: true,
  })
  drawText(ctx, {
    text: 'Montant HT',
    x: 480,
    y: 460,
    size: 10,
    bold: true,
  })

  drawText(ctx, {
    text: 'Développement Angular / .NET',
    x: 60,
    y: 430,
    size: 9,
  })

  drawText(ctx, {
    text: `${ invoice.workedDays }`,
    x: 270,
    y: 430,
    size: 9,
  })
  drawText(ctx, {
    text: `${ invoice.dailyRate.toFixed(2) }`,
    x: 380,
    y: 430,
    size: 9,
  })
  const netAmountTextWidth = font.widthOfTextAtSize(`${ formatCurrency(totals.netAmount) }`, 9);
  drawText(ctx, {
    text: `${ formatCurrency(totals.netAmount) }`,
    x: 595 - 60 - netAmountTextWidth,
    y: 430,
    size: 9,
  })

  page.drawLine({
    start: { x: 60, y: 420 },
    end: { x: 595-60, y: 420 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  page.drawLine({
    start: { x: 60, y: 350 },
    end: { x: 595-60, y: 350 },
    thickness: 1,
    color: rgb(15/255, 97/255, 122/255),
  });
  drawText(ctx, {
    text: `Total HT`,
    x: 380,
    y: 330,
    size: 9,
  });
  const textWidth = font.widthOfTextAtSize(`${ formatCurrency(totals.netAmount) }`, 9);
  drawText(ctx, {
    text: `${ formatCurrency(totals.netAmount) }`,
    x: 595 - 60 - textWidth,
    y: 330,
    size: 9,
  });
  page.drawLine({
    start: { x: 380, y: 320 },
    end: { x: 595-60, y: 320 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  drawText(ctx, {
    text: `TVA (20%)`,
    x: 380,
    y: 300,
    size: 9,
  });
  const vatTextWidth = font.widthOfTextAtSize(`${ formatCurrency(totals.vatAmount) }`, 9);
  drawText(ctx, {
    text: `${ formatCurrency(totals.vatAmount) }`,
    x: 595 - 60 - vatTextWidth,
    y: 300,
    size: 9,
  });
  
  page.drawLine({
    start: { x: 380, y: 290 },
    end: { x: 595-60, y: 290 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  

  const x = 60, y = 210, w = 595-120, h = 40
  const dash = { dashArray: [3, 5], dashPhase: 0, thickness: 1, color: rgb(0.5, 0.5, 0.5) }

  page.drawLine({ start: { x, y }, end: { x: x+w, y }, ...dash })           // bas
  page.drawLine({ start: { x, y: y+h }, end: { x: x+w, y: y+h }, ...dash }) // haut
  page.drawLine({ start: { x, y }, end: { x, y: y+h }, ...dash })           // gauche
  page.drawLine({ start: { x: x+w, y }, end: { x: x+w, y: y+h }, ...dash }) // droite

  drawText(ctx, {
    text: 'Période :',
    x: 70,
    y: 225,
    size: 9,
  });

  drawText(ctx, {
    text: `${invoice.periodLabel.toLocaleUpperCase()}`,
    x: 120,
    y: 225,
    size: 16,
    bold: false,
  });

  drawText(ctx, {
    text: 'Total TTC :',
    x: 380,
    y: 225,
    size: 9,
  });

  const totalTtcTextWidth = font.widthOfTextAtSize(`${formatCurrency(totals.grossAmount)}`, 16);
  drawText(ctx, {
    text: `${formatCurrency(totals.grossAmount)}`,
    x: 595 - 60 - 5 - totalTtcTextWidth,
    y: 225,
    size: 16,
    bold: false,
  });

  // ------------ FOOTER ------------
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 595,
    height: 150,
    color: rgb(240/255, 240/255, 240/255),
  });

  drawText(ctx, {
    text: 'SIRET - N° TVA :',
    x: 60,
    y: 120,
    size: 10,
    bold: true,
  });
  drawText(ctx, {
    text: `${invoice.seller.siret} - ${invoice.seller.vatNumber}`,
    x: 60,
    y: 106,
    size: 9,
  });
  drawText(ctx, {
    text: 'IBAN - BIC :',
    x: 60,
    y: 79,
    size: 10,
    bold: true,
  });
  drawText(ctx, {
    text: `${invoice.seller.iban} - ${invoice.seller.bic}`,
    x: 60,
    y: 65,
    size: 9,
  });
  page.drawLine({
    start: { x: 300, y: 130 },
    end: { x: 300, y: 65 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  const dueDateFormatted = formatDate(invoice.dueDate)
  const dueDateTextWidth = font.widthOfTextAtSize(`Date limite de règlement : ${dueDateFormatted}`, 8)
  drawText(ctx, {
    text: `Date limite de règlement : ${dueDateFormatted}`,
    x: 595 - 60 - dueDateTextWidth,
    y: 120,
    size: 8,
  });
  const penaltyTextWidth = font.widthOfTextAtSize(`En cas de retard de paiement, une pénalité de 3 fois le taux`, 8);
  drawText(ctx, {
    text: `En cas de retard de paiement, une pénalité de 3 fois le taux`,
    x: 595 - 60 - penaltyTextWidth,
    y: 87,
    size: 8
  });
  const penaltyTextWidth2 = font.widthOfTextAtSize(` d'intérêt légal sera appliquée.`, 8);
  drawText(ctx, {
    text: ` d'intérêt légal sera appliquée.`,
    x: 595 - 60 - penaltyTextWidth2,
    y: 75,
    size: 8
  });

  page.drawLine({
    start: { x: 60, y: 45 },
    end: { x: 595 - 60, y: 45 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  const contactInfosWidth = font.widthOfTextAtSize(`06.69.09.17.95 - maxime.sangoi.pro@pm.me`, 8);
  drawText(ctx, {
    text: `06.69.09.17.95 - maxime.sangoi.pro@pm.me`,
    x: (595 - contactInfosWidth) / 2,
    y: 26,
    size: 8
  });

  return pdfDoc.save()
}
