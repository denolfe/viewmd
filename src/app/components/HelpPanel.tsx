import { TextAttributes } from '@opentui/core'
import { useTerminalDimensions } from '@opentui/react'
import { useAppState } from '../state'
import { HINTS } from '../lib/keys'
import { groupHints, layoutColumns } from '../lib/help-layout'
import { theme } from '../styles/theme'

// Fixed key-column width so descriptions line up across rows.
const KEY_COL = 12
// Below this terminal width a second column would cramp descriptions into ragged
// wraps, so the panel stays single-column (and taller) instead.
const MIN_TWO_COLUMN_WIDTH = 72
// Labeled top rule: a run of RULE_GLYPH fills the width around the title.
const RULE_GLYPH = '━'
const HELP_TITLE = 'Keyboard shortcuts'

export function HelpPanel() {
  const { helpVisible } = useAppState()
  const { width } = useTerminalDimensions()
  if (!helpVisible) return null

  const sections = groupHints(HINTS)
  const columns = layoutColumns(sections, width >= MIN_TWO_COLUMN_WIDTH)
  // 3 = the leading "━ " lead-in plus one space before the trailing rule.
  const rule = RULE_GLYPH.repeat(Math.max(0, width - HELP_TITLE.length - 3))

  // A drawer sliding up from the bottom: no box border, just a labeled top rule.
  // The opaque background masks the document behind it, so the rule alone reads as
  // the boundary. Spans the full terminal width (over the TOC too) since the panel
  // is modal — all keys are swallowed while open — giving two columns clean room.
  return (
    <box
      position="absolute"
      bottom={0}
      left={0}
      width={width}
      zIndex={20}
      flexDirection="column"
      backgroundColor={theme.background}
      paddingBottom={1}
    >
      <box flexDirection="row">
        <text fg={theme.border}>{`${RULE_GLYPH} `}</text>
        <text fg={theme.heading} attributes={TextAttributes.BOLD}>
          {HELP_TITLE}
        </text>
        <text fg={theme.border}>{` ${rule}`}</text>
      </box>
      <box flexDirection="row" paddingTop={1}>
        {columns.map(col => (
          <box key={col[0]?.group} flexDirection="column" flexGrow={1} paddingX={1}>
            {col.map((section, i) => (
              <box key={section.group} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
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
