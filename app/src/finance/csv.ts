export interface ParsedCsv {
  rows: string[][]
  unclosedQuote: boolean
}

export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < src.length) {
    const char = src[i]
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }
    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (char === '\r' || char === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      if (char === '\r' && src[i + 1] === '\n') i += 2
      else i += 1
      continue
    }
    field += char
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return {
    rows: rows.filter((record) => !(record.length === 1 && record[0].trim() === '')),
    unclosedQuote: inQuotes,
  }
}

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}

export function sniffRejectedFile(text: string): string | null {
  if (text.includes('\0')) {
    return 'This file does not look like a CSV. Export the statement as CSV from your bank.'
  }
  const head = text.slice(0, 800).trimStart()
  if (!head) return 'The file is empty.'
  if (head.startsWith('%PDF')) {
    return 'This is a PDF. Your bank also has a CSV download — Receipt.AI reads that, not the statement PDF.'
  }
  if (head.startsWith('PK')) {
    return 'This looks like an Excel workbook. In the bank export menu, choose CSV.'
  }
  if (/^<!doctype html/i.test(head) || /^<html/i.test(head) || head.startsWith('<')) {
    return 'This file is a web page, not a CSV. Use your bank’s Download or Export CSV option.'
  }
  return null
}
