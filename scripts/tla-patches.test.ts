import { describe, expect, test } from 'bun:test'
import { applyTlaPatches, assertPatchesApplied, buildTlaPatches } from './tla-patches'

const CORE_PATH = '/repo/node_modules/@opentui/core/index-pcvh9d34.js'

describe('tla-patches', () => {
  test('rewrites both core top-level awaits', () => {
    const patches = buildTlaPatches('@opentui/core-darwin-arm64')
    const applied = new Set<(typeof patches)[number]>()
    const out = applyTlaPatches({
      path: CORE_PATH,
      source: [
        'var backend2 = await loadBackend2();',
        'var nativePackage = await resolveNativePackage();',
      ].join('\n'),
      patches,
      applied,
    })
    expect(out).toContain('var backend2 = createBunBackend2(require("bun:ffi"));')
    expect(out).toContain('var nativePackage = { default: __viewmdNativeLibPath };')
    expect(out).toContain('import __viewmdNativeLibPath from "@opentui/core-darwin-arm64"')
    expect(out).not.toContain('await')
    expect(applied.size).toBe(2)
  })

  test('rewrites the react devtools top-level await', () => {
    const patches = buildTlaPatches('@opentui/core-darwin-arm64')
    const out = applyTlaPatches({
      path: '/repo/node_modules/@opentui/react/chunk-fm0c65gm.js',
      source: 'await import("./chunk-bdqvmfwv.js");',
      patches,
    })
    expect(out).not.toContain('await')
    expect(out).toContain('ERR_MODULE_NOT_FOUND')
  })

  test('matches Windows backslash-separated paths', () => {
    const patches = buildTlaPatches('@opentui/core-win32-x64')
    const out = applyTlaPatches({
      path: 'C:\\repo\\node_modules\\@opentui\\core\\index-pcvh9d34.js',
      source: 'var backend2 = await loadBackend2();',
      patches,
    })
    expect(out).not.toContain('await')
  })

  test('leaves non-matching paths untouched', () => {
    const patches = buildTlaPatches('@opentui/core-darwin-arm64')
    const source = 'var backend2 = await loadBackend2();'
    const out = applyTlaPatches({ path: '/repo/src/index.tsx', source, patches })
    expect(out).toBe(source)
  })

  test('assertPatchesApplied throws when a pattern went stale', () => {
    const patches = buildTlaPatches('@opentui/core-darwin-arm64')
    const applied = new Set<(typeof patches)[number]>(patches.slice(0, 1))
    expect(() => assertPatchesApplied(patches, applied)).toThrow(/no longer match/)
    expect(() => assertPatchesApplied(patches, new Set(patches))).not.toThrow()
  })

  test('patches actually match the installed @opentui dist files', async () => {
    const targets = [
      { dir: 'node_modules/@opentui/core', glob: new Bun.Glob('index-*.js') },
      { dir: 'node_modules/@opentui/react', glob: new Bun.Glob('chunk-*.js') },
    ]
    const patches = buildTlaPatches('@opentui/core-darwin-arm64')
    const applied = new Set<(typeof patches)[number]>()
    for (const { dir, glob } of targets) {
      for await (const name of glob.scan(dir)) {
        const path = `${dir}/${name}`
        applyTlaPatches({ path, source: await Bun.file(path).text(), patches, applied })
      }
    }
    expect(applied.size).toBe(patches.length)
  })
})
