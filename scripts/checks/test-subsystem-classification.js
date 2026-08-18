#!/usr/bin/env node
// Subsystem classification owner.
//
// Exactly one authority assigns every tracked `*.test.js` file exactly one
// subsystem — the product responsibility it proves. This is the THIRD
// orthogonal dimension alongside primary (what kind of proof) and resource
// (how it may execute); see the constants module for why the three are
// independent.
//
// EVALUATION IS ALL-RULES, NEVER FIRST-MATCH:
//
//   exact override?  yes -> exactly that subsystem
//                    no  -> evaluate EVERY general rule
//   0 matches -> FAIL unclassified
//   1 match   -> classify
//   >1 match  -> FAIL ambiguous, naming every matching rule
//
// Rule order is presentation only. Disjointness is a property of the patterns,
// proven by the ambiguity audit rather than hidden behind precedence. A
// first-match chain would let a reordering silently change what CI runs.
//
// There is deliberately no fallback subsystem. A test the taxonomy cannot
// place must fail by name, because silent under-classification looks exactly
// like correct classification.

import {collectTestFiles} from './test-primary-classification.js';
import {
  SUBSYSTEM_AMBIGUOUS_PROBLEM,
  SUBSYSTEM_DEAD_OVERRIDE_PROBLEM,
  SUBSYSTEM_DEAD_RULE_PROBLEM,
  SUBSYSTEM_DIGEST_ALGORITHM_LABEL,
  SUBSYSTEM_DIGEST_HEX_WIDTH,
  SUBSYSTEM_EMPTY_SUBSYSTEM_PROBLEM,
  SUBSYSTEM_FNV1A32_OFFSET_BASIS,
  SUBSYSTEM_FNV1A32_PRIME,
  SUBSYSTEM_MANIFEST_ID,
  SUBSYSTEM_OVERRIDES,
  SUBSYSTEM_RULES,
  SUBSYSTEM_OVERRIDE_REASON_PROBLEM,
  SUBSYSTEM_SCHEMA_VERSION,
  SUBSYSTEM_SEPARATOR,
  SUBSYSTEM_UNCLASSIFIED_PROBLEM,
  SUBSYSTEM_UNKNOWN_SUBSYSTEM_PROBLEM,
  SUBSYSTEMS,
} from './test-subsystem-classification-constants.js';

export {
  SUBSYSTEM_MANIFEST_PATH,
  SUBSYSTEM_OVERRIDES,
  SUBSYSTEM_RULES,
  SUBSYSTEM_SCHEMA_VERSION,
  SUBSYSTEMS,
} from './test-subsystem-classification-constants.js';

// Ambient-intrinsic hardening (system-guidelines): capture the primitives at
// module load so a poisoned prototype cannot reroute the census.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const regExpTest = Function.call.bind(RegExp.prototype.test);

const NEWLINE_SEPARATOR = '\n';
const HEX_RADIX = 16;
const PAD_CHARACTER = '0';
const RULE_JOIN = ' + ';
const OVERRIDE_RULE_ID = 'override';

// Every rule whose pattern matches. Callers decide what 0 or >1 means; this
// function never picks a winner.
export function subsystemRulesMatching(testPath) {
  return arrayFilter(SUBSYSTEM_RULES, (rule) => regExpTest(rule.pattern, testPath));
}

function classifyOne(testPath) {
  const override = Object.hasOwn(SUBSYSTEM_OVERRIDES, testPath) ?
    SUBSYSTEM_OVERRIDES[testPath] : null;
  if (override) {
    return {
      subsystem: override.subsystem,
      rule: OVERRIDE_RULE_ID,
      reason: override.reason,
      matched: 1,
    };
  }
  const hits = subsystemRulesMatching(testPath);
  if (hits.length === 1) {
    return {subsystem: hits[0].subsystem, rule: hits[0].id, matched: 1};
  }
  return {
    subsystem: null,
    rule: arrayMap(hits, (hit) => `${hit.id}->${hit.subsystem}`).join(RULE_JOIN),
    matched: hits.length,
  };
}

function pushOverrideProblems(censusSet, problems) {
  for (const testPath of Object.keys(SUBSYSTEM_OVERRIDES)) {
    if (!censusSet.has(testPath)) {
      problems.push(`${SUBSYSTEM_DEAD_OVERRIDE_PROBLEM}: ${testPath}`);
      continue;
    }
    if (!SUBSYSTEM_OVERRIDES[testPath].reason) {
      problems.push(`${SUBSYSTEM_OVERRIDE_REASON_PROBLEM}: ${testPath}`);
    }
  }
}

function pushLivenessProblems(ruleHits, counts, problems) {
  for (const rule of SUBSYSTEM_RULES) {
    if (ruleHits.get(rule.id) === 0) {
      problems.push(`${SUBSYSTEM_DEAD_RULE_PROBLEM}: ${rule.id}`);
    }
  }
  for (const subsystem of SUBSYSTEMS) {
    if (!counts[subsystem]) {
      problems.push(`${SUBSYSTEM_EMPTY_SUBSYSTEM_PROBLEM}: ${subsystem}`);
    }
  }
}

// Pure function of the live census plus the sealed taxonomy, so the manifest is
// fully reproducible. Returns the assignment plus every integrity problem found
// while building it (never throws: callers decide fatality).
export function deriveSubsystemClasses(root) {
  const census = collectTestFiles(root);
  const censusSet = new Set(census);
  const classes = {};
  const problems = [];
  const ruleHits = new Map(arrayMap(SUBSYSTEM_RULES, (rule) => [rule.id, 0]));
  const counts = {};
  for (const testPath of census) {
    const verdict = classifyOne(testPath);
    if (verdict.matched === 0) {
      problems.push(`${SUBSYSTEM_UNCLASSIFIED_PROBLEM}: ${testPath}`);
      continue;
    }
    if (verdict.matched > 1) {
      problems.push(
        `${SUBSYSTEM_AMBIGUOUS_PROBLEM}: ${testPath} [${verdict.rule}]`);
      continue;
    }
    if (!arrayIncludes(SUBSYSTEMS, verdict.subsystem)) {
      problems.push(
        `${SUBSYSTEM_UNKNOWN_SUBSYSTEM_PROBLEM}: ${testPath} -> ${verdict.subsystem}`);
      continue;
    }
    if (verdict.rule !== OVERRIDE_RULE_ID) {
      ruleHits.set(verdict.rule, ruleHits.get(verdict.rule) + 1);
    }
    classes[testPath] = verdict.subsystem;
    counts[verdict.subsystem] = (counts[verdict.subsystem] || 0) + 1;
  }
  pushOverrideProblems(censusSet, problems);
  pushLivenessProblems(ruleHits, counts, problems);
  return {census, classes, counts, problems};
}

function fnv1a32(input) {
  let hash = SUBSYSTEM_FNV1A32_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, SUBSYSTEM_FNV1A32_PRIME) >>> 0;
  }
  const hex = stringPadStart(
    hash.toString(HEX_RADIX), SUBSYSTEM_DIGEST_HEX_WIDTH, PAD_CHARACTER);
  return `${SUBSYSTEM_DIGEST_ALGORITHM_LABEL}-${hex}`;
}

// The manifest's only digest: path -> subsystem. There is deliberately no second
// digest over rule identity. Three earlier review rounds all failed the same way
// - an extra representation became a thing that itself needed verifying - so the
// rule that placed a test is DERIVED on demand by --explain, never published.
export function subsystemManifestDigest(classes) {
  return fnv1a32(arrayMap(
    Object.keys(classes).sort(),
    (testPath) => `${testPath}${SUBSYSTEM_SEPARATOR}${classes[testPath]}`)
    .join(NEWLINE_SEPARATOR));
}

export function buildSubsystemManifest(root) {
  const {census, classes, counts, problems} = deriveSubsystemClasses(root);
  const sortedCounts = {};
  for (const subsystem of SUBSYSTEMS) {
    if (counts[subsystem]) sortedCounts[subsystem] = counts[subsystem];
  }
  return {
    schemaVersion: SUBSYSTEM_SCHEMA_VERSION,
    id: SUBSYSTEM_MANIFEST_ID,
    counts: sortedCounts,
    censusSize: census.length,
    digest: subsystemManifestDigest(classes),
    classes,
    problems,
  };
}

// Why one test landed where it did. Derived live, so no stored explanation can
// drift from the rules that actually run.
export function explainSubsystemClassification(testPath) {
  if (Object.hasOwn(SUBSYSTEM_OVERRIDES, testPath)) {
    const override = SUBSYSTEM_OVERRIDES[testPath];
    return {
      subsystem: override.subsystem,
      rule: OVERRIDE_RULE_ID,
      reason: override.reason,
    };
  }
  const hits = subsystemRulesMatching(testPath);
  if (hits.length === 1) return {subsystem: hits[0].subsystem, rule: hits[0].id};
  return {
    subsystem: null,
    rule: null,
    matched: arrayMap(hits, (hit) => `${hit.id}->${hit.subsystem}`),
  };
}

// The selector's question, reserved for Stage 2: which files prove this area.
export function testsForSubsystem(manifest, subsystem) {
  return arrayFilter(
    Object.keys(manifest.classes).sort(),
    (testPath) => manifest.classes[testPath] === subsystem);
}
