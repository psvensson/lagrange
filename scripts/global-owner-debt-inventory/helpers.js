import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {classifyPath} from '../inventory-ordinal-segments.js';
import {
  OWNER_DEBT,
  OWNER_DEBT_DUPLICATION_IGNORED_FIELDS,
  OWNER_DEBT_GLOB,
  OWNER_DEBT_IMPORT_GRAPH_INPUT_AUTHORITIES,
  OWNER_DEBT_IMPORT_GRAPH_INPUT_DIRECTORIES,
  OWNER_DEBT_JAVASCRIPT_EXTENSIONS,
  OWNER_DEBT_RESOLVER_STATE,
  OWNER_DEBT_SOURCE_DIRECTORIES,
} from './constants.js';

const NODE_MODULES_DIRECTORY = 'node_modules';
const PACKAGE_MANIFEST_NAME = 'package.json';
const PACKAGE_SCOPE_PREFIX = '@';
const RESOLVER_ENTRY_ABSENT = 'absent';
const RESOLVER_ENTRY_DIRECTORY = 'directory';
const RESOLVER_ENTRY_FILE = 'file';
const RESOLVER_ENTRY_SYMLINK = 'symlink';
const RESOLVER_MAX_DEPTH = 64;
const RESOLVER_MAX_ENTRIES = 250_000;
const RESOLVER_MAX_FILE_BYTES = 16 * 1024 * 1024;
const RESOLVER_ERROR_CODE_HYPHEN = '-';
const RESOLVER_ERROR_CODE_UNDERSCORE = '_';
const RESOLVER_PARENT_PATH = '..';
const RESOLVER_PARENT_PREFIX = '../';
const RESOLVER_BACKSLASH = '\\';
const RESOLVER_DEPTH_BUDGET = 'depth-budget';
const RESOLVER_ENTRY_BUDGET = 'entry-budget';
const RESOLVER_NONCANONICAL_PATH = 'noncanonical-path';
const RESOLVER_PATH_SEPARATOR = '/';
const RESOLVER_ESCAPE = 'escape';
const RESOLVER_ERROR_ELOOP = 'ELOOP';
const RESOLVER_SYMLINK_CYCLE = 'symlink-cycle';
const RESOLVER_IO = 'io';
const RESOLVER_ERROR_ENOENT = 'ENOENT';
const RESOLVER_ERROR_ENOTDIR = 'ENOTDIR';
const RESOLVER_FILE_BUDGET = 'file-budget';
const RESOLVER_CURRENT_DIRECTORY = '.';
const RESOLVER_IMPORTS_PREFIX = '#';
const RESOLVER_NONCANONICAL_PROBE = 'noncanonical-probe';
const stringSplit = Function.call.bind(String.prototype.split);

function normalizePath(root, filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  return path.relative(root, resolved).replaceAll(path.sep, OWNER_DEBT.pathSeparator);
}

// A dependency reached through a symlinked directory under root (the publish
// gate links node_modules into a temporary worktree) resolves to the
// symlink target's realpath, which escapes root and yields a `../` path.
// Map that realpath back onto the logical symlinked location so the
// resolver probe sees the canonical worktree-relative form.
function normalizePathThroughSymlinkedRoot(root, filePath) {
  const relative = normalizePath(root, filePath);
  if (!relative.startsWith(RESOLVER_PARENT_PREFIX) &&
      relative !== RESOLVER_PARENT_PATH) {
    return relative;
  }
  const resolved = path.isAbsolute(filePath) ?
    filePath :
    path.resolve(root, filePath);
  let entries;
  try {
    entries = fs.readdirSync(root, {withFileTypes: true});
  } catch {
    return relative;
  }
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    let targetReal;
    try {
      targetReal = fs.realpathSync(path.join(root, entry.name));
    } catch {
      continue;
    }
    if (resolved === targetReal ||
        resolved.startsWith(`${targetReal}${path.sep}`)) {
      const suffix = resolved.slice(targetReal.length);
      return normalizePath(root, path.join(root, entry.name, suffix));
    }
  }
  return relative;
}

function sha256(value) {
  return crypto.createHash(OWNER_DEBT.hashAlgorithm).update(value)
    .digest(OWNER_DEBT.hashEncoding);
}

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath),
    OWNER_DEBT.encodingUtf8));
}

function fileIdentity(root, relativePath) {
  const content = fs.readFileSync(path.join(root, relativePath));
  return {path: relativePath, bytes: content.length, sha256: sha256(content)};
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalizeJson(entry)]));
}

function logicalJsonIdentity(relativePath, value, ignoredFields = []) {
  const ignored = new Set(ignoredFields);
  const projected = Object.fromEntries(Object.entries(value)
    .filter(([key]) => !ignored.has(key)));
  return {
    path: relativePath,
    identityKind: OWNER_DEBT.identityLogicalJson,
    ignoredFields: [...ignored].sort(),
    sha256: sha256(JSON.stringify(canonicalizeJson(projected))),
  };
}

function duplicationReportIdentity(relativePath, report) {
  const statistics = {...report.statistics};
  delete statistics.detectionDate;
  return logicalJsonIdentity(relativePath, {statistics},
    OWNER_DEBT_DUPLICATION_IGNORED_FIELDS);
}

function listJavaScriptFilesIn(root, directories) {
  const result = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() &&
          OWNER_DEBT_JAVASCRIPT_EXTENSIONS.has(path.extname(entry.name))) {
        result.push(normalizePath(root, absolute));
      }
    }
  };
  for (const directory of directories) {
    const absolute = path.join(root, directory);
    if (fs.existsSync(absolute)) visit(absolute);
  }
  return result.sort();
}

function listJavaScriptFiles(root) {
  return listJavaScriptFilesIn(root, OWNER_DEBT_SOURCE_DIRECTORIES);
}

function listImportGraphInputFiles(root) {
  const inputs = listJavaScriptFilesIn(
    root, OWNER_DEBT_IMPORT_GRAPH_INPUT_DIRECTORIES);
  for (const authority of OWNER_DEBT_IMPORT_GRAPH_INPUT_AUTHORITIES) {
    if (fs.existsSync(path.join(root, authority))) inputs.push(authority);
  }
  return [...new Set(inputs)].sort();
}

function javascriptSourceDigest(root, files) {
  const hash = crypto.createHash(OWNER_DEBT.hashAlgorithm);
  for (const filePath of files) {
    hash.update(filePath).update(OWNER_DEBT.nullSeparator)
      .update(fs.readFileSync(path.join(root, filePath)));
  }
  return hash.digest(OWNER_DEBT.hashEncoding);
}

function updateResolverField(hash, value) {
  hash.update(String(value)).update(OWNER_DEBT.nullSeparator);
}

function resolverSurfaceError(code, relativePath) {
  const error = new Error(`resolver surface ${code}: ${relativePath}`);
  error.code = `RESOLVER_SURFACE_${code.toUpperCase().replaceAll(
    RESOLVER_ERROR_CODE_HYPHEN, RESOLVER_ERROR_CODE_UNDERSCORE)}`;
  return error;
}

function isCanonicalResolverPath(relativePath) {
  return typeof relativePath === 'string' && relativePath.length > 0 &&
    !path.posix.isAbsolute(relativePath) &&
    path.posix.normalize(relativePath) === relativePath &&
    relativePath !== RESOLVER_PARENT_PATH &&
    !relativePath.startsWith(RESOLVER_PARENT_PREFIX) &&
    !relativePath.includes(RESOLVER_BACKSLASH);
}

function resolverContext(root) {
  return {
    rootReal: fs.realpathSync(root),
    cache: new Map(),
    visiting: new Set(),
    entries: 0,
    fileBytes: 0,
  };
}

function assertResolverBudget(context, relativePath, depth, entryCount = 0) {
  if (depth > RESOLVER_MAX_DEPTH) {
    throw resolverSurfaceError(RESOLVER_DEPTH_BUDGET, relativePath);
  }
  context.entries += entryCount;
  if (context.entries > RESOLVER_MAX_ENTRIES) {
    throw resolverSurfaceError(RESOLVER_ENTRY_BUDGET, relativePath);
  }
}

function resolverAbsolute(context, relativePath) {
  if (!isCanonicalResolverPath(relativePath)) {
    throw resolverSurfaceError(RESOLVER_NONCANONICAL_PATH, String(relativePath));
  }
  return path.join(
    context.rootReal, ...relativePath.split(RESOLVER_PATH_SEPARATOR));
}

function containedResolverTarget(context, absolute, relativePath) {
  let existing = absolute;
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) {
      throw resolverSurfaceError(RESOLVER_ESCAPE, relativePath);
    }
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  let realExisting;
  try {
    realExisting = fs.realpathSync(existing);
  } catch (error) {
    throw resolverSurfaceError(error.code === RESOLVER_ERROR_ELOOP ?
      RESOLVER_SYMLINK_CYCLE : RESOLVER_IO, relativePath);
  }
  const projected = path.resolve(realExisting, ...missing);
  const inside = projected === context.rootReal ||
    projected.startsWith(`${context.rootReal}${path.sep}`);
  if (!inside) throw resolverSurfaceError(RESOLVER_ESCAPE, relativePath);
  return normalizePath(context.rootReal, projected);
}

function resolverEntryKind(entry) {
  if (entry.isDirectory()) return RESOLVER_ENTRY_DIRECTORY;
  if (entry.isSymbolicLink()) return RESOLVER_ENTRY_SYMLINK;
  return RESOLVER_ENTRY_FILE;
}

function shouldVisitResolverEntry(recursive, bindFollowedContent, entry) {
  if (!recursive || entry.name === NODE_MODULES_DIRECTORY) return false;
  return entry.isDirectory() || entry.isSymbolicLink() ||
    entry.name === PACKAGE_MANIFEST_NAME ||
    (bindFollowedContent && entry.isFile());
}

function resolvedSymlinkTarget(context, relativePath, target) {
  const absolute = path.resolve(
    path.dirname(resolverAbsolute(context, relativePath)), target);
  return containedResolverTarget(context, absolute, relativePath);
}

function resolverStat(absolute, relativePath) {
  try {
    return fs.lstatSync(absolute);
  } catch (error) {
    if (error.code === RESOLVER_ERROR_ENOENT ||
        error.code === RESOLVER_ERROR_ENOTDIR) return null;
    throw resolverSurfaceError(error.code === RESOLVER_ERROR_ELOOP ?
      RESOLVER_SYMLINK_CYCLE : RESOLVER_IO, relativePath);
  }
}

function updateSymlinkSurface(hash, context, relativePath, recursive,
  bindFollowedContent, bindPackageRootContent, depth, absolute) {
  updateResolverField(hash, RESOLVER_ENTRY_SYMLINK);
  const target = fs.readlinkSync(absolute);
  const resolvedTarget = resolvedSymlinkTarget(context, relativePath, target);
  updateResolverField(hash, resolvedTarget);
  updateResolverField(hash, portableSurfaceDigest(
    context, resolvedTarget, recursive, depth + 1,
    bindFollowedContent || bindPackageRootContent, false, true));
}

function updateFileSurface(hash, context, relativePath, stat, absolute,
  bindFileContent) {
  updateResolverField(hash, RESOLVER_ENTRY_FILE);
  if (!bindFileContent && path.basename(relativePath) !== PACKAGE_MANIFEST_NAME) {
    return;
  }
  context.fileBytes += stat.size;
  if (context.fileBytes > RESOLVER_MAX_FILE_BYTES) {
    throw resolverSurfaceError(RESOLVER_FILE_BUDGET, relativePath);
  }
  hash.update(fs.readFileSync(absolute)).update(OWNER_DEBT.nullSeparator);
}

function updateDirectorySurface(hash, context, relativePath, recursive, depth,
  absolute, bindFollowedContent) {
  updateResolverField(hash, RESOLVER_ENTRY_DIRECTORY);
  const entries = fs.readdirSync(absolute, {withFileTypes: true})
    .sort((left, right) => left.name.localeCompare(right.name));
  assertResolverBudget(context, relativePath, depth, entries.length);
  for (const entry of entries) {
    updateResolverField(hash, entry.name);
    updateResolverField(hash, resolverEntryKind(entry));
    if (shouldVisitResolverEntry(recursive, bindFollowedContent, entry)) {
      updateResolverField(hash, portableSurfaceDigest(
        context, path.posix.join(relativePath, entry.name), recursive,
        depth + 1, bindFollowedContent));
    }
  }
}

function portableSurfaceDigest(context, relativePath, recursive, depth = 0,
  bindFollowedContent = false, bindPackageRootContent = false,
  bindFileContent = false) {
  assertResolverBudget(context, relativePath, depth);
  const cacheKey = JSON.stringify([
    relativePath, recursive, bindFollowedContent, bindPackageRootContent,
    bindFileContent,
  ]);
  if (context.cache.has(cacheKey)) return context.cache.get(cacheKey);
  if (context.visiting.has(cacheKey)) {
    throw resolverSurfaceError(RESOLVER_SYMLINK_CYCLE, relativePath);
  }
  const hash = crypto.createHash(OWNER_DEBT.hashAlgorithm);
  const absolute = resolverAbsolute(context, relativePath);
  updateResolverField(hash, relativePath);
  context.visiting.add(cacheKey);
  const stat = resolverStat(absolute, relativePath);
  if (stat === null) {
    updateResolverField(hash, RESOLVER_ENTRY_ABSENT);
  } else if (stat.isSymbolicLink()) {
    updateSymlinkSurface(
      hash, context, relativePath, recursive, bindFollowedContent,
      bindPackageRootContent, depth, absolute);
  } else if (stat.isDirectory()) {
    updateDirectorySurface(
      hash, context, relativePath, recursive, depth, absolute,
      bindFollowedContent);
  } else {
    updateFileSurface(
      hash, context, relativePath, stat, absolute,
      bindFollowedContent || bindFileContent);
  }
  const digest = hash.digest(OWNER_DEBT.hashEncoding);
  context.visiting.delete(cacheKey);
  context.cache.set(cacheKey, digest);
  return digest;
}

function updatePortableSurface(hash, context, relativePath, recursive,
  bindPackageRootContent = false) {
  updateResolverField(
    hash, portableSurfaceDigest(
      context, relativePath, recursive, 0, false, bindPackageRootContent));
}

function packageNameFromSpecifier(specifier) {
  const segments = stringSplit(specifier, OWNER_DEBT.pathSeparator);
  if (specifier[0] === PACKAGE_SCOPE_PREFIX && segments.length > 1) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}

function isBarePackageSpecifier(specifier) {
  const packageName = packageNameFromSpecifier(specifier);
  return Boolean(packageName) && specifier[0] !== RESOLVER_CURRENT_DIRECTORY &&
    specifier[0] !== OWNER_DEBT.pathSeparator &&
    specifier[0] !== RESOLVER_IMPORTS_PREFIX;
}

function resolverLookupPackageRoots(importer, specifier) {
  const packageName = packageNameFromSpecifier(specifier);
  const roots = [];
  let directory = path.posix.dirname(importer);
  while (true) {
    roots.push(path.posix.join(
      directory, NODE_MODULES_DIRECTORY, packageName));
    if (directory === RESOLVER_CURRENT_DIRECTORY) return roots;
    directory = path.posix.dirname(directory);
  }
}

function packageRootFromTarget(target) {
  const segments = stringSplit(target, OWNER_DEBT.pathSeparator);
  if (segments[0] !== NODE_MODULES_DIRECTORY || segments.length < 2) return null;
  const packageSegments = segments[1][0] === PACKAGE_SCOPE_PREFIX ?
    segments.slice(0, 3) : segments.slice(0, 2);
  return packageSegments.join(OWNER_DEBT.pathSeparator);
}

function resolvedCandidateDirectories(target, packageRoot) {
  const result = [];
  let candidate = path.posix.dirname(target);
  while (candidate === packageRoot ||
      candidate.startsWith(`${packageRoot}${OWNER_DEBT.pathSeparator}`)) {
    result.push(candidate);
    if (candidate === packageRoot) break;
    candidate = path.posix.dirname(candidate);
  }
  return result.reverse();
}

function assertCanonicalResolverProbe(probe) {
  if (!isCanonicalResolverPath(probe.from) ||
      (probe.state === OWNER_DEBT_RESOLVER_STATE.resolved &&
        !isCanonicalResolverPath(probe.target))) {
    throw resolverSurfaceError(RESOLVER_NONCANONICAL_PROBE, probe.from);
  }
}

function updateLookupPackageRoots(hash, context, probe) {
  for (const packageRoot of resolverLookupPackageRoots(
    probe.from, probe.specifier)) {
    updatePortableSurface(hash, context, packageRoot, true, true);
  }
}

function updateProbeSurface(hash, context, probe) {
  assertCanonicalResolverProbe(probe);
  updateResolverField(hash, probe.from);
  updateResolverField(hash, probe.specifier);
  updateResolverField(hash, probe.state);
  if (probe.state === OWNER_DEBT_RESOLVER_STATE.resolved) {
    updatePortableSurface(hash, context, probe.target, false);
    updatePortableSurface(hash, context, path.posix.dirname(probe.target), false);
    const packageRoot = packageRootFromTarget(probe.target);
    if (packageRoot) {
      updatePortableSurface(
        hash, context, path.posix.join(
          packageRoot, PACKAGE_MANIFEST_NAME), false);
      for (const directory of resolvedCandidateDirectories(
        probe.target, packageRoot)) {
        updatePortableSurface(hash, context, directory, false);
      }
    }
    if (isBarePackageSpecifier(probe.specifier)) {
      updateLookupPackageRoots(hash, context, probe);
    }
    return;
  }
  if (isBarePackageSpecifier(probe.specifier)) {
    updateLookupPackageRoots(hash, context, probe);
    return;
  }
  const importerDirectory = path.posix.dirname(probe.from);
  const candidate = path.posix.normalize(path.posix.join(
    importerDirectory, probe.specifier));
  updatePortableSurface(hash, context, candidate, false);
  updatePortableSurface(hash, context, path.posix.dirname(candidate), false);
}

function importGraphResolverStateDigest(root, resolverInputs = []) {
  const hash = crypto.createHash(OWNER_DEBT.hashAlgorithm);
  const context = resolverContext(root);
  for (const probe of resolverInputs) {
    updateProbeSurface(hash, context, probe);
  }
  return hash.digest(OWNER_DEBT.hashEncoding);
}

function globPatternToRegex(pattern) {
  let source = OWNER_DEBT_GLOB.start;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === OWNER_DEBT_GLOB.wildcard &&
        pattern[index + 1] === OWNER_DEBT_GLOB.wildcard) {
      const followedBySlash = pattern[index + 2] === OWNER_DEBT.pathSeparator;
      source += followedBySlash ? OWNER_DEBT_GLOB.recursiveDirectory :
        OWNER_DEBT_GLOB.recursive;
      index += followedBySlash ? 2 : 1;
      continue;
    }
    if (character === OWNER_DEBT_GLOB.wildcard) {
      source += OWNER_DEBT_GLOB.oneSegment;
      continue;
    }
    if (character === OWNER_DEBT_GLOB.single) {
      source += OWNER_DEBT_GLOB.oneCharacter;
      continue;
    }
    source += OWNER_DEBT_GLOB.specialCharacters.includes(character) ?
      `\\${character}` : character;
  }
  return new RegExp(`${source}$`, OWNER_DEBT_GLOB.unicodeFlag);
}

function ownerAreaForPath(filePath) {
  const segments = filePath.split(OWNER_DEBT.pathSeparator);
  if (segments[0] === OWNER_DEBT.testDirectory &&
      segments[1] === OWNER_DEBT.distributedDirectory && segments[2]) {
    return `${OWNER_DEBT.testDirectory}/${OWNER_DEBT.distributedDirectory}/` +
      segments[2];
  }
  return segments.length > 1 ? `${segments[0]}/${segments[1]}` : segments[0];
}

function classifyDebtPath(filePath) {
  const segments = filePath.split(OWNER_DEBT.pathSeparator);
  if (segments[0] === OWNER_DEBT.sourceDirectory) {
    const declared = classifyPath(filePath);
    if (!declared.boundary.endsWith(OWNER_DEBT.semanticFallbackSuffix)) {
      return {
        key: `semantic:${declared.owner}/${declared.boundary}`,
        owner: declared.owner,
        boundary: declared.boundary,
        classification: OWNER_DEBT.classDeclaredOwner,
        ownerArea: ownerAreaForPath(filePath),
      };
    }
    return {
      key: `area:${ownerAreaForPath(filePath)}`,
      owner: null,
      boundary: ownerAreaForPath(filePath),
      classification: OWNER_DEBT.classOwnerAreaFallback,
      ownerArea: ownerAreaForPath(filePath),
    };
  }
  return {
    key: `area:${ownerAreaForPath(filePath)}`,
    owner: null,
    boundary: ownerAreaForPath(filePath),
    classification: segments[0] === OWNER_DEBT.testDirectory ?
      OWNER_DEBT.classTestOwnerArea : OWNER_DEBT.classToolOwnerArea,
    ownerArea: ownerAreaForPath(filePath),
  };
}

function signalId(kind, fields) {
  return sha256(`${kind}${OWNER_DEBT.nullSeparator}` +
    fields.join(OWNER_DEBT.nullSeparator));
}

function reconcileAssignments(sourceSignals, assignments) {
  const sourceIds = new Set(sourceSignals.map((signal) => signal.id));
  if (sourceIds.size !== sourceSignals.length) {
    throw new Error(OWNER_DEBT.assignmentDuplicateError);
  }
  const counts = new Map();
  for (const assignment of assignments) {
    if (!sourceIds.has(assignment.id)) {
      throw new Error(`assignment references unknown signal ${assignment.id}`);
    }
    if (!assignment.boundaryKey) {
      throw new Error(`assignment is missing a boundary for ${assignment.id}`);
    }
    counts.set(assignment.id, (counts.get(assignment.id) || 0) + 1);
  }
  const missing = [...sourceIds].filter((id) => !counts.has(id));
  const repeated = [...counts].filter(([, count]) => count !== 1);
  if (missing.length > 0) {
    throw new Error(`${missing.length} debt signal(s) are unassigned`);
  }
  if (repeated.length > 0) {
    throw new Error(`${repeated.length} debt signal(s) are assigned more than once`);
  }
  return {
    sourceSignalCount: sourceSignals.length,
    assignedSignalCount: assignments.length,
    uniqueAssignmentCount: counts.size,
    digest: sha256(assignments
      .map((item) => `${item.id}${OWNER_DEBT.nullSeparator}${item.boundaryKey}`)
      .sort()
      .join(OWNER_DEBT.newline)),
  };
}

export {
  classifyDebtPath,
  duplicationReportIdentity,
  fileIdentity,
  globPatternToRegex,
  javascriptSourceDigest,
  importGraphResolverStateDigest,
  isBarePackageSpecifier,
  listImportGraphInputFiles,
  listJavaScriptFiles,
  logicalJsonIdentity,
  normalizePath,
  normalizePathThroughSymlinkedRoot,
  ownerAreaForPath,
  readJson,
  reconcileAssignments,
  sha256,
  signalId,
};
