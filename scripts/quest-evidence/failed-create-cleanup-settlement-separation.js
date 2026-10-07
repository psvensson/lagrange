#!/usr/bin/env node
import {runQuestEvidenceHarness} from './harness-runtime.js';

const QUEST_ID = 'failed-create-cleanup-settlement-separation';
const OUTPUT_FILE =
  `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const TEST_FILE_COMMAND = 'npm run test:file --';
const testCommand = (...files) => `${TEST_FILE_COMMAND} ${files.join(' ')}`;

const TERMINAL_CLEANUP =
  'test/rebalancer/terminal-failed-add-target-cleanup.test.js';
const FAILED_GENERATION =
  'test/node/replica-failed-create-cleanup-generation.test.js';
const D2_REPLACEMENT = 'test/rebalancer/replace-real-group-d2.test.js';
const ADMISSION_OWNER = 'test/node/replica-create-admission-owner.test.js';
const ADMISSION_RECOVERY =
  'test/node/replica-create-admission-recovery.test.js';
const COORDINATOR_ADMISSION =
  'test/rebalancer/coordinator-created-operation-admission.test.js';
const TERMINAL_CAS =
  'test/rebalancer/replica-operation-terminal-cas.test.js';
const OPERATION_REPOSITORY =
  'test/rebalancer/replica-operation-repository.test.js';
const OPERATION_SCHEMA =
  'test/partition/replica-operations-schema-migration.test.js';
const CONTROL_PLANE_SETUP =
  'test/bootstrap/shared/control-plane-setup.test.js';
const DISPATCH_CENSUS =
  'test/scripts/check-operation-dispatch-completion-owner.test.js';
const HANDLER_OWNER_PATH =
  'test/node/replica-handler-owner-path-bypass.test.js';
const COORDINATOR_OWNERSHIP =
  'test/rebalancer/rebalance-coordinator-operation-ownership.test.js';
const DELIVERED_PROGRESS =
  'test/rebalancer/operation-workflow-delivered-create-progress-retention.test.js';
const PRIORITY_RECOVERY =
  'test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js';
const REPLACE_WORKFLOW =
  'test/rebalancer/replace-replica-workflow.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'ordinary-settlement-independent-of-cleanup',
    testFile: TERMINAL_CLEANUP,
    command: testCommand(TERMINAL_CLEANUP),
    detail: 'Pre-intent and absent-target ADD/REPLACE terminal outcomes settle ' +
      'without manufacturing or waiting for destructive cleanup authority.',
  }),
  Object.freeze({
    id: 'failed-create-cleanup-exact-generation',
    testFile: FAILED_GENERATION,
    command: testCommand(FAILED_GENERATION, TERMINAL_CLEANUP),
    detail: 'Only the exact operation-bound token, create attempt and current ' +
      'lifecycle generation authorize FAILED-to-REMOVING cleanup.',
  }),
  Object.freeze({
    id: 'd2-source-retention-and-generic-repair',
    testFile: D2_REPLACEMENT,
    command: testCommand(D2_REPLACEMENT, TERMINAL_CLEANUP),
    detail: 'D2 keeps the source voter while the dead target settles, and a ' +
      'later formerly-live FAILED generation remains owned by generic repair.',
  }),
  Object.freeze({
    id: 'late-create-durable-admission-linearization',
    testFile: ADMISSION_RECOVERY,
    command: testCommand(ADMISSION_OWNER, ADMISSION_RECOVERY,
      COORDINATOR_ADMISSION, TERMINAL_CAS),
    detail: 'The durable operation-row CAS orders terminal-first and ' +
      'admission-first CREATE, lost answers, concurrent handlers and boot loss.',
  }),
  Object.freeze({
    id: 'stale-retry-and-restart-reconstruction',
    testFile: ADMISSION_OWNER,
    command: testCommand(ADMISSION_OWNER, ADMISSION_RECOVERY,
      OPERATION_REPOSITORY, OPERATION_SCHEMA),
    detail: 'Restart and rotation reconstruct only the exact retained attempt; ' +
      'legacy rows, row loss, successor attempts and stale boots cannot revive it.',
  }),
  Object.freeze({
    id: 'cleanup-release-delivery-and-retry-lifetime',
    testFile: TERMINAL_CLEANUP,
    command: testCommand(TERMINAL_CLEANUP, FAILED_GENERATION,
      CONTROL_PLANE_SETUP),
    detail: 'The REMOVE-only release edge retains one retry through lost ACK, ' +
      'reconstructs after restart, unrefs only native timers and stops on shutdown.',
  }),
  Object.freeze({
    id: 'owner-censuses-and-widened-regression',
    testFile: DISPATCH_CENSUS,
    command: testCommand(DISPATCH_CENSUS, HANDLER_OWNER_PATH,
      COORDINATOR_OWNERSHIP, COORDINATOR_ADMISSION, DELIVERED_PROGRESS,
      PRIORITY_RECOVERY, TERMINAL_CAS, REPLACE_WORKFLOW, CONTROL_PLANE_SETUP),
    detail: 'The ordinary and cleanup delivery edges, facade failure route and ' +
      'sole terminal sink pass their source censuses with the widened corrected cone.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
