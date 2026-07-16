// CSV field-escaping + row-joining — extracted from students.service.ts's
// exportStudentsCsv (Phase 3) once a second real caller appeared
// (modules/chatbot's re-fetchable report downloads, Phase 6a), not built
// speculatively ahead of need. Deliberately not a library dependency (no
// CSV library exists anywhere in this codebase's package.json) — the
// original Phase 3 implementation was this same few-line manual
// escape/join, just inlined in one module; this is that logic moved
// somewhere both callers can share verbatim, not a rewrite.
function escapeCsvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(header: string[], rows: string[][]): string {
  const lines = [header.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\n');
}
