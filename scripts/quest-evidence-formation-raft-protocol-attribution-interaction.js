// Deterministic evidence harness for the Raft/formation interaction Quest.
// The canonical pre-edit cohesion review lives in the migrated Quest record;
// this harness carries it into the structurally owned terminal receipt.

import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
  runQuestEvidenceHarness,
} from './quest-evidence-harness-runtime.js';

const QUEST_ID = 'formation-raft-protocol-attribution-interaction';
const TEST_FILE =
  'test/raft/liferaft-formation-attribution-interaction.test.js';
const QUEST_FILE = path.join(
  'solve',
  'quests',
  QUEST_ID,
  'quest.json',
);
const quest = JSON.parse(readFileSync(QUEST_FILE, 'utf8'));
const COHESION_REVIEW = `${quest.legacy.cohesionReview.lines.join('\n')}\n`;

const RECEIPTS = Object.freeze([
  Object.freeze({
    id: 'liferaft-cohesion-review',
    testFile: TEST_FILE,
    detail: COHESION_REVIEW,
  }),
  Object.freeze({
    id: 'owner-interaction-contract-registered',
    testFile: TEST_FILE,
    detail: 'the protected coupled-pair registry binds the Raft behavior and ' +
      'formation accounting/mapping endpoints to one typed contract and this ' +
      'exact primary witness',
  }),
  Object.freeze({
    id: 'election-heartbeat-registration-and-rearm',
    testFile: TEST_FILE,
    detail: 'real LifeRaft constructor registration, two leader heartbeat ' +
      'generations, and two election promotions register and re-arm through ' +
      'production methods with raft_protocol ownership',
  }),
  Object.freeze({
    id: 'indefinite-retry-generations',
    testFile: TEST_FILE,
    detail: 'the upstream LifeRaft indefinite loop executes three attempts, ' +
      'two timeout/error immediate generations, and completion with every ' +
      'measured segment retained by raft_protocol',
  }),
  Object.freeze({
    id: 'inbound-data-production-dispatch',
    testFile: TEST_FILE,
    detail: 'EventEmitter delivery enters the installed patched DATA listener ' +
      'and its asynchronous upstream response continuation under ' +
      'raft_protocol',
  }),
  Object.freeze({
    id: 'raft-apply-distinct-exclusive',
    testFile: TEST_FILE,
    detail: 'an inbound append reaches the production cooperative commit ' +
      'scheduler and charges its durable application slice only to raft_apply ' +
      'while DATA-side log work stays raft_protocol',
  }),
  Object.freeze({
    id: 'no-double-attribution',
    testFile: TEST_FILE,
    detail: 'the protocol plus apply durations equal busy duration once, and ' +
      'owners plus idle exactly equal the injected-clock window with zero ' +
      'partition delta or overlap',
  }),
  Object.freeze({
    id: 'inactive-raft-equivalence',
    testFile: TEST_FILE,
    detail: 'current and mapping-reverted modules produce identical normalized ' +
      'heartbeat, retry, DATA, commit/apply, return, state, and timer effects ' +
      'when no attribution window is active',
  }),
  Object.freeze({
    id: 'interaction-red-on-revert',
    testFile: TEST_FILE,
    detail: 'module-loader controls remove the exact protocol and apply ' +
      'mappings while retaining production LifeRaft paths: all three protocol ' +
      'claims fall to zero and apply is visibly misattributed to protocol',
  }),
]);

const OUTPUT_FILE = path.join(
  'solve',
  'quests',
  QUEST_ID,
  'evidence',
  'receipt.json',
);

runQuestEvidenceHarness({
  questId: QUEST_ID,
  outputFile: OUTPUT_FILE,
  receipts: RECEIPTS,
});
