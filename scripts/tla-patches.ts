export type TlaPatch = {
  /** Matches the resolved module path this patch applies to. */
  pathFilter: RegExp
  find: string
  replace: string
  /** Prepended to the module source when the patch applies (e.g. an import). */
  prepend?: string
}

/**
 * Bytecode compilation requires CJS output, which forbids top-level await
 * anywhere in the bundle. OpenTUI's dist files hold two module-scope awaits
 * that resolve synchronously under Bun (the only runtime a compiled viewmd
 * binary runs on), so the build rewrites them to their sync equivalents.
 *
 * Version-sensitive by design: if an OpenTUI upgrade moves this code, the
 * pattern stops matching and the build fails loudly (either via
 * assertPatchesApplied or the bundler's own top-level-await error) rather
 * than silently shipping stale patches.
 */
export function buildTlaPatches(nativePackageName: string): TlaPatch[] {
  return [
    {
      // bun-ffi-structs picks its FFI backend with `await loadBackend2()`;
      // under Bun that path is just a dynamic import of bun:ffi, which
      // require() loads synchronously.
      pathFilter: /@opentui\/core\/index-[a-z0-9]+\.js$/,
      find: 'var backend2 = await loadBackend2();',
      replace: 'var backend2 = createBunBackend2(require("bun:ffi"));',
    },
    {
      // resolveNativePackage() dynamic-imports the platform package, which the
      // build aliases to the sync stable-cache shim — import it statically.
      pathFilter: /@opentui\/core\/index-[a-z0-9]+\.js$/,
      find: 'var nativePackage = await resolveNativePackage();',
      replace: 'var nativePackage = { default: __viewmdNativeLibPath };',
      prepend: `import __viewmdNativeLibPath from ${JSON.stringify(nativePackageName)}\n`,
    },
    {
      // DEV-only react-devtools import. Compiled binaries don't bundle
      // devtools; throwing the module-not-found shape the surrounding catch
      // expects preserves its install-hint warning under DEV=true.
      pathFilter: /@opentui\/react\/chunk-[a-z0-9]+\.js$/,
      find: 'await import("./chunk-bdqvmfwv.js");',
      replace:
        'throw Object.assign(new Error("react-devtools-core is not bundled in compiled viewmd"), { code: "ERR_MODULE_NOT_FOUND" });',
    },
  ]
}

/** Apply every matching patch to a module's source. Pure; returns the source. */
export function applyTlaPatches(params: {
  path: string
  source: string
  patches: TlaPatch[]
  applied?: Set<TlaPatch>
}): string {
  const { path, patches, applied } = params
  let source = params.source
  for (const patch of patches) {
    if (!patch.pathFilter.test(path)) continue
    if (!source.includes(patch.find)) continue
    source = source.replace(patch.find, patch.replace)
    if (patch.prepend) source = patch.prepend + source
    applied?.add(patch)
  }
  return source
}

/** Fails the build when an OpenTUI upgrade has moved a patched pattern. */
export function assertPatchesApplied(patches: TlaPatch[], applied: Set<TlaPatch>): void {
  const missing = patches.filter(p => !applied.has(p))
  if (missing.length > 0) {
    throw new Error(
      `top-level-await patches no longer match their targets (upstream dist changed?):\n` +
        missing.map(p => `  ${p.pathFilter} :: ${p.find}`).join('\n'),
    )
  }
}
