import { test, expect } from 'bun:test'
import { classifyHref } from '../../lib/links'

// InlineLink chooses its branch purely from classifyHref; lock that contract.
test('relative .md link classifies as navigable (no OSC-8 branch)', () => {
  expect(classifyHref({ baseDir: '/d', href: './a.md' }).kind).toBe('doc')
})
test('in-doc anchor classifies as navigable', () => {
  expect(classifyHref({ baseDir: '/d', href: '#sec' }).kind).toBe('anchor')
})
test('external link classifies as ignore (OSC-8 branch)', () => {
  expect(classifyHref({ baseDir: '/d', href: 'https://x.com' }).kind).toBe('ignore')
})
