import { describe, expect, test } from 'bun:test'
import { parseArgs, parsePositiveInt } from './args'

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
  test('--help flag', () => {
    expect(parseArgs(['--help'])).toEqual({ showHelp: true })
  })
  test('-h short flag', () => {
    expect(parseArgs(['-h'])).toEqual({ showHelp: true })
  })
  test('--version flag', () => {
    expect(parseArgs(['--version'])).toEqual({ showVersion: true })
  })
  test('-v short flag', () => {
    expect(parseArgs(['-v'])).toEqual({ showVersion: true })
  })
  test('help alongside a file path', () => {
    expect(parseArgs(['--help', 'README.md'])).toEqual({
      showHelp: true,
      filePath: 'README.md',
    })
  })
  test('unknown long flag is an error', () => {
    expect(parseArgs(['--hlep'])).toEqual({
      error: "unknown option '--hlep' (run viewmd --help)",
    })
  })
  test('unknown short flag is an error', () => {
    expect(parseArgs(['-x', 'doc.md'])).toEqual({
      error: "unknown option '-x' (run viewmd --help)",
    })
  })
  test('lone dash means stdin (no file path)', () => {
    expect(parseArgs(['-'])).toEqual({})
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
  test('--max-lines rejects exponent notation', () => {
    expect(parseArgs(['--max-lines', '1e21'])).toEqual({
      error: '--max-lines requires a positive integer',
    })
  })
})

describe('parsePositiveInt', () => {
  test('accepts only bare decimal digits', () => {
    expect(parsePositiveInt('40')).toBe(40)
    expect(parsePositiveInt('1')).toBe(1)
    for (const bad of ['1e21', '0x10', ' 5 ', '-3', '1.5', '', undefined]) {
      expect(parsePositiveInt(bad)).toBeUndefined()
    }
  })
  test('rejects digit strings that overflow to Infinity', () => {
    expect(parsePositiveInt('9'.repeat(400))).toBeUndefined()
  })
})
