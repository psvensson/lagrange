import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {basename, join, resolve} from 'node:path';
import {buildJsWasmComponentArtifact} from '../../src/query/callback-module-artifact.js';
import {
  CODE_EXECUTOR_TYPE,
  DEFAULT_EXAMPLES_DIR,
  EXAMPLE_DEFAULT,
  EXAMPLE_DIR_NAME_PREFIX,
  FILE_NAME,
  HEX_DIGEST_PREFIX,
  MODULE_EXPORTS_ARG,
  MODULE_OBJECT_ARG,
  MODULE_RETURN_LINE,
  RUNTIME_KIND,
  TEXT_ENCODING_UTF8,
  VERSION_SANITIZE_REGEX,
} from './examples-runner-constants.js';

/**
 * Normalize semver-like values for stable function IDs.
 *
 * @param {string} version
 * @return {string}
 */
function normalizeVersion(version) {
  return String(version || EXAMPLE_DEFAULT.VERSION)
    .replace(VERSION_SANITIZE_REGEX, '_');
}

/**
 * Build the deterministic `code.function_id` for an example.
 *
 * @param {{id: string, version: string}} manifest
 * @return {string}
 */
function buildFunctionId(manifest) {
  return `example-${manifest.id}-v${normalizeVersion(manifest.version)}`;
}

/**
 * Build a friendly function name for diagnostics.
 *
 * @param {{id: string}} manifest
 * @return {string}
 */
function buildFunctionName(manifest) {
  return `examples.${manifest.id}`;
}

/**
 * Compute a SHA-256 digest for uploaded code/artifact blobs.
 *
 * @param {string} content
 * @return {string}
 */
function computeDigest(content) {
  const hash = createHash('sha256');
  hash.update(content);
  return HEX_DIGEST_PREFIX + hash.digest('hex');
}

/**
 * Verify an example callback module exports the requested callback function.
 *
 * @param {string} source
 * @param {string} callbackExport
 * @param {string} sourcePath
 */
function compileModuleSource(source, callbackExport, sourcePath) {
  const module = {exports: {}};
  const moduleFactory = new Function(
    MODULE_EXPORTS_ARG,
    MODULE_OBJECT_ARG,
    `${source}\n${MODULE_RETURN_LINE}`,
  );
  const evaluated = moduleFactory(module.exports, module);
  const exportsObject = evaluated && typeof evaluated === 'object' ?
    evaluated :
    module.exports;
  const handler = exportsObject ? exportsObject[callbackExport] : null;
  if (typeof handler !== 'function') {
    throw new Error(
      `Example module missing exported callback "${callbackExport}": ${sourcePath}`,
    );
  }
}

/**
 * Package source into the `code_blob` payload expected by runtime kind.
 *
 * @param {string} source
 * @param {string} callbackExport
 * @param {string} runtimeKind
 * @return {{codeBlob: string, executorType: string}}
 */
function packageCodeBlob(source, callbackExport, runtimeKind) {
  if (runtimeKind === RUNTIME_KIND.WASM_COMPONENT) {
    const artifact = buildJsWasmComponentArtifact(source, callbackExport);
    return {
      codeBlob: artifact,
      executorType: CODE_EXECUTOR_TYPE.WASM_SERVICE,
    };
  }

  return {
    codeBlob: source,
    executorType: CODE_EXECUTOR_TYPE.NATIVE_JS,
  };
}

/**
 * Resolve ordered example directories (`NN-name`).
 *
 * @param {string} examplesDir
 * @return {Promise<string[]>}
 */
async function discoverExampleDirectories(examplesDir) {
  const absoluteDir = resolve(examplesDir);
  const entries = await readdir(absoluteDir, {withFileTypes: true});
  return entries
    .filter((entry) => entry.isDirectory() && EXAMPLE_DIR_NAME_PREFIX.test(entry.name))
    .map((entry) => join(absoluteDir, entry.name))
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}

/**
 * Read and package one example manifest directory.
 *
 * @param {string} exampleDir
 * @return {Promise<Object>}
 */
async function packageExample(exampleDir) {
  const manifestPath = join(exampleDir, FILE_NAME.EXAMPLE_MANIFEST);
  const manifestRaw = await readFile(manifestPath, TEXT_ENCODING_UTF8);
  const manifest = JSON.parse(manifestRaw);

  if (!manifest.id || !manifest.entry || !manifest.callbackExport) {
    throw new Error(`Invalid example manifest: ${manifestPath}`);
  }

  const entryPath = join(exampleDir, manifest.entry);
  const source = await readFile(entryPath, TEXT_ENCODING_UTF8);
  compileModuleSource(source, manifest.callbackExport, entryPath);

  const runtimeKind = manifest.runtimeKind || RUNTIME_KIND.NATIVE_JS;
  const packagedCode = packageCodeBlob(
    source,
    manifest.callbackExport,
    runtimeKind,
  );

  const expectedPath = join(
    exampleDir,
    manifest.expectedFile || FILE_NAME.EXPECTED,
  );
  const expectedRaw = await readFile(expectedPath, TEXT_ENCODING_UTF8);
  const expected = JSON.parse(expectedRaw);

  return {
    id: manifest.id,
    title: manifest.title || manifest.id,
    level: manifest.level || EXAMPLE_DEFAULT.LEVEL,
    required: manifest.required !== false,
    runtimeKind,
    executorType: packagedCode.executorType,
    callbackExport: manifest.callbackExport,
    select: manifest.select,
    params: Array.isArray(manifest.params) ? manifest.params : [],
    version: String(manifest.version || EXAMPLE_DEFAULT.VERSION),
    expected,
    source,
    codeBlob: packagedCode.codeBlob,
    sourcePath: entryPath,
    expectedPath,
    functionId: buildFunctionId(manifest),
    functionName: buildFunctionName(manifest),
    digest: computeDigest(packagedCode.codeBlob),
    moduleName: manifest.id,
  };
}

/**
 * Apply include/exclude filters to an example ID.
 *
 * @param {string} exampleId
 * @param {Set<string>} includeSet
 * @param {Set<string>} excludeSet
 * @return {boolean}
 */
function shouldIncludeExample(exampleId, includeSet, excludeSet) {
  if (includeSet && includeSet.size > 0 && !includeSet.has(exampleId)) {
    return false;
  }
  if (excludeSet && excludeSet.size > 0 && excludeSet.has(exampleId)) {
    return false;
  }
  return true;
}

/**
 * Discover and package all selected examples.
 *
 * @param {{
 *   examplesDir?: string,
 *   include?: string[],
 *   exclude?: string[]
 * }} options
 * @return {Promise<Object[]>}
 */
async function packageExamples(options = {}) {
  const examplesDir = options.examplesDir || DEFAULT_EXAMPLES_DIR;
  const includeSet = new Set(options.include || []);
  const excludeSet = new Set(options.exclude || []);
  const directories = await discoverExampleDirectories(examplesDir);
  const packaged = [];

  for (const exampleDir of directories) {
    const example = await packageExample(exampleDir);
    if (!shouldIncludeExample(example.id, includeSet, excludeSet)) {
      continue;
    }
    packaged.push(example);
  }

  return packaged;
}

export {
  discoverExampleDirectories,
  packageExample,
  packageExamples,
};
