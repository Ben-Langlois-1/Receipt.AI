export function parseDate(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (iso) return validDate(iso[1], iso[2], iso[3])

  const parts = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text)
  if (!parts) return null

  let year = parts[3]
  if (year.length === 2) {
    year = `${Number(year) > 50 ? '19' : '20'}${year}`
  }
  let month = Number(parts[1])
  let day = Number(parts[2])
  if (month > 12 && day <= 12) {
    const swap = month
    month = day
    day = swap
  }
  return validDate(year, String(month), String(day))
}

function validDate(yearRaw: string, monthRaw: string, dayRaw: string): string | null {
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
