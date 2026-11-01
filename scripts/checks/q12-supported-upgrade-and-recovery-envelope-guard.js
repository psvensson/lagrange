#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const stringIncludes = Function.call.bind(String.prototype.includes);

const UTF8 = 'utf8';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '../..');
const METRIC_ARG = '--metric';
const LINE_BREAK = '\n';
const ZERO_EXIT = 0;
const FAIL_EXIT = 1;

const Q12_SURFACES = Object.freeze([
  Object.freeze({
    id: 'support-envelope-owner-contract',
    markers: Object.freeze([
      'SUPPORT_ENVELOPE_SCHEMA_VERSION',
      'SUPPORT_ENVELOPE_AVAILABILITY_OUTCOME',
      'SUPPORT_ENVELOPE_DRILL_ID',
      'SUPPORT_ENVELOPE_REASON_CODE',
      'REQUIRED_DEPENDENCY_QUEST_IDS',
      'computeSupportEnvelopeDigest',
      'validateVersionPairAdmission',
      'evaluateRollbackEligibility',
      'validateMixedVersionNodeAdmission',
      'buildSupportEnvelopeRecord',
      'validateSupportEnvelopeRecord',
      'SupportEnvelopeOwner',
    ]),
    relPath: 'src/bootstrap/owners/support-envelope-owner.js',
  }),
  Object.freeze({
    id: 'rolling-upgrade-envelope-and-rollback-cutoff',
    markers: Object.freeze([
      'OUTSIDE_SUPPORT_ENVELOPE',
      'executeRollback',
      'evaluateRollbackEligibility',
    ]),
    relPath: 'src/bootstrap/owners/rolling-upgrade-owner.js',
  }),
  Object.freeze({
    id: 'join-admission-mixed-version-refusal',
    markers: Object.freeze([
      'resolveSupportEnvelopeConflict',
      'resolveJoinSupportEnvelopeConflict',
    ]),
    relPath: 'src/bootstrap/owners/bootstrap-join-admission-owner.js',
  }),
  Object.freeze({
    id: 'management-v1-byoc-partition-callbacks-and-envelope-facts',
    markers: Object.freeze([
      'exportPartitionSnapshots',
      'hydratePartitionSnapshots',
      'supportEnvelope',
    ]),
    relPath: 'src/bootstrap/owners/management-v1-owner.js',
  }),
  Object.freeze({
    id: 'canonical-support-envelope-json',
    markers: Object.freeze([
      'rolling_upgrade',
      'downgrade_rollback_boundary',
      'one_node_failure_recovery',
      'wiped_replica_rebuild',
      'service_artifact_upgrade',
      'envelopeDigest',
    ]),
    relPath: 'docs/support-envelope.json',
  }),
  Object.freeze({
    id: 'supported-upgrade-and-recovery-scenario',
    markers: Object.freeze([
      'supported-upgrade-and-recovery-envelope',
      'executeRollingUpgradeDrill',
      'executeDowngradeRollbackDrill',
      'executeOneNodeFailureRecoveryDrill',
      'executeWipedReplicaRebuildDrill',
      'executeServiceArtifactUpgradeDrill',
      'executeByocPartitionBackupRestoreProof',
      'executeJoinHandshakeAdmissionProof',
    ]),
    relPath:
      'test/distributed/scenarios/supported-upgrade-and-recovery-envelope.js',
  }),
  Object.freeze({
    id: 'support-envelope-owner-test-suite',
    markers: Object.freeze([
      'OUTSIDE_SUPPORT_ENVELOPE',
      'ROLLBACK_CUTOFF_EXCEEDED',
      'ACKNOWLEDGED_DATA_LOSS_DETECTED',
      'REBUILD_WINDOW_EXCEEDED',
      'REPLICA_SIZE_EXCEEDS_ENVELOPE',
      'MISSING_DEPENDENCY_RECEIPT',
    ]),
    relPath: 'test/bootstrap/support-envelope-owner.test.js',
  }),
]);

function collectQ12Deficits() {
  const deficits = [];
  for (const surface of Q12_SURFACES) {
    const absPath = path.join(REPO_ROOT, surface.relPath);
    if (!fs.existsSync(absPath)) {
      deficits.push(surface.id);
      continue;
    }
    const sourceText = fs.readFileSync(absPath, UTF8);
    const missingMarker = arrayFind(
      surface.markers,
      (marker) => !stringIncludes(sourceText, marker),
    );
    if (missingMarker !== undefined) {
      deficits.push(`${surface.id}:${missingMarker}`);
    }
  }
  return deficits;
}

const deficits = collectQ12Deficits();
if (arrayIncludes(process.argv, METRIC_ARG)) {
  process.stdout.write(`${deficits.length}${LINE_BREAK}`);
  process.exit(ZERO_EXIT);
}
if (deficits.length > 0) {
  process.stderr.write(`${arrayJoin(deficits, LINE_BREAK)}${LINE_BREAK}`);
  process.exit(FAIL_EXIT);
}
process.stdout.write(`0${LINE_BREAK}`);
