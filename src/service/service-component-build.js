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
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The canonical authoring WIT package at the repo root (wit/world.wit),
// carrying the combined service-cell world (handle-request, run, reduce).
// Resolved lazily and SEA-aware: in the single-executable bundle esbuild
// rewrites import.meta.url to undefined (a top-level `new URL` here
// crashed the whole bundled entrypoint at module load); component builds
// are a dev/CLI concern, so the bundle resolves the staged path beside
// the executable instead.
const STAGED_WIT_DIR = 'wit';
const WIT_FILE_NAME = 'lagrange-cell.wit';

const SEA_BUILD_FLAG = 'true';
const WIT_RELATIVE_PATH = '../../wit';

function defaultWitPath() {
  if (process.env.SEA_BUILD === SEA_BUILD_FLAG) {
    return path.join(path.dirname(process.argv[1]), STAGED_WIT_DIR, WIT_FILE_NAME);
  }
  return fileURLToPath(new URL(WIT_RELATIVE_PATH, import.meta.url));
}

const canonicalWitDirectory = defaultWitPath;
const SERVICE_CELL_WORLD = 'service-cell';
// Build-time-only devDependency; the specifier lives in a named const so
// the dynamic import carries no bare module literal.
const COMPONENTIZE_MODULE = '@bytecodealliance/componentize-js';
const COMPONENTIZE_SPECIFIER = COMPONENTIZE_MODULE;

// The sealed guest sandbox: no ambient randomness, stdio, clocks, host
// HTTP, or fetch-event entrypoint reach the componentized service.
const DISABLED_ENGINE_FEATURES = Object.freeze([
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
]);

const SERVICE_COMPONENT_BUILD_ERROR_CODE = Object.freeze({
  MISSING_GENERATED_ARTIFACTS: 'MISSING_GENERATED_ARTIFACTS',
  MISSING_WIT_WORLD: 'MISSING_WIT_WORLD',
  MISSING_COMPILER: 'MISSING_COMPILER',
  COMPONENTIZE_FAILED: 'COMPONENTIZE_FAILED',
});

const SERVICE_COMPONENT_BUILD_ERROR_NAME = 'ServiceComponentBuildError';

class ServiceComponentBuildError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = SERVICE_COMPONENT_BUILD_ERROR_NAME;
    this.code = code;
  }
}

async function loadComponentize(componentizeImpl) {
  if (componentizeImpl) {
    return componentizeImpl;
  }
  try {
    return await import(COMPONENTIZE_SPECIFIER);
  } catch (error) {
    throw new ServiceComponentBuildError(
      SERVICE_COMPONENT_BUILD_ERROR_CODE.MISSING_COMPILER,
      `lagrange service build requires ${COMPONENTIZE_SPECIFIER}: ${error?.message || error}`,
      {cause: error},
    );
  }
}

function resolveValidatedBuildPaths(entryPath, sourcePath, witPath) {
  const resolvedEntryPath = entryPath || sourcePath;
  if (!resolvedEntryPath || !fs.existsSync(resolvedEntryPath)) {
    throw new ServiceComponentBuildError(
      SERVICE_COMPONENT_BUILD_ERROR_CODE.MISSING_GENERATED_ARTIFACTS,
      `Generated component entry was not found at ${resolvedEntryPath}; run lagrange service generate before lagrange service build`,
    );
  }
  const resolvedWitPath = witPath || defaultWitPath();
  if (!fs.existsSync(resolvedWitPath)) {
    throw new ServiceComponentBuildError(
      SERVICE_COMPONENT_BUILD_ERROR_CODE.MISSING_WIT_WORLD,
      `WIT world definition was not found at ${resolvedWitPath}`,
    );
  }
  return {resolvedEntryPath, resolvedWitPath};
}

/**
 * Componentize a generated service entry against the service-cell world.
 * @param {object} params
 * @param {string} [params.entryPath] - on-disk generated entry module path.
 * @param {string} [params.sourcePath] - alias for entryPath.
 * @param {string} [params.worldName] - WIT world (defaults to service-cell).
 * @param {string} [params.witPath] - WIT package dir or file (defaults to defaultWitPath()).
 * @param {object} [params.componentizeImpl] - optional componentize implementation override.
 * @return {Promise<{component: Uint8Array, options: object}>}
 */
async function buildServiceComponent({
  entryPath,
  sourcePath = entryPath,
  worldName = SERVICE_CELL_WORLD,
  witPath = undefined,
  componentizeImpl = null,
} = {}) {
  const {resolvedEntryPath, resolvedWitPath} =
    resolveValidatedBuildPaths(entryPath, sourcePath, witPath);
  const {componentize} = await loadComponentize(componentizeImpl);
  const options = {
    disableFeatures: [...DISABLED_ENGINE_FEATURES],
    sourcePath: resolvedEntryPath,
    witPath: resolvedWitPath,
    worldName,
  };
  let result;
  try {
    result = await componentize(options);
  } catch (error) {
    if (error instanceof ServiceComponentBuildError) {
      throw error;
    }
    throw new ServiceComponentBuildError(
      SERVICE_COMPONENT_BUILD_ERROR_CODE.COMPONENTIZE_FAILED,
      `componentize failed: ${error?.message || error}`,
      {cause: error},
    );
  }
  return {component: result.component, options};
}

const componentizeService = buildServiceComponent;

export {
  SERVICE_COMPONENT_BUILD_ERROR_CODE,
  ServiceComponentBuildError,
  buildServiceComponent,
  canonicalWitDirectory,
  componentizeService,
  defaultWitPath,
};
