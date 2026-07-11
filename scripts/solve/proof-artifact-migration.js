import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  migrateInlineChangeArtifact,
  readChangeArtifact,
} from './content-addressed-change-artifact.js';
import {readLog} from './store.js';

const CENSUS_QUEST_ID = 'solver-proof-artifact-census';
const CENSUS_SCENARIO = 'solver-proof-artifact-census';
const MIGRATION_QUEST_ID = 'solver-proof-artifact-content-addressing';
const RECEIPT_PATH =
  `solve/changes/${MIGRATION_QUEST_ID}/migration-receipt.json`;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const REQUIRED_DUPLICATE_REDUCTION = 0.9;
const TEXT_ENCODING = 'utf8';
const CHANGE_REF_PREFIX = 'diff:';
const CHANGES_DIRECTORY = 'solve/changes';
const PARENT_PATH_PREFIX = '..';
const PROBLEM_SEPARATOR = '; ';
const STATUS_READABLE = 'readable';
const STATUS_HISTORICAL_UNSUPPORTED = 'historical-unsupported-reference';
const STATUS_HISTORICAL_INVALID_SOURCE =
  'historical-invalid-source-reference';
const STATUS_PAYLOAD_MISSING = 'payload-missing';
const ARTIFACT_KIND_CONTENT_ADDRESSED = 'content-addressed';
const PROBLEM_MISSING_CENSUS_EVIDENCE =
  'W11 terminal census evidence is missing';
const PROBLEM_MISSING_CENSUS_DETAIL =
  'W11 terminal report has no census detail';
const PROBLEM_EXISTING_RECEIPT =
  'zero-migration run cannot satisfy W12: receipt already exists';
const PROBLEM_NO_ELIGIBLE_GROUPS =
  'W11 baseline has no eligible duplicate groups';
const PROBLEM_BEFORE_MIGRATION_PREFIX =
  'W11 references fail before migration: ';
const PROBLEM_AFTER_MIGRATION_PREFIX =
  'W11 references fail after migration: ';
const PROBLEM_MISSING_RECEIPT = 'migration receipt is missing';
const PROBLEM_BASELINE_EVIDENCE_MISMATCH =
  'migration receipt does not match W11 terminal evidence';
const PROBLEM_STORAGE_POLICY_MISMATCH =
  'migration receipt storage policy differs from W11 baseline';
const PROBLEM_DUPLICATE_BASELINE_MISMATCH =
  'migration receipt duplicate baseline does not reconcile';
const PROBLEM_ELIGIBLE_PATH_SET_MISMATCH =
  'migration receipt does not cover the exact eligible path set';
const PROBLEM_STALE_REFERENCE_COUNT =
  'migration receipt reference count is stale';
const PROBLEM_ZERO_MIGRATED_ARTIFACTS =
  'migration receipt records zero migrated artifacts';
const PROBLEM_ARTIFACT_COUNT_MISMATCH =
  'migration receipt artifact count does not reconcile';
const PROBLEM_REWRITE_RECOVERY_COUNT_MISMATCH =
  'migration receipt rewrite/recovery counts do not reconcile';
const PROBLEM_INSUFFICIENT_DUPLICATE_REDUCTION =
  'eligible duplicate byte reduction is below 90%';
const PROBLEM_NONCANONICAL_STORAGE_PATH_PREFIX =
  'migration receipt storage paths are non-canonical: ';
const PROBLEM_CURRENT_DUPLICATE_BYTES_MISMATCH =
  'current duplicate bytes do not match migration receipt';
const PROBLEM_DUPLICATE_REDUCTION_MISMATCH =
  'migration receipt duplicate reduction does not reconcile';

function hash(content) {
  return createHash(HASH_ALGORITHM).update(content).digest(HASH_ENCODING);
}

function workspacePath(root, relative) {
  return path.resolve(root, relative);
}

function terminalCensusEvidence(root) {
  const log = readLog(root, CENSUS_QUEST_ID);
  const terminal = log.findLast((event) =>
    event.type === 'quest' && event.status === 'solved' && event.evidence);
  if (!terminal) throw new Error(PROBLEM_MISSING_CENSUS_EVIDENCE);
  return terminal.evidence;
}

function loadBaseline(root) {
  const evidence = terminalCensusEvidence(root);
  const reportPath = workspacePath(root, evidence);
  const reportBytes = fs.readFileSync(reportPath);
  const report = JSON.parse(reportBytes.toString(TEXT_ENCODING));
  const scenario = report.standardSummary?.scenarios?.find((item) =>
    item.scenario === CENSUS_SCENARIO);
  const census = scenario?.detail?.census;
  if (!census) throw new Error(PROBLEM_MISSING_CENSUS_DETAIL);
  return {
    evidence,
    evidenceSha256: hash(reportBytes),
    census,
  };
}

function readableBaselineReferences(census) {
  return census.references.filter((reference) =>
    reference.readabilityStatus === STATUS_READABLE);
}

function currentReadabilityStatus(root, reference) {
  if (!reference.changeRef.startsWith(CHANGE_REF_PREFIX)) {
    return STATUS_HISTORICAL_UNSUPPORTED;
  }
  const requested = path.resolve(
    root,
    reference.changeRef.slice(CHANGE_REF_PREFIX.length),
  );
  const changesDir = path.resolve(root, CHANGES_DIRECTORY);
  const relative = path.relative(changesDir, requested);
  if (!relative || relative.startsWith(PARENT_PATH_PREFIX) ||
    path.isAbsolute(relative)) {
    return STATUS_HISTORICAL_INVALID_SOURCE;
  }
  const artifact = readChangeArtifact(root, reference.changeRef);
  return artifact.valid ? STATUS_READABLE : STATUS_PAYLOAD_MISSING;
}

function referenceProblems(root, census) {
  const problems = [];
  for (const reference of census.references) {
    const currentStatus = currentReadabilityStatus(root, reference);
    if (currentStatus !== reference.readabilityStatus) {
      problems.push(`${reference.changeRef}: readability changed from ` +
        `${reference.readabilityStatus} to ${currentStatus}`);
      continue;
    }
    if (reference.readabilityStatus !== STATUS_READABLE) continue;
    const artifact = readChangeArtifact(root, reference.changeRef);
    if (!artifact.valid) {
      problems.push(`${reference.changeRef}: ` +
        artifact.problems.join(PROBLEM_SEPARATOR));
      continue;
    }
    if (artifact.payloadSha256 !== reference.payloadSha256) {
      problems.push(`${reference.changeRef}: payload identity changed`);
    }
  }
  return problems;
}

function eligibleGroups(census) {
  const threshold = census.migrationPolicy.inlineThresholdBytes;
  return census.duplicateGroups.filter((group) =>
    group.payloadBytes >= threshold);
}

function physicalPayloadLocations(root, group) {
  const locations = new Set();
  for (const relative of group.paths) {
    const changeRef = `diff:${relative}`;
    const artifact = readChangeArtifact(root, changeRef);
    if (!artifact.valid) continue;
    if (artifact.kind === ARTIFACT_KIND_CONTENT_ADDRESSED) {
      locations.add(path.relative(root, artifact.objectPath));
    } else {
      locations.add(path.relative(root, artifact.artifactPath));
    }
  }
  return locations;
}

function duplicateBytesAfter(root, groups) {
  return groups.reduce((total, group) => {
    const locations = physicalPayloadLocations(root, group).size;
    return total + group.payloadBytes * Math.max(0, locations - 1);
  }, 0);
}

function receiptFile(root) {
  return workspacePath(root, RECEIPT_PATH);
}

export function migrateProofArtifacts(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  if (fs.existsSync(receiptFile(absoluteRoot))) {
    throw new Error(PROBLEM_EXISTING_RECEIPT);
  }
  const baseline = loadBaseline(absoluteRoot);
  const groups = eligibleGroups(baseline.census);
  if (groups.length === 0) {
    throw new Error(PROBLEM_NO_ELIGIBLE_GROUPS);
  }
  const beforeProblems = referenceProblems(absoluteRoot, baseline.census);
  if (beforeProblems.length > 0) {
    throw new Error(PROBLEM_BEFORE_MIGRATION_PREFIX +
      beforeProblems.join(PROBLEM_SEPARATOR));
  }
  const migrations = [];
  for (const group of groups) {
    for (const artifactPath of group.paths) {
      migrations.push({
        path: artifactPath,
        payloadSha256: group.payloadSha256,
        ...migrateInlineChangeArtifact(absoluteRoot, artifactPath),
      });
    }
  }
  const migratedArtifacts = migrations.length;
  const newlyMigratedArtifacts = migrations.filter((item) => item.migrated).length;
  const recoveredMigratedArtifacts = migrations.filter(
    (item) => item.alreadyMigrated).length;
  const afterProblems = referenceProblems(absoluteRoot, baseline.census);
  if (afterProblems.length > 0) {
    throw new Error(PROBLEM_AFTER_MIGRATION_PREFIX +
      afterProblems.join(PROBLEM_SEPARATOR));
  }
  const baselineDuplicateBytes = groups.reduce((total, group) =>
    total + group.duplicatePayloadBytes, 0);
  const remainingDuplicateBytes = duplicateBytesAfter(absoluteRoot, groups);
  const reduction = baselineDuplicateBytes === 0 ? 0 :
    (baselineDuplicateBytes - remainingDuplicateBytes) / baselineDuplicateBytes;
  const receipt = {
    schemaVersion: 1,
    baselineEvidence: baseline.evidence,
    baselineEvidenceSha256: baseline.evidenceSha256,
    inlineThresholdBytes: baseline.census.migrationPolicy.inlineThresholdBytes,
    contentCompression: baseline.census.migrationPolicy.contentCompression,
    classifiedReferenceOccurrences: baseline.census.summary
      .classifiedReferenceOccurrences,
    readableReferenceOccurrences: readableBaselineReferences(baseline.census).length,
    migratedArtifacts,
    newlyMigratedArtifacts,
    recoveredMigratedArtifacts,
    eligibleDuplicateGroups: groups.length,
    baselineDuplicateBytes,
    remainingDuplicateBytes,
    duplicateReduction: reduction,
    migrations: migrations.map((item) => ({
      path: item.path,
      payloadSha256: item.payloadSha256,
      descriptorPath: path.relative(absoluteRoot, item.artifactPath),
      objectPath: path.relative(absoluteRoot, item.objectPath),
      descriptorSha256: hash(fs.readFileSync(item.artifactPath)),
      objectStorageSha256: hash(fs.readFileSync(item.objectPath)),
      objectCreated: item.objectCreated,
    })),
  };
  const file = receiptFile(absoluteRoot);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(temporaryFile, file);
  return {receipt, receiptPath: RECEIPT_PATH};
}

export function validateProofArtifactMigration(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  const problems = [];
  const file = receiptFile(absoluteRoot);
  if (!fs.existsSync(file)) {
    return {valid: false, problems: [PROBLEM_MISSING_RECEIPT]};
  }
  const receipt = JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  const baseline = loadBaseline(absoluteRoot);
  const groups = eligibleGroups(baseline.census);
  const expectedPaths = groups.flatMap((group) => group.paths).sort();
  const receiptPaths = (receipt.migrations || [])
    .map((migration) => migration.path).sort();
  const baselineDuplicateBytes = groups.reduce((total, group) =>
    total + group.duplicatePayloadBytes, 0);
  if (receipt.baselineEvidenceSha256 !== baseline.evidenceSha256) {
    problems.push(PROBLEM_BASELINE_EVIDENCE_MISMATCH);
  }
  if (receipt.inlineThresholdBytes !==
    baseline.census.migrationPolicy.inlineThresholdBytes ||
    receipt.contentCompression !==
      baseline.census.migrationPolicy.contentCompression) {
    problems.push(PROBLEM_STORAGE_POLICY_MISMATCH);
  }
  if (receipt.eligibleDuplicateGroups !== groups.length ||
    receipt.baselineDuplicateBytes !== baselineDuplicateBytes) {
    problems.push(PROBLEM_DUPLICATE_BASELINE_MISMATCH);
  }
  if (new Set(receiptPaths).size !== receiptPaths.length ||
    JSON.stringify(receiptPaths) !== JSON.stringify(expectedPaths)) {
    problems.push(PROBLEM_ELIGIBLE_PATH_SET_MISMATCH);
  }
  const references = readableBaselineReferences(baseline.census);
  problems.push(...referenceProblems(absoluteRoot, baseline.census));
  if (receipt.readableReferenceOccurrences !== references.length) {
    problems.push(PROBLEM_STALE_REFERENCE_COUNT);
  }
  if (receipt.migratedArtifacts <= 0) {
    problems.push(PROBLEM_ZERO_MIGRATED_ARTIFACTS);
  }
  if (receipt.migratedArtifacts !== expectedPaths.length ||
    receipt.migrations?.length !== expectedPaths.length) {
    problems.push(PROBLEM_ARTIFACT_COUNT_MISMATCH);
  }
  if (receipt.newlyMigratedArtifacts + receipt.recoveredMigratedArtifacts !==
    receipt.migratedArtifacts) {
    problems.push(PROBLEM_REWRITE_RECOVERY_COUNT_MISMATCH);
  }
  if (receipt.duplicateReduction < REQUIRED_DUPLICATE_REDUCTION) {
    problems.push(PROBLEM_INSUFFICIENT_DUPLICATE_REDUCTION);
  }
  for (const migration of receipt.migrations || []) {
    const artifact = readChangeArtifact(absoluteRoot, `diff:${migration.path}`);
    if (!artifact.valid ||
      artifact.kind !== ARTIFACT_KIND_CONTENT_ADDRESSED) {
      problems.push(`migrated descriptor is invalid: ${migration.path}`);
    } else if (artifact.payloadSha256 !== migration.payloadSha256) {
      problems.push(`migrated payload identity changed: ${migration.path}`);
    }
    if (artifact.valid && (
      path.relative(absoluteRoot, artifact.artifactPath) !==
        migration.descriptorPath ||
      path.relative(absoluteRoot, artifact.objectPath) !== migration.objectPath)) {
      problems.push(PROBLEM_NONCANONICAL_STORAGE_PATH_PREFIX +
        migration.path);
    }
    const descriptorPath = workspacePath(absoluteRoot, migration.descriptorPath);
    const objectPath = workspacePath(absoluteRoot, migration.objectPath);
    if (!fs.existsSync(descriptorPath) ||
      hash(fs.readFileSync(descriptorPath)) !== migration.descriptorSha256) {
      problems.push(`migrated descriptor storage identity changed: ${migration.path}`);
    }
    if (!fs.existsSync(objectPath) ||
      hash(fs.readFileSync(objectPath)) !== migration.objectStorageSha256) {
      problems.push(`migrated object storage identity changed: ${migration.path}`);
    }
  }
  const remainingDuplicateBytes = duplicateBytesAfter(absoluteRoot, groups);
  if (remainingDuplicateBytes !== receipt.remainingDuplicateBytes) {
    problems.push(PROBLEM_CURRENT_DUPLICATE_BYTES_MISMATCH);
  }
  const reduction = baselineDuplicateBytes === 0 ? 0 :
    (baselineDuplicateBytes - remainingDuplicateBytes) / baselineDuplicateBytes;
  if (Math.abs(reduction - receipt.duplicateReduction) > Number.EPSILON) {
    problems.push(PROBLEM_DUPLICATE_REDUCTION_MISMATCH);
  }
  return {
    valid: problems.length === 0,
    problems,
    receipt,
    baseline,
  };
}

export {RECEIPT_PATH};
