#!/usr/bin/env node

import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHECK_EMPTY_TEXT = '';
const CHECK_ENCODING_UTF8 = 'utf8';
const CHECK_EXIT_FAILURE = 1;
const CHECK_FILE_EXTENSION_JS = '.js';
const CHECK_NEWLINE = '\n';
const CHECK_OWNER_MAP_PATH = 'architecture/current-owner-maps.md';
const CHECK_SCAN_ROOT_SRC = 'src';
const CHECK_SCAN_ROOT_TEST = 'test';
const CHECK_REBALANCER_DIR = 'src/rebalancer';
const CHECK_CONTROL_PLANE_PRIORITY_SNAPSHOT_PATTERN =
  /^src\/control-plane\/priority-recovery-snapshot-stage(?:-\d+|-shared)\.js$/u;
const CHECK_SUMMARY_OK =
  'operation progress authority guard passed';
const CHECK_ERROR_PREFIX = 'operation progress authority guard failed:';

const RETIRED_SOURCE_TOKEN_PARTS = Object.freeze([
  Object.freeze(['witness', 'Source']),
  Object.freeze(['Witness', 'Source']),
  Object.freeze(['WITNESS', '_SOURCE']),
  Object.freeze(['witness', '_source']),
  Object.freeze(['topologyOperator', 'Witness', 'Source']),
]);

const LEGACY_OPERATION_PROGRESS_TOKEN_PARTS = Object.freeze([
  Object.freeze(['operation', '-progress-']),
  Object.freeze(['operation', '-lifecycle']),
  Object.freeze(['operationProgressRecord']),
  Object.freeze(['operationProgressEvents']),
  Object.freeze(['operationProgressStore']),
  Object.freeze(['advance', 'OperationLifecycle']),
]);

const RETIRED_SINGLE_OWNER_FORM_PATTERNS = Object.freeze([
  Object.freeze({
    pattern: /\bentity_type\s+IS\s+NULL\b/u,
    reason: 'operation identity cannot fall back from an untyped row',
  }),
  Object.freeze({
    pattern: /\boperation\??\.entityType\s*\|\|\s*SERVICE_TYPE\.PARTITION\b/u,
    reason: 'persisted operation identity cannot default to partition',
  }),
  Object.freeze({
    pattern: /\boperation\??\.entityId\s*\|\|\s*operation\??\.partitionId\b/u,
    reason: 'persisted operation identity cannot alias partitionId',
  }),
  Object.freeze({
    pattern: /\boperation\.entityType\s*\|\|\s*operation\.entity_type\b/u,
    reason: 'workflow operations have one in-memory entityType form',
  }),
  Object.freeze({
    pattern: /\bOPERATION_METADATA_KEY\.MEMBERSHIP_PUBLICATION_EPOCH\b/u,
    reason: 'planning epoch belongs only to its durable operation column',
  }),
  Object.freeze({
    pattern: /\bruntimeServiceDispatchedReplicaBelongsToEntity\b/u,
    reason: 'runtime replica identity has one canonical matcher',
  }),
  Object.freeze({
    pattern: /\bresolveLegacyTargetCandidates\b/u,
    reason: 'node publication has one canonical ingress owner',
  }),
  Object.freeze({
    pattern: /\bRuntimeServiceLegacyTargetReconciler\b/u,
    reason: 'runtime placement has no always-running compatibility reconciler',
  }),
  Object.freeze({
    pattern: /\bisGenuineServiceCreateAdmission\b/u,
    reason: 'runtime ADD and REPLACE have one placement admission class',
  }),
  Object.freeze({
    pattern: /\bgetReservedCreateAddSlots\b/u,
    reason: 'runtime placement reservation has no create-only API',
  }),
  Object.freeze({
    pattern: /\bisGenuineCreate\b/u,
    reason: 'budget callers cannot select a create-only runtime form',
  }),
  Object.freeze({
    pattern: /\breservedCreateAddSlots\b/u,
    reason: 'budget configuration has one runtime-placement reservation',
  }),
  Object.freeze({
    pattern: /rebalance-coordinator-create-slot-reservation/u,
    reason: 'the retired create-only reservation module cannot return',
  }),
]);

const REBALANCER_ORDINAL_FILE_PATTERN =
  /(?:^|\/)[^/]+(?:segment|stage|part)[^/]*\.js$/u;

// The operation-workflow-owner ordinal chain was decomposed into responsibility-
// named modules (retry-registry, execution-lane, transition-persistence, dispatch-
// execution, priority-publication-* safety, priority-recovery-* observation,
// operation-workflow-recovery-* reconcile/timeout/drain). With unified-rebalancer
// and rebalance-coordinator also decomposed, no legacy rebalancer ordinal files
// remain; the tracked-ordinal pattern below still rejects any re-introduced
// numbered segment/stage/part file.
const LEGACY_REBALANCER_ORDINAL_FILES = Object.freeze([]);
// The priority-recovery-snapshot ordinal stages were decomposed into
// responsibility-named modules (ingress/eligibility/publication/active-gate/
// workflow/rebalancer/observation/actuation/burndown/closure/contract, dispatch
// snapshot evidence folded into priority-recovery-dispatch-snapshot.js). No
// legacy control-plane ordinal files remain; the tracked-ordinal pattern below
// still rejects any re-introduced numbered stage file.
const LEGACY_CONTROL_PLANE_ORDINAL_FILES = Object.freeze([]);
const LEGACY_ORDINAL_FILES = Object.freeze([
  ...LEGACY_REBALANCER_ORDINAL_FILES,
  ...LEGACY_CONTROL_PLANE_ORDINAL_FILES,
]);

function buildTokens(tokenParts) {
  return Object.freeze(tokenParts.map((parts) =>
    parts.join(CHECK_EMPTY_TEXT),
  ));
}

async function collectFiles(rootDir) {
  const entries = await readdir(rootDir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const path = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(path));
      continue;
    }
    if (entry.isFile() && path.endsWith(CHECK_FILE_EXTENSION_JS)) {
      files.push(path);
    }
  }
  return files;
}

async function readUtf8(path) {
  return readFile(path, CHECK_ENCODING_UTF8);
}

function collectTokenViolations({
  files,
  contentByFile,
  tokens,
  reason,
}) {
  const violations = [];
  for (const file of files) {
    const content = contentByFile.get(file) || CHECK_EMPTY_TEXT;
    for (const token of tokens) {
      if (containsTokenAtIdentifierBoundary(content, token)) {
        violations.push(`${file}: ${reason}: ${token}`);
      }
    }
  }
  return violations;
}

function collectPatternViolations({files, contentByFile, rules}) {
  const violations = [];
  for (const file of files) {
    const content = contentByFile.get(file) || CHECK_EMPTY_TEXT;
    for (const {pattern, reason} of rules) {
      if (pattern.test(content)) {
        violations.push(`${file}: ${reason}: ${pattern.source}`);
      }
    }
  }
  return violations;
}

function isIdentifierCharacter(character) {
  return character !== undefined && /[$\w]/u.test(character);
}

function containsTokenAtIdentifierBoundary(content, token) {
  let offset = content.indexOf(token);
  while (offset >= 0) {
    const before = offset > 0 ? content[offset - 1] : undefined;
    const after = content[offset + token.length];
    const startsWithIdentifier = isIdentifierCharacter(token[0]);
    const endsWithIdentifier =
      isIdentifierCharacter(token[token.length - 1]);
    if ((!startsWithIdentifier || !isIdentifierCharacter(before)) &&
        (!endsWithIdentifier || !isIdentifierCharacter(after))) {
      return true;
    }
    offset = content.indexOf(token, offset + 1);
  }
  return false;
}

function isTrackedOrdinalFile(file) {
  return (
    file.startsWith(`${CHECK_REBALANCER_DIR}/`) &&
    REBALANCER_ORDINAL_FILE_PATTERN.test(file)
  ) || CHECK_CONTROL_PLANE_PRIORITY_SNAPSHOT_PATTERN.test(file);
}

function collectOrdinalFileViolations(sourceFiles) {
  const allowed = new Set(LEGACY_ORDINAL_FILES);
  const actual = sourceFiles
    .filter(isTrackedOrdinalFile)
    .sort();
  const actualSet = new Set(actual);
  const unexpected = actual.filter((file) => !allowed.has(file));
  const missing = LEGACY_ORDINAL_FILES.filter((file) =>
    !actualSet.has(file),
  );
  return Object.freeze([
    ...unexpected.map((file) => `${file}: new ordinal rebalancer file`),
    ...missing.map((file) => `${file}: owner-map legacy file missing`),
  ]);
}

function ownerMapHasSemanticSuccessor(ownerMapContent, file) {
  if (file.endsWith('-methods.js')) {
    return true;
  }
  const escapedFile = file.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const rowPattern = new RegExp(
    '\\|\\s*`' + escapedFile +
      '`\\s*\\|[^|]*\\|[^|]*\\b(?:src\\/|future\\s+`?src\\/)',
    'u',
  );
  return rowPattern.test(ownerMapContent);
}

function collectOwnerMapViolations(ownerMapContent) {
  return LEGACY_ORDINAL_FILES
    .filter((file) => !ownerMapHasSemanticSuccessor(ownerMapContent, file))
    .map((file) =>
      `${CHECK_OWNER_MAP_PATH}: missing removal ledger row with semantic successor target for ${file}`);
}

async function main() {
  const sourceFiles = await collectFiles(CHECK_SCAN_ROOT_SRC);
  const testFiles = await collectFiles(CHECK_SCAN_ROOT_TEST);
  const scannedFiles = Object.freeze([...sourceFiles, ...testFiles]);
  const contentEntries = await Promise.all(scannedFiles.map(async (file) => [
    file,
    await readUtf8(file),
  ]));
  const contentByFile = new Map(contentEntries);
  const legacyContentByFile = new Map(
    [...contentByFile.entries()].filter(([file]) =>
      LEGACY_ORDINAL_FILES.includes(file),
    ),
  );
  const ownerMapContent = await readUtf8(CHECK_OWNER_MAP_PATH);
  const violations = Object.freeze([
    ...collectTokenViolations({
      files: scannedFiles,
      contentByFile,
      tokens: buildTokens(RETIRED_SOURCE_TOKEN_PARTS),
      reason: 'retired lifecycle source vocabulary',
    }),
    ...collectPatternViolations({
      files: sourceFiles,
      contentByFile,
      rules: RETIRED_SINGLE_OWNER_FORM_PATTERNS,
    }),
    ...collectOrdinalFileViolations(sourceFiles),
    ...collectTokenViolations({
      files: LEGACY_REBALANCER_ORDINAL_FILES,
      contentByFile: legacyContentByFile,
      tokens: buildTokens(LEGACY_OPERATION_PROGRESS_TOKEN_PARTS),
      reason: 'operation_progress implementation belongs in named files',
    }),
    ...collectOwnerMapViolations(ownerMapContent),
  ]);

  if (violations.length > Number(CHECK_EMPTY_TEXT.length)) {
    throw new Error([
      CHECK_ERROR_PREFIX,
      ...violations,
    ].join(CHECK_NEWLINE));
  }
  process.stdout.write(`${CHECK_SUMMARY_OK}${CHECK_NEWLINE}`);
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((error) => {
    process.stderr.write(`${error.message}${CHECK_NEWLINE}`);
    process.exitCode = CHECK_EXIT_FAILURE;
  });
}

export {
  LEGACY_CONTROL_PLANE_ORDINAL_FILES,
  LEGACY_REBALANCER_ORDINAL_FILES,
  RETIRED_SINGLE_OWNER_FORM_PATTERNS,
  collectOrdinalFileViolations,
  collectOwnerMapViolations,
  collectPatternViolations,
  containsTokenAtIdentifierBoundary,
  ownerMapHasSemanticSuccessor,
};
