// The source/build manifest owner enumerates the executable content of a
// deployment: source and the installed production dependency closure named
// by npm's lock. Package bodies are measured, not inferred from versions.
import {readFile, readdir, readlink, realpath, stat} from 'node:fs/promises';
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
const MAX_FS_CONCURRENCY = 16;
const UTF8_ENCODING = 'utf8';
const SHORT_FINGERPRINT_HEX_LENGTH = 16;

async function mapBounded(items, limit, worker) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  };
  const workers = Array.from(
    {length: Math.min(limit, items.length)},
    () => runWorker(),
  );
  await Promise.all(workers);
  return results;
}

async function collectEntries(
  directory,
  prefix,
  ancestors,
  skipNested,
  fileTargets,
  resolvedDir = null,
) {
  const actual = resolvedDir ?? await realpath(directory);
  if (ancestors.has(actual)) {
    throw new Error(DIRECTORY_CYCLE);
  }
  const lineage = new Set([...ancestors, actual]);
  const dirEntries = await readdir(directory, {withFileTypes: true});
  for (const entry of dirEntries) {
    // Nested dependency packages each have their own lock entry. Do not
    // accidentally include a dev dependency hoisted beneath a runtime one.
    if (skipNested && entry.name === DEPENDENCY_DIRECTORY) continue;
    const absolute = path.join(directory, entry.name);
    const relativePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectEntries(
        absolute, relativePath, lineage, skipNested, fileTargets,
        path.join(actual, entry.name),
      );
    } else if (entry.isFile()) {
      fileTargets.push({absolute, relativePath, isSymlink: false});
    } else {
      // Follow installed symlinks: the running module consumes their body,
      // so hashing only the link text would not identify executable bytes.
      const shape = await stat(absolute);
      if (shape.isDirectory()) {
        await collectEntries(absolute, relativePath, lineage, skipNested, fileTargets);
      } else if (shape.isFile()) {
        fileTargets.push({absolute, relativePath, isSymlink: entry.isSymbolicLink()});
      }
    }
  }
}

async function readFileTargets(fileTargets) {
  return mapBounded(
    fileTargets,
    MAX_FS_CONCURRENCY,
    async ({absolute, relativePath, isSymlink}) => ({
      relativePath,
      content: await readFile(absolute),
      shortContent: isSymlink ?
        Buffer.from(await readlink(absolute), UTF8_ENCODING) :
        null,
    }),
  );
}

async function contentRecords(directory, prefix, ancestors = new Set(), skipNested = true) {
  const fileTargets = [];
  await collectEntries(directory, prefix, ancestors, skipNested, fileTargets);
  return readFileTargets(fileTargets);
}

async function productionDependencyRecords(root, lock) {
  const fileTargets = [];
  const absentRecords = [];
  for (const [relativePath, entry] of Object.entries(lock.packages)) {
    if (!relativePath || entry.dev === true) continue;
    const directory = path.join(root, relativePath);
    try {
      await stat(directory);
    } catch (error) {
      if (error.code !== MISSING_FILE_CODE || entry.optional !== true) throw error;
      // An absent optional package is an explicit part of this deployment,
      // distinct from a package that is present and executes on another node.
      absentRecords.push({relativePath, content: Buffer.from(OPTIONAL_ABSENT)});
      continue;
    }
    await collectEntries(directory, relativePath, new Set(), true, fileTargets);
  }
  const presentRecords = await readFileTargets(fileTargets);
  return [...absentRecords, ...presentRecords];
}

/**
 * Measure an installed source/build tree. Used by the boot owner and SEA
 * producer; no expected digest, environment value or package version wins
 * over the bytes this function read.
 * @param {string} root - Actual source/build root.
 * @return {Promise<Object>} Immutable measured content facts.
 */
async function measureRuntimeContent(root) {
  const [lockBytes, manifestBytes] = await Promise.all([
    readFile(path.join(root, DEPENDENCY_LOCK)),
    readFile(path.join(root, PACKAGE_MANIFEST)),
  ]);
  const lock = JSON.parse(lockBytes);
  const [source, dependencies] = await Promise.all([
    contentRecords(path.join(root, SOURCE_DIRECTORY), SOURCE_DIRECTORY),
    productionDependencyRecords(root, lock),
  ]);
  const manifests = [
    {relativePath: DEPENDENCY_LOCK, content: lockBytes},
    {relativePath: PACKAGE_MANIFEST, content: manifestBytes},
  ];
  const shortSourceRecords = source.map(({relativePath, content, shortContent}) => ({
    relativePath: relativePath.startsWith(`${SOURCE_DIRECTORY}/`) ?
      relativePath.slice(SOURCE_DIRECTORY.length + 1) :
      relativePath,
    content: shortContent ?? content,
  }));
  return Object.freeze({
    sourceDigest: computeContentRecordsFingerprint(source),
    shortSourceFingerprint: computeContentRecordsFingerprint(shortSourceRecords)
      .slice(0, SHORT_FINGERPRINT_HEX_LENGTH),
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
