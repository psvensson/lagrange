#!/usr/bin/env node
// Resource classification owner.
//
// Exactly one authority assigns every tracked `*.test.js` file one resource
// class: ordinary, cpu-heavy, external-toolchain, or exclusive. This is the
// SECOND, orthogonal dimension alongside the primary class owned by
// test-primary-classification.js — primary says what a test is, resource says
// what it costs to schedule. The gate planner consumes both: primary chooses
// which lane a test belongs to, resource chooses that lane's job count.
//
// Existence of this surface is why "wasm" must not quietly become a synonym
// for a particular shard: a toolchain test declares its cost explicitly and
// keeps whatever primary class it actually has.
//
// Fail-closed contract: any census file missing from the manifest, any path
// claimed by two curated shards, any shard naming a path outside the live
// census, and any unknown class are hard errors.

import fs from 'node:fs';
import path from 'node:path';

import {collectTestFiles} from './test-primary-classification.js';
import {
  RESOURCE_CLASSES,
  RESOURCE_CLASSES_NOT_OBJECT_PROBLEM,
  RESOURCE_CLASS_MANIFEST_ID,
  RESOURCE_CLASS_MANIFEST_PATH,
  RESOURCE_CLASS_ORDINARY,
  RESOURCE_CLASS_SCHEMA_VERSION,
  RESOURCE_CLASS_SEPARATOR,
  RESOURCE_CLASS_SHARD_PATHS,
  RESOURCE_DIGEST_ALGORITHM_LABEL,
  RESOURCE_DIGEST_HEX_WIDTH,
  RESOURCE_DUPLICATE_PATH_PROBLEM,
  RESOURCE_EXTRA_PATH_PROBLEM,
  RESOURCE_FNV1A32_OFFSET_BASIS,
  RESOURCE_FNV1A32_PRIME,
  RESOURCE_MANIFEST_NOT_OBJECT_PROBLEM,
  RESOURCE_MISSING_PATH_PROBLEM,
  RESOURCE_UNKNOWN_CLASS_PROBLEM,
  RESOURCE_UNKNOWN_PATH_PROBLEM,
} from './test-resource-classification-constants.js';

export {
  RESOURCE_CLASSES,
  RESOURCE_CLASS_JOBS,
  RESOURCE_CLASS_MANIFEST_PATH,
  RESOURCE_CLASS_ORDINARY,
  RESOURCE_CLASS_SCHEMA_VERSION,
} from './test-resource-classification-constants.js';

// Ambient-intrinsic hardening (system-guidelines): capture the primitives at
// module load so a poisoned prototype cannot reroute the census.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringSplit = Function.call.bind(String.prototype.split);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);

const UTF8_ENCODING = 'utf8';
const NEWLINE_SEPARATOR = '\n';
const COMMENT_PREFIX = '#';
const HEX_RADIX = 16;
const PAD_CHARACTER = '0';

function readCuratedShard(root, shardPath) {
  const absolute = path.join(root, shardPath);
  if (!fs.existsSync(absolute)) return [];
  const lines = stringSplit(
    fs.readFileSync(absolute, UTF8_ENCODING), NEWLINE_SEPARATOR);
  return arrayFilter(
    arrayMap(lines, (line) => stringTrim(line)),
    (line) => line.length > 0 && !stringStartsWith(line, COMMENT_PREFIX))
    .sort();
}

// Pure function of the census plus the curated shards, so the manifest is
// fully reproducible. Returns the assignment plus every integrity problem
// found while building it (never throws: callers decide fatality).
export function deriveResourceClasses(root) {
  const census = collectTestFiles(root);
  const censusSet = new Set(census);
  const classes = {};
  const problems = [];
  const claimedBy = new Map();
  for (const resourceClass of RESOURCE_CLASSES) {
    const shardPath = RESOURCE_CLASS_SHARD_PATHS[resourceClass];
    if (!shardPath) continue;
    for (const testPath of readCuratedShard(root, shardPath)) {
      if (!censusSet.has(testPath)) {
        problems.push(
          `${RESOURCE_UNKNOWN_PATH_PROBLEM}: ${shardPath} -> ${testPath}`);
        continue;
      }
      const previous = claimedBy.get(testPath);
      if (previous) {
        problems.push(
          `${RESOURCE_DUPLICATE_PATH_PROBLEM}: ${testPath} ` +
          `(${previous}, ${resourceClass})`);
        continue;
      }
      claimedBy.set(testPath, resourceClass);
      classes[testPath] = resourceClass;
    }
  }
  for (const testPath of census) {
    if (classes[testPath] === undefined) {
      classes[testPath] = RESOURCE_CLASS_ORDINARY;
    }
  }
  return {census, classes, problems};
}

export function resourceManifestDigest(classes) {
  const entries = arrayMap(
    Object.keys(classes).sort(),
    (testPath) => `${testPath}${RESOURCE_CLASS_SEPARATOR}${classes[testPath]}`)
    .join(NEWLINE_SEPARATOR);
  let hash = RESOURCE_FNV1A32_OFFSET_BASIS;
  for (let index = 0; index < entries.length; index += 1) {
    hash ^= entries.charCodeAt(index);
    hash = Math.imul(hash, RESOURCE_FNV1A32_PRIME) >>> 0;
  }
  const hex = stringPadStart(
    hash.toString(HEX_RADIX), RESOURCE_DIGEST_HEX_WIDTH, PAD_CHARACTER);
  return `${RESOURCE_DIGEST_ALGORITHM_LABEL}-${hex}`;
}

export function buildResourceManifest(root) {
  const {census, classes, problems} = deriveResourceClasses(root);
  const counts = {};
  for (const resourceClass of RESOURCE_CLASSES) counts[resourceClass] = 0;
  for (const testPath of Object.keys(classes)) counts[classes[testPath]] += 1;
  return {
    schemaVersion: RESOURCE_CLASS_SCHEMA_VERSION,
    id: RESOURCE_CLASS_MANIFEST_ID,
    counts,
    censusSize: census.length,
    digest: resourceManifestDigest(classes),
    classes,
    problems,
  };
}

export function loadResourceManifest(
  root, manifestPath = RESOURCE_CLASS_MANIFEST_PATH) {
  const absolute = path.join(root, manifestPath);
  if (!fs.existsSync(absolute)) {
    return {ok: false, problems: [`resource manifest missing: ${manifestPath}`]};
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, UTF8_ENCODING));
  } catch (error) {
    return {ok: false, problems: [`resource manifest unreadable: ${error.message}`]};
  }
  if (!parsed || typeof parsed !== 'object') {
    return {ok: false, problems: [RESOURCE_MANIFEST_NOT_OBJECT_PROBLEM]};
  }
  if (!parsed.classes || typeof parsed.classes !== 'object') {
    return {ok: false, problems: [RESOURCE_CLASSES_NOT_OBJECT_PROBLEM]};
  }
  return {ok: true, manifest: parsed, problems: []};
}

// Fail-closed comparison of the committed manifest against the live census.
export function verifyResourceManifest(root, manifestPath) {
  const loaded = loadResourceManifest(root, manifestPath);
  if (!loaded.ok) return {ok: false, problems: loaded.problems};
  const derived = buildResourceManifest(root);
  const problems = [...derived.problems];
  const committed = loaded.manifest.classes;
  for (const testPath of Object.keys(derived.classes)) {
    if (committed[testPath] === undefined) {
      problems.push(`${RESOURCE_MISSING_PATH_PROBLEM}: ${testPath}`);
    }
  }
  for (const testPath of Object.keys(committed)) {
    const assigned = committed[testPath];
    if (derived.classes[testPath] === undefined) {
      problems.push(`${RESOURCE_EXTRA_PATH_PROBLEM}: ${testPath}`);
      continue;
    }
    if (!arrayIncludes(RESOURCE_CLASSES, assigned)) {
      problems.push(`${RESOURCE_UNKNOWN_CLASS_PROBLEM}: ${testPath} -> ${assigned}`);
    }
  }
  if (loaded.manifest.digest !== derived.digest) {
    problems.push(
      `resource manifest digest drift: committed ${loaded.manifest.digest}, ` +
      `census ${derived.digest}`);
  }
  return {ok: problems.length === 0, problems, derived};
}

// The gate planner's question: which files run in this lane, at what jobs.
export function testsForResourceClass(manifest, resourceClass) {
  return arrayFilter(
    Object.keys(manifest.classes),
    (testPath) => manifest.classes[testPath] === resourceClass).sort();
}
