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
  test('--max-lines with a separate value', () => {
    expect(parseArgs(['--max-lines', '40', 'doc.md'])).toEqual({
      filePath: 'doc.md',
      maxLines: 40,
    })
  })
  test('--max-lines=<n> form', () => {
    expect(parseArgs(['--max-lines=25', 'doc.md'])).toEqual({ filePath: 'doc.md', maxLines: 25 })
  })
  test('missing value is an error', () => {
    expect(parseArgs(['--max-lines'])).toEqual({
      error: '--max-lines requires a positive integer',
    })
  })
  test('empty value after = is an error', () => {
    expect(parseArgs(['--max-lines='])).toEqual({
      error: '--max-lines requires a positive integer',
    })
  })
  test('non-integer and non-positive values are errors', () => {
    expect(parseArgs(['--max-lines', 'abc'])).toEqual({
      error: '--max-lines requires a positive integer',
    })
    expect(parseArgs(['--max-lines', '0'])).toEqual({
      error: '--max-lines requires a positive integer',
    })
    expect(parseArgs(['--max-lines', '-5'])).toEqual({
      error: '--max-lines requires a positive integer',
    })
  })
})
