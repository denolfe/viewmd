import type { Match } from './search'

/** Full param bag for a search-match jump; the reducer treats it opaquely. */
export type MatchJumpParams = {
  match: Match
  matches: Match[]
  index: number
  topOffset?: number
}

export type PendingTarget =
  | { kind: 'heading'; id: string; topOffset: number }
  | { kind: 'match'; params: MatchJumpParams }
  | { kind: 'scrollTop'; top: number }

export type PendingState = {
  pending: PendingTarget | null
  /** The pending is a post-swap reposition — its settle fires `repositioned`. */
  isSwap: boolean
}

/**
 * What the adapter computes from live geometry for the current pending target.
 * `null` = target not mountable yet. `reached` = target is within clamp range.
 */
export type Resolution = { delta: number; reached: boolean } | null

export type PendingEvent =
  | { kind: 'issueJump'; target: PendingTarget; resolution: Resolution }
  | { kind: 'pinJump'; target: PendingTarget }
  | { kind: 'userScroll' }
  | { kind: 'frameTick'; resolution: Resolution; fullyMounted: boolean }

export type PendingEffect = { kind: 'scrollBy'; delta: number } | { kind: 'repositioned' }

type Reduced = { state: PendingState; effects: PendingEffect[] }

export const IDLE: PendingState = { pending: null, isSwap: false }

export function pendingReducer(state: PendingState, event: PendingEvent): Reduced {
  switch (event.kind) {
    case 'issueJump':
      return issueJump(state, event.target, event.resolution)
    case 'pinJump':
      return { state: { pending: event.target, isSwap: true }, effects: [] }
    case 'userScroll':
      return supersede(state)
    case 'frameTick':
      return frameTick(state, event.resolution, event.fullyMounted)
  }
}

function issueJump(state: PendingState, target: PendingTarget, resolution: Resolution): Reduced {
  // Superseding an in-flight swap drops its cover: fire repositioned so the shell
  // doesn't stay covered when a user jump replaces a post-swap pin mid-flight.
  const carry: PendingEffect[] = state.isSwap ? [{ kind: 'repositioned' }] : []
  if (resolution?.reached)
    return { state: IDLE, effects: [...scrollEffect(resolution.delta), ...carry] }
  return {
    state: { pending: target, isSwap: false },
    effects: resolution ? [...scrollEffect(resolution.delta), ...carry] : carry,
  }
}

function frameTick(state: PendingState, resolution: Resolution, fullyMounted: boolean): Reduced {
  if (!state.pending) return { state, effects: [] }
  if (resolution === null) {
    // Target still unmounted. Bail only once the whole doc is mounted (it will
    // never appear); otherwise wait for more progressive mount.
    return fullyMounted ? settle(state) : { state, effects: [] }
  }
  // Settle when reached, or give up chasing once the whole doc is mounted (the
  // target is as close as it will ever get — e.g. a pin past a now-shorter doc).
  if (resolution.reached || fullyMounted) return settle(state, resolution.delta)
  return { state, effects: scrollEffect(resolution.delta) }
}

function supersede(state: PendingState): Reduced {
  if (!state.pending && !state.isSwap) return { state, effects: [] }
  return settle(state)
}

/** Clear the pending; scroll by `delta` if given; fire `repositioned` if it was a swap. */
function settle(state: PendingState, delta?: number): Reduced {
  const effects = delta === undefined ? [] : scrollEffect(delta)
  if (state.isSwap) effects.push({ kind: 'repositioned' })
  return { state: IDLE, effects }
}

function scrollEffect(delta: number): PendingEffect[] {
  return delta !== 0 ? [{ kind: 'scrollBy', delta }] : []
}
