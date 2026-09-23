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
import {ReplicaOperationRepository} from
  '../../src/rebalancer/replica-operation-repository.js';

const TEST_TIMEOUT_MS = 60000;
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
