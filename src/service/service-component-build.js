/**
 * The single build-time componentize owner for code-first services.
 *
 * `componentizeService` bundles ordinary ESM dependencies (including
 * pinned Hono and `lagrange-server/authoring`) into a self-contained
 * guest entry module while refusing imports of the server root package
 * (`lagrange-server`) or Node built-ins (`node:*`), then invokes
 * ComponentizeJS with the canonical option bag — the sealed world, the
 * canonical `wit/` package directory, and the disabled engine features.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {builtinModules} from 'node:module';
import {fileURLToPath} from 'node:url';
import {
  PINNED_HONO_TOOLCHAIN_VERSIONS,
  computeSha256Digest,
} from './hono-component-qualification.js';

const STAGED_WIT_DIR = 'wit';
const STAGED_SRC_DIR = 'src';
const STAGED_AUTHORING_DIR = 'authoring';
const STAGED_INDEX_FILE = 'index.js';
const STAGED_NODE_MODULES_DIR = 'node_modules';
const WIT_FILE_NAME = 'lagrange-cell.wit';
const WORLD_WIT_FILE = 'world.wit';
const UTF8_ENCODING = 'utf8';

const SEA_BUILD_FLAG = 'true';
const WIT_RELATIVE_PATH = '../../wit';
const AUTHORING_RELATIVE_PATH = '../authoring/index.js';
const REPO_NODE_MODULES_RELATIVE_PATH = '../../node_modules';

const SERVICE_CELL_WORLD = 'service-cell';
const SERVICE_CELL_V2_WORLD = 'service-cell-v2';
const COMPONENTIZE_MODULE = '@bytecodealliance/componentize-js';
const COMPONENTIZE_SPECIFIER = COMPONENTIZE_MODULE;
const ESBUILD_SPECIFIER = 'esbuild';

const AUTHORING_PACKAGE_SUBPATH = 'lagrange-server/authoring';
const FORBIDDEN_GUEST_ROOT_IMPORT = 'lagrange-server';
const FORBIDDEN_NODE_BUILTIN_FRAGMENT = 'Node built-in module';
const NODE_PROTOCOL_PREFIX = 'node:';
const CELL_IMPORT_GLOB = 'lagrange:cell/*';
const BUNDLE_TEMP_PREFIX = 'lagrange-guest-bundle-';
const BUNDLED_ENTRY_FILE_NAME = 'guest-entry.bundled.mjs';
const ESBUILD_FORMAT_ESM = 'esm';
const ESBUILD_LOG_LEVEL_SILENT = 'silent';
const ESBUILD_PLATFORM_NEUTRAL = 'neutral';
const ESBUILD_MAIN_FIELDS = Object.freeze(['module', 'main']);
const ESBUILD_CONDITIONS = Object.freeze(['import', 'module', 'default']);
const BUILTIN_MODULE_SET = Object.freeze(new Set(builtinModules));
const BUNDLE_PLUGIN_NAME = 'lagrange-guest-boundary-guard';
const PLUGIN_FILTER_ALL = /.*/;

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
  COMPONENTIZE_FAILED: 'COMPONENTIZE_FAILED',
  FORBIDDEN_GUEST_IMPORT: 'FORBIDDEN_GUEST_IMPORT',
  MISSING_COMPILER: 'MISSING_COMPILER',
  MISSING_GENERATED_ARTIFACTS: 'MISSING_GENERATED_ARTIFACTS',
  MISSING_WIT_WORLD: 'MISSING_WIT_WORLD',
});

const SERVICE_COMPONENT_BUILD_ERROR_NAME = 'ServiceComponentBuildError';

class ServiceComponentBuildError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = SERVICE_COMPONENT_BUILD_ERROR_NAME;
    this.code = code;
  }
}

function defaultWitPath() {
  if (process.env.SEA_BUILD === SEA_BUILD_FLAG) {
    return path.join(
      path.dirname(process.argv[1]),
      STAGED_WIT_DIR,
      WIT_FILE_NAME,
    );
  }
  return fileURLToPath(new URL(WIT_RELATIVE_PATH, import.meta.url));
}

function resolveAuthoringEntryPath() {
  if (process.env.SEA_BUILD === SEA_BUILD_FLAG) {
    return path.join(
      path.dirname(process.argv[1]),
      STAGED_SRC_DIR,
      STAGED_AUTHORING_DIR,
      STAGED_INDEX_FILE,
    );
  }
  return fileURLToPath(new URL(AUTHORING_RELATIVE_PATH, import.meta.url));
}

function resolveRepoNodeModulesPath() {
  if (process.env.SEA_BUILD === SEA_BUILD_FLAG) {
    return path.join(path.dirname(process.argv[1]), STAGED_NODE_MODULES_DIR);
  }
  return fileURLToPath(
    new URL(REPO_NODE_MODULES_RELATIVE_PATH, import.meta.url),
  );
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

async function loadEsbuild() {
  try {
    return await import(ESBUILD_SPECIFIER);
  } catch (error) {
    throw new ServiceComponentBuildError(
      SERVICE_COMPONENT_BUILD_ERROR_CODE.MISSING_COMPILER,
      `lagrange service build requires ${ESBUILD_SPECIFIER}: ${error?.message || error}`,
      {cause: error},
    );
  }
}

function isNodeBuiltinSpecifier(specifier) {
  return (
    specifier.startsWith(NODE_PROTOCOL_PREFIX) ||
    BUILTIN_MODULE_SET.has(specifier)
  );
}

function createGuestBoundaryPlugin(authoringEntryPath) {
  return {
    name: BUNDLE_PLUGIN_NAME,
    setup(build) {
      build.onResolve({filter: PLUGIN_FILTER_ALL}, (args) => {
        if (args.path === AUTHORING_PACKAGE_SUBPATH) {
          return {path: authoringEntryPath};
        }
        if (args.path === FORBIDDEN_GUEST_ROOT_IMPORT) {
          return {
            errors: [{
              text:
                `Guest service cannot import '${FORBIDDEN_GUEST_ROOT_IMPORT}' root; ` +
                `use '${AUTHORING_PACKAGE_SUBPATH}' instead`,
            }],
          };
        }
        if (isNodeBuiltinSpecifier(args.path)) {
          return {
            errors: [{
              text:
                `Guest service cannot import ${FORBIDDEN_NODE_BUILTIN_FRAGMENT} '${args.path}'`,
            }],
          };
        }
        return null;
      });
    },
  };
}

function classifyBundleFailureCode(message) {
  if (
    message.includes(FORBIDDEN_GUEST_ROOT_IMPORT) ||
    message.includes(FORBIDDEN_NODE_BUILTIN_FRAGMENT)
  ) {
    return SERVICE_COMPONENT_BUILD_ERROR_CODE.FORBIDDEN_GUEST_IMPORT;
  }
  return SERVICE_COMPONENT_BUILD_ERROR_CODE.COMPONENTIZE_FAILED;
}

async function bundleGuestEntry(resolvedEntryPath) {
  const {build} = await loadEsbuild();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), BUNDLE_TEMP_PREFIX));
  const bundledEntryPath = path.join(tempDir, BUNDLED_ENTRY_FILE_NAME);
  const authoringEntryPath = resolveAuthoringEntryPath();
  const repoNodeModulesPath = resolveRepoNodeModulesPath();
  const nodePaths = fs.existsSync(repoNodeModulesPath) ?
    [repoNodeModulesPath] :
    [];
  try {
    await build({
      absWorkingDir: path.dirname(resolvedEntryPath),
      bundle: true,
      conditions: [...ESBUILD_CONDITIONS],
      entryPoints: [resolvedEntryPath],
      external: [CELL_IMPORT_GLOB],
      format: ESBUILD_FORMAT_ESM,
      logLevel: ESBUILD_LOG_LEVEL_SILENT,
      mainFields: [...ESBUILD_MAIN_FIELDS],
      nodePaths,
      outfile: bundledEntryPath,
      platform: ESBUILD_PLATFORM_NEUTRAL,
      plugins: [createGuestBoundaryPlugin(authoringEntryPath)],
    });
  } catch (error) {
    fs.rmSync(tempDir, {force: true, recursive: true});
    const message = String(error?.message || error);
    throw new ServiceComponentBuildError(
      classifyBundleFailureCode(message),
      `guest bundle failed: ${message}`,
      {cause: error},
    );
  }
  const bundledSource = fs.readFileSync(bundledEntryPath, UTF8_ENCODING);
  return {
    bundledEntryDigest: computeSha256Digest(bundledSource),
    bundledEntryPath,
    cleanup() {
      fs.rmSync(tempDir, {force: true, recursive: true});
    },
  };
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
  const witFilePath = fs.statSync(resolvedWitPath).isDirectory() ?
    path.join(resolvedWitPath, WORLD_WIT_FILE) :
    resolvedWitPath;
  if (!fs.existsSync(witFilePath)) {
    throw new ServiceComponentBuildError(
      SERVICE_COMPONENT_BUILD_ERROR_CODE.MISSING_WIT_WORLD,
      `WIT world definition was not found at ${witFilePath}`,
    );
  }
  const witWorld = fs.readFileSync(witFilePath, UTF8_ENCODING);
  return {resolvedEntryPath, resolvedWitPath, witWorld};
}

function shouldBundleGuestEntry(bundle, componentizeImpl) {
  if (bundle === undefined) {
    return componentizeImpl === null;
  }
  return Boolean(bundle);
}

function buildDigestsRecord(entryDigest, bundleHandle, component) {
  const componentBytes = component instanceof Uint8Array ?
    component :
    new Uint8Array(component || []);
  return Object.freeze({
    bundledEntryDigest: bundleHandle ?
      bundleHandle.bundledEntryDigest :
      entryDigest,
    componentDigest: computeSha256Digest(componentBytes),
    entryDigest,
  });
}

async function runComponentizeWithBundle(
  componentize,
  options,
  bundleHandle,
  resolvedEntryPath,
) {
  const sourcePath = bundleHandle ?
    bundleHandle.bundledEntryPath :
    resolvedEntryPath;
  try {
    return await componentize({...options, sourcePath});
  } catch (error) {
    if (error instanceof ServiceComponentBuildError) {
      throw error;
    }
    throw new ServiceComponentBuildError(
      SERVICE_COMPONENT_BUILD_ERROR_CODE.COMPONENTIZE_FAILED,
      `componentize failed: ${error?.message || error}`,
      {cause: error},
    );
  } finally {
    bundleHandle?.cleanup();
  }
}

function inferServiceWorldFromEntrySource(entrySource) {
  return typeof entrySource === 'string' &&
      entrySource.includes(SERVICE_CELL_V2_WORLD) ?
    SERVICE_CELL_V2_WORLD :
    SERVICE_CELL_WORLD;
}

/**
 * Componentize a generated service entry against the service-cell world.
 * @param {object} params
 * @param {string} [params.entryPath] - on-disk generated entry module path.
 * @param {string} [params.sourcePath] - alias for entryPath.
 * @param {string} [params.worldName] - WIT world (defaults to entry-inferred world).
 * @param {string} [params.witPath] - WIT package dir or file (defaults to defaultWitPath()).
 * @param {boolean} [params.bundle] - whether to bundle ESM guest dependencies with esbuild.
 * @param {object} [params.componentizeImpl] - optional componentize implementation override.
 * @return {Promise<{component: Uint8Array, digests: object, toolchain: object, options: object}>}
 */
async function buildServiceComponent({
  entryPath,
  sourcePath = entryPath,
  worldName = undefined,
  witPath = undefined,
  bundle = undefined,
  componentizeImpl = null,
} = {}) {
  const {resolvedEntryPath, resolvedWitPath, witWorld} =
    resolveValidatedBuildPaths(entryPath, sourcePath, witPath);
  const entrySource = fs.readFileSync(resolvedEntryPath, UTF8_ENCODING);
  const effectiveWorldName =
    worldName || inferServiceWorldFromEntrySource(entrySource);
  const entryDigest = computeSha256Digest(entrySource);
  const bundleHandle = shouldBundleGuestEntry(bundle, componentizeImpl) ?
    await bundleGuestEntry(resolvedEntryPath) :
    null;
  const {componentize} = await loadComponentize(componentizeImpl);
  const options = {
    disableFeatures: [...DISABLED_ENGINE_FEATURES],
    sourcePath: resolvedEntryPath,
    witWorld,
    worldName: effectiveWorldName,
  };
  const result = await runComponentizeWithBundle(
    componentize,
    options,
    bundleHandle,
    resolvedEntryPath,
  );
  return {
    component: result.component,
    digests: buildDigestsRecord(entryDigest, bundleHandle, result.component),
    options: {...options, witPath: resolvedWitPath},
    toolchain: PINNED_HONO_TOOLCHAIN_VERSIONS,
  };
}

const componentizeService = buildServiceComponent;

export {
  PINNED_HONO_TOOLCHAIN_VERSIONS,
  SERVICE_COMPONENT_BUILD_ERROR_CODE,
  ServiceComponentBuildError,
  buildServiceComponent,
  bundleGuestEntry,
  componentizeService,
  inferServiceWorldFromEntrySource,
};
