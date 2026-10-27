// The source/build manifest owner enumerates the executable content of a
// deployment: source and the installed production dependency closure named
// by npm's lock. Package bodies are measured, not inferred from versions.
import {readFile, readdir, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {computeContentRecordsFingerprint} from './source-fingerprint.js';

const SOURCE_DIRECTORY = 'src';
const PACKAGE_MANIFEST = 'package.json';
const DEPENDENCY_LOCK = 'package-lock.json';
const DEPENDENCY_DIRECTORY = 'node_modules';
const OPTIONAL_ABSENT = 'optional-package-absent';
const DIRECTORY_CYCLE = 'runtime dependency directory cycle';
const RUNTIME_BUILD_MANIFEST = 'runtime-content-manifest.json';
const MISSING_FILE_CODE = 'ENOENT';

async function contentRecords(directory, prefix, ancestors = new Set(), skipNested = true) {
  const actual = await realpath(directory);
  if (ancestors.has(actual)) {
    throw new Error(DIRECTORY_CYCLE);
  }
  const lineage = new Set([...ancestors, actual]);
  const records = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    // Nested dependency packages each have their own lock entry. Do not
    // accidentally include a dev dependency hoisted beneath a runtime one.
    if (skipNested && entry.name === DEPENDENCY_DIRECTORY) continue;
    const absolute = path.join(directory, entry.name);
    const relativePath = `${prefix}/${entry.name}`;
    const shape = await stat(absolute);
    if (shape.isDirectory()) {
      records.push(...await contentRecords(absolute, relativePath, lineage, skipNested));
    } else if (shape.isFile()) {
      // Follow installed symlinks: the running module consumes their body,
      // so hashing only the link text would not identify executable bytes.
      records.push({relativePath, content: await readFile(absolute)});
    }
  }
  return records;
}

async function productionDependencyRecords(root, lock) {
  const records = [];
  for (const [relativePath, entry] of Object.entries(lock.packages)) {
    if (!relativePath || entry.dev === true) continue;
    const directory = path.join(root, relativePath);
    try {
      await stat(directory);
    } catch (error) {
      if (error.code !== MISSING_FILE_CODE || entry.optional !== true) throw error;
      // An absent optional package is an explicit part of this deployment,
      // distinct from a package that is present and executes on another node.
      records.push({relativePath, content: Buffer.from(OPTIONAL_ABSENT)});
      continue;
    }
    records.push(...await contentRecords(directory, relativePath));
  }
  return records;
}

/**
 * Measure an installed source/build tree. Used by the boot owner and SEA
 * producer; no expected digest, environment value or package version wins
 * over the bytes this function read.
 * @param {string} root - Actual source/build root.
 * @return {Promise<Object>} Immutable measured content facts.
 */
async function measureRuntimeContent(root) {
  const lockBytes = await readFile(path.join(root, DEPENDENCY_LOCK));
  const lock = JSON.parse(lockBytes);
  const source = await contentRecords(path.join(root, SOURCE_DIRECTORY), SOURCE_DIRECTORY);
  const dependencies = await productionDependencyRecords(root, lock);
  const manifests = [
    {relativePath: DEPENDENCY_LOCK, content: lockBytes},
    {relativePath: PACKAGE_MANIFEST, content: await readFile(path.join(root, PACKAGE_MANIFEST))},
  ];
  return Object.freeze({
    sourceDigest: computeContentRecordsFingerprint(source),
    dependencyDigest: computeContentRecordsFingerprint(dependencies),
    manifestDigest: computeContentRecordsFingerprint(manifests),
    dependencyFileCount: dependencies.length,
  });
}

async function measurePackagedDependencies(root) {
  return computeContentRecordsFingerprint(await contentRecords(
    path.join(root, DEPENDENCY_DIRECTORY), DEPENDENCY_DIRECTORY, new Set(), false));
}

export {RUNTIME_BUILD_MANIFEST, measurePackagedDependencies, measureRuntimeContent};
