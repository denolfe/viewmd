import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONTENT_MAX_WIDTH } from '../styles/layout'
import { loadConfig, MIN_CONTENT_WIDTH, resolvePath, resolveSettings, validate } from './config'

describe('resolvePath', () => {
  test('prefers VIEWMD_CONFIG when set', () => {
    expect(resolvePath({ VIEWMD_CONFIG: '/tmp/x.toml', XDG_CONFIG_HOME: '/xdg', HOME: '/h' })).toBe(
      '/tmp/x.toml',
    )
  })
  test('uses XDG_CONFIG_HOME when set and non-empty', () => {
    expect(resolvePath({ XDG_CONFIG_HOME: '/xdg', HOME: '/h' })).toBe('/xdg/viewmd/config.toml')
  })
  test('treats empty XDG_CONFIG_HOME as unset', () => {
    expect(resolvePath({ XDG_CONFIG_HOME: '', HOME: '/h' })).toBe('/h/.config/viewmd/config.toml')
  })
  test('falls back to HOME/.config', () => {
    expect(resolvePath({ HOME: '/h' })).toBe('/h/.config/viewmd/config.toml')
  })
})

describe('validate', () => {
  test('keeps valid keys, no warnings', () => {
    expect(validate({ width: 80, 'max-lines': 40 })).toEqual({
      config: { width: 80, maxLines: 40 },
      warnings: [],
    })
  })
  test('drops unknown key with warning', () => {
    const r = validate({ foo: 1, width: 80 })
    expect(r.config).toEqual({ width: 80 })
    expect(r.warnings).toEqual([`viewmd: unknown config key 'foo' (ignored)`])
  })
  test('drops non-positive-integer value with warning', () => {
    const r = validate({ width: 'big' })
    expect(r.config).toEqual({})
    expect(r.warnings).toEqual([`viewmd: config 'width' must be a positive integer (ignored)`])
  })
})

describe('resolveSettings', () => {
  test('maxLines: flag beats env beats config', () => {
    const r = resolveSettings({
      config: { maxLines: 10 },
      env: { FZF_PREVIEW_LINES: '20' },
      flags: { maxLines: 30 },
    })
    expect(r.maxLines).toBe(30)
  })
  test('maxLines: env beats config when no flag', () => {
    const r = resolveSettings({
      config: { maxLines: 10 },
      env: { FZF_PREVIEW_LINES: '20' },
      flags: {},
    })
    expect(r.maxLines).toBe(20)
  })
  test('maxLines: config when no flag/env', () => {
    const r = resolveSettings({ config: { maxLines: 10 }, env: {}, flags: {} })
    expect(r.maxLines).toBe(10)
  })
  test('contentMaxWidth: config.width clamped to MIN_CONTENT_WIDTH', () => {
    expect(resolveSettings({ config: { width: 5 }, env: {}, flags: {} }).contentMaxWidth).toBe(
      MIN_CONTENT_WIDTH,
    )
  })
  test('contentMaxWidth: defaults to CONTENT_MAX_WIDTH', () => {
    expect(resolveSettings({ config: {}, env: {}, flags: {} }).contentMaxWidth).toBe(
      CONTENT_MAX_WIDTH,
    )
  })
})

describe('loadConfig', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'viewmd-cfg-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const load = (name: string) => loadConfig({ VIEWMD_CONFIG: join(dir, name) })

  test('missing file: empty config, no warnings', async () => {
    expect(await load('nope.toml')).toEqual({ config: {}, warnings: [] })
  })
  test('valid file: parsed config', async () => {
    await writeFile(join(dir, 'ok.toml'), 'width = 80\nmax-lines = 40\n')
    expect(await load('ok.toml')).toEqual({ config: { width: 80, maxLines: 40 }, warnings: [] })
  })
  test('malformed TOML: empty config with warning', async () => {
    await writeFile(join(dir, 'bad.toml'), 'width = = =\n')
    const r = await load('bad.toml')
    expect(r.config).toEqual({})
    expect(r.warnings[0]).toStartWith(`viewmd: invalid TOML in ${join(dir, 'bad.toml')}:`)
  })
  test('unknown key: dropped with warning', async () => {
    await writeFile(join(dir, 'extra.toml'), 'width = 80\nfoo = 1\n')
    const r = await load('extra.toml')
    expect(r.config).toEqual({ width: 80 })
    expect(r.warnings).toEqual([`viewmd: unknown config key 'foo' (ignored)`])
  })
})
