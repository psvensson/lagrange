#!/usr/bin/env node

// Navigability and fallback patterns: a one-way ratchet per pattern over the
// shared detector module (scripts/checks/code-navigability-detectors.js),
// which owns all detection; this audit only maps detector sites to guideline
// violations, applies one count baseline per pattern and prints the tighten
// hint. docs/development/code-style.md "Navigability and fallback patterns"
// names each pattern and its replacement form.
//
// One owner per gate: a pattern promoted to an ESLint no-restricted-syntax
// entry whose message carries navigability-rule:<pattern> is ESLint's, read
// through the same promotedPatterns reader the budget script uses; the audit
// drops it (no baseline, no violation) and ratchets only the rest.

import {existsSync} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {KEYS} from 'eslint-visitor-keys';

import {
  defaultEslintRunner,
  promotedPatterns,
} from './checks/code-navigability-eslint-promotion.js';
import {EXIT_CODE, SCRIPT_TEXT} from './guideline-check-constants.js';
import {
  OUTPUT_FORMAT,
  applyCountBaseline,
  buildGuidelineViolationReport,
  collectJavaScriptFiles,
  getEnclosingFunctionName,
  formatGuidelineHumanSummary,
  loadCountBaseline,
  runGuidelineCheck,
  runGuidelineCheckWhenDirect,
  writeCountBaseline,
} from './guideline-check-shared.js';
import {printRatchetTighteningHint} from './metric-check-helpers.js';

const RULE_REFERENCE =
  'docs/development/code-style.md "Navigability and fallback patterns": ' +
  'each pattern makes an agent re-derive what an owner is or what a value ' +
  'means; write the replacement form named in the reason instead';

const NAVIGABILITY_PATTERN = Object.freeze({
  OWNER_PORT_FEATURE_DETECTION: 'owner_port_feature_detection',
  IDENTITY_KEYED_MODULE_STATE: 'identity_keyed_module_state',
  PROTOTYPE_COPY_BAGS: 'prototype_copy_bags',
  INHERITANCE_DEPTH_OVER_TWO: 'inheritance_depth_over_two',
  ROW_FIELD_ALIAS_READS: 'row_field_alias_reads',
  STATE_READ_DEFAULTS: 'state_read_defaults',
  VALUE_OR_PROMISE_THEN_CHECKS: 'value_or_promise_then_checks',
  TWO_SOURCE_FALLBACK_READS: 'two_source_fallback_reads',
  TYPEOF_DUAL_PATHS: 'typeof_dual_paths',
  CATCH_RETURNS_DEFAULT: 'catch_returns_default',
  ALIAS_EXPORTS: 'alias_exports',
  LEGACY_TERM_IDENTIFIERS: 'legacy_term_identifiers',
});
const ALL_PATTERNS = Object.freeze(Object.values(NAVIGABILITY_PATTERN));

// Per-file detector export for each pattern; the extends chain is resolved
// across files by detectInheritanceDepthOverTwo(parsedFiles).
const PER_FILE_DETECTOR = Object.freeze({
  [NAVIGABILITY_PATTERN.OWNER_PORT_FEATURE_DETECTION]: 'detectOwnerPortFeatureDetection',
  [NAVIGABILITY_PATTERN.IDENTITY_KEYED_MODULE_STATE]: 'detectIdentityKeyedModuleState',
  [NAVIGABILITY_PATTERN.PROTOTYPE_COPY_BAGS]: 'detectPrototypeCopyBags',
  [NAVIGABILITY_PATTERN.ROW_FIELD_ALIAS_READS]: 'detectRowFieldAliasReads',
  [NAVIGABILITY_PATTERN.STATE_READ_DEFAULTS]: 'detectStateReadDefaults',
  [NAVIGABILITY_PATTERN.VALUE_OR_PROMISE_THEN_CHECKS]: 'detectValueOrPromiseThenChecks',
  [NAVIGABILITY_PATTERN.TWO_SOURCE_FALLBACK_READS]: 'detectTwoSourceFallbackReads',
  [NAVIGABILITY_PATTERN.TYPEOF_DUAL_PATHS]: 'detectTypeofDualPaths',
  [NAVIGABILITY_PATTERN.CATCH_RETURNS_DEFAULT]: 'detectCatchReturnsDefault',
  [NAVIGABILITY_PATTERN.ALIAS_EXPORTS]: 'detectAliasExports',
  [NAVIGABILITY_PATTERN.LEGACY_TERM_IDENTIFIERS]: 'detectLegacyTermIdentifiers',
});

const PATTERN_REPLACEMENT = Object.freeze({
  [NAVIGABILITY_PATTERN.OWNER_PORT_FEATURE_DETECTION]:
    'typeof feature detection on an owner member; take a named collaborator ' +
    'validated once in the constructor instead',
  [NAVIGABILITY_PATTERN.IDENTITY_KEYED_MODULE_STATE]:
    'module-scope identity-keyed state; hold it in an owner-held field instead',
  [NAVIGABILITY_PATTERN.PROTOTYPE_COPY_BAGS]:
    'prototype-copy method bag; write an explicit-context module instead',
  [NAVIGABILITY_PATTERN.INHERITANCE_DEPTH_OVER_TWO]:
    'extends chain deeper than two; compose named collaborators instead',
  [NAVIGABILITY_PATTERN.ROW_FIELD_ALIAS_READS]:
    'one field read in two spellings; decode the row once in one row decoder',
  [NAVIGABILITY_PATTERN.STATE_READ_DEFAULTS]:
    'default on a status, role or step read; decide on a named state instead',
  [NAVIGABILITY_PATTERN.VALUE_OR_PROMISE_THEN_CHECKS]:
    '.then check on a value-or-promise; make the producer always return a promise',
  [NAVIGABILITY_PATTERN.TWO_SOURCE_FALLBACK_READS]:
    'one fact read from two sources; read the one authority for that fact',
  [NAVIGABILITY_PATTERN.TYPEOF_DUAL_PATHS]:
    'typeof dual path; keep one path and delete the other',
  [NAVIGABILITY_PATTERN.CATCH_RETURNS_DEFAULT]:
    'catch that returns a default; surface a typed refusal instead',
  [NAVIGABILITY_PATTERN.ALIAS_EXPORTS]:
    'alias export; import the original name directly',
  [NAVIGABILITY_PATTERN.LEGACY_TERM_IDENTIFIERS]:
    'legacy vocabulary in an identifier; retire the legacy path and its name',
});

const DETECTOR_MODULE_SPECIFIER = './checks/code-navigability-detectors.js';
const CROSS_FILE_DETECTOR = 'detectInheritanceDepthOverTwo';
const DEFAULT_SCAN_ROOTS = Object.freeze(['src']);
const DEFAULT_BASELINE_DIRECTORY_URL = new URL('./', import.meta.url);
const BASELINE_FILE_PREFIX = 'check-guideline-navigability-baseline-';
const BASELINE_FILE_SUFFIX = '.json';
const BASELINE_LABEL_PREFIX = 'navigability ';
const VIOLATION_LABEL = 'navigability';
const PATTERN_FLAG = '--pattern';
const UPDATE_BASELINE_FLAG = '--update-baseline';
const OUTPUT_FLAGS = Object.freeze([OUTPUT_FORMAT.JSON, OUTPUT_FORMAT.INCLUDE_TESTS]);
const INHERITED_SUMMARY_SUFFIX = ' inherited navigability baseline violations';
const IDENTITY_SEPARATOR = '|';
const LIST_SEPARATOR = ', ';
const PATH_SEPARATOR = '/';
const LISTED_VIOLATION_LIMIT = 20;
const PROMOTED_NOTE_PREFIX = 'Promoted to ESLint (audited there, not here): ';

function loadDetectors(options) {
  return options.detectors ?? import(DETECTOR_MODULE_SPECIFIER);
}

// The selected patterns ESLint's resolved configuration for the first
// domain file promotes; an unreadable configuration promotes none, so the
// audit then ratchets every pattern.
async function promotedSelection(patterns, options) {
  const [sampleFile] = await collectJavaScriptFiles(DEFAULT_SCAN_ROOTS[0]);
  const runner = options.eslintRunner ?? defaultEslintRunner;
  return promotedPatterns(process.cwd(),
    runner,
    sampleFile && repoRelativePath(sampleFile),
    patterns);
}

function repoRelativePath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath))
    .split(path.sep).join(PATH_SEPARATOR);
}

function childContainingRange(node, [start, end]) {
  for (const key of KEYS[node.type] ?? []) {
    for (const child of [node[key]].flat()) {
      if (child?.range && child.range[0] <= start && end <= child.range[1]) {
        return child;
      }
    }
  }
  return null;
}

// Bookkeeping, not detection: the innermost function whose range encloses
// the detector's site, named the way every guideline identity names it.
function enclosingFunctionName(ast, range) {
  const chain = [];
  for (let node = ast; node; node = childContainingRange(node, range)) {
    chain.push(node);
  }
  return getEnclosingFunctionName(chain);
}

function siteToViolation(site, pattern, parsed) {
  return {
    filePath: parsed.file,
    line: site.loc.start.line,
    column: site.loc.start.column,
    functionName: enclosingFunctionName(parsed.ast, site.range),
    kind: pattern,
    reason: PATTERN_REPLACEMENT[pattern],
    ruleReference: RULE_REFERENCE,
  };
}

function buildNavigabilityViolationIdentity(violation) {
  return [
    violation.filePath,
    violation.kind,
    violation.functionName,
  ].join(IDENTITY_SEPARATOR);
}

// The extends chain of a scanned class may run through any domain file, so
// the whole domain is parsed and the sites are kept per file for the scan.
async function collectCrossFileViolations(detectors, parsedByFile) {
  for (const root of DEFAULT_SCAN_ROOTS) {
    for (const filePath of await collectJavaScriptFiles(root)) {
      const file = repoRelativePath(filePath);
      const source = await fs.readFile(filePath, SCRIPT_TEXT.ENCODING_UTF8);
      parsedByFile.set(file, detectors.parseNavigabilitySource(source, file));
    }
  }
  const violationsByFile = new Map();
  for (const site of detectors[CROSS_FILE_DETECTOR]([...parsedByFile.values()])) {
    const violation = siteToViolation(
      site, NAVIGABILITY_PATTERN.INHERITANCE_DEPTH_OVER_TWO, parsedByFile.get(site.file));
    violationsByFile.set(site.file,
      [...violationsByFile.get(site.file) ?? [], violation]);
  }
  return violationsByFile;
}

async function collectNavigabilityViolations(pathsToScan, options = {}) {
  const detectors = await loadDetectors(options);
  const patterns = options.patterns ?? ALL_PATTERNS;
  const perFilePatterns = patterns.filter((pattern) => PER_FILE_DETECTOR[pattern]);
  const parsedByFile = new Map();
  const crossFileViolations = patterns.includes(NAVIGABILITY_PATTERN.INHERITANCE_DEPTH_OVER_TWO) ?
    await collectCrossFileViolations(detectors, parsedByFile) :
    new Map();
  const report = await buildGuidelineViolationReport(
    pathsToScan,
    {...options, governedRoots: [...DEFAULT_SCAN_ROOTS]},
    (source, filePath) => {
      const file = repoRelativePath(filePath);
      const parsed = parsedByFile.get(file) ??
        detectors.parseNavigabilitySource(source, file);
      parsedByFile.delete(file);
      return [
        ...perFilePatterns.flatMap((pattern) =>
          detectors[PER_FILE_DETECTOR[pattern]](parsed)
            .map((site) => siteToViolation(site, pattern, parsed))),
        ...crossFileViolations.get(file) ?? [],
      ];
    },
  );
  return {...report, patterns};
}

function baselineFileUrl(pattern, options) {
  return new URL(
    `${BASELINE_FILE_PREFIX}${pattern}${BASELINE_FILE_SUFFIX}`,
    options.baselineDirectoryUrl ?? DEFAULT_BASELINE_DIRECTORY_URL,
  );
}

function countAllowances(baseline) {
  let count = 0;
  for (const allowance of baseline.values()) {
    count += allowance;
  }
  return count;
}

async function collectNavigabilityViolationsWithBaseline(pathsToScan, options = {}) {
  const {patterns, ...report} = await collectNavigabilityViolations(pathsToScan, options);
  const baseline = new Map();
  const patternCounts = [];
  for (const pattern of patterns) {
    const patternBaseline = await loadCountBaseline(
      baselineFileUrl(pattern, options),
      buildNavigabilityViolationIdentity,
    );
    for (const [identity, allowance] of patternBaseline) {
      baseline.set(identity, allowance);
    }
    patternCounts.push({
      pattern,
      rawViolationCount: report.violations.filter((v) => v.kind === pattern).length,
      baselineViolationCount: countAllowances(patternBaseline),
    });
  }
  return {
    ...applyCountBaseline(report, baseline, buildNavigabilityViolationIdentity),
    patternCounts,
  };
}

function formatHumanSummary(report) {
  const lines = [formatGuidelineHumanSummary(report, VIOLATION_LABEL)];
  for (const violation of report.violations.slice(0, LISTED_VIOLATION_LIMIT)) {
    lines.push(`${violation.filePath}:${violation.line} ${violation.functionName} ` +
      `${violation.kind}: ${violation.reason}`);
  }
  lines.push(`Matched ${report.inheritedViolationCount}${INHERITED_SUMMARY_SUFFIX}`);
  return lines.join(SCRIPT_TEXT.NEWLINE);
}

function printTighteningHints(report, options) {
  for (const entry of report.patternCounts) {
    printRatchetTighteningHint(
      `${BASELINE_LABEL_PREFIX}${entry.pattern}`,
      entry.rawViolationCount,
      entry.baselineViolationCount,
      repoRelativePath(fileURLToPath(baselineFileUrl(entry.pattern, options))),
    );
  }
}

// Baseline writes seal the current count and may only lower it afterwards:
// a pattern whose count grew keeps its recorded file and fails the update.
async function updateNavigabilityBaselines(pathsToScan, options) {
  if (pathsToScan.length > 0) {
    process.stderr.write(`${UPDATE_BASELINE_FLAG} scans the whole governed domain; ` +
      `drop the path arguments: ${pathsToScan.join(LIST_SEPARATOR)}\n`);
    return EXIT_CODE.USAGE;
  }
  const report = await collectNavigabilityViolations([], options);
  let exitCode = EXIT_CODE.SUCCESS;
  for (const pattern of report.patterns) {
    const fileUrl = baselineFileUrl(pattern, options);
    const violations = report.violations.filter((v) => v.kind === pattern);
    const recordedCount = existsSync(fileUrl) ?
      countAllowances(await loadCountBaseline(fileUrl, buildNavigabilityViolationIdentity)) :
      Number.POSITIVE_INFINITY;
    if (violations.length > recordedCount) {
      process.stderr.write(`Refusing to raise the ${pattern} baseline from ` +
        `${recordedCount} to ${violations.length}; fix the new sites instead\n`);
      exitCode = EXIT_CODE.FAILURE;
      continue;
    }
    await writeCountBaseline(
      fileUrl,
      {totalViolationCount: violations.length, violations},
      `${BASELINE_LABEL_PREFIX}${pattern}`,
    );
  }
  return exitCode;
}

function parsePatternSelection(argv) {
  const index = argv.indexOf(PATTERN_FLAG);
  if (index < 0) {
    return {patterns: ALL_PATTERNS, remainingArgs: argv};
  }
  const pattern = argv[index + 1];
  return {
    patterns: ALL_PATTERNS.includes(pattern) ? [pattern] : null,
    pattern,
    remainingArgs: argv.filter((_arg, position) =>
      position !== index && position !== index + 1),
  };
}

async function main(argv = process.argv.slice(2), options = {}) {
  const {patterns, pattern, remainingArgs} = parsePatternSelection(argv);
  if (!patterns) {
    process.stderr.write(`Unknown ${PATTERN_FLAG} ${pattern}; expected one of ` +
      `${ALL_PATTERNS.join(LIST_SEPARATOR)}\n`);
    return EXIT_CODE.USAGE;
  }
  const promoted = await promotedSelection(patterns, options);
  const auditOptions = {
    ...options,
    patterns: patterns.filter((candidate) => !promoted.has(candidate)),
  };
  if (promoted.size > 0) {
    process.stderr.write(`${PROMOTED_NOTE_PREFIX}${[...promoted].join(LIST_SEPARATOR)}\n`);
  }
  const pathsToScan = remainingArgs.filter((arg) =>
    arg !== UPDATE_BASELINE_FLAG && !OUTPUT_FLAGS.includes(arg));
  if (remainingArgs.includes(UPDATE_BASELINE_FLAG)) {
    return updateNavigabilityBaselines(pathsToScan, auditOptions);
  }
  let report = null;
  const exitCode = await runGuidelineCheck(
    remainingArgs,
    async (scanPaths, cliOptions) => {
      report = await collectNavigabilityViolationsWithBaseline(
        scanPaths, {...auditOptions, ...cliOptions});
      return report;
    },
    formatHumanSummary,
  );
  // A partial scan (staged files) always counts below the domain baseline,
  // so the hint is only meaningful for a whole-domain human-readable run.
  if (pathsToScan.length === 0 && !remainingArgs.includes(OUTPUT_FORMAT.JSON)) {
    printTighteningHints(report, auditOptions);
  }
  return exitCode;
}

runGuidelineCheckWhenDirect(import.meta.url, main);

export {
  NAVIGABILITY_PATTERN,
  main,
};
