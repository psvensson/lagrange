// Receipt-free witnesses of quest reroute-carries-the-entry-id (verification
// round 1, B2; the design's per-loop W1 variants): every loop that sends one
// logical mutation again after an honest "outcome unknown" answer carries the
// mutation's ONE identity - minted once, outside its attempt loop - so the
// partition answers the second attempt from the outcome row of the first and
// the mutation applies once.
//
// The loops: the CDC integration's routed system-table mutation (S2, its
// attempt loop over the SQL engine), its local system-table lane (S3, a local
// replica sent the write before the routed engine path), and the rebalancer's
// replica-operation mutation gateway (S4, both retry loops: the SQL mutation
// through the control-plane gateway's query path, and the row mutation
// through the gateway's mutation ingress and the CDC row mutations).
//
// Each runs over production owners: CDCIntegrationService,
// ControlPlaneSystemTableGateway, ReplicaOperationRepository, SQLQueryEngine
// and a replica on the controllable consensus port (write-identity-attempt-
// harness.js) whose first proposal of the mutation is released unknown by its
// commit deadline and commits afterwards. The environment then withdraws the
// replica from the engine's catalogue until the loop's next engine call
// (routing churn), so the loop's own attempt - not the executor's in-call
// reroute - sends the write again. Every expectation is read from the replica
// (the entryIds it was sent, what it applied) and from the loop's answer.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  INSERT_ROW_SQL,
  UPDATE_ROW_SQL,
  IDENTITY_TABLE,
  createClientPath,
  openReplica,
} from './write-identity-attempt-harness.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../../src/control-plane/control-plane-system-table-gateway-shared.js';
import {PARTITION_COMMITTED_STATEMENT_BINDING} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';

const TEST_TIMEOUT_MS = 60000;
const SETTLE_POLLS = 400;
const SETTLE_POLL_MS = 5;
// The refusal code the quest names (the name of the contract).
const STATEMENT_MISMATCH_CODE = 'partition_write_entry_id_statement_mismatch';
const NODE_ID = 'identity-node';
const ROW_ID = 'op-identity';
const SEED = Object.freeze({sql: INSERT_ROW_SQL, params: [ROW_ID, 'pending']});
// The mutation every loop sends: the engine renders the CDC row mutation's
// statement with these parameters too.
const MUTATION = Object.freeze({
  sql: UPDATE_ROW_SQL, params: ['moved', ROW_ID]});
const SILENT_LOGGER = Object.freeze({
  info() {}, warn() {}, error() {}, debug() {}});
const NO_CACHE = Object.freeze({
  get: () => null, getAll: () => [], filter: () => []});

// A replica holding the row, the client path in front of it, and the
// owners a loop runs over. The CDC integration is set to one attempt per
// call when the loop under witness is the rebalancer's (its retry is then the
// repository's own); its attempt settings are its own fields.
async function withLoopOwners(partitionId, {cdcAttempts}, body) {
  const replica = await openReplica(partitionId, {releasable: true});
  try {
    const client = createClientPath(replica);
    const seeded = await client.engine.executeQuery(SEED.sql, SEED.params);
    assert.equal(seeded.success, true, 'setup: the row is written');
    const cdc = new CDCIntegrationService({nodeId: NODE_ID,
      sqlQueryEngine: client.engine});
    Object.assign(cdc, {retryMaxAttempts: cdcAttempts, retryDelayMs: 1});
    const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID,
      sqlQueryEngine: client.engine, cdcIntegrationService: cdc});
    const repository = new ReplicaOperationRepository({nodeId: NODE_ID,
      systemTableCache: NO_CACHE, cdcIntegrationService: cdc,
      controlPlaneSystemTableGateway: gateway, logger: SILENT_LOGGER});
    await body({replica, client, cdc, repository});
  } finally {
    await replica.close();
  }
}

// Run a loop whose first engine call is answered "outcome unknown" (the
// replica releases the proposal, which commits afterwards); the replica is
// withdrawn from the engine's catalogue after that call's first delivery
// until the loop calls the engine again. The idempotency key of each engine
// call, and the loop's answer.
async function afterAnUnknownOutcome({replica, client}, runLoop) {
  const engineCalls = [];
  const execute = client.engine.executeQuery.bind(client.engine);
  client.engine.executeQuery = (sql, params, options) => {
    engineCalls.push(options?.idempotencyKey ?? null);
    client.catalogue.withdrawn = false;
    return execute(sql, params, options);
  };
  const deliver = client.router.deliver.bind(client.router);
  client.router.deliver = async (address, message) => {
    const answer = await deliver(address, message);
    client.catalogue.withdrawn = engineCalls.length === 1;
    return answer;
  };
  replica.armRelease();
  let answer;
  try {
    answer = await runLoop();
  } catch (error) {
    answer = {success: false, error: error.message};
  }
  return {answer, engineCalls};
}

// Every engine call of the loop carried one key, and the loop supplied it.
function assertOneIdempotencyKey(engineCalls, loop) {
  assert.equal(typeof engineCalls[0], 'string',
    `${loop}: the loop supplies the mutation's idempotency key`);
  assert.deepEqual(engineCalls, engineCalls.map(() => engineCalls[0]),
    `${loop}: every attempt carries the mutation's one idempotency key`);
}

function assertAppliedOnceUnderOneIdentity(replica, {answer}, loop) {
  const entryIds = replica.entryIdsSentFor(MUTATION);
  assert.equal(replica.release.released, 1,
    `setup: ${loop}: the replica released the first proposal unknown`);
  assert.ok(entryIds.length > 1,
    `${loop}: the mutation was sent again after the unknown outcome ` +
    `(${JSON.stringify(entryIds)})`);
  assert.equal(replica.applications(MUTATION), 1,
    `${loop}: the mutation applied once (sent under ` +
    `${JSON.stringify(entryIds)})`);
  assert.equal(new Set(entryIds).size, 1,
    `${loop}: every attempt carries the mutation's one entryId ` +
    `(${JSON.stringify(entryIds)})`);
  assert.equal(answer?.success, true,
    `${loop}: the loop answers success (${JSON.stringify(answer)})`);
}

test('S2: the CDC routed mutation sends every attempt under its one ' +
  'identity and applies once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withLoopOwners('identity-loop-cdc', {cdcAttempts: 6},
    async (owners) => {
      const run = await afterAnUnknownOutcome(owners, () =>
        owners.cdc.executeSQLViaQueryEngine(MUTATION.sql, MUTATION.params,
          {queryTimeoutMs: 6000}));
      assert.equal(run.engineCalls.length, 2,
        'S2: the loop made a second attempt after the unknown outcome');
      assertAppliedOnceUnderOneIdentity(owners.replica, run, 'S2');
      assertOneIdempotencyKey(run.engineCalls, 'S2');
    });
});

test('S3: the CDC local lane sends the write to its local replica under the ' +
  'entryId the routed path carries, and it applies once',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLoopOwners('identity-loop-lane', {cdcAttempts: 6},
    async (owners) => {
      // The node's local leader replica of the table (the lane's input,
      // as the node's service registry resolves it).
      owners.cdc.resolveLocalSystemTableServices = () =>
        [owners.replica.service];
      const run = await afterAnUnknownOutcome(owners, () =>
        owners.cdc.executeSQLViaQueryEngine(MUTATION.sql, MUTATION.params,
          {queryTimeoutMs: 6000}));
      assertAppliedOnceUnderOneIdentity(owners.replica, run, 'S3');
    });
});

test('S4: the rebalancer\'s SQL mutation retry sends every attempt under ' +
  'its one identity and applies once', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withLoopOwners('identity-loop-rebalancer-sql', {cdcAttempts: 1},
    async (owners) => {
      const run = await afterAnUnknownOutcome(owners, () =>
        owners.repository.executeOperationMutationWithRetry(MUTATION.sql,
          MUTATION.params, {}));
      assert.equal(run.engineCalls.length, 2,
        'S4: the repository made a second attempt after the unknown outcome');
      assertAppliedOnceUnderOneIdentity(owners.replica, run, 'S4 sql');
      assertOneIdempotencyKey(run.engineCalls, 'S4');
    });
});

test('S4: the rebalancer\'s row mutation retry, through the gateway\'s ' +
  'mutation ingress and the CDC row mutation, sends every attempt under ' +
  'its one identity and applies once', {timeout: TEST_TIMEOUT_MS},
async () => {
  await withLoopOwners('identity-loop-rebalancer-row', {cdcAttempts: 1},
    async (owners) => {
      const run = await afterAnUnknownOutcome(owners, () =>
        owners.repository.executeReplicaOperationGatewayMutationWithRetry({
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: IDENTITY_TABLE,
          whereClause: {operation_id: ROW_ID},
          data: {status: MUTATION.params[0]},
        }, {}));
      assert.equal(run.engineCalls.length, 2,
        'S4: the repository made a second attempt after the unknown outcome');
      assertAppliedOnceUnderOneIdentity(owners.replica, run, 'S4 row');
      assertOneIdempotencyKey(run.engineCalls, 'S4');
    });
});

// Verification round 3, B4: every carrier of a mutation's entryId sends the
// statement in the one rendering the engine path sends, so the partition
// sees one statement per logical mutation. The lane is offered its local
// replica on the first attempt only (the replica stops being a local leader
// after the unknown outcome - the usual cause of one), so the routed engine
// path sends the mutation again under the entryId the lane's attempt
// settled: the partition answers it as a replay of the same statement, and
// the loop answers success.
function offerTheLaneOnce(owners) {
  let offers = 0;
  owners.cdc.resolveLocalSystemTableServices = () => {
    offers += 1;
    return offers === 1 ? [owners.replica.service] : [];
  };
}

// The engine's deliveries of a statement to the replica, and their answers.
function deliveriesOf(client, statement) {
  const params = JSON.stringify(statement.params);
  return client.router.deliveries.filter((delivery) =>
    JSON.stringify(delivery.params) === params);
}

function assertEngineResendIsReplay(owners, run, loop) {
  const deliveries = deliveriesOf(owners.client, MUTATION);
  assert.equal(deliveries.length, 1, `${loop}: the engine path sent the ` +
    `mutation once (${JSON.stringify(deliveries.map((d) => d.answer))})`);
  assert.equal(deliveries[0].answer?.idempotentReplay, true,
    `${loop}: the engine's re-send is answered from the lane attempt's ` +
    `outcome row (${JSON.stringify(deliveries[0].answer)})`);
  assert.equal(deliveries[0].answer?.statementBinding,
    PARTITION_COMMITTED_STATEMENT_BINDING.SAME_STATEMENT,
    `${loop}: as a replay of the same statement`);
  assert.equal(run.engineCalls.length, 1,
    `${loop}: the loop called the engine once after the lane`);
  assertAppliedOnceUnderOneIdentity(owners.replica, run, loop);
}

test('B4 V2: the CDC routed mutation whose lane attempt was answered ' +
  'unknown is answered a replay by the engine path, and succeeds once',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLoopOwners('identity-loop-lane-once', {cdcAttempts: 6},
    async (owners) => {
      offerTheLaneOnce(owners);
      const run = await afterAnUnknownOutcome(owners, () =>
        owners.cdc.executeSQLViaQueryEngine(MUTATION.sql, MUTATION.params,
          {queryTimeoutMs: 6000}));
      assertEngineResendIsReplay(owners, run, 'V2');
    });
});

test('B4 V3: the rebalancer\'s row mutation whose lane attempt was answered ' +
  'unknown is answered a replay by the engine path, and succeeds once',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withLoopOwners('identity-loop-lane-once-row', {cdcAttempts: 1},
    async (owners) => {
      offerTheLaneOnce(owners);
      const run = await afterAnUnknownOutcome(owners, () =>
        owners.repository.executeReplicaOperationGatewayMutationWithRetry({
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: IDENTITY_TABLE,
          whereClause: {operation_id: ROW_ID},
          data: {status: MUTATION.params[0]},
        }, {}));
      assertEngineResendIsReplay(owners, run, 'V3');
    });
});

// Verification round 4, B6: a node leading two partitions of the table
// offers the lane both. The first answers the write "outcome unknown" (it
// may have applied there: it commits afterwards), so the lane never sends it
// on to the second partition, whose entryId is another; the write is sent
// again only under the entryId the unknown answer was given for, and the
// loop answers the truth. What each partition was sent and applied is read
// from the partitions themselves.
test('B6: the CDC local lane never sends a write whose outcome is unknown ' +
  'on to another local partition', {timeout: TEST_TIMEOUT_MS}, async () => {
  const second = await openReplica('identity-loop-lane-second-partition',
    {releasable: true});
  try {
    await withLoopOwners('identity-loop-lane-first-partition',
      {cdcAttempts: 6}, async (owners) => {
        owners.cdc.resolveLocalSystemTableServices = () =>
          [owners.replica.service, second.service];
        const insert = {sql: INSERT_ROW_SQL, params: ['op-lane-b6', 'new']};
        const run = await afterAnUnknownOutcome(owners, () =>
          owners.cdc.executeSQLViaQueryEngine(insert.sql, insert.params,
            {queryTimeoutMs: 6000}));
        // The released proposal commits after its unknown answer.
        for (let polls = 0; owners.replica.valueOf(insert.params[0]) ===
          null && polls < SETTLE_POLLS; polls += 1) {
          await new Promise((resume) => setTimeout(resume, SETTLE_POLL_MS));
        }
        const partitions = [owners.replica, second];
        const entryIds = partitions.flatMap((partition) =>
          partition.entryIdsSentFor(insert));
        assert.equal(owners.replica.release.released, 1,
          'setup: the first partition released the write unknown');
        assert.deepEqual(partitions.map((partition) =>
          partition.applications(insert)), [1, 0],
        'the write applied once, in the partition that answered unknown');
        assert.deepEqual(second.entryIdsSentFor(insert), [],
          'the write is never sent to the second partition');
        assert.equal(new Set(entryIds).size, 1, 'the write is sent under ' +
          `one entryId only (${JSON.stringify(entryIds)})`);
        assert.equal(run.answer?.success, true, 'the loop answers the ' +
          `write's success (${JSON.stringify(run.answer)})`);
      });
  } finally {
    await second.close();
  }
});

// Verification round 3, F22: a partition's refusal of a key reused for
// another statement failed for good - no attempt can succeed under it - so
// a loop sends that statement once and answers the refusal, whatever the
// coordinator's summary text says. The key is settled for MUTATION first;
// the loop is then handed the key with another statement (the CDC mutation
// takes its caller's key; the rebalancer's repository is made to mint it).
const OTHER = Object.freeze({sql: UPDATE_ROW_SQL, params: ['other', ROW_ID]});
const REUSED_KEY = 'identity-loop-reused-key';

async function sentOnceUnderASettledKey(owners, runLoop, loop) {
  const settled = await owners.client.engine.executeQuery(MUTATION.sql,
    MUTATION.params, {idempotencyKey: REUSED_KEY});
  assert.equal(settled.success, true, `setup: ${loop}: the key is settled`);
  const engineCalls = [];
  const execute = owners.client.engine.executeQuery.bind(owners.client.engine);
  owners.client.engine.executeQuery = (sql, params, options) => {
    engineCalls.push(options?.idempotencyKey ?? null);
    return execute(sql, params, options);
  };
  let answer;
  try {
    answer = await runLoop();
  } catch (error) {
    answer = error;
  }
  const deliveries = deliveriesOf(owners.client, OTHER);
  assert.deepEqual(deliveries.map((delivery) => delivery.answer?.failureCode),
    [STATEMENT_MISMATCH_CODE], `${loop}: the partition refused the other ` +
    'statement under the settled key, and it was sent once');
  assert.deepEqual(engineCalls, [REUSED_KEY],
    `${loop}: the loop attempted it once`);
  assert.notEqual(answer?.success, true, `${loop}: the loop does not answer ` +
    'success');
  assert.equal(owners.replica.valueOf(ROW_ID), MUTATION.params[0],
    `${loop}: the other statement was not applied`);
}

test('F22: the CDC routed mutation sends a statement refused under its ' +
  'settled key once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withLoopOwners('identity-loop-mismatch-cdc', {cdcAttempts: 6},
    (owners) => sentOnceUnderASettledKey(owners, () =>
      owners.cdc.executeSQLViaQueryEngine(OTHER.sql, OTHER.params,
        {queryTimeoutMs: 6000, idempotencyKey: REUSED_KEY}), 'CDC'));
});

test('F22: the rebalancer\'s mutation retry sends a statement refused ' +
  'under its settled key once', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withLoopOwners('identity-loop-mismatch-rebalancer', {cdcAttempts: 1},
    (owners) => {
      owners.repository.mintOperationMutationIdempotencyKey = () =>
        REUSED_KEY;
      return sentOnceUnderASettledKey(owners, () =>
        owners.repository.executeOperationMutationWithRetry(OTHER.sql,
          OTHER.params, {}), 'rebalancer');
    });
});
