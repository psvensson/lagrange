import {test} from '../../src/test-helpers/tap.js';
import {
  areApplicationWriteFormationPreconditionsSatisfied,
  buildApplicationWriteFormationObservation,
  readLocalControlSnapshot,
  runApplicationWriteProbe,
} from './helpers/embedded-cluster-harness.js';
import {
  SCHEMA_JOB_SQL,
} from './helpers/schema-provisioning-job-observer.js';
import {
  EMBEDDED_STEP_OUTCOME,
  expose,
} from './helpers/embedded-node-protocol.js';

const NODE_ID = Object.freeze({SEED: 'seed-node', JOINER: 'joiner-node'});
const EXPECTED_NODE_IDS = Object.freeze([NODE_ID.SEED, NODE_ID.JOINER]);

const fulfilled = (value) => ({
  outcome: EMBEDDED_STEP_OUTCOME.FULFILLED,
  value: expose(value),
});

const schemaRow = (jobId, status, extra = {}) => fulfilled({
  rows: [{job_id: jobId, status, current_step: status,
    reason_codes: '[]', attempt_count: 1, ...extra}],
});

function snapshot({handoffState = 'complete', runtimePromotionAllowed = true,
  nextAction = 'admit_active_gate',
  handoffExpectedNodeIds = EXPECTED_NODE_IDS} = {}) {
  return {
    capturedAt: 1234,
    controlPlaneDiagnostics: {
      publicationActiveGateHandoff: {
        expectedNodeIds: handoffExpectedNodeIds,
        nextAction,
        runtimePromotionAllowed,
        state: handoffState,
      },
      currentPriorityPlacementObservation: {
        capturedAt: 1233,
        eligibleNodeIds: [NODE_ID.SEED],
        satisfied: false,
        state: 'available',
      },
      readinessByNodeId: {
        [NODE_ID.SEED]: {dimensions: {controlPlaneWritable: false}},
        [NODE_ID.JOINER]: {dimensions: {provisioningEligible: false}},
      },
    },
  };
}

test('embedded formation consumes authoritative preconditions before DDL',
  (t) => {
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        {nodes: EXPECTED_NODE_IDS},
        EXPECTED_NODE_IDS),
      false,
      'active-node visibility alone is not application-write readiness',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot({handoffState: 'pending'}), EXPECTED_NODE_IDS),
      false,
      'an incomplete publication handoff keeps the formation attempt closed',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot({runtimePromotionAllowed: false}), EXPECTED_NODE_IDS),
      false,
      'a handoff without runtime promotion permission keeps formation closed',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot({nextAction: 'observe_owner_handoff'}), EXPECTED_NODE_IDS),
      false,
      'a handoff not yet admitting the active gate keeps formation closed',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        handoffExpectedNodeIds: [NODE_ID.SEED],
      }), EXPECTED_NODE_IDS),
      false,
      'a reduced handoff cohort cannot establish formation',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        handoffExpectedNodeIds: [NODE_ID.SEED, 'other-node'],
      }), EXPECTED_NODE_IDS),
      false,
      'a same-size mismatched handoff cohort cannot establish formation',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(snapshot({
        handoffExpectedNodeIds: [...EXPECTED_NODE_IDS, 'other-node'],
      }), EXPECTED_NODE_IDS),
      false,
      'an expanded handoff cohort cannot establish this formation',
    );
    t.equal(
      areApplicationWriteFormationPreconditionsSatisfied(
        snapshot(), EXPECTED_NODE_IDS),
      true,
      'the completed exact-cohort handoff establishes formation despite ' +
        'stale placement and per-peer readiness projections',
    );
    t.end();
  });

test('embedded formation failure retains a compact owner observation', (t) => {
  t.same(
    buildApplicationWriteFormationObservation(snapshot({
      handoffExpectedNodeIds: [NODE_ID.SEED],
    }), EXPECTED_NODE_IDS),
    {
      snapshotCapturedAt: 1234,
      handoffState: 'complete',
      handoffRuntimePromotionAllowed: true,
      handoffNextAction: 'admit_active_gate',
      handoffExpectedNodeIds: [NODE_ID.SEED],
      expectedNodeIds: EXPECTED_NODE_IDS,
      preconditionsSatisfied: false,
    },
    'timeout evidence names every input to the formation predicate',
  );
  t.end();
});

test('embedded formation submits its DDL witness once', async (t) => {
  let createAttempts = 0;
  let insertAttempts = 0;
  await t.rejects(runApplicationWriteProbe(async (sql) => {
    if (sql.startsWith('CREATE TABLE')) {
      createAttempts++;
      throw new Error('terminal schema rejection');
    }
    insertAttempts++;
    return [];
  }, {deadlineMs: 1000, now: () => 0, sleep: async () => {}}),
  /create: terminal schema rejection/,
  'the first DDL rejection is surfaced directly');
  t.equal(createAttempts, 1, 'DDL is submitted exactly once');
  t.equal(insertAttempts, 0, 'a rejected DDL cannot fall through to INSERT');
});

test('formation blocks INSERT until the exact schema job succeeds',
  async (t) => {
    const jobId = 'schema-job-settling';
    let nowMs = 0;
    let createAttempts = 0;
    let insertAttempts = 0;
    let observations = 0;
    const events = [];
    const jobOutcomes = [
      schemaRow(jobId, 'PENDING'),
      schemaRow(jobId, 'SUCCEEDED', {completed_at: 250}),
    ];
    const result = await runApplicationWriteProbe(async (sql, params) => {
      if (sql === SCHEMA_JOB_SQL) {
        observations++;
        events.push(`observe:${observations}`);
        t.same(params, [jobId], 'only the returned durable job is observed');
        return jobOutcomes.shift();
      }
      if (sql.startsWith('CREATE TABLE')) {
        createAttempts++;
        events.push('create');
        return fulfilled({success: true, jobId, contractState: 'pending',
          nextAction: 'retry'});
      }
      insertAttempts++;
      events.push('insert');
      return fulfilled({rows: []});
    }, {
      deadlineMs: 1000,
      now: () => nowMs,
      sleep: async (ms) => {
        nowMs += ms;
      },
    });
    t.equal(result.create.ready, true, 'SUCCEEDED is the readiness event');
    t.equal(result.create.create.contractState, 'pending',
      'the fulfilled pending contract is retained, not called ready');
    t.equal(result.create.job.status, 'SUCCEEDED',
      'terminal owner state is retained');
    t.equal(createAttempts, 1, 'CREATE is submitted exactly once');
    t.equal(observations, 2, 'pending requires another read-only observation');
    t.equal(insertAttempts, 1, 'INSERT is submitted exactly once');
    t.same(events, ['create', 'observe:1', 'observe:2', 'insert'],
      'INSERT follows the terminal SUCCEEDED observation');
  });

test('schema failure and deadline prevent the formation INSERT', async (t) => {
  const jobId = 'schema-job-terminal';
  const pendingCreate = fulfilled({success: true, jobId,
    contractState: 'pending', nextAction: 'retry'});
  let failedCreateAttempts = 0;
  let failedInsertAttempts = 0;
  await t.rejects(runApplicationWriteProbe(async (sql) => {
    if (sql === SCHEMA_JOB_SQL) {
      return schemaRow(jobId, 'FAILED', {error_code: 'PROVISION_FAILED',
        error_message: 'canonical failure'});
    }
    if (sql.startsWith('CREATE TABLE')) {
      failedCreateAttempts++;
      return pendingCreate;
    }
    failedInsertAttempts++;
    return fulfilled({rows: []});
  }, {deadlineMs: 1000, now: () => 0, sleep: async () => {}}),
  /create: canonical failure/,
  'the durable owner failure is surfaced directly');
  t.equal(failedCreateAttempts, 1, 'failure never retries CREATE');
  t.equal(failedInsertAttempts, 0, 'FAILED cannot fall through to INSERT');

  let nowMs = 0;
  let createAttempts = 0;
  let insertAttempts = 0;
  await t.rejects(runApplicationWriteProbe(async (sql) => {
    if (sql === SCHEMA_JOB_SQL) return schemaRow(jobId, 'RUNNING');
    if (sql.startsWith('CREATE TABLE')) {
      createAttempts++;
      return pendingCreate;
    }
    insertAttempts++;
    return fulfilled({rows: []});
  }, {
    deadlineMs: 500,
    now: () => nowMs,
    sleep: async (ms) => {
      nowMs += ms;
    },
  }), /create: schema provisioning deadline reached/,
  'the existing formation deadline bounds the durable observation');
  t.equal(createAttempts, 1, 'deadline never retries CREATE');
  t.equal(insertAttempts, 0, 'deadline cannot fall through to INSERT');
});

test('embedded control-snapshot observation is bounded', async (t) => {
  let observedSignal = null;
  const stalledFetch = (_url, options) => {
    observedSignal = options.signal;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('bounded observation aborted');
        error.name = 'AbortError';
        reject(error);
      }, {once: true});
    });
  };
  await t.rejects(
    readLocalControlSnapshot(t, {adminPort: 1}, 1, stalledFetch),
    {name: 'AbortError'},
    'a stalled admin observation cannot escape its remaining budget',
  );
  t.equal(observedSignal?.aborted, true, 'the request signal is aborted');
});
