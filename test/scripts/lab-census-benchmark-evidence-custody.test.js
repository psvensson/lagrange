import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';

import {
  placementKillScript,
  placementScript,
} from '../../scripts/lab/probe.js';
import {
  assertCompleteFiveLaneJoin,
  collectRun,
  computeSrcDigest,
  validateShardApplicability,
} from '../../scripts/checks/fallback-branch-census.js';
import {
  currentPreloadSha256,
  mergeRuns,
  sha256Hex,
} from '../../scripts/checks/fallback-branch-census-coverage.js';
import {
  ADMISSION_REASON,
  CLAIM_CELL_STATUS,
  admitClaim,
  checkSemanticGate,
  gateBindingHolds,
} from '../distributed/harness/benchmark-claim-admission.js';
import {
  buildFixtureHeader,
  buildFixtureRun,
  sealFixtureRun,
} from '../distributed/harness/comparative-benchmark-fixtures.js';
import {
  OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS,
} from '../distributed/harness/oltp-scenario-a-semantic-gate.js';

const COMMIT = '1ad04d21a0000000000000000000000000000000';

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'census-evidence-custody-'));
  fs.mkdirSync(path.join(root, 'src'), {recursive: true});
  fs.mkdirSync(path.join(root, 'test'), {recursive: true});
  fs.writeFileSync(path.join(root, 'src', 'subject.js'),
    'export const choose = (a, b) => a || b;\n');
  return root;
}

test('R1 canonical runner placement and cleanup binds machine lock holder and terminates runner process group',
  () => {
    assert.match(
      placementKillScript(),
      /kill\s+-s\s+TERM\s+--\s+"-\$1"/u,
      'placement kill script must signal runner process group with kill -s TERM -- "-$1"',
    );

    const script = placementScript(['test/example.test.js']);
    assert.match(
      script,
      /machine\.holder\.json/u,
      'placement script must bind machine.holder.json path',
    );
    assert.match(
      script,
      /trap\s+cleanup\s+EXIT/u,
      'placement script must install trap cleanup EXIT',
    );
    assert.match(
      script,
      /kill\s+-s\s+TERM\s+--\s+"-\$pid"/u,
      'placement script stop function must terminate runner process group',
    );
  });

test('R2 complete source-bound witness manifest records digests and full witness accounting',
  () => {
    const root = makeTempRoot();
    const subjectUrl = pathToFileURL(path.join(root, 'src', 'subject.js')).href;
    const childTest = path.join(root, 'test', 'child.test.mjs');
    fs.writeFileSync(childTest, [
      'import assert from \'node:assert/strict\';',
      'import {test} from \'node:test\';',
      `import {choose} from ${JSON.stringify(subjectUrl)};`,
      'test(\'runs\', () => { assert.equal(choose(1, 2), 1); });',
    ].join('\n'));

    const driver = path.join(root, 'test', 'driver.mjs');
    fs.writeFileSync(driver, [
      'import {spawnSync} from \'node:child_process\';',
      'const cleanEnv = {...process.env};',
      'delete cleanEnv.NODE_TEST_CONTEXT;',
      `const res = spawnSync(process.execPath, ['--test', ${JSON.stringify(childTest)}],`,
      '  {env: cleanEnv, encoding: \'utf8\'});',
      'if (res.status !== 0) throw new Error(res.stderr);',
    ].join('\n'));

    const out = path.join(root, 'out-r2');
    const record = collectRun({
      lane: 'bootstrap',
      out,
      root,
      command: [process.execPath, driver],
      host: 'fixture',
      commit: COMMIT,
    });

    assert.equal(record.exitCode, 0);
    assert.match(record.srcDigest, /^[0-9a-f]{64}$/u, 'record must include srcDigest');
    assert.equal(record.srcDigest, computeSrcDigest(record.fileDigests));
    assert.equal(record.preloadDigest, currentPreloadSha256());
    assert.ok(typeof record.dependencyFingerprint === 'string',
      'record must include dependencyFingerprint');
    assert.deepEqual(record.witnessAccounting, {
      complete: true,
      started: record.witnesses.started,
      completeCount: record.witnesses.complete,
      missingWitnesses: 0,
      uninstrumentedCount: 0,
      exitCode: 0,
    });
  });

test('R3 merge and join refuse runs with mismatched digests incomplete witnesses non-zero exits or unreadable coverage',
  () => {
    const root = makeTempRoot();
    const subjectUrl = pathToFileURL(path.join(root, 'src', 'subject.js')).href;
    const childTest = path.join(root, 'test', 'child.test.mjs');
    fs.writeFileSync(childTest, [
      'import assert from \'node:assert/strict\';',
      'import {test} from \'node:test\';',
      `import {choose} from ${JSON.stringify(subjectUrl)};`,
      'test(\'runs\', () => { assert.equal(choose(1, 2), 1); });',
    ].join('\n'));

    const driver = path.join(root, 'test', 'driver.mjs');
    fs.writeFileSync(driver, [
      'import {spawnSync} from \'node:child_process\';',
      'const cleanEnv = {...process.env};',
      'delete cleanEnv.NODE_TEST_CONTEXT;',
      `const res = spawnSync(process.execPath, ['--test', ${JSON.stringify(childTest)}],`,
      '  {env: cleanEnv, encoding: \'utf8\'});',
      'if (res.status !== 0) throw new Error(res.stderr);',
    ].join('\n'));

    const outA = path.join(root, 'out-a');
    const outB = path.join(root, 'out-b');
    collectRun({lane: 'unit', out: outA, root, command: [process.execPath, driver], host: 'hA', commit: COMMIT});
    collectRun({lane: 'bootstrap', out: outB, root, command: [process.execPath, driver], host: 'hB', commit: COMMIT});

    // 1. Mismatched srcDigest
    const recordBPath = path.join(outB, 'run.json');
    const recordB = JSON.parse(fs.readFileSync(recordBPath, 'utf8'));
    recordB.srcDigest = '0'.repeat(64);
    fs.writeFileSync(recordBPath, JSON.stringify(recordB, null, 2));
    assert.throws(
      () => mergeRuns([outA, outB]),
      /srcDigest mismatch/u,
      'mergeRuns must reject shard runs with mismatched srcDigest',
    );

    // Restore record B srcDigest, then test non-zero exit code
    recordB.srcDigest = computeSrcDigest(recordB.fileDigests);
    recordB.exitCode = 1;
    fs.writeFileSync(recordBPath, JSON.stringify(recordB, null, 2));
    assert.throws(
      () => mergeRuns([outB]),
      /non-zero exit code|failed exit code/u,
      'mergeRuns must reject run with non-zero exit code',
    );

    // Test missing preloadDigest
    recordB.exitCode = 0;
    delete recordB.preloadDigest;
    delete recordB.coveragePreload;
    fs.writeFileSync(recordBPath, JSON.stringify(recordB, null, 2));
    assert.throws(
      () => mergeRuns([outB]),
      /preloadDigest/u,
      'mergeRuns must reject run with missing preloadDigest',
    );

    // Test incomplete witness manifest
    recordB.preloadDigest = currentPreloadSha256();
    recordB.coveragePreload = {
      active: true,
      option: '--import=x',
      module: 'scripts/checks/fallback-branch-census-preload.js',
      sha256: recordB.preloadDigest,
    };
    recordB.witnessAccounting = {
      complete: false,
      started: 2,
      completeCount: 1,
      missingWitnesses: 1,
      uninstrumentedCount: 0,
      exitCode: 0,
    };
    fs.writeFileSync(recordBPath, JSON.stringify(recordB, null, 2));
    assert.throws(
      () => mergeRuns([outB], {strictWitnesses: true}),
      /incomplete witness manifest|missingWitnesses/u,
      'mergeRuns with strictWitnesses must reject run with incomplete witness manifest',
    );
    const fiveRuns = ['unit', 'packaging', 'integration', 'bootstrap', 'formation'].map((lane) => ({
      id: `${lane}-1`,
      lane,
      host: 'fixture',
      commit: COMMIT,
      startedAt: new Date().toISOString(),
      coverageDigest: 'a'.repeat(64),
      witnesses: {started: 1, complete: 1, lost: 0},
      ...(lane === 'bootstrap' ? {witnessAccounting: {complete: false, missingWitnesses: 1}} : {}),
    }));
    assert.throws(
      () => assertCompleteFiveLaneJoin({runs: fiveRuns, unreadable: []}, {runs: fiveRuns}),
      /complete runs with zero lost witnesses|incomplete runs|offending runs/u,
      'assertCompleteFiveLaneJoin must reject incomplete run',
    );
  });

test('R4 dependency-aware shard applicability accepts matching shards and rejects drifted dependencies or files',
  () => {
    const root = makeTempRoot();
    const fileDigests = {
      'src/subject.js': sha256Hex(fs.readFileSync(path.join(root, 'src', 'subject.js'))),
    };
    const srcDigest = computeSrcDigest(fileDigests);
    const preloadDigest = currentPreloadSha256();
    const shardRecord = {
      id: 'unit-shard-1',
      lane: 'unit',
      srcDigest,
      preloadDigest,
      dependencyFingerprint: 'dep-fingerprint-v1',
      fileDigests,
      witnessAccounting: {
        complete: true,
        started: 1,
        completeCount: 1,
        missingWitnesses: 0,
        uninstrumentedCount: 0,
        exitCode: 0,
      },
    };

    // Applicable when matching
    const validResult = validateShardApplicability(shardRecord, {
      root,
      currentPreloadDigest: preloadDigest,
      currentDependencyFingerprint: 'dep-fingerprint-v1',
    });
    assert.equal(validResult.applicable, true);

    // Inapplicable when file content drifts
    fs.writeFileSync(path.join(root, 'src', 'subject.js'), 'export const mutated = true;\n');
    const driftedResult = validateShardApplicability(shardRecord, {
      root,
      currentPreloadDigest: preloadDigest,
      currentDependencyFingerprint: 'dep-fingerprint-v1',
    });
    assert.equal(driftedResult.applicable, false);
    assert.match(driftedResult.reason, /drift|mismatch/u);

    // Inapplicable when dependency fingerprint drifts
    fs.writeFileSync(path.join(root, 'src', 'subject.js'), 'export const choose = (a, b) => a || b;\n');
    const depDriftResult = validateShardApplicability(shardRecord, {
      root,
      currentPreloadDigest: preloadDigest,
      currentDependencyFingerprint: 'dep-fingerprint-v2',
    });
    assert.equal(depDriftResult.applicable, false);
    assert.match(depDriftResult.reason, /dependency-fingerprint-mismatch|dependency/u);
  });

test('R5 admitClaim and checkSemanticGate award only executed and passed semantic proof IDs rejecting skipped or unproven cases',
  () => {
    const campaignId = 'camp-r5';
    const header = buildFixtureHeader({campaignId, targetIds: ['lagrange']});
    const run = buildFixtureRun({campaignId, targetId: 'lagrange', subkind: 'main'});

    // Gate with unexecuted case:
    const unexecutedGate = {
      status: OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS.PASSED,
      passed: ['isolation:paymentCommit', 'isolation:atomicCommitRequired'],
      failed: [],
      missing: [],
      binding: {
        campaignId,
        containerId: run.deployment.endpoint.containerId,
        imageId: run.identity.products[0].imageId,
        endpoint: `${run.deployment.endpoint.host}:${run.deployment.endpoint.port}`,
      },
      cases: [
        {
          caseId: 'payment',
          proofIds: ['isolation:paymentCommit'],
          status: 'passed',
          binding: {
            campaignId,
            containerId: run.deployment.endpoint.containerId,
            imageId: run.identity.products[0].imageId,
            endpoint: `${run.deployment.endpoint.host}:${run.deployment.endpoint.port}`,
          },
        },
        {
          caseId: 'durability',
          proofIds: ['isolation:atomicCommitRequired'],
          status: 'not-executed',
          binding: {
            campaignId,
            containerId: run.deployment.endpoint.containerId,
            imageId: run.identity.products[0].imageId,
            endpoint: `${run.deployment.endpoint.host}:${run.deployment.endpoint.port}`,
          },
        },
      ],
    };

    run.correctness.semanticGate = unexecutedGate;
    sealFixtureRun(run, {keepFinalState: true});

    // checkSemanticGate must refuse unexecuted case
    const reasons = checkSemanticGate(run);
    assert.ok(
      reasons.includes(ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED) ||
      reasons.includes(ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE),
      'gate with unexecuted cases cannot yield passed status',
    );

    // Durability case without restart evidence must not award proof IDs:
    const missingRestartGate = {
      ...unexecutedGate,
      cases: [
        {
          caseId: 'payment',
          proofIds: ['isolation:paymentCommit'],
          status: 'passed',
          binding: unexecutedGate.binding,
        },
        {
          caseId: 'durability',
          proofIds: ['isolation:atomicCommitRequired'],
          status: 'passed',
          // missing restart/faultEvidence!
          faultEvidence: null,
          binding: unexecutedGate.binding,
        },
      ],
    };
    run.correctness.semanticGate = missingRestartGate;
    sealFixtureRun(run, {keepFinalState: true});

    const reasonsNoRestart = checkSemanticGate(run);
    assert.ok(
      reasonsNoRestart.includes(ADMISSION_REASON.SEMANTIC_GATE_NOT_PASSED) ||
      reasonsNoRestart.includes(ADMISSION_REASON.SEMANTIC_GATE_INCOMPLETE),
      'durability case missing restart evidence cannot pass semantic gate',
    );

    const claim = {targetId: 'lagrange', subkind: 'main', claimKind: 'capacity', forensicReceiptIds: []};
    const rejectedAdmission = admitClaim({
      claim,
      runs: [{file: 'run.json', run}],
      campaignHeaders: new Map([[campaignId, header]]),
      retainedReferences: [],
      invalidations: [],
    });
    assert.notEqual(rejectedAdmission.status, CLAIM_CELL_STATUS.VALID_OBSERVED);
    assert.deepEqual(rejectedAdmission.evidence.semanticProofIds, ['isolation:paymentCommit']);
    assert.ok(!rejectedAdmission.evidence.semanticProofIds.includes('isolation:atomicCommitRequired'),
      'proof ID for durability lacking restart evidence must not be awarded');

    // Valid gate with executed passed case awards proof IDs upon admission:
    const validGate = {
      status: OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS.PASSED,
      passed: ['isolation:paymentCommit'],
      failed: [],
      missing: [],
      binding: unexecutedGate.binding,
      cases: [
        {
          caseId: 'payment',
          proofIds: ['isolation:paymentCommit'],
          status: 'passed',
          binding: unexecutedGate.binding,
        },
      ],
    };
    run.correctness.semanticGate = validGate;
    sealFixtureRun(run, {keepFinalState: true});
    assert.deepEqual(checkSemanticGate(run), []);
    const admitted = admitClaim({
      claim,
      runs: [{file: 'run.json', run}],
      campaignHeaders: new Map([[campaignId, header]]),
      retainedReferences: [],
      invalidations: [],
    });
    assert.deepEqual(admitted.evidence.semanticProofIds, ['isolation:paymentCommit']);
  });

test('R6 gateBindingHolds strictly enforces deployment identity across all proof cases refusing cross-deployment evidence',
  () => {
    const campaignId = 'camp-r6';
    const run = buildFixtureRun({campaignId, targetId: 'lagrange', subkind: 'main'});

    const validBinding = {
      campaignId,
      containerId: run.deployment.endpoint.containerId,
      imageId: run.identity.products[0].imageId,
      endpoint: `${run.deployment.endpoint.host}:${run.deployment.endpoint.port}`,
    };
    const foreignBinding = {
      ...validBinding,
      containerId: 'ctr-foreign-arm',
    };

    // Case 1: gate.binding matches, but a case has foreign containerId:
    const crossDeploymentGate = {
      status: OLTP_SCENARIO_A_SEMANTIC_GATE_STATUS.PASSED,
      passed: ['isolation:paymentCommit'],
      failed: [],
      missing: [],
      binding: validBinding,
      cases: [
        {
          caseId: 'payment',
          proofIds: ['isolation:paymentCommit'],
          status: 'passed',
          binding: foreignBinding,
        },
      ],
    };

    assert.equal(
      gateBindingHolds(run, validBinding, crossDeploymentGate),
      false,
      'gateBindingHolds must reject gate when case binding has foreign containerId',
    );

    run.correctness.semanticGate = crossDeploymentGate;
    sealFixtureRun(run, {keepFinalState: true});
    const reasons = checkSemanticGate(run);
    assert.ok(
      reasons.includes(ADMISSION_REASON.SEMANTIC_GATE_UNBOUND),
      'checkSemanticGate must return SEMANTIC_GATE_UNBOUND on cross-deployment evidence',
    );

    // Case 2: all cases match deployment:
    const matchingGate = {
      ...crossDeploymentGate,
      cases: [
        {
          caseId: 'payment',
          proofIds: ['isolation:paymentCommit'],
          status: 'passed',
          binding: validBinding,
        },
      ],
    };
    assert.equal(
      gateBindingHolds(run, validBinding, matchingGate),
      true,
      'gateBindingHolds accepts matching deployment identity across all cases',
    );
  });
