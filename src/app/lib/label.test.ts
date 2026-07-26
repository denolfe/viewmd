import { describe, expect, test } from 'bun:test'
import { truncateLabelLeft } from './label'

describe('truncateLabelLeft', () => {
  test('returns label unchanged when it fits', () => {
    expect(truncateLabelLeft('docs/README.md', 20)).toBe('docs/README.md')
  })
  test('left-truncates with ellipsis, keeping the filename tail', () => {
    expect(truncateLabelLeft('long-parent-dir/README.md', 12)).toBe('…r/README.md')
  })
  test('result never exceeds maxWidth', () => {
    expect(truncateLabelLeft('abcdef', 3)).toHaveLength(3)
  })
  test('degenerate widths', () => {
    expect(truncateLabelLeft('abc', 1)).toBe('…')
    expect(truncateLabelLeft('abc', 0)).toBe('')
  })
})
