// The source/build manifest owner enumerates the executable content of a
// deployment: source and the installed production dependency closure. A source
// checkout uses its lock; an npm installation resolves its declared closure.
// Package bodies are measured, not inferred from versions.
import {lstat, readFile, readdir, realpath, stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
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
const TEXT_ENCODING = 'utf8';
const ROOT_PACKAGE_ID = 'root';
const PACKAGE_RECORD_PREFIX = 'packages';
const EDGE_RECORD_PREFIX = 'edges';
const FILE_SUFFIXES = Object.freeze(['.js', '.json', '.node']);
const PACKAGE_SEPARATOR = '/';
const SCOPE_PREFIX = '@';
const ARGUMENT_SEPARATOR = ' ';
const OPTION_UNDERSCORE = '_';
const OPTION_DASH = '-';
const CONTENT_LAYOUT = Object.freeze({LOCKED: 'locked', INSTALLED: 'installed', BUNDLED: 'bundled'});
const CONTENT_ENTRY = Object.freeze({READ: 'read', SKIP: 'skip'});
const UNSUPPORTED_LAYOUT = 'unsupported runtime dependency layout';
const PACKAGE_NAME_PATTERN = /^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/u;
const PARENT_NAME = '..';
const CURRENT_NAME = '.';
const PRESERVE_SYMLINKS = /--preserve-symlinks(?:-main)?(?:[\s"'=]|$)/u;
const SYMLINK_MODE_UNSUPPORTED = 'symlink-preserving runtime dependency measurement unsupported';
const FILE_DEPENDENCY_UNSUPPORTED = 'file-backed runtime dependency measurement unsupported';
const REQUIRED_DEPENDENCY_MISSING = 'required runtime dependency unavailable';
const INVALID_DEPENDENCY_MANIFEST = 'invalid runtime dependency manifest';

async function existingEntry(file) {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code !== MISSING_FILE_CODE) throw error;
    return null;
  }
}

async function dependencyLockBytes(root) {
  const file = path.join(root, DEPENDENCY_LOCK);
  try {
    return await readFile(file);
  } catch (error) {
    // A dangling link is present invalid content, not an absent npm lock.
    if (error.code !== MISSING_FILE_CODE || await existingEntry(file)) throw error;
    return null;
  }
}

async function packageManifest(directory) {
  const bytes = await readFile(path.join(directory, PACKAGE_MANIFEST), TEXT_ENCODING);
  const manifest = JSON.parse(bytes);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(INVALID_DEPENDENCY_MANIFEST);
  }
  return manifest;
}

function dependencyNames(value) {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(INVALID_DEPENDENCY_MANIFEST);
  }
  const names = Object.keys(value);
  for (const name of names) {
    if (!PACKAGE_NAME_PATTERN.test(name) || name.split(PACKAGE_SEPARATOR).some(
      (part) => part === PARENT_NAME || part === CURRENT_NAME)) {
      throw new Error(INVALID_DEPENDENCY_MANIFEST);
    }
  }
  return names;
}

function declaredDependencies(manifest) {
  const dependencies = new Map();
  for (const name of dependencyNames(manifest.peerDependencies)) {
    dependencies.set(name, manifest.peerDependenciesMeta?.[name]?.optional === true);
  }
  for (const name of dependencyNames(manifest.dependencies)) dependencies.set(name, false);
  for (const name of dependencyNames(manifest.optionalDependencies)) dependencies.set(name, true);
  return [...dependencies.keys()].sort().map((name) => ({name, optional: dependencies.get(name)}));
}

async function existingDirectory(directory) {
  if (!await existingEntry(directory)) return null;
  // Resolve separately so ENOENT behind an existing symlink is never absence.
  const actual = await realpath(directory);
  if (!(await stat(actual)).isDirectory()) throw new Error(FILE_DEPENDENCY_UNSUPPORTED);
  return actual;
}

async function packageInLookupDirectory(directory, name) {
  if (!await existingDirectory(directory)) return null;
  const scope = name.split(PACKAGE_SEPARATOR)[0];
  if (name.startsWith(SCOPE_PREFIX) && !await existingDirectory(path.join(directory, scope))) {
    return null;
  }
  const candidate = path.join(directory, name);
  // CJS may select a loose file before a directory. This census owns npm
  // package directories, so refuse unsupported/ambiguous loose-file layouts.
  for (const suffix of FILE_SUFFIXES) {
    if (await existingEntry(candidate + suffix)) throw new Error(FILE_DEPENDENCY_UNSUPPORTED);
  }
  return existingDirectory(candidate);
}

async function resolveDependencyDirectories(parent, name) {
  const require = createRequire(path.join(parent.directory, PACKAGE_MANIFEST));
  const candidates = new Set();
  if (parent.manifest.name === name && parent.manifest.exports != null) {
    candidates.add(parent.directory);
  }
  // A trailing slash requests package lookup even for a package named like a
  // builtin. Include CJS global fallbacks: transitive code need not be ESM.
  for (const directory of require.resolve.paths(`${name}/`)) {
    const resolved = await packageInLookupDirectory(directory, name);
    if (resolved !== null) candidates.add(resolved);
  }
  // CommonJS may fall through an existing directory lacking a requested
  // entry/subpath. Measure the conservative possible closure in lookup order.
  return [...candidates];
}

async function enqueuePackage(directory, packages, pending) {
  if (!packages.has(directory)) {
    const entry = {directory, id: String(packages.size),
      manifest: await packageManifest(directory)};
    packages.set(directory, entry);
    pending.push(entry);
  }
  return packages.get(directory).id;
}

async function enqueueInteriorPackages(interiorPackages, packages, pending) {
  for (const directory of interiorPackages) await enqueuePackage(directory, packages, pending);
  interiorPackages.clear();
}

async function installedDependencyTargets(parent, dependency, packages, pending) {
  const directories = await resolveDependencyDirectories(parent, dependency.name);
  if (directories.length === 0) {
    if (!dependency.optional) throw new Error(`${REQUIRED_DEPENDENCY_MISSING}: ${dependency.name}`);
    return [OPTIONAL_ABSENT];
  }
  for (const directory of directories) {
    await enqueuePackage(directory, packages, pending);
  }
  return directories.map((directory) => packages.get(directory).id);
}

async function installedDependencyRecords(root, interiorPackages) {
  const options = [...process.execArgv, process.env.NODE_OPTIONS ?? ''].join(ARGUMENT_SEPARATOR);
  if (PRESERVE_SYMLINKS.test(options.replaceAll(OPTION_UNDERSCORE, OPTION_DASH))) {
    throw new Error(SYMLINK_MODE_UNSUPPORTED);
  }
  const directory = await realpath(root);
  const first = {directory, id: ROOT_PACKAGE_ID, manifest: await packageManifest(directory)};
  const packages = new Map([[directory, first]]);
  const pending = [first];
  const records = [];
  await enqueueInteriorPackages(interiorPackages, packages, pending);
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    if (current !== first) {
      records.push(...await contentRecords(current.directory,
        `${PACKAGE_RECORD_PREFIX}/${current.id}`, new Set(), CONTENT_LAYOUT.INSTALLED,
        current.directory, interiorPackages));
    }
    await enqueueInteriorPackages(interiorPackages, packages, pending);
    for (const dependency of declaredDependencies(current.manifest)) {
      const targets = await installedDependencyTargets(current, dependency, packages, pending);
      records.push({relativePath: `${EDGE_RECORD_PREFIX}/${current.id}/${dependency.name}`,
        content: Buffer.from(JSON.stringify(targets))});
    }
  }
  return records;
}

function contentEntryDisposition(directory, entry, layout, packageRoot) {
  if (layout !== CONTENT_LAYOUT.BUNDLED && entry.name === DEPENDENCY_DIRECTORY) {
    if (layout !== CONTENT_LAYOUT.INSTALLED || directory === packageRoot) return CONTENT_ENTRY.SKIP;
  }
  if (layout === CONTENT_LAYOUT.INSTALLED && entry.isSymbolicLink()) {
    throw new Error(`${UNSUPPORTED_LAYOUT}: ${path.join(directory, entry.name)}`);
  }
  return CONTENT_ENTRY.READ;
}

async function assertContentDirectory(directory, layout) {
  if (layout === CONTENT_LAYOUT.INSTALLED && (await lstat(directory)).isSymbolicLink()) {
    throw new Error(`${UNSUPPORTED_LAYOUT}: ${directory}`);
  }
}

function isInteriorManifest(entry, directory, packageRoot, layout) {
  return layout === CONTENT_LAYOUT.INSTALLED && entry.name === PACKAGE_MANIFEST &&
    path.relative(packageRoot, directory).split(path.sep).includes(DEPENDENCY_DIRECTORY);
}

async function contentRecords(directory, prefix, ancestors = new Set(),
  layout = CONTENT_LAYOUT.LOCKED, packageRoot = directory, interiorPackages = new Set()) {
  await assertContentDirectory(directory, layout);
  const actual = await realpath(directory);
  if (ancestors.has(actual)) {
    throw new Error(DIRECTORY_CYCLE);
  }
  const lineage = new Set([...ancestors, actual]);
  const records = [];
  const entries = await readdir(directory, {withFileTypes: true});
  entries.sort((a, b) => a.name < b.name ? -1 : 1);
  for (const entry of entries) {
    // Nested dependency packages each have their own lock entry. Do not
    // accidentally include a dev dependency hoisted beneath a runtime one.
    const disposition = contentEntryDisposition(directory, entry, layout, packageRoot);
    if (disposition === CONTENT_ENTRY.SKIP) continue;
    const absolute = path.join(directory, entry.name);
    const relativePath = `${prefix}/${entry.name}`;
    const shape = await stat(absolute);
    if (shape.isDirectory()) {
      records.push(...await contentRecords(absolute, relativePath, lineage, layout,
        packageRoot, interiorPackages));
    } else if (shape.isFile()) {
      // Follow installed symlinks: the running module consumes their body,
      // so hashing only the link text would not identify executable bytes.
      records.push({relativePath, content: await readFile(absolute)});
      if (isInteriorManifest(entry, directory, packageRoot, layout)) {
        interiorPackages.add(actual);
      }
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
  const lockBytes = await dependencyLockBytes(root);
  const layout = lockBytes === null ? CONTENT_LAYOUT.INSTALLED : CONTENT_LAYOUT.LOCKED;
  const interiorPackages = new Set();
  const source = await contentRecords(path.join(root, SOURCE_DIRECTORY), SOURCE_DIRECTORY,
    new Set(), layout, root, interiorPackages);
  const dependencies = lockBytes === null ?
    await installedDependencyRecords(root, interiorPackages) :
    await productionDependencyRecords(root, JSON.parse(lockBytes));
  const manifests = [
    {relativePath: PACKAGE_MANIFEST, content: await readFile(path.join(root, PACKAGE_MANIFEST))},
  ];
  if (lockBytes !== null) manifests.push({relativePath: DEPENDENCY_LOCK, content: lockBytes});
  return Object.freeze({
    sourceDigest: computeContentRecordsFingerprint(source),
    dependencyDigest: computeContentRecordsFingerprint(dependencies),
    manifestDigest: computeContentRecordsFingerprint(manifests),
    dependencyFileCount: dependencies.length,
  });
}

async function measurePackagedDependencies(root) {
  return computeContentRecordsFingerprint(await contentRecords(
    path.join(root, DEPENDENCY_DIRECTORY), DEPENDENCY_DIRECTORY,
    new Set(), CONTENT_LAYOUT.BUNDLED));
}

export {RUNTIME_BUILD_MANIFEST, measurePackagedDependencies, measureRuntimeContent};
