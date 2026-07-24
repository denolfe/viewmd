import { test, expect } from 'bun:test'
import { documentTrail } from './trail'

test('single doc yields one current crumb, no separators implied', () => {
  const crumbs = documentTrail({ labels: ['README.md'], maxWidth: 80 })
  expect(crumbs).toEqual([{ label: 'README.md', kind: 'current' }])
})

test('two docs yield back then current', () => {
  const crumbs = documentTrail({ labels: ['README.md', 'docs/guide.md'], maxWidth: 80 })
  expect(crumbs).toEqual([
    { label: 'README.md', kind: 'back' },
    { label: 'docs/guide.md', kind: 'current' },
  ])
})

test('deep chain within width keeps every crumb and tags them', () => {
  const crumbs = documentTrail({
    labels: ['a.md', 'b.md', 'c.md', 'd.md'],
    maxWidth: 80,
  })
  expect(crumbs.map(c => c.kind)).toEqual(['past', 'past', 'back', 'current'])
})

test('overflow collapses the middle, keeping first + last two', () => {
  const labels = ['origin.md', 'one.md', 'two.md', 'three.md', 'docs/guide.md', 'api.md']
  const crumbs = documentTrail({ labels, maxWidth: 20 })
  expect(crumbs).toEqual([
    { label: 'origin.md', kind: 'past' },
    { label: '…', kind: 'ellipsis' },
    { label: 'docs/guide.md', kind: 'back' },
    { label: 'api.md', kind: 'current' },
  ])
})

test('overflow never truncates the back or current crumb', () => {
  const labels = ['a.md', 'b.md', 'c.md', 'back.md', 'current.md']
  const crumbs = documentTrail({ labels, maxWidth: 5 })
  const kinds = crumbs.map(c => c.kind)
  expect(kinds).toContain('back')
  expect(kinds).toContain('current')
  expect(kinds.filter(k => k === 'ellipsis').length).toBe(1)
})

test('undefined labels fall back to a placeholder', () => {
  const crumbs = documentTrail({ labels: [undefined, 'api.md'], maxWidth: 80 })
  expect(crumbs).toEqual([
    { label: '<untitled>', kind: 'back' },
    { label: 'api.md', kind: 'current' },
  ])
})

test('tag invariants hold: one current, at most one back and ellipsis', () => {
  const labels = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md']
  const crumbs = documentTrail({ labels, maxWidth: 10 })
  const kinds = crumbs.map(c => c.kind)
  expect(kinds.filter(k => k === 'current').length).toBe(1)
  expect(kinds.filter(k => k === 'back').length).toBe(1)
  expect(kinds.filter(k => k === 'ellipsis').length).toBe(1)
})
