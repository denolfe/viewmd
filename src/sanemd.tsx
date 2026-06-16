#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer } from "@opentui/react"

function App() {
  const renderer = useRenderer()
  useKeyboard(key => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) renderer.destroy()
  })
  return (
    <box border padding={1}>
      <text>sanemd</text>
    </box>
  )
}

const renderer = await createCliRenderer({ exitOnCtrlC: false })
createRoot(renderer).render(<App />)
