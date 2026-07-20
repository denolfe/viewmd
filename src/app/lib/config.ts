import { CONTENT_MAX_WIDTH } from '../styles/layout'

/** Floor for a configured content width; mirrors index.tsx's pane MIN_WIDTH. */
export const MIN_CONTENT_WIDTH = 20

/** Parsed + validated config. All keys optional; absence means "fall through". */
export type Config = { width?: number; maxLines?: number }

/** Fully resolved values consumed by the render/interactive paths. */
export type ResolvedSettings = { contentMaxWidth: number; maxLines?: number }

type Env = Record<string, string | undefined>

const KEY_MAP = { width: 'width', 'max-lines': 'maxLines' } as const
type TomlKey = keyof typeof KEY_MAP

export function resolvePath(env: Env): string {
  if (env.VIEWMD_CONFIG) return env.VIEWMD_CONFIG
  const base = env.XDG_CONFIG_HOME ? env.XDG_CONFIG_HOME : `${env.HOME ?? ''}/.config`
  return `${base}/viewmd/config.toml`
}

export function validate(raw: Record<string, unknown>): { config: Config; warnings: string[] } {
  const config: Config = {}
  const warnings: string[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!isTomlKey(key)) {
      warnings.push(`viewmd: unknown config key '${key}' (ignored)`)
      continue
    }
    if (!isPositiveInt(value)) {
      warnings.push(`viewmd: config '${key}' must be a positive integer (ignored)`)
      continue
    }
    config[KEY_MAP[key]] = value
  }
  return { config, warnings }
}

export function resolveSettings(params: {
  config: Config
  env: Env
  flags: { maxLines?: number }
}): ResolvedSettings {
  const { config, env, flags } = params
  return {
    contentMaxWidth:
      config.width === undefined ? CONTENT_MAX_WIDTH : Math.max(MIN_CONTENT_WIDTH, config.width),
    maxLines: flags.maxLines ?? parseFzfLines(env.FZF_PREVIEW_LINES) ?? config.maxLines,
  }
}

export async function loadConfig(env: Env): Promise<{ config: Config; warnings: string[] }> {
  const path = resolvePath(env)
  const file = Bun.file(path)
  if (!(await file.exists())) return { config: {}, warnings: [] }

  let text: string
  try {
    text = await file.text()
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    return { config: {}, warnings: [`viewmd: cannot read config ${path}: ${reason}`] }
  }

  let parsed: unknown
  try {
    parsed = Bun.TOML.parse(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { config: {}, warnings: [`viewmd: invalid TOML in ${path}: ${msg}`] }
  }

  if (parsed === null || typeof parsed !== 'object') return { config: {}, warnings: [] }
  return validate(parsed as Record<string, unknown>)
}

function isTomlKey(key: string): key is TomlKey {
  return key === 'width' || key === 'max-lines'
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function parseFzfLines(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}
