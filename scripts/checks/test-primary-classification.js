#!/usr/bin/env node
// Primary test classification owner (developer-velocity epic V2a).
//
// Exactly one authority assigns every tracked `*.test.js` file one primary
// class: unit, integration, bootstrap, convergence-probe, or packaging.
// The committed manifest `test/shards/primary-classes.json` is generated from
// the deterministic rules below plus the curated shard files; shell globs in
// package.json, shard generation, duration policy, and (later) the proof-cone
// selector all consume it. Smoke stays an overlapping acceptance-manifest
// view, never a primary class.
//
// Fail-closed contract: any test file missing from the manifest, assigned
// twice, assigned an unknown class, or classified by a rule the census cannot
// reproduce is a hard error. Manifest bytes older than the filesystem census
// fail closed as well (`generate-test-primary-classes.js --check`).

import fs from 'node:fs';
import path from 'node:path';

import {
  BOOTSTRAP_DIRECTORY_PREFIX,
  CLASS_SEPARATOR,
  CONVERGENCE_PROBES_SHARD_PATH,
  DIGEST_ALGORITHM_LABEL,
  DIGEST_HEX_WIDTH,
  FNV1A32_OFFSET_BASIS,
  FNV1A32_PRIME,
  INTEGRATION_DIRECTORY_PREFIX,
  INTEGRATION_FILE_SUFFIX,
  PACKAGING_DIRECTORY_PREFIX,
  PRIMARY_CLASSES,
  PRIMARY_CLASS_BOOTSTRAP,
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_INTEGRATION,
  PRIMARY_CLASS_MANIFEST_ID,
  PRIMARY_CLASS_MANIFEST_PATH,
  PRIMARY_CLASS_PACKAGING,
  PRIMARY_CLASS_SCHEMA_VERSION,
  PRIMARY_CLASS_UNIT,
  TEST_FILE_SUFFIX,
} from './test-primary-classification-constants.js';

export {
  PRIMARY_CLASSES,
  PRIMARY_CLASS_BOOTSTRAP,
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_INTEGRATION,
  PRIMARY_CLASS_MANIFEST_PATH,
  PRIMARY_CLASS_PACKAGING,
  PRIMARY_CLASS_SCHEMA_VERSION,
  PRIMARY_CLASS_UNIT,
} from './test-primary-classification-constants.js';


// Ambient-intrinsic hardening (system-guidelines): capture the string
// primitives at module load so a poisoned prototype cannot reroute the
// census.
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const NODE_MODULES_DIRECTORY = 'node_modules';
const UTF8_ENCODING = 'utf8';
const NEWLINE_SEPARATOR = '\n';
const HEX_RADIX = 16;
const PAD_CHARACTER = '0';
const MANIFEST_NOT_OBJECT_PROBLEM = 'manifest is not an object';
const CLASSES_NOT_OBJECT_PROBLEM = 'manifest.classes is not an object';
const HIDDEN_ENTRY_PREFIX = '.';
const PATH_SEPARATOR = path.sep;
const POSIX_SEPARATOR = '/';
const COMMENT_PREFIX = '#';

export function collectTestFiles(root) {
  const testRoot = path.join(root, 'test');
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === NODE_MODULES_DIRECTORY ||
          stringStartsWith(entry.name, HIDDEN_ENTRY_PREFIX)) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (entry.isFile() && stringEndsWith(entry.name, TEST_FILE_SUFFIX)) {
        found.push(stringSplit(path.relative(root, absolute), PATH_SEPARATOR)
          .join(POSIX_SEPARATOR));
      }
    }
  };
  walk(testRoot);
  return found.sort();
}

function readCuratedShard(root, shardPath) {
  const absolute = path.join(root, shardPath);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  const lines = stringSplit(fs.readFileSync(absolute, UTF8_ENCODING), NEWLINE_SEPARATOR);
  return arrayFilter(
    arrayMap(lines, (line) => stringTrim(line)),
    (line) => line.length > 0 && !stringStartsWith(line, COMMENT_PREFIX))
    .sort();
}

// Deterministic classification rules, evaluated in order. Every rule is a
// pure function of the repo-relative path plus the curated convergence-probe
// shard, so the manifest is fully reproducible from the census.
export function classifyTestFile(testPath, convergenceProbes) {
  if (convergenceProbes.has(testPath)) {
    return PRIMARY_CLASS_CONVERGENCE_PROBE;
  }
  if (stringStartsWith(testPath, PACKAGING_DIRECTORY_PREFIX)) {
    return PRIMARY_CLASS_PACKAGING;
  }
  // Directory wins over the `*.integration.test.js` suffix: a bootstrap test
  // exercising integration semantics (e.g.
  // test/bootstrap/fresh-join-via-non-seed-node.integration.test.js) still
  // belongs to the bootstrap lane that runs it.
  if (stringStartsWith(testPath, INTEGRATION_DIRECTORY_PREFIX)) {
    return PRIMARY_CLASS_INTEGRATION;
  }
  if (stringStartsWith(testPath, BOOTSTRAP_DIRECTORY_PREFIX)) {
    return PRIMARY_CLASS_BOOTSTRAP;
  }
  if (stringEndsWith(testPath, INTEGRATION_FILE_SUFFIX)) {
    return PRIMARY_CLASS_INTEGRATION;
  }
  return PRIMARY_CLASS_UNIT;
}

export function derivePrimaryClasses(root) {
  const census = collectTestFiles(root);
  const convergenceProbes = new Set(
    readCuratedShard(root, CONVERGENCE_PROBES_SHARD_PATH));
  const classes = {};
  for (const testPath of census) {
    classes[testPath] = classifyTestFile(testPath, convergenceProbes);
  }
  return {census, classes};
}

export function manifestDigest(classes) {
  // Stable digest over sorted entries; pins generated artifacts to the exact
  // manifest content without a crypto dependency in the hot path.
  const entries = arrayMap(
    Object.keys(classes).sort(),
    (testPath) => `${testPath}${CLASS_SEPARATOR}${classes[testPath]}`)
    .join(NEWLINE_SEPARATOR);
  let hash = FNV1A32_OFFSET_BASIS;
  for (let index = 0; index < entries.length; index += 1) {
    hash ^= entries.charCodeAt(index);
    hash = Math.imul(hash, FNV1A32_PRIME) >>> 0;
  }
  return `${DIGEST_ALGORITHM_LABEL}-${stringPadStart(hash.toString(HEX_RADIX), DIGEST_HEX_WIDTH, PAD_CHARACTER)}`;
}

export function buildManifest(root) {
  const {census, classes} = derivePrimaryClasses(root);
  const counts = {};
  for (const primaryClass of PRIMARY_CLASSES) {
    counts[primaryClass] = 0;
  }
  for (const testPath of Object.keys(classes)) {
    counts[classes[testPath]] += 1;
  }
  return {
    schemaVersion: PRIMARY_CLASS_SCHEMA_VERSION,
    id: PRIMARY_CLASS_MANIFEST_ID,
    classes,
    counts,
    digest: manifestDigest(classes),
    censusSize: census.length,
  };
}

export function loadManifest(root, manifestPath = PRIMARY_CLASS_MANIFEST_PATH) {
  const absolute = path.join(root, manifestPath);
  if (!fs.existsSync(absolute)) {
    return {ok: false, problems: [`primary classification manifest missing: ${manifestPath}`]};
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, UTF8_ENCODING));
  } catch (error) {
    return {ok: false, problems: [`primary classification manifest is not valid JSON: ${error.message}`]};
  }
  return {ok: true, manifest: parsed, problems: []};
}

// The fail-closed census: manifest vs live filesystem. Returns a list of
// human-readable problems; an empty list means the manifest is the exact
// primary-class census of the tree.
export function verifyManifest(root, manifest) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object') {
    return [MANIFEST_NOT_OBJECT_PROBLEM];
  }
  if (manifest.schemaVersion !== PRIMARY_CLASS_SCHEMA_VERSION) {
    problems.push(`unsupported schemaVersion: ${manifest.schemaVersion}`);
  }
  const classes = manifest.classes;
  if (!classes || typeof classes !== 'object' || Array.isArray(classes)) {
    return [...problems, CLASSES_NOT_OBJECT_PROBLEM];
  }

  const validClasses = new Set(PRIMARY_CLASSES);
  const manifestPaths = Object.keys(classes);
  const seen = new Set();
  for (const testPath of manifestPaths) {
    if (seen.has(testPath)) {
      problems.push(`duplicate assignment: ${testPath}`);
    }
    seen.add(testPath);
    if (!validClasses.has(classes[testPath])) {
      problems.push(`unknown class "${classes[testPath]}" for ${testPath}`);
    }
    if (!stringEndsWith(testPath, TEST_FILE_SUFFIX)) {
      problems.push(`non-test path assigned: ${testPath}`);
    }
  }

  const census = collectTestFiles(root);
  const censusSet = new Set(census);
  for (const testPath of census) {
    if (!seen.has(testPath)) {
      problems.push(`unclassified test file: ${testPath}`);
    }
  }
  for (const testPath of manifestPaths) {
    if (!censusSet.has(testPath)) {
      problems.push(`manifest assigns missing test file: ${testPath}`);
    }
  }

  // Rule reproducibility: the stored class must be exactly what the rules
  // derive today. A hand-edited manifest entry fails closed here.
  const {classes: derived} = derivePrimaryClasses(root);
  for (const testPath of census) {
    if (seen.has(testPath) && validClasses.has(classes[testPath]) &&
        derived[testPath] !== classes[testPath]) {
      problems.push(
        `class drift for ${testPath}: manifest="${classes[testPath]}" rules="${derived[testPath]}"`);
    }
  }

  const expectedDigest = manifestDigest(classes);
  if (manifest.digest !== expectedDigest) {
    problems.push(`digest mismatch: manifest="${manifest.digest}" expected="${expectedDigest}"`);
  }
  return problems;
}
