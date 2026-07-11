import { TextAttributes } from '@opentui/core'
import { theme } from '../../styles/theme'

export function ImageBlock({ alt, src, id }: { alt: string; src: string; id?: string }) {
  return (
    <box id={id} marginBottom={1} paddingX={2}>
      <text fg={theme.foregroundMuted}>
        <em>
          [Image: {alt || src}
          {alt && src ? (
            <>
              {' → '}
              <a href={src}>
                <span fg={theme.link} attributes={TextAttributes.UNDERLINE}>
                  {src}
                </span>
              </a>
            </>
          ) : null}
          ]
        </em>
      </text>
    </box>
  )
}
