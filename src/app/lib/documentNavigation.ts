import { useCallback, useReducer } from 'react'

import { classifyHref } from './links'
import { loadDocument, fileLabel as fileLabelFor } from './loadDocument'
import type { LoadedDocument } from './loadDocument'

export type HistoryEntry = {
  document: LoadedDocument
  scrollTop: number
  currentHeadingId: string | null
}

/** What a doc swap resets in App-local UI state. `none` for in-doc jumps. */
export type DocReset = 'full' | 'searchOnly' | 'none'

export type ScrollIntent =
  | { kind: 'top' }
  | { kind: 'restore'; scrollTop: number; currentHeadingId: string | null }
  // `postSwap` picks the deferred post-layout pin (after a doc swap the box is
  // committed but reads y=0) vs an immediate scroll (in-doc jump, box laid out).
  | { kind: 'anchor'; headingId: string; postSwap: boolean }

/** Latest positioning request emitted by a transition; `seq` disambiguates repeats. */
export type NavIntent = { scroll: ScrollIntent; reset: DocReset; seq: number }

export type NavState = {
  doc: LoadedDocument
  history: HistoryEntry[]
  intent: NavIntent | null
}

export type NavAction =
  | { type: 'FOLLOW_LOADED'; doc: LoadedDocument; from: HistoryEntry; anchor?: string }
  | { type: 'BACK' }
  | { type: 'RELOAD_LOADED'; doc: LoadedDocument; anchor: string | null }
  | { type: 'IN_DOC_JUMP'; scroll: ScrollIntent }

export function navReducer(state: NavState, action: NavAction): NavState {
  const seq = (state.intent?.seq ?? 0) + 1
  switch (action.type) {
    case 'FOLLOW_LOADED': {
      const scroll: ScrollIntent = action.anchor
        ? { kind: 'anchor', headingId: action.anchor, postSwap: true }
        : { kind: 'top' }
      return {
        doc: action.doc,
        history: [...state.history, action.from],
        intent: { scroll, reset: 'full', seq },
      }
    }
    case 'BACK': {
      const entry = state.history[state.history.length - 1]
      if (!entry) return state
      return {
        doc: entry.document,
        history: state.history.slice(0, -1),
        intent: {
          scroll: {
            kind: 'restore',
            scrollTop: entry.scrollTop,
            currentHeadingId: entry.currentHeadingId,
          },
          reset: 'full',
          seq,
        },
      }
    }
    case 'RELOAD_LOADED': {
      const scroll: ScrollIntent = action.anchor
        ? { kind: 'anchor', headingId: action.anchor, postSwap: true }
        : { kind: 'top' }
      return {
        doc: action.doc,
        history: state.history,
        intent: { scroll, reset: 'searchOnly', seq },
      }
    }
    case 'IN_DOC_JUMP':
      return { ...state, intent: { scroll: action.scroll, reset: 'none', seq } }
  }
}

export function useDocumentNavigation(params: {
  initialDoc: LoadedDocument
  captureScroll: () => { scrollTop: number; currentHeadingId: string | null }
  onError: (text: string) => void
}) {
  const { initialDoc, captureScroll, onError } = params
  const [state, doDispatch] = useReducer(navReducer, {
    doc: initialDoc,
    history: [],
    intent: null,
  })

  const follow = useCallback(
    (href: string) => {
      const target = classifyHref({ baseDir: state.doc.dir, href })
      if (target.kind === 'ignore') return
      if (target.kind === 'anchor') {
        doDispatch({
          type: 'IN_DOC_JUMP',
          scroll: { kind: 'anchor', headingId: target.id, postSwap: false },
        })
        return
      }
      // A link back into the current file is an in-doc jump, not a reload.
      if (target.absPath === state.doc.absPath) {
        const scroll: ScrollIntent = target.anchor
          ? { kind: 'anchor', headingId: target.anchor, postSwap: false }
          : { kind: 'top' }
        doDispatch({ type: 'IN_DOC_JUMP', scroll })
        return
      }
      const { scrollTop, currentHeadingId } = captureScroll()
      loadDocument(target.absPath)
        .then(next => {
          doDispatch({
            type: 'FOLLOW_LOADED',
            doc: next,
            from: { document: state.doc, scrollTop, currentHeadingId },
            anchor: target.anchor,
          })
        })
        .catch(() => onError(`Cannot open ${fileLabelFor(target.absPath)}`))
    },
    [state.doc, captureScroll, onError],
  )

  const back = useCallback(() => doDispatch({ type: 'BACK' }), [])

  const reload = useCallback(() => {
    const path = state.doc.absPath
    if (!path) return
    const { currentHeadingId } = captureScroll()
    loadDocument(path)
      .then(next => doDispatch({ type: 'RELOAD_LOADED', doc: next, anchor: currentHeadingId }))
      .catch(() => onError('Reload failed: file unreadable'))
  }, [state.doc.absPath, captureScroll, onError])

  const backLabel = state.history[state.history.length - 1]?.document.fileLabel

  return {
    doc: state.doc,
    intent: state.intent,
    follow,
    back,
    reload,
    backLabel,
    historyDepth: state.history.length,
  }
}
