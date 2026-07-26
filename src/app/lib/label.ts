/**
 * Left-truncate to fit `maxWidth`, keeping the tail (filename) visible.
 * Measures in characters, not display columns, so a CJK filename can overflow
 * its budget — acceptable while the only caller is the status line's own row.
 */
export function truncateLabelLeft(label: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''
  if (label.length <= maxWidth) return label
  if (maxWidth === 1) return '…'
  return `…${label.slice(label.length - maxWidth + 1)}`
}
