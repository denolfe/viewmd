import type { Node } from './ast'
import { escapeRegex } from './regex-util'
import { projectDocument, runText } from './visible-text'
import type { Run } from './visible-text'

/**
 * A search hit in a block's visible text.
 * `start`/`length` are offsets in the run's joined visible text (see
 * visible-text.ts); `runKey` selects the run within the block. `blockPath` is
 * the AST index path (match-nav derives the preceding heading from its head).
 */
export type Match = {
  blockPath: number[]
  /** DOM id of the box the match lives in: heading slug, list-item row id, else blockId(path). */
  blockElementId: string
  runKey: string
  start: number
  length: number
}

export function findMatches(nodes: Node[], pattern: string): Match[] {
  if (!pattern) return []
  const re = new RegExp(escapeRegex(pattern), 'gi')
  const out: Match[] = []
  for (const proj of projectDocument(nodes)) {
    for (const run of proj.runs) {
      const text = runText(run)
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        if (re.lastIndex === m.index) re.lastIndex++ // safety for zero-length match
        if (m[0].length === 0 || overlapsUnsearchable(run, m.index, m[0].length)) continue
        out.push({
          blockPath: proj.blockPath,
          blockElementId: proj.blockElementId,
          runKey: run.key,
          start: m.index,
          length: m[0].length,
        })
      }
    }
  }
  return out
}

function overlapsUnsearchable(run: Run, start: number, length: number): boolean {
  let pos = 0
  for (const s of run.segments) {
    const end = pos + s.text.length
    if (!s.searchable && start < end && start + length > pos) return true
    pos = end
  }
  return false
}
