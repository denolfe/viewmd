import { describe, expect, test } from 'bun:test'
import { buildOptionalDependencyMap, buildPlatformManifest, buildRootManifest } from './stage-lib'
import { PLATFORMS } from './platforms'

describe('stage-lib', () => {
  test('platform manifest carries os/cpu guards', () => {
    const linux = PLATFORMS.find(p => p.id === 'linux-x64')
    if (!linux) throw new Error('linux-x64 missing')
    const m = buildPlatformManifest({ platform: linux, version: '1.2.3' })
    expect(m.name).toBe('viewmd-linux-x64')
    expect(m.version).toBe('1.2.3')
    expect(m.os).toEqual(['linux'])
    expect(m.cpu).toEqual(['x64'])
  })

  test('optionalDependency map lists all 5 at the version', () => {
    const map = buildOptionalDependencyMap('1.2.3')
    expect(Object.keys(map).length).toBe(5)
    expect(map['viewmd-win32-x64']).toBe('1.2.3')
  })

  test('root manifest strips private/peer/dev/scripts and injects fields', () => {
    const root = buildRootManifest({
      source: {
        name: 'viewmd',
        private: true,
        peerDependencies: { typescript: '^5' },
        scripts: { x: 'y' },
        dependencies: { marked: '15' },
      },
      version: '1.2.3',
    })
    expect(root.private).toBeUndefined()
    expect(root.peerDependencies).toBeUndefined()
    expect(root.scripts).toBeUndefined()
    expect(root.dependencies).toEqual({ marked: '15' })
    expect(root.bin).toEqual({ viewmd: './bin/viewmd.cjs' })
    expect(Object.keys(root.optionalDependencies as object).length).toBe(5)
  })
})
