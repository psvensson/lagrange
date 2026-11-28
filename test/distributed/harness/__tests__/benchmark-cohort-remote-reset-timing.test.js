import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createSemanticGateStage,
  executeRemoteGateAction,
} from '../comparative-benchmark-semantic-gate.js';
import {
  OLTP_SCENARIO_A_PROOF_CASES,
} from '../oltp-scenario-a-proof-cases.js';
import {
  arrayFilter,
  arrayFind,
  arraySome,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';
import {
  createContainerLedger,
  dockerRules,
} from './real-product-deployer-product-answers-fixture.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  createLagrangeOltpAdapter,
} from '../../reference-client/lagrange-oltp-adapter.js';
import {
  IMAGE,
  createArm,
  restartRuleForLedger,
  runCohortResetTestQuery,
} from './benchmark-cohort-reset-test-fixture.js';

test('remote-reset-timing-boundary: executeRemoteGateAction and createSemanticGateStage ' +
  'preserve earlier adapter reset timings across the remote JSON boundary instead of ' +
  'substituting case completion time', async () => {
  const store = new Map();
  const tableSchemas = new Map();
  const createdIndexes = new Map();
  const catalogState = {
    store, tableSchemas, createdIndexes,
    returnSchemaProbeRow: true, requireTableOnTruncate: true,
  };
  const fakeClient = {
    connect: async () => {},
    query: (sql, params = []) => runCohortResetTestQuery(catalogState, sql, params),
    end: async () => {},
  };

  const seedAdapter = await createLagrangeOltpAdapter({
    endpoint: {host: '10.0.0.1', port: 5433},
    connection: {user: 'bench', database: 'bench'},
    createClient: () => fakeClient,
    workload: {scale: 1, workers: 1},
  });
  await seedAdapter.close();

  const remoteReqBase = {
    system: 'lagrange',
    connection: {
      endpoint: {host: '10.0.0.1', port: 5433},
      credentials: {user: 'bench', database: 'bench'},
    },
    binding: {
      campaignId: 'camp-remote-reset', containerId: 'c-lagrange-1',
      imageId: IMAGE, endpoint: '10.0.0.1:5433',
    },
    persistentStorage: true,
  };
  const remoteActionResult = await executeRemoteGateAction(
    {...remoteReqBase, action: 'pg-case', caseId: 'payment'},
    {createPgClient: () => fakeClient},
  );
  const remoteDurabilityBeforeResult = await executeRemoteGateAction(
    {...remoteReqBase, action: 'pg-durability-before'},
    {createPgClient: () => fakeClient},
  );
  assert.equal(typeof remoteDurabilityBeforeResult.resetOutcome, 'object');
  assert.ok(remoteDurabilityBeforeResult.resetOutcome !== null);
  assert.equal(typeof remoteDurabilityBeforeResult.resetOutcome.resetStartedAt, 'string');
  assert.equal(typeof remoteDurabilityBeforeResult.resetOutcome.resetEndedAt, 'string');
  const serializedOverSsh = JSON.parse(JSON.stringify(remoteActionResult));
  assert.equal(typeof serializedOverSsh.resetOutcome, 'object');
  assert.ok(serializedOverSsh.resetOutcome !== null);
  assert.equal(typeof serializedOverSsh.resetOutcome.resetStartedAt, 'string');
  assert.equal(typeof serializedOverSsh.resetOutcome.resetEndedAt, 'string');
  assert.ok(Number.isFinite(serializedOverSsh.resetOutcome.resetDurationMs));
  assert.ok(Number.isFinite(serializedOverSsh.resetOutcome.seedLoadDurationMs));

  const lateControllerNowMs = Date.parse(serializedOverSsh.resetOutcome.resetEndedAt) + 60_000;
  const lateControllerIso = new Date(lateControllerNowMs).toISOString();
  const serializedDurabilityBefore = JSON.parse(JSON.stringify(remoteDurabilityBeforeResult));
  const ledger = createContainerLedger();
  const baseArm = createArm(ledger, 0, {persistent: true});
  const remotePayloadPattern = /--input-type=module -e '[^']+' ([A-Za-z0-9+/=]+)$/u;
  const scriptedSsh = createScriptedSsh([
    [(command, host) => host === '10.0.0.9' && stringIncludes(command, '--input-type=module'),
      (command) => {
        const encoded = remotePayloadPattern.exec(command)[1];
        const req = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        if (req.action === 'pg-durability-before') {
          return `${JSON.stringify(serializedDurabilityBefore)}\n`;
        }
        if (req.action === 'pg-durability-after') {
          return `${JSON.stringify({
            paymentAfterRestart: serializedDurabilityBefore.paymentBeforeRestart,
            stateAfterRestart: serializedDurabilityBefore.stateBeforeRestart,
          })}\n`;
        }
        const proofCase = arrayFind(OLTP_SCENARIO_A_PROOF_CASES, (c) => c.id === req.caseId);
        return `${JSON.stringify({
          ...serializedOverSsh,
          proofRecord: {
            ...serializedOverSsh.proofRecord,
            evidenceId: `lagrange:lagrange-${req.caseId}-v1`,
            proofIds: proofCase?.proofIds || serializedOverSsh.proofRecord.proofIds,
          },
        })}\n`;
      }],
    ...dockerRules(ledger),
    restartRuleForLedger(ledger),
  ]);
  const stage = createSemanticGateStage({
    journey: async () => {
      throw new Error('local journey must not be used when loadGeneratorHost is set');
    },
    sshRun: scriptedSsh.sshRun, opts: {},
    loadGeneratorHost: {ip: '10.0.0.9', repoPath: '/srv/repo', nodePath: '/usr/bin/node'},
    evidenceDirOf: () => null, now: () => lateControllerNowMs,
  });

  const staged = await stage({
    run: {runId: 'r-remote-timing', system: 'lagrange'},
    manifest: {campaignId: 'camp-remote-reset'},
    deployment: baseArm,
  });

  const resetEvents = arrayFilter(staged.events, (e) => e.kind === 'dataset-reset');
  assert.ok(resetEvents.length >= 2);
  assert.equal(arraySome(resetEvents, (e) => e.caseId === 'durability'), true);
  for (const event of resetEvents) {
    const expectedReset = event.caseId === 'durability' ?
      serializedDurabilityBefore.resetOutcome : serializedOverSsh.resetOutcome;
    assert.equal(event.at, expectedReset.resetEndedAt);
    assert.notEqual(event.at, lateControllerIso);
    assert.equal(event.startedAt, expectedReset.resetStartedAt);
    assert.equal(event.endedAt, expectedReset.resetEndedAt);
    assert.equal(event.durationMs, expectedReset.resetDurationMs);
    assert.equal(event.seedLoadDurationMs, expectedReset.seedLoadDurationMs);
  }
});
