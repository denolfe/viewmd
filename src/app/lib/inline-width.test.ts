import { describe, expect, test } from 'bun:test'
import { stringWidth } from './char-width'
import { inlineVisibleWidth, nodeVisibleWidth } from './inline-width'
import { imageLabelText } from './visible-text'

test('CJK text is measured by display width, not UTF-16 length', () => {
  expect(nodeVisibleWidth({ kind: 'text', value: '中文' })).toBe(4)
})

test('inline image width equals the rendered [Image: …] label width', () => {
  const node = { kind: 'image', alt: 'logo', src: 'x.png' } as const
  expect(nodeVisibleWidth(node)).toBe(stringWidth(imageLabelText('logo', 'x.png')))
  expect(nodeVisibleWidth(node)).toBeGreaterThan(4) // old (alt||src).length was 4
})

test('alt-only image still matches its label', () => {
  const node = { kind: 'image', alt: 'logo', src: '' } as const
  expect(nodeVisibleWidth(node)).toBe(stringWidth(imageLabelText('logo', '')))
})

test('codespan width includes pill glyphs at display width', () => {
  expect(nodeVisibleWidth({ kind: 'codespan', value: 'ab' })).toBe(2 + 2)
})

describe('inlineVisibleWidth', () => {
  test('plain text length', () => {
    expect(inlineVisibleWidth([{ kind: 'text', value: 'hello' }])).toBe(5)
  })
  test('codespan adds 2 for pill glyphs', () => {
    expect(inlineVisibleWidth([{ kind: 'codespan', value: 'foo' }])).toBe(5)
  })
  test('mixed text + codespan', () => {
    expect(
      inlineVisibleWidth([
        { kind: 'text', value: 'Use ' },
        { kind: 'codespan', value: 'foo' },
      ]),
    ).toBe(9)
  })
  test('recurses strong children', () => {
    expect(
      inlineVisibleWidth([{ kind: 'strong', children: [{ kind: 'text', value: 'abcd' }] }]),
    ).toBe(4)
  })
})
