import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { HINTS } from '../lib/keys'
import { groupHints, layoutColumns } from '../lib/help-layout'
import { theme } from '../styles/theme'
import { VIEWER_OVERHEAD } from '../styles/layout'

// Fixed key-column width so descriptions line up across rows.
const KEY_COL = 12
// Cap the panel body at this fraction of the terminal height before spilling to a second column.
const HELP_MAX_HEIGHT_FRACTION = 0.6

export function HelpPanel() {
  const { helpVisible, contentWidth } = useAppState()
  const { height } = useTerminalDimensions()
  if (!helpVisible) return null

  const sections = groupHints(HINTS)
  // Cap the body near HELP_MAX_HEIGHT_FRACTION of the terminal, leaving rows for the
  // title + border; the Math.max floor keeps 4 rows as the minimum usable body height.
  const maxBodyRows = Math.max(4, Math.floor(height * HELP_MAX_HEIGHT_FRACTION) - 3)
  const columns = layoutColumns(sections, maxBodyRows)

  return (
    <box
      position="absolute"
      bottom={0}
      left={0}
      width={contentWidth + VIEWER_OVERHEAD}
      zIndex={20}
      flexDirection="column"
      backgroundColor={theme.background}
      border
      borderColor={theme.border}
    >
      <text fg={theme.foregroundMuted} attributes={TextAttributes.BOLD}>
        {' Keyboard shortcuts'}
      </text>
      <box flexDirection="row">
        {columns.map(col => (
          <box key={col[0]?.group} flexDirection="column" flexGrow={1} paddingX={1}>
            {col.map(section => (
              <box key={section.group} flexDirection="column">
                <text fg={theme.foregroundMuted} attributes={TextAttributes.BOLD}>
                  {section.group}
                </text>
                {section.hints.map(h => (
                  <box key={`${section.group}:${h.keys}:${h.desc}`} flexDirection="row">
                    <text fg={theme.heading}>{h.keys.padEnd(KEY_COL)}</text>
                    <text fg={theme.foreground}>{h.desc}</text>
                  </box>
                ))}
              </box>
            ))}
          </box>
        ))}
      </box>
    </box>
  )
}
