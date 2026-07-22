/**
 * Terminal display width of a single Unicode code point.
 * East-Asian Wide/Fullwidth → 2, zero-width/combining → 0, everything else → 1.
 * Covers the ranges markdown viewers actually hit (CJK, fullwidth forms,
 * combining marks); not a full UAX #11 table.
 */
export function charWidth(cp: number): 0 | 1 | 2 {
  if (isZeroWidth(cp)) return 0
  if (isWide(cp)) return 2
  return 1
}

/** Display width of a string, summed over code points (not UTF-16 units). */
export function stringWidth(s: string): number {
  let total = 0
  for (const ch of s) total += charWidth(ch.codePointAt(0) ?? 0)
  return total
}

function isZeroWidth(cp: number): boolean {
  return (
    cp === 0x200b || // zero-width space
    cp === 0x200c || // zero-width non-joiner
    cp === 0x200d || // zero-width joiner
    cp === 0xfeff || // zero-width no-break space (BOM)
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritical marks
    (cp >= 0x1ab0 && cp <= 0x1aff) || // combining diacritical marks extended
    (cp >= 0x1dc0 && cp <= 0x1dff) || // combining diacritical marks supplement
    (cp >= 0x20d0 && cp <= 0x20ff) || // combining diacritical marks for symbols
    (cp >= 0xfe20 && cp <= 0xfe2f) // combining half marks
  )
}

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK Radicals … Kangxi
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana … CJK symbols
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compatibility Forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth Forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth signs
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK Ext B+
  )
}
