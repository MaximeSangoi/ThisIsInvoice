import { rgb, type PDFPage, type PDFFont } from 'pdf-lib'

export interface PdfRenderContext {
  page: PDFPage
  font: PDFFont
  fontBold: PDFFont
}

interface DrawTextOptions {
  text: string
  x: number
  y: number
  size?: number
  bold?: boolean,
  maxWidth?: number,
  lineHeight?: number,
  wordBreaks?: string[]
}

const normalizePdfText = (value: string): string =>
  value.replace(/[\u202f\u00a0]/g, ' ')

export const drawText = (ctx: PdfRenderContext, options: DrawTextOptions): void => {
  const { text, x, y, size = 11, bold = false } = options
  const safeText = normalizePdfText(text)

  ctx.page.drawText(safeText, {
    x,
    y,
    size,
    font: bold ? ctx.fontBold : ctx.font,
    color: rgb(0.1, 0.14, 0.2),
    maxWidth: options.maxWidth,
    lineHeight: options.lineHeight,
    wordBreaks: options.wordBreaks
  })
}

export const drawSection = (
  ctx: PdfRenderContext,
  options: {
    title: string
    x: number
    topY: number
    lines: string[]
  },
): void => {
  const { title, x, topY, lines } = options

  drawText(ctx, {
    text: title,
    x,
    y: topY,
    size: 12,
    bold: true,
  })

  lines.forEach((line, index) => {
    drawText(ctx, {
      size: 10,
      text: line,
      x,
      y: topY - (index + 1) * 14,
    })
  })
}
