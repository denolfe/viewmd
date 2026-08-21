import { describe, expect, test } from 'bun:test'
import { stringWidth } from './char-width'
import { inlineVisibleWidth, nodeVisibleWidth, wrapInline } from './inline-width'
import { imageLabelText, inlineText } from './visible-text'
import type { InlineNode } from './ast'

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

describe('wrapInline', () => {
  test('wraps text inside a styled container instead of treating it as atomic', () => {
    const nodes: InlineNode[] = [
      { kind: 'em', children: [{ kind: 'text', value: 'for non commercial purpose' }] },
    ]
    const lines = wrapInline(nodes, 12)
    expect(lines.length).toBe(3)
    for (const line of lines) expect(inlineVisibleWidth(line)).toBeLessThanOrEqual(12)
    for (const line of lines) expect(line.every(n => n.kind === 'em')).toBe(true)
    expect(lines.map(l => inlineText(l)).join('')).toBe('for non commercial purpose')
  })

  test('no wrapped line exceeds maxWidth when styled and plain text mix', () => {
    const nodes: InlineNode[] = [
      { kind: 'text', value: 'S-Lab 1.0 ' },
      { kind: 'em', children: [{ kind: 'text', value: '"for non-commercial purpose"' }] },
      { kind: 'text', value: '; HF card says MIT' },
    ]
    for (const line of wrapInline(nodes, 16)) {
      expect(inlineVisibleWidth(line)).toBeLessThanOrEqual(16)
    }
  })

  test('keeps a link on one node per line', () => {
    const nodes: InlineNode[] = [
      { kind: 'link', href: 'x', children: [{ kind: 'text', value: 'alpha beta gamma' }] },
    ]
    const lines = wrapInline(nodes, 6)
    expect(lines.length).toBe(3)
    expect(lines.every(l => l.length === 1)).toBe(true)
  })

  test('measures wide characters by display width', () => {
    const lines = wrapInline([{ kind: 'text', value: '中文中文 abc' }], 8)
    for (const line of lines) expect(inlineVisibleWidth(line)).toBeLessThanOrEqual(8)
    expect(lines.length).toBe(2)
  })
})
