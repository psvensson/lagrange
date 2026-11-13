import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import * as solveCommands from '../../scripts/solve/commands.js';
import * as solveGuards from '../../scripts/solve/guards.js';
import * as solveProbes from '../../scripts/solve/probes.js';
import {questState, readLog} from '../../scripts/solve/store.js';
import {PROBE, QUEST_SCHEMA} from '../../scripts/solve/schema.js';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {
  evaluateCoupledPairGuards,
  loadImpactContractRegistry,
} from '../../scripts/checks/impact-contract-registry.js';
import {selectProofCone} from '../../scripts/checks/impact-proof-cone.js';

const QUEST_ID = 'bound-review-test-quest';
const EPIC_ID = 'bound-review-test-epic';
const ORACLE_FILE = `solve/quests/${QUEST_ID}/evidence/oracle.json`;
const STATEMENT = 'Content bound review and interaction proof test quest.';
const VERIFIER = 'subagent:verifier-alpha';
const SRC_FILE = 'src/test-producer.js';
const GIT_USER = ['-c', 'user.name=Tester', '-c', 'user.email=tester@example.invalid'];
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');

function git(root, args) {
  return execGit([...GIT_USER, ...args], {cwd: root, encoding: 'utf8'});
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function goGreen(root) {
  write(root, ORACLE_FILE, JSON.stringify({metric: 0, target: 0}));
}

function setupTestRepo(t, {withCoupledPairs = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bound-review-repo-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));

  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'lagrange-tester']);
  git(root, ['config', 'user.email', 'tester@example.invalid']);

  write(root, `solve/epics/${EPIC_ID}.md`, [
    '---',
    `id: ${EPIC_ID}`,
    'status: open',
    'proof: deterministic',
    'doneWhen:',
    '  probe: oracle',
    '  args:',
    `    file: ${ORACLE_FILE}`,
    'quests:',
    `  - ${QUEST_ID}`,
    'authorizes:',
    '  - src/**',
    '  - test/**',
    '  - scripts/**',
    '---',
    '',
    '# Test Epic',
  ].join('\n'));

  write(root, `solve/quests/${QUEST_ID}/quest.json`, JSON.stringify({
    schema: QUEST_SCHEMA,
    id: QUEST_ID,
    statement: STATEMENT,
    epic: EPIC_ID,
    doneWhen: {
      probe: PROBE.ORACLE,
      args: {file: ORACLE_FILE},
    },
  }, null, 2));

  // Red at start time (metric 1 > target 0):
  write(root, ORACLE_FILE, JSON.stringify({metric: 1, target: 0}));
  write(root, '.gitkeep', '');
  write(root, SRC_FILE, 'export const value = 1;\n');

  if (withCoupledPairs) {
    const contractsSource = {
      schemaVersion: 2,
      id: 'impact-contracts',
      contracts: {
        'order-lifecycle': {
          description: 'Order lifecycle protocol',
          owners: ['src/order-', 'src/payment-'],
          tests: ['test/order-payment-interaction.test.js'],
        },
      },
      coupledPairs: {
        'order-lifecycle': {
          description: 'Order and payment coupling',
          endpoints: [
            {id: 'order-producer', owners: ['src/order-']},
            {id: 'payment-consumer', owners: ['src/payment-']},
          ],
          contract: 'order-lifecycle',
          witnessTests: ['test/order-payment-interaction.test.js'],
        },
      },
    };
    write(root, 'test/shards/impact-contracts.json', JSON.stringify(contractsSource, null, 2));
    write(root, 'src/order-service.js', 'export const order = 1;\n');
    write(root, 'src/payment-service.js', 'export const payment = 1;\n');
    write(root, 'test/order-payment-interaction.test.js', 'export const testOrderPayment = true;\n');
  }

  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'initial commit']);

  solveCommands.note(root, {id: QUEST_ID, type: 'finding', text: 'Assign the test package.',
    assignment: {paths: ['src/', 'test/', 'scripts/'], authority: 'test task authorization'}});

  return root;
}

test('mutating a reviewed src/ file after note --verification --verdict approve is refused by land', (t) => {
  const root = setupTestRepo(t);
  solveCommands.start(root, {id: QUEST_ID});
  goGreen(root);

  write(root, SRC_FILE, 'export const value = 2;\n');
  solveCommands.note(root, {id: QUEST_ID, type: 'attempt', text: 'attempt 1'});
  solveCommands.note(root, {
    id: QUEST_ID,
    type: 'verification',
    verifier: VERIFIER,
    verdict: 'approve',
    text: 'independent review approving candidate',
  });

  // Mutate the reviewed source file after review:
  write(root, SRC_FILE, 'export const value = 3; // post-review mutation\n');

  assert.throws(
    () => solveCommands.land(root, {id: QUEST_ID, skipProof: true, noVerify: true}),
    (error) => {
      const msg = String(error?.message || '');
      return /candidate digest|content-binding/i.test(msg);
    },
    'land must refuse with explicit content-binding/candidate digest mismatch when src/ is mutated',
  );
});

test('mutating a witness test, fixture, contract registry, or proof script after note --verification --verdict approve is refused by land', (t) => {
  const root = setupTestRepo(t);
  const witnessPath = 'test/witness.test.js';
  write(root, witnessPath, 'export const witness = 1;\n');
  git(root, ['add', witnessPath]);
  git(root, ['commit', '-q', '-m', 'add witness']);

  solveCommands.start(root, {id: QUEST_ID});
  goGreen(root);

  write(root, SRC_FILE, 'export const value = 2;\n');
  solveCommands.note(root, {id: QUEST_ID, type: 'attempt', text: 'attempt 1'});
  solveCommands.note(root, {
    id: QUEST_ID,
    type: 'verification',
    verifier: VERIFIER,
    verdict: 'approve',
    text: 'approved attempt 1',
  });

  // Mutate the proof input after review:
  write(root, witnessPath, 'export const witness = 2; // mutated proof input\n');

  assert.throws(
    () => solveCommands.land(root, {id: QUEST_ID, skipProof: true, noVerify: true}),
    (error) => {
      const msg = String(error?.message || '');
      return /candidate digest|content-binding/i.test(msg);
    },
    'land must refuse with explicit content-binding/candidate digest mismatch when proof input is mutated',
  );
});

test('an unmutated candidate whose digest matches the review binding is accepted by land', (t) => {
  const root = setupTestRepo(t);
  solveCommands.start(root, {id: QUEST_ID});
  goGreen(root);

  write(root, SRC_FILE, 'export const value = 2;\n');
  solveCommands.note(root, {id: QUEST_ID, type: 'attempt', text: 'attempt 1'});
  solveCommands.note(root, {
    id: QUEST_ID,
    type: 'verification',
    verifier: VERIFIER,
    verdict: 'approve',
    text: 'approved attempt 1',
  });

  const state = questState(readLog(root, QUEST_ID));
  assert.ok(state.lastVerification?.candidateDigest, 'verification entry must record candidateDigest');

  const outcome = solveCommands.land(root, {id: QUEST_ID, skipProof: true, noVerify: true});
  assert.equal(outcome.id, QUEST_ID);
  assert.match(outcome.commit, /^[0-9a-f]{40}$/u);
});

test('appending the verification entry to log.ndjson does not invalidate the candidate digest', (t) => {
  const root = setupTestRepo(t);
  write(root, SRC_FILE, 'export const value = 2;\n');

  const compute = solveCommands.computeCandidateDigest;
  assert.equal(typeof compute, 'function', 'computeCandidateDigest must be exported');

  const quest = {
    id: QUEST_ID,
    doneWhen: {probe: PROBE.ORACLE, args: {file: ORACLE_FILE}},
  };

  const digestBefore = compute(root, quest);
  assert.ok(digestBefore && typeof digestBefore === 'string', 'must compute valid digest');

  // Append a verification entry to log.ndjson (which lives inside solve/quests/<quest>/):
  const logPath = path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`);
  fs.appendFileSync(logPath, JSON.stringify({
    ts: new Date().toISOString(),
    type: 'verification',
    verifier: VERIFIER,
    verdict: 'approve',
    candidateDigest: digestBefore,
    text: 'approved',
  }) + '\n');

  // Also write/update receipt.json inside solve/quests/<quest>/evidence/:
  write(root, `solve/quests/${QUEST_ID}/evidence/receipt.json`, JSON.stringify({
    schema: 'test-receipt/1',
    quest: QUEST_ID,
    status: 'pass',
    receipts: [],
  }));

  const digestAfter = compute(root, quest);
  assert.equal(
    digestAfter,
    digestBefore,
    'candidate digest must be stable across log.ndjson and receipt.json writes',
  );
});

test('changing only the producer OR only the consumer of a registered coupled pair selects the paired witnessTests', () => {
  // Using the repository's real registered coupled pairs:
  // distributed-transaction-coordinator-participant-protocol:
  // producer: src/query/sql-query-engine-participant-wire.js
  // consumer: src/partition/partition-service-remote-query-methods.js
  // witness test: test/query/transaction-coordinator-participant-protocol.test.js
  const witnessTest = 'test/query/transaction-coordinator-participant-protocol.test.js';

  // 1. Change ONLY the producer
  const producerOnly = ['src/query/sql-query-engine-participant-wire.js'];
  const coneProducer = selectProofCone(REPOSITORY_ROOT, producerOnly);
  assert.ok(
    coneProducer.selection.selectedTests.includes(witnessTest),
    'modifying only the producer must select the paired witness test in selectProofCone',
  );

  // 2. Change ONLY the consumer
  const consumerOnly = ['src/partition/partition-service-remote-query-methods.js'];
  const coneConsumer = selectProofCone(REPOSITORY_ROOT, consumerOnly);
  assert.ok(
    coneConsumer.selection.selectedTests.includes(witnessTest),
    'modifying only the consumer must select the paired witness test in selectProofCone',
  );

  // 3. evaluateCoupledPairGuards also surfaces selectedWitnessTests for one-sided modification
  const {registry} = loadImpactContractRegistry(REPOSITORY_ROOT);
  const evaluated = evaluateCoupledPairGuards(registry, producerOnly);
  assert.ok(
    Array.isArray(evaluated.selectedWitnessTests) &&
      evaluated.selectedWitnessTests.includes(witnessTest),
    'evaluateCoupledPairGuards must surface selectedWitnessTests on one-sided change',
  );
  assert.equal(
    evaluated.triggeredPairs.length,
    0,
    'triggeredPairs (both endpoints changed) must remain empty on one-sided change',
  );
});

test('touching an endpoint of a coupled pair with missing witnessTests or incomplete contract edges fails closed even on a single-file change', (t) => {
  const root = setupTestRepo(t, {withCoupledPairs: true});
  const contractsPath = path.join(root, 'test/shards/impact-contracts.json');
  const contractsData = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));

  // Break the coupled pair: remove witnessTests so it has an incomplete edge problem
  contractsData.coupledPairs['order-lifecycle'].witnessTests = [];
  write(root, 'test/shards/impact-contracts.json', JSON.stringify(contractsData, null, 2));

  // Single-file change touching only one endpoint
  const singleEndpointPath = 'src/order-service.js';
  const problems = solveGuards.coupledPairProblems(root, [singleEndpointPath]);

  assert.ok(
    problems.length > 0,
    'coupledPairProblems must fail closed on a single-file change touching a problematic coupled pair',
  );
  assert.ok(
    problems.some((p) => p.includes('order-lifecycle')),
    `problem message must name the coupled pair, got: ${JSON.stringify(problems)}`,
  );
});

test('reusing a receipt whose testFileDigests or applicability record does not match the current witness file is refused, while a valid applicability record / matching digest is accepted', (t) => {
  const root = setupTestRepo(t);
  const witnessFile = 'test/example-witness.test.js';
  const initialContent = 'test("example", () => {});\n';
  write(root, witnessFile, initialContent);

  const initialDigest = crypto.createHash('sha256').update(initialContent).digest('hex');
  const receiptFile = `solve/quests/${QUEST_ID}/evidence/receipt.json`;

  // 1. Receipt matching current witness file digest -> accepted
  write(root, receiptFile, JSON.stringify({
    schema: 'test-receipt/1',
    quest: QUEST_ID,
    status: 'pass',
    testFileDigests: {[witnessFile]: initialDigest},
    receipts: [{id: 'r1', passed: true, testFile: witnessFile}],
  }));

  const args = {file: receiptFile, requiredReceipts: ['r1']};
  const measuredMatching = solveProbes.measureTestReceipt(root, args);
  assert.equal(measuredMatching.done, true, 'matching witness digest must be accepted');

  // 2. Witness file mutates -> digest divergence without applicability -> refused
  write(root, witnessFile, 'test("mutated", () => {});\n');
  const measuredDiverged = solveProbes.measureTestReceipt(root, args);
  assert.equal(measuredDiverged.done, false, 'diverged witness digest without applicability must be refused');

  // 3. Receipt has valid applicability record -> accepted
  write(root, receiptFile, JSON.stringify({
    schema: 'test-receipt/1',
    quest: QUEST_ID,
    status: 'pass',
    testFileDigests: {[witnessFile]: initialDigest},
    applicability: {
      status: 'approved',
      reason: 'Witness refactored for clarity with unchanged semantic invariants',
    },
    receipts: [{id: 'r1', passed: true, testFile: witnessFile}],
  }));

  const measuredWithApplicability = solveProbes.measureTestReceipt(root, args);
  assert.equal(measuredWithApplicability.done, true, 'valid applicability record must be accepted for diverged witness');

  // 4. Receipt has invalid applicability record -> refused
  write(root, receiptFile, JSON.stringify({
    schema: 'test-receipt/1',
    quest: QUEST_ID,
    status: 'pass',
    testFileDigests: {[witnessFile]: initialDigest},
    applicability: {
      status: 'rejected',
      reason: 'Rejected due to semantic divergence',
    },
    receipts: [{id: 'r1', passed: true, testFile: witnessFile}],
  }));

  const measuredRejectedApplicability = solveProbes.measureTestReceipt(root, args);
  assert.equal(measuredRejectedApplicability.done, false, 'rejected applicability must be refused');
});
