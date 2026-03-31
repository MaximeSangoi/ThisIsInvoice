const normalizeClientName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()

export const buildInvoiceNumber = (issueDate: string, clientName: string, existingNumbers: string[]): string => {
  const d = new Date(issueDate)
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  const client = normalizeClientName(clientName)
  const prefix = `${yyyymm}-${client}-`

  const versions = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number.parseInt(n.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n))

  const nextVersion = (Math.max(0, ...versions) + 1).toString().padStart(3, '0')
  return `${prefix}${nextVersion}`
}
