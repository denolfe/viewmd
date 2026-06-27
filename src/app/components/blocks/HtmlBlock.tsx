import { TextAttributes } from '@opentui/core'
import type { HtmlSegment } from '../../lib/html'
import { theme } from '../../styles/theme'

// Renders raw HTML segments preserving anchors and images. Used for
// block-level <html> nodes where badge rows / nav lists / clickable banner
// images need their URLs to survive. Whitespace between segments is already
// normalized by parseHtmlSegments.
export function HtmlBlock({ segments }: { segments: HtmlSegment[] }) {
  return (
    <box marginBottom={1} paddingX={2}>
      <text fg={theme.foregroundMuted}>
        <SegmentList segments={segments} inLink={false} />
      </text>
    </box>
  )
}

function SegmentList({ segments, inLink }: { segments: HtmlSegment[]; inLink: boolean }) {
  return (
    <>
      {segments.map((s, i) => (
        <SegmentOne key={i} seg={s} inLink={inLink} />
      ))}
    </>
  )
}

function SegmentOne({ seg, inLink }: { seg: HtmlSegment; inLink: boolean }) {
  if (seg.kind === 'text') return <>{seg.value}</>

  if (seg.kind === 'image') {
    const label = seg.alt || seg.src
    // When wrapped in a link, the surrounding <a> carries the click target;
    // suppress the redundant " → src" tail so the label reads cleanly.
    if (inLink) {
      return <em>[Image: {label}]</em>
    }
    return (
      <em>
        [Image: {label}
        {seg.alt && seg.src ? (
          <>
            {' → '}
            <a href={seg.src}>
              <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
                {seg.src}
              </span>
            </a>
          </>
        ) : null}
        ]
      </em>
    )
  }

  return (
    <a href={seg.href}>
      <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
        <SegmentList segments={seg.children} inLink={true} />
      </span>
    </a>
  )
}
