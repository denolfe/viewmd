import { describe, expect, test } from 'bun:test'
import { parseArgs } from './args'

describe('parseArgs', () => {
  test('empty argv', () => {
    expect(parseArgs([])).toEqual({})
  })
  test('file path only', () => {
    expect(parseArgs(['README.md'])).toEqual({ filePath: 'README.md' })
  })
  test('--render flag', () => {
    expect(parseArgs(['--render', 'README.md'])).toEqual({
      filePath: 'README.md',
      forceRender: true,
    })
  })
  test('-r short flag', () => {
    expect(parseArgs(['-r'])).toEqual({ forceRender: true })
  })
  test('flag and file in any order', () => {
    expect(parseArgs(['-r', 'a.md', '--render'])).toEqual({
      filePath: 'a.md',
      forceRender: true,
    })
  })
  test('first non-flag positional wins', () => {
    expect(parseArgs(['a.md', 'b.md'])).toEqual({ filePath: 'a.md' })
  })
})
