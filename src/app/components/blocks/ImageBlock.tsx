import { TextAttributes } from '@opentui/core'
import { theme } from '../../styles/theme'

export function ImageBlock({ alt, src }: { alt: string; src: string }) {
  return (
    <box marginBottom={1} paddingX={2}>
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
