// Shared CSV <-> Excel (.xlsx) helpers, used everywhere this codebase
// offers a spreadsheet download/upload (batch roster export, the bulk-
// import CSV template, and the bulk-import upload itself). xlsx (SheetJS)
// is a genuinely new dependency — this codebase had no spreadsheet library
// at all before this. Kept as a thin conversion layer around plain CSV
// text rather than a second, xlsx-specific data pipeline: every existing
// CSV producer/consumer (the backend's toCsv, AddStudentsDialog's
// parseCsvText) stays exactly as-is; xlsx is purely a transcoding format
// applied at the download/upload boundary.
//
// xlsx itself is NOT imported statically here — same CLAUDE1.md
// non-negotiable #7 principle already applied to Monaco/CodeEditor: a
// heavy, occasionally-used dependency must not ship in the main bundle.
// Both exported functions below load it via a dynamic import() only when
// actually called (i.e. when a user clicks Export/Download Template/
// Choose file), so its JS chunk is fetched on demand rather than on every
// page load. React.lazy()/Suspense doesn't apply here — these are plain
// async functions, not components — a dynamic import() at the point of
// use is the direct equivalent for non-component code (confirmed via
// `pnpm build`: xlsx appears as its own chunk, separate from the main
// bundle, same as CodeEditor's).
export type SpreadsheetFormat = 'csv' | 'xlsx'

export const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// SheetJS's own CSV parser handles quoted/escaped fields (commas, quotes,
// newlines inside a value) correctly — reusing it here instead of hand-
// rolling a second CSV parser just for this conversion.
export async function csvTextToXlsxBlob(csvText: string): Promise<Blob> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(csvText, { type: 'string' })
  const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Blob([arrayBuffer], { type: XLSX_MIME_TYPE })
}

// Converts an uploaded .xlsx file's first sheet back into CSV text, so the
// existing CSV-parsing/validation code path can be reused unchanged
// regardless of which format was actually uploaded.
export async function xlsxFileToCsvText(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]
  return XLSX.utils.sheet_to_csv(worksheet)
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
