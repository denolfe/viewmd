import { TextAttributes } from '@opentui/core'
import { HighlightedText, RunScope } from './InlineRenderer'
import { imageLabelText } from '../../lib/visible-text'
import { theme } from '../../styles/theme'

export function ImageBlock({ alt, src, id }: { alt: string; src: string; id: string }) {
  return (
    <box id={id} marginBottom={1} paddingX={2}>
      <text fg={theme.foregroundMuted}>
        <em>
          <RunScope blockId={id} text={imageLabelText(alt, src)}>
            <HighlightedText value="[Image: " />
            <HighlightedText value={alt || src} />
            {alt && src ? (
              <>
                <HighlightedText value=" → " />
                <a href={src}>
                  <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
                    <HighlightedText value={src} />
                  </span>
                </a>
              </>
            ) : null}
            <HighlightedText value="]" />
          </RunScope>
        </em>
      </text>
    </box>
  )
}
