export interface UploadInvoicePayload {
  invoiceId: string
  invoiceNumber: string
  pdfBase64: string
  xmlText: string
}

export interface UploadInvoiceResult {
  remoteVersion: number
  remotePath: string
}

export interface StorageProvider {
  uploadInvoice(payload: UploadInvoicePayload): Promise<UploadInvoiceResult>
}
