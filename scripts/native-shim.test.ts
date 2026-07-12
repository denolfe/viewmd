import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import {
  COMPILED_RUNTIME_FILTER,
  buildShimSource,
  opentuiNativePackageName,
  resolveNativeLib,
} from './native-shim'
import { PLATFORMS, hostPlatform } from './platforms'

describe('native-shim', () => {
  test('maps platforms to opentui native package names', () => {
    const byId = Object.fromEntries(PLATFORMS.map(p => [p.id, opentuiNativePackageName(p)]))
    expect(byId['darwin-arm64']).toBe('@opentui/core-darwin-arm64')
    expect(byId['linux-x64']).toBe('@opentui/core-linux-x64')
    expect(byId['win32-x64']).toBe('@opentui/core-win32-x64')
  })

  test('resolves the installed native lib for the host platform', () => {
    const native = resolveNativeLib(hostPlatform())
    expect(existsSync(native.libPath)).toBe(true)
    expect(native.libFileName).toMatch(/\.(dylib|so|dll)$/)
    expect(native.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  describe('COMPILED_RUNTIME_FILTER', () => {
    test('matches posix bundler paths', () => {
      expect(COMPILED_RUNTIME_FILTER.test('/Users/x/viewmd/src/compiled-runtime.ts')).toBe(true)
    })

    test('matches Windows bundler paths (backslash separators)', () => {
      expect(COMPILED_RUNTIME_FILTER.test('D:\\a\\viewmd\\viewmd\\src\\compiled-runtime.ts')).toBe(
        true,
      )
    })

    test('does not match unrelated files', () => {
      expect(COMPILED_RUNTIME_FILTER.test('/x/src/compiled-runtime.test.ts')).toBe(false)
      expect(COMPILED_RUNTIME_FILTER.test('/x/other/compiled-runtime.ts')).toBe(false)
    })
  })

  describe('buildShimSource', () => {
    const src = buildShimSource({
      libPath: '/repo/node_modules/@opentui/core-darwin-arm64/libopentui.dylib',
      libFileName: 'libopentui.dylib',
      version: '0.4.1',
    })

    test('embeds the native lib as a file import', () => {
      expect(src).toContain(
        `import embedded from "/repo/node_modules/@opentui/core-darwin-arm64/libopentui.dylib" with { type: 'file' }`,
      )
    })

    test('caches under a version-keyed filename and exports the path', () => {
      expect(src).toContain('libopentui-0.4.1.dylib')
      expect(src).toContain('export default')
    })

    test('has no top-level await (keeps --bytecode viable)', () => {
      expect(src).not.toMatch(/\bawait\b/)
    })
  })
})
