/**
 * The single build-time componentize owner for code-first services.
 *
 * `componentizeService` is a thin wrapper over ComponentizeJS that pins
 * the canonical option bag — the sealed `service-cell` world, the
 * canonical `wit/` package directory, and the disabled engine features —
 * so every caller (the example runner, the parity test, and future
 * generator/CLI owners) builds a component the same way instead of
 * re-declaring the option constants inline.
 *
 * Build-time only: `@bytecodealliance/componentize-js` is a
 * devDependency, so the import is dynamic and lives inside the function.
 * Nothing here executes at production runtime; the produced component is
 * a WASM byte array a later owner wraps into an OCI layout.
 *
 * The opts-object `sourcePath` form is deliberate: ComponentizeJS must
 * resolve the generated entry's static developer-module imports itself
 * (no inlined/bundled source string), which is the property the parity
 * test asserts.
 */
import {fileURLToPath} from 'node:url';

// The canonical authoring WIT package at the repo root (wit/world.wit),
// carrying the combined service-cell world (handle-request, run, reduce).
const CANONICAL_WIT_DIRECTORY =
  fileURLToPath(new URL('../../wit', import.meta.url));
const SERVICE_CELL_WORLD = 'service-cell';
// Build-time-only devDependency; the specifier lives in a named const so
// the dynamic import carries no bare module literal.
const COMPONENTIZE_MODULE = '@bytecodealliance/componentize-js';
// The sealed guest sandbox: no ambient randomness, stdio, clocks, host
// HTTP, or fetch-event entrypoint reach the componentized service.
const DISABLED_ENGINE_FEATURES = Object.freeze([
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
]);

/**
 * Componentize a generated service entry against the service-cell world.
 * @param {object} params
 * @param {string} params.sourcePath - on-disk generated entry module path.
 * @param {string} [params.worldName] - WIT world (defaults to service-cell).
 * @param {string} [params.witPath] - WIT package dir (defaults to wit/).
 * @return {Promise<{component: Uint8Array, options: object}>}
 */
async function componentizeService({
  sourcePath,
  worldName = SERVICE_CELL_WORLD,
  witPath = CANONICAL_WIT_DIRECTORY,
}) {
  const {componentize} = await import(COMPONENTIZE_MODULE);
  const options = {
    disableFeatures: [...DISABLED_ENGINE_FEATURES],
    sourcePath,
    witPath,
    worldName,
  };
  const {component} = await componentize(options);
  return {component, options};
}

export {componentizeService};
