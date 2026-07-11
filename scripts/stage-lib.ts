import type { Platform } from './platforms'
import { PLATFORMS, platformPackageName } from './platforms'

export function buildPlatformManifest(params: {
  platform: Platform
  version: string
}): Record<string, unknown> {
  const { platform, version } = params
  return {
    name: platformPackageName(platform.id),
    version,
    description: `Prebuilt viewmd binary for ${platform.id}`,
    license: 'MIT',
    repository: { type: 'git', url: 'git+https://github.com/denolfe/viewmd.git' },
    os: [platform.os],
    cpu: [platform.cpu],
    files: ['bin', 'LICENSE'],
  }
}

export function buildOptionalDependencyMap(version: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const p of PLATFORMS) map[platformPackageName(p.id)] = version
  return map
}

export function buildRootManifest(params: {
  source: Record<string, unknown>
  version: string
}): Record<string, unknown> {
  const { source, version } = params
  // Runtime deps are bundled into the prebuilt binaries and dist/npm/main.js,
  // so the published root ships none of them. module/lint-staged reference
  // files that aren't published; drop them too.
  const {
    private: _private,
    peerDependencies: _peer,
    devDependencies: _dev,
    dependencies: _deps,
    scripts: _scripts,
    module: _module,
    'lint-staged': _lintStaged,
    ...rest
  } = source
  return {
    ...rest,
    version,
    bin: { viewmd: './bin/viewmd.cjs' },
    engines: { node: '>=18' },
    files: ['bin', 'dist/npm', 'assets/parsers', 'README.md', 'LICENSE'],
    publishConfig: { access: 'public' },
    optionalDependencies: buildOptionalDependencyMap(version),
  }
}
