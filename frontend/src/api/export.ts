export function exportCSV(year: number, month: number): void {
  window.open(`/api/v1/export/${year}/${month}/csv`, '_blank')
}

export function exportJSON(year: number, month: number): void {
  window.open(`/api/v1/export/${year}/${month}/json`, '_blank')
}
