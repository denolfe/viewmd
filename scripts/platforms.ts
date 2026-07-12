export type PlatformId = 'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'linux-arm64' | 'win32-x64'

export type Platform = {
  id: PlatformId
  os: string // node process.platform value
  cpu: string // node process.arch value
  bunTarget: Bun.Build.CompileTarget
  runsOn: string // GitHub Actions runner label
  binName: string
}

export const PLATFORMS: Platform[] = [
  {
    id: 'darwin-arm64',
    os: 'darwin',
    cpu: 'arm64',
    bunTarget: 'bun-darwin-arm64',
    runsOn: 'macos-14',
    binName: 'viewmd',
  },
  {
    id: 'darwin-x64',
    os: 'darwin',
    cpu: 'x64',
    bunTarget: 'bun-darwin-x64',
    runsOn: 'macos-15-intel',
    binName: 'viewmd',
  },
  {
    id: 'linux-x64',
    os: 'linux',
    cpu: 'x64',
    bunTarget: 'bun-linux-x64',
    runsOn: 'ubuntu-latest',
    binName: 'viewmd',
  },
  {
    id: 'linux-arm64',
    os: 'linux',
    cpu: 'arm64',
    bunTarget: 'bun-linux-arm64',
    runsOn: 'ubuntu-24.04-arm',
    binName: 'viewmd',
  },
  {
    id: 'win32-x64',
    os: 'win32',
    cpu: 'x64',
    bunTarget: 'bun-windows-x64',
    runsOn: 'windows-latest',
    binName: 'viewmd.exe',
  },
]

export function platformPackageName(id: PlatformId): string {
  return `viewmd-${id}`
}

export function hostPlatform(): Platform {
  const id = `${process.platform}-${process.arch}`
  const match = PLATFORMS.find(p => p.id === id)
  if (!match) throw new Error(`Unsupported host platform: ${id}`)
  return match
}
