#!/usr/bin/env bun
import { $ } from 'bun'

// Usage: bun run release <version>   e.g. bun run release 0.1.0-beta.2
// Bumps package.json, then commits, tags, and pushes. A changelog of commits
// since the last tag is generated once and reused as the commit body and the
// annotated tag message; the release itself is published separately from the tag.

const version = process.argv[2]
if (!version) {
  console.error('Usage: bun run release <version>  (e.g. 0.1.0-beta.2)')
  process.exit(1)
}
if (version.startsWith('v')) {
  console.error(`Pass the version without a leading "v" (got "${version}").`)
  process.exit(1)
}

const tag = `v${version}`

const status = (await $`git status --porcelain`.text()).trim()
if (status) {
  console.error('Working tree is not clean. Commit or stash changes first.')
  process.exit(1)
}

const existingTag = (await $`git tag --list ${tag}`.text()).trim()
if (existingTag) {
  console.error(`Tag ${tag} already exists.`)
  process.exit(1)
}

const changelog = await buildChangelog()

await bumpVersion(version)

await $`git commit -am ${`chore(release): ${tag}\n\n${changelog}`}`
await $`git tag -a ${tag} -m ${`${tag}\n\n${changelog}`}`
await $`git push --follow-tags`

console.log(`Released ${tag}`)

async function bumpVersion(version: string) {
  const pkgPath = 'package.json'
  const raw = await Bun.file(pkgPath).text()
  const next = raw.replace(/("version":\s*)"[^"]*"/, `$1"${version}"`)
  if (next === raw) throw new Error('Could not find "version" field in package.json')
  await Bun.write(pkgPath, next)
}

async function buildChangelog() {
  const lastTag = (await $`git describe --tags --abbrev=0`.nothrow().text()).trim()
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
  const commits = (
    await $`git log ${range} --no-merges --pretty=format:${'- %s (%h)'}`.text()
  ).trim()
  return commits || '- No changes'
}
