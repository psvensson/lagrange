import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {classifyPath} from '../inventory-ordinal-segments.js';
import {
  OWNER_DEBT,
  OWNER_DEBT_DUPLICATION_IGNORED_FIELDS,
  OWNER_DEBT_GLOB,
  OWNER_DEBT_JAVASCRIPT_EXTENSIONS,
  OWNER_DEBT_SOURCE_DIRECTORIES,
} from './constants.js';

function normalizePath(root, filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  return path.relative(root, resolved).replaceAll(path.sep, OWNER_DEBT.pathSeparator);
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

function listJavaScriptFiles(root) {
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
  for (const directory of OWNER_DEBT_SOURCE_DIRECTORIES) {
    visit(path.join(root, directory));
  }
  return result.sort();
}

function javascriptSourceDigest(root, files) {
  const hash = crypto.createHash(OWNER_DEBT.hashAlgorithm);
  for (const filePath of files) {
    hash.update(filePath).update(OWNER_DEBT.nullSeparator)
      .update(fs.readFileSync(path.join(root, filePath)));
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
  listJavaScriptFiles,
  logicalJsonIdentity,
  normalizePath,
  ownerAreaForPath,
  readJson,
  reconcileAssignments,
  sha256,
  signalId,
};
