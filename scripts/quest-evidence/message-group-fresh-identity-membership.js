#!/usr/bin/env node
// Evidence harness for the sealed fresh message-group identity Quest.
// File names are the independently reviewed V1/V2 owner witnesses.
import {runQuestEvidenceHarness} from
  './harness-runtime.js';

const QUEST_ID = 'message-group-fresh-identity-membership';
const OUTPUT_FILE = `solve/quests/${QUEST_ID}/evidence/receipt.json`;
const run = (...files) => `npm run test:file -- ${files.join(' ')}`;

const LANE = 'test/rebalancer/message-group-membership-operation-lane.test.js';
const TWO_REPLACE =
  'test/rebalancer/message-group-fresh-identity-two-replace.test.js';
const HANDLER =
  'test/node/message-group-service-handler-membership.test.js';
const CREATE =
  'test/node/message-group-create-admission-recovery.test.js';
const PROMOTION =
  'test/message-group/message-group-fresh-learner-promotion.test.js';
const REMOVAL =
  'test/message-group/message-group-replace-removal-fence.test.js';
const SNAPSHOT =
  'test/message-group/message-group-fresh-learner-snapshot.test.js';
const PHYSICAL =
  'test/integration/message-group-fresh-identity-replacement.integration.test.js';
const PARK =
  'test/rebalancer/message-group-membership-change-parked.test.js';
const EXISTING_HANDLER = 'test/node/message-group-service-handler.test.js';
const EXIT = 'test/node/replica-removal-consensus-exit.test.js';
const IDENTITY = 'test/raft/raft-rs-backend/peer-identity.test.js';
const BOOTSTRAP =
  'test/raft/raft-rs-backend/bootstrap-committed-membership.test.js';

const receipts = Object.freeze([
  Object.freeze({
    id: 'fresh-identity-permanent-registry-and-membership-lane',
    testFile: LANE,
    command: run(LANE, TWO_REPLACE, IDENTITY),
    detail: 'Authoritative concurrent INSERTs produce one group lane; fresh ' +
      'logical/peer identities remain reserved across terminal-history pruning.',
  }),
  Object.freeze({
    id: 'committed-learner-real-state-transfer-and-create-fence',
    testFile: SNAPSHOT,
    command: run(HANDLER, CREATE, SNAPSHOT, BOOTSTRAP),
    detail: 'Committed ADD_LEARNER and a read-only join descriptor precede ' +
      'the exact identity81 CAS; only its token permits real replay/snapshot.',
  }),
  Object.freeze({
    id: 'atomic-leader-proof-and-committed-promotion',
    testFile: PROMOTION,
    command: run(PROMOTION, HANDLER),
    detail: 'One runtime-owner turn compares target and leader ConfState ' +
      'generations, evaluates leader progress and proposes ADD_PEER.',
  }),
  Object.freeze({
    id: 'serial-replace-handoff-and-source-retention',
    testFile: TWO_REPLACE,
    command: run(TWO_REPLACE, LANE, REMOVAL),
    detail: 'R1 settles before R2; named handoff and voter proof precede ' +
      'source intent, and every defer retains the source.',
  }),
  Object.freeze({
    id: 'separated-membership-obligation-and-terminal-settlement',
    testFile: LANE,
    command: run(LANE, TWO_REPLACE),
    detail: 'Ordinary terminal settlement remains independent while exact ' +
      'orphan-learner removal retains the group lane until committed absence.',
  }),
  Object.freeze({
    id: 'committed-and-source-own-absence-exact-cleanup',
    testFile: REMOVAL,
    command: run(REMOVAL, EXIT),
    detail: 'Leader/quorum absence releases membership serialization; source ' +
      'own applied absence alone retires its port and exact token permits cleanup.',
  }),
  Object.freeze({
    id: 'lost-answer-restart-pruning-and-stale-disk-recovery',
    testFile: CREATE,
    command: run(CREATE, LANE, REMOVAL, SNAPSHOT),
    detail: 'Every half-boundary restarts from durable owner facts; pruning, ' +
      'stale source disk and successor generation cannot revive old authority.',
  }),
  Object.freeze({
    id: 'distinct-offseed-seedloss-and-owner-censuses',
    testFile: PHYSICAL,
    command: run(PHYSICAL, PARK, EXISTING_HANDLER, TWO_REPLACE),
    detail: 'B4/C5 occupy distinct off-seed storage, survive seed loss at 2/3, ' +
      'and restore canonical SQL routing/CDC/cache with every bypass refused.',
  }),
]);

runQuestEvidenceHarness({questId: QUEST_ID, outputFile: OUTPUT_FILE, receipts});
