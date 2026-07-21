import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { truncateLabelLeft } from '../lib/toc-util'
import { theme } from '../styles/theme'

const BADGE = ' VIEWMD '

type Props = { fileLabel?: string }

export function StatusLine({ fileLabel }: Props) {
  const { status } = useAppState()
  const { width } = useTerminalDimensions()

  if (status.kind === 'error') {
    return (
      <box height={1} paddingX={1} backgroundColor={theme.searchBarNoMatchBg} overflow="hidden">
        <text fg={theme.searchBarFg}>{status.text}</text>
      </box>
    )
  }

  if (status.kind === 'info') {
    return (
      <box height={1} paddingX={1} overflow="hidden">
        <text fg={theme.foreground}>{status.text}</text>
      </box>
    )
  }

  // idle: VIEWMD badge (mirrors h1 heading style) + plain filename.
  // Reserve BADGE width, one lead space, and paddingX (2) when truncating the path.
  const maxFile = Math.max(0, width - BADGE.length - 3)
  return (
    <box height={1} paddingX={1} overflow="hidden" flexDirection="row">
      <text bg={theme.h1Bg} fg={theme.h1Fg}>
        <strong>{BADGE}</strong>
      </text>
      {fileLabel && (
        <text fg={theme.foregroundMuted}>{' ' + truncateLabelLeft(fileLabel, maxFile)}</text>
      )}
    </box>
  )
}
