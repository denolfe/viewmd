// Points OpenTUI's tree-sitter worker at its embedded location when running
// inside a `bun build --compile` standalone binary. The worker is embedded as a
// second compile entrypoint at this $bunfs path; without this, OpenTUI resolves
// a non-existent path and syntax highlighting silently fails. No-op in dev,
// where the worker resolves from the real filesystem.
if (Bun.main.startsWith('/$bunfs')) {
  process.env.OTUI_TREE_SITTER_WORKER_PATH ||=
    '/$bunfs/root/node_modules/@opentui/core/parser.worker.js'
}
