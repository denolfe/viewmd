// Bun resolves `import x from './y.wasm' with { type: 'file' }` to a path string.
declare module '*.wasm' {
  const path: string
  export default path
}

declare module '*.scm' {
  const path: string
  export default path
}
