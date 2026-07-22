import { expect, test } from 'bun:test'
import { charWidth, stringWidth } from './char-width'

test('ascii is width 1', () => {
  expect(charWidth('a'.codePointAt(0)!)).toBe(1)
  expect(stringWidth('hello')).toBe(5)
})

test('CJK and fullwidth are width 2', () => {
  expect(charWidth('中'.codePointAt(0)!)).toBe(2)
  expect(charWidth('３'.codePointAt(0)!)).toBe(2) // fullwidth digit
  expect(stringWidth('中文')).toBe(4)
})

test('combining / zero-width are width 0', () => {
  expect(charWidth(0x0301)).toBe(0) // combining acute accent
  expect(charWidth(0x200b)).toBe(0) // zero-width space
})

test('stringWidth counts code points, not UTF-16 units', () => {
  // '🎉' is one code point (surrogate pair in UTF-16); a naive .length would see 2 halves.
  expect(stringWidth('🎉')).toBe(2)
  expect('🎉'.length).toBe(2) // proves the naive UTF-16 length disagrees
})
