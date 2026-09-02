// Deterministic evidence harness for the critical-placement-authoritative-
// evidence quest (S3): receipt declarations only. The witness uses raw
// node:test (not the repo tap shim), so --test-name-pattern selects exactly
// one anchored scenario per receipt.

import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const WITNESS_TEST =
  'test/bootstrap/critical-placement-authoritative-evidence.test.js';
const NODE_TEST_COMMAND_PREFIX = 'node --test ';
const TEST_NAME_PATTERN_FLAG_PREFIX = '--test-name-pattern="';
const DOUBLE_QUOTE = '"';
const SPACE = ' ';

function scenarioCommand(scenarioPattern) {
  return NODE_TEST_COMMAND_PREFIX +
    TEST_NAME_PATTERN_FLAG_PREFIX + scenarioPattern + DOUBLE_QUOTE +
    SPACE + WITNESS_TEST;
}

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'fresh-seed-critical-set-fully-inspected',
    command: scenarioCommand('^fresh-seed-critical-set-fully-inspected'),
    detail: 'on a fresh seeded cluster the inspected critical partitions ' +
      'equal the declared critical set (no literal count anywhere), every ' +
      'inspected partition resolves its requirement from its persisted ' +
      'policy row through the replication-target authority, and ' +
      'REQUIRED_COUNT_UNKNOWN counts exactly zero. Inspected == declared == ' +
      'policy-valid is the S3 positive contract',
  }),
  Object.freeze({
    id: 'seed-concentrated-placement-is-known-not-converged',
    command: scenarioCommand(
      '^seed-concentrated-placement-is-known-not-converged'),
    detail: 'the shape a cluster is ACTUALLY created in — every critical ' +
      'partition holding its full replica count on the seed alone — is a ' +
      'MEASURED deficit: KNOWN_NOT_CONVERGED with EVERY critical partition ' +
      'pending and none unknown. This is the state an RF-only check calls ' +
      'satisfied at t=0, and it is knowledge, not absence',
  }),
  Object.freeze({
    id: 'spread-placement-is-known-converged',
    command: scenarioCommand('^spread-placement-is-known-converged'),
    detail: 'every declared critical partition spread across its required ' +
      'distinct voting nodes is KNOWN_CONVERGED with no pending and no ' +
      'unknown ids, so the three-state contract is satisfiable and not ' +
      'vacuously strict',
  }),
  Object.freeze({
    id: 'partial-spread-names-the-pending-partitions',
    command: scenarioCommand('^partial-spread-names-the-pending-partitions'),
    detail: 'three partitions pending by MIXED causes — two with no service ' +
      'rows and one present but on a single node — with pendingPartitionIds ' +
      'asserted to equal exactly those three, sorted, and unknownPartitionIds ' +
      'empty. Cardinality three and mixed causes together defeat a constant, ' +
      'a cap-at-one or cap-at-two accumulation, and an implementation keyed ' +
      'on absence alone',
  }),
  Object.freeze({
    id: 'required-rf-resolves-through-the-policy-authority',
    command: scenarioCommand(
      '^required-rf-resolves-through-the-policy-authority'),
    detail: 'the divergence probe: persisted replica_count 5 with the ' +
      'declared initial-identity count still 3 makes the requirement 5, so ' +
      'three distinct holders become a measured deficit — and restoring the ' +
      'persisted default restores KNOWN_CONVERGED. The requirement follows ' +
      'the authoritative persisted policy and nothing else; an ' +
      'identity-count or table-policy reader cannot stay green here',
  }),
  Object.freeze({
    id: 'absent-policy-evidence-is-unknown-never-known-not-converged',
    command: scenarioCommand(
      '^absent-policy-evidence-is-unknown-never-known-not-converged'),
    detail: 'a partition with NO persisted policy row and holders that would ' +
      'satisfy the declared default resolves UNKNOWN: requirement 0, source ' +
      'undeclared, listed in unknownPartitionIds and NOT in ' +
      'pendingPartitionIds, and the aggregate refuses KNOWN_CONVERGED. ' +
      'Guessing either KNOWN state from absent policy evidence reds here',
  }),
  Object.freeze({
    id: 'one-malformed-policy-keeps-only-that-evidence-unknown',
    command: scenarioCommand(
      '^one-malformed-policy-keeps-only-that-evidence-unknown'),
    detail: 'a present-but-invalid replica_count keeps exactly that ' +
      'partition UNKNOWN while neighbours keep their measured answers: with ' +
      'a real deficit elsewhere the set is KNOWN_NOT_CONVERGED (an unknown ' +
      'neighbour cannot retract a measurement), with every neighbour ' +
      'satisfied the set is UNKNOWN (an unknown partition blocks any ' +
      'KNOWN_CONVERGED claim)',
  }),
  Object.freeze({
    id: 'bootstrap-expected-rf-cannot-turn-unknown-into-known',
    command: scenarioCommand(
      '^bootstrap-expected-rf-cannot-turn-unknown-into-known'),
    detail: 'the schema creation default would EXACTLY satisfy the fixture ' +
      'holders, so an implementation falling back to the bootstrap expected ' +
      'RF reports KNOWN_CONVERGED and reds this receipt. The default seeds a ' +
      'NEW row; it is never a reading of a row that failed to declare one, ' +
      'and it can keep a barrier blocked but never mint knowledge',
  }),
  Object.freeze({
    id: 'unreadable-cache-is-typed-unknown',
    command: scenarioCommand('^unreadable-cache-is-typed-unknown'),
    detail: 'six whole-cache unreadable shapes, a policy-table-only failure, ' +
      'and an async (thenable-answering) cache all observe UNKNOWN with the ' +
      'failed surface named in reasonCodes and NO pending ids minted. ' +
      'Unreadable evidence is never a deficit verdict — the previous ' +
      'observer typed this as not-converged, which conflated UNKNOWN with ' +
      'KNOWN_NOT_CONVERGED, and that conflation is the defect this quest ' +
      'exists to remove',
  }),
  Object.freeze({
    id: 'stale-topology-evidence-cannot-authorize-current-topology',
    command: scenarioCommand(
      '^stale-topology-evidence-cannot-authorize-current-topology'),
    detail: 'the observation is stamped with the membership publication ' +
      'epoch it was computed under and the evidence-currency boundary runs ' +
      'the membership epoch owner\'s fence over the stamp: a KNOWN_CONVERGED ' +
      'stamped under epoch 4 fences STALE against current epoch 5 and ' +
      'FUTURE against epoch 3 (both refuse), CURRENT only for the topology ' +
      'it described, and an UNAVAILABLE stamp fences UNKNOWN. No local ' +
      'generation counter exists; the fence vocabulary is reused',
  }),
  Object.freeze({
    id: 'observer-mints-no-readiness-state',
    command: scenarioCommand('^observer-mints-no-readiness-state'),
    detail: 'the observation is frozen and carries evidence fields only — ' +
      'no ready, phase, active, verdict, status, lifecycle or state key — so ' +
      'it creates no second readiness or release authority',
  }),
  Object.freeze({
    id: 'barrier-release-is-unchanged-by-the-observation',
    command: scenarioCommand(
      '^barrier-release-is-unchanged-by-the-observation'),
    detail: 'CONTROL and the safety property of this slice: the barrier ' +
      'REPORTS the observation and must not gate on it. A joiner that waited ' +
      'for spread which only its own join can supply would deadlock ' +
      'formation, so the release condition stays the startup-authority ' +
      'answer across all four reachable release states, with and without ' +
      'the observation present. Must stay green',
  }),
  Object.freeze({
    id: 'witness-deterministic',
    command: scenarioCommand('^witness-deterministic'),
    detail: 'repeated observation and reversed service-row AND policy-row ' +
      'order produce one identical projection, so no receipt passes by row ' +
      'ordering or retained state',
  }),
]);

const QUEST_ID = 'critical-placement-authoritative-evidence';
const SOLVE_DIR = 'solve';
const EVIDENCE_DIR = 'evidence';
const RECEIPT_FILENAME =
  'critical-placement-authoritative-evidence.receipt.json';

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: path.join(SOLVE_DIR, EVIDENCE_DIR, RECEIPT_FILENAME),
  receipts: RECEIPTS,
});
