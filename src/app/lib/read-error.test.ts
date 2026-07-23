import { expect, test } from 'bun:test'
import { fileReadErrorMessage } from './read-error'

test('maps common errno codes to friendly reasons', () => {
  expect(fileReadErrorMessage({ code: 'ENOENT', path: 'x.md' })).toBe(
    "cannot read 'x.md': no such file or directory",
  )
  expect(fileReadErrorMessage({ code: 'EACCES', path: 'x.md' })).toBe(
    "cannot read 'x.md': permission denied",
  )
  expect(fileReadErrorMessage({ code: 'EISDIR', path: 'd' })).toBe(
    "cannot read 'd': is a directory",
  )
  expect(fileReadErrorMessage({ code: 'ENOTDIR', path: 'd' })).toBe(
    "cannot read 'd': not a directory",
  )
})

test('unknown code falls back to the raw message', () => {
  expect(fileReadErrorMessage({ code: 'EWHATEVER', path: 'x.md', raw: 'boom' })).toBe(
    "cannot read 'x.md': boom",
  )
})

test('no code and no raw yields a generic reason', () => {
  expect(fileReadErrorMessage({ path: 'x.md' })).toBe("cannot read 'x.md': unable to read file")
})
