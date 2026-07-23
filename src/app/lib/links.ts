import { isAbsolute, resolve } from 'node:path'
import { slugify } from './ast'

/** Classified target of a markdown link href, relative to a document's directory. */
export type LinkTarget =
  | { kind: 'anchor'; id: string }
  | { kind: 'doc'; absPath: string; anchor?: string }
  | { kind: 'ignore' }

const MD_EXT = /\.(md|markdown)$/i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Classify a markdown link href relative to `baseDir` (the directory of the
 * document containing the link). `baseDir` is undefined when the document
 * was read from stdin, in which case relative doc links cannot be resolved
 * and are ignored.
 */
export function classifyHref({ baseDir, href }: { baseDir?: string; href: string }): LinkTarget {
  if (href.startsWith('#')) return { kind: 'anchor', id: normalizeAnchor(href.slice(1)) }
  if (HAS_SCHEME.test(href) || href.startsWith('//')) return { kind: 'ignore' }

  const hashIndex = href.indexOf('#')
  const rawPath = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const rawAnchor = hashIndex >= 0 ? href.slice(hashIndex + 1) : undefined

  if (!rawPath) return { kind: 'ignore' }
  const path = decodeWithFallback(rawPath)
  if (!MD_EXT.test(path)) return { kind: 'ignore' }
  if (isAbsolute(path)) return { kind: 'ignore' }
  if (!baseDir) return { kind: 'ignore' }

  const anchor = rawAnchor ? normalizeAnchor(rawAnchor) : undefined
  return { kind: 'doc', absPath: resolve(baseDir, path), anchor }
}

// Reproduce heading-id minting so `#Foo Bar` targets the `foo-bar` heading.
function normalizeAnchor(fragment: string): string {
  return slugify(decodeWithFallback(fragment))
}

// Percent-decode, falling back to the raw string on a malformed sequence
// (decodeURIComponent throws URIError on e.g. `%zz`).
function decodeWithFallback(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
