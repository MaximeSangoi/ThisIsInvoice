import { PDFArray, PDFDict, PDFDocument, PDFName, PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'

export interface InvoiceMeta {
  fileName: string
  number: string
  typeCode: string
  issueDate: string
  sellerName: string
  buyerName: string
  currency: string
  netAmount: number
  vatAmount: number
  grossAmount: number
}

const deref = (pdfDoc: PDFDocument, obj: PDFObject | undefined): PDFObject | undefined => {
  if (obj instanceof PDFRef) return pdfDoc.context.lookup(obj) ?? undefined
  return obj ?? undefined
}

/**
 * Decompress a FlateDecode stream using the browser's DecompressionStream API.
 * Returns raw bytes unchanged if no FlateDecode filter is present.
 */
const inflateIfNeeded = async (stream: PDFRawStream): Promise<Uint8Array> => {
  const rawBytes = stream.getContents()
  const filter = stream.dict.get(PDFName.of('Filter'))
  if (!filter || filter.toString() !== '/FlateDecode') return rawBytes

  const ds = new DecompressionStream('deflate')
  const writer = ds.writable.getWriter()
  writer.write(new Uint8Array(rawBytes.buffer as ArrayBuffer, rawBytes.byteOffset, rawBytes.byteLength))
  writer.close()

  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let totalLength = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLength += value.length
  }

  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

/**
 * Load a PDF from bytes and extract the embedded Factur-X XML.
 * Returns the raw XML string, or null if no embedded factur-x.xml was found.
 */
export const extractXmlFromPdf = async (pdfBytes: Uint8Array): Promise<string | null> => {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const catalog = pdfDoc.catalog

  const namesDict = deref(pdfDoc, catalog.get(PDFName.of('Names'))) as PDFDict | undefined
  if (!namesDict) return null

  const efDict = deref(pdfDoc, namesDict.get(PDFName.of('EmbeddedFiles'))) as PDFDict | undefined
  if (!efDict) return null

  const namesArray = deref(pdfDoc, efDict.get(PDFName.of('Names'))) as PDFArray | undefined
  if (!namesArray) return null

  // Names array is [name1, ref1, name2, ref2, ...]
  for (let i = 0; i < namesArray.size(); i += 2) {
    const fileSpec = deref(pdfDoc, namesArray.get(i + 1)) as PDFDict | undefined
    if (!fileSpec) continue

    const efEntry = deref(pdfDoc, fileSpec.get(PDFName.of('EF'))) as PDFDict | undefined
    if (!efEntry) continue

    const stream = deref(pdfDoc, efEntry.get(PDFName.of('F'))) as PDFRawStream | undefined
    if (!stream) continue

    const bytes = await inflateIfNeeded(stream)
    const text = new TextDecoder().decode(bytes)

    // Check if this is a CII / Factur-X XML
    if (text.includes('CrossIndustryInvoice')) {
      return text
    }
  }

  return null
}

/**
 * Parse a Factur-X CII XML string and extract key invoice metadata.
 */
export const parseFacturXXml = (xml: string): Omit<InvoiceMeta, 'fileName'> => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const text = (tagName: string, parent?: Element): string => {
    const el = (parent ?? doc).getElementsByTagNameNS('*', tagName)
    return el.item(0)?.textContent?.trim() ?? ''
  }

  const exchangedDoc = doc.getElementsByTagNameNS('*', 'ExchangedDocument').item(0) as Element | undefined
  const number = text('ID', exchangedDoc)
  const typeCode = text('TypeCode', exchangedDoc)

  // IssueDateTime → DateTimeString (format 102 = YYYYMMDD)
  const rawDate = text('DateTimeString')
  const issueDate = rawDate.length === 8
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : rawDate

  // Seller / Buyer
  const tradeAgreement = doc.getElementsByTagNameNS('*', 'ApplicableHeaderTradeAgreement').item(0)
  const sellerParty = tradeAgreement?.getElementsByTagNameNS('*', 'SellerTradeParty').item(0)
  const buyerParty = tradeAgreement?.getElementsByTagNameNS('*', 'BuyerTradeParty').item(0)
  const sellerName = text('Name', sellerParty as Element | undefined)
  const buyerName = text('Name', buyerParty as Element | undefined)

  // Monetary summation
  const summation = doc.getElementsByTagNameNS('*', 'SpecifiedTradeSettlementHeaderMonetarySummation').item(0)
  const netAmount = parseFloat(text('LineTotalAmount', summation as Element | undefined)) || 0
  const grossAmount = parseFloat(text('GrandTotalAmount', summation as Element | undefined)) || 0
  const vatAmount = parseFloat(text('TaxTotalAmount', summation as Element | undefined)) || 0

  // Currency
  const settlement = doc.getElementsByTagNameNS('*', 'ApplicableHeaderTradeSettlement').item(0)
  const currency = text('InvoiceCurrencyCode', settlement as Element | undefined) || 'EUR'

  return { number, typeCode, issueDate, sellerName, buyerName, currency, netAmount, vatAmount, grossAmount }
}
