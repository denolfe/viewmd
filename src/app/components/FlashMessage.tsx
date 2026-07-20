import { useAppState } from '../state'
import { theme } from '../styles/theme'

export function FlashMessage() {
  const { flashMessage } = useAppState()
  if (!flashMessage) return null
  return (
    <box
      position="absolute"
      bottom={0}
      left={0}
      height={1}
      zIndex={30}
      paddingX={1}
      backgroundColor={theme.stickyBg}
      overflow="hidden"
    >
      <text fg={theme.searchBarFg}>{flashMessage}</text>
    </box>
  )
}
