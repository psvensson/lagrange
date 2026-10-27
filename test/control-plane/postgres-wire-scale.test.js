import {test} from '../../src/test-helpers/tap.js';
import {ServiceDefinitionsOwner} from '../../src/control-plane/owners/service-definitions-owner.js';
import {POSTGRES_WIRE_SCALE_ERROR_CODE, POSTGRES_WIRE_SCALE_PREDICATE} from
  '../../src/control-plane/owners/postgres-wire-scale-contract.js';
import {AdminOwnerOperations} from '../../src/admin/admin-owner-operations.js';
import {CONTROL_PLANE_MUTATION_OUTCOME} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {PARTITION_SETTLED_REPLAY} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';

const CONFIG = Object.freeze({host: '127.0.0.1', authMode: 'password', tlsMode: 'disable'});
const REQUEST = Object.freeze({replicaCount: 2, runtimeConfig: CONFIG});
const APPLIED = Object.freeze({success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
  partitionResult: {affectedRows: 1}});

function fixture(answer = APPLIED, retryOptions = {}) {
  const calls = [];
  const owner = new ServiceDefinitionsOwner({catalogOwner: {},
    controlPlaneSystemTableGateway: {
      async updateSystemTableRow(table, where, data, options) {
        calls.push({table, where, data, options});
        return typeof answer === 'function' ? answer(calls.length) : answer;
      },
    }, ...retryOptions});
  return {owner, calls, admin: new AdminOwnerOperations({getServiceDefinitionsOwner: () => owner})};
}

test('PG-wire scale validates exact request and delegates config to descriptor owner', async (t) => {
  const {owner, calls} = fixture();
  const invalid = [undefined, null, {}, [], {...REQUEST, serviceId: 'other'},
    {...REQUEST, runtimeKind: 'foreign'}, ...[-1, 1.5, '2', Infinity, 2 ** 53].map(
      (replicaCount) => ({...REQUEST, replicaCount})),
    ...[null, [], 'json', {host: '0.0.0.0', authMode: 'trust', tlsMode: 'disable'},
      {host: '127.0.0.1'}, {...CONFIG, secret: 'forbidden'}, {...CONFIG, port: 0}]
      .map((runtimeConfig) => ({...REQUEST, runtimeConfig}))];
  for (const request of invalid) {
    await t.rejects(owner.scalePostgresWireListener(request),
      {code: POSTGRES_WIRE_SCALE_ERROR_CODE.REQUEST_INVALID});
  }
  t.equal(calls.length, 0, 'invalid input has no durable effect');
  const answer = await owner.scalePostgresWireListener({...REQUEST, replicaCount: 0});
  t.equal(answer.desiredState.replicaCount, 0, 'zero is the explicit scale-down intent');
  t.same(calls[0].where, POSTGRES_WIRE_SCALE_PREDICATE);
  t.same(Object.keys(calls[0].data).sort(), ['replica_count', 'runtime_config']);
  t.equal(calls[0].table, 'service_definitions');
});

test('PG-wire scale never reports zero, unknown, ambiguous or deferred effects persisted', async (t) => {
  for (const outcome of [CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    CONTROL_PLANE_MUTATION_OUTCOME.NO_OP, CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED]) {
    const {admin} = fixture({success: true, outcome, affectedRows: 0});
    const response = await admin.scalePostgresWireListener(REQUEST);
    t.equal(response.statusCode, 409);
    t.equal(response.body.errorCode, POSTGRES_WIRE_SCALE_ERROR_CODE.DEFINITION_MISMATCH);
  }
  const unknown = [{success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED},
    {...APPLIED, partitionResult: {affectedRows: 0,
      settledReplay: PARTITION_SETTLED_REPLAY.OUTCOME_NOT_RETAINED}},
    ...[2, -1, '1'].map((affectedRows) => ({...APPLIED, partitionResult: {affectedRows}})),
    {success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED, affectedRows: 0},
    {success: true, outcome: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY, affectedRows: 1}];
  for (const result of unknown) {
    const {admin} = fixture(result);
    const response = await admin.scalePostgresWireListener(REQUEST);
    t.equal(response.statusCode, 503);
    t.equal(response.body.errorCode, POSTGRES_WIRE_SCALE_ERROR_CODE.OUTCOME_UNCONFIRMED);
    t.equal(response.body.success, false);
  }
});

test('PG-wire scale gateway retries preserve the original desired values and identity', async (t) => {
  let now = 0;
  const request = {replicaCount: 2, runtimeConfig: {...CONFIG}};
  const {owner, calls} = fixture((attempt) => attempt === 1 ? {
    success: false, error: 'authoritative_row_source_unavailable', deferRetry: true,
  } : APPLIED, {controlPlaneWriteRetryNow: () => now,
    controlPlaneWriteRetrySleep: async (delayMs) => {
      now += delayMs;
      request.replicaCount = 7;
      request.runtimeConfig.authMode = 'trust';
    }});
  const answer = await owner.scalePostgresWireListener(request);
  t.same(answer.desiredState, REQUEST);
  t.equal(calls.length, 2);
  t.same(calls[1].data, calls[0].data);
  t.same(calls[1].where, POSTGRES_WIRE_SCALE_PREDICATE);
  t.equal(calls[0].options.writeIdentity, calls[1].options.writeIdentity);
  t.type(calls[0].options.writeIdentity, 'string');
});

test('PG-wire scale preserves HTTP owner readiness and genuine failure outcomes', async (t) => {
  const absent = await new AdminOwnerOperations().scalePostgresWireListener(REQUEST);
  t.equal(absent.statusCode, 503);
  t.equal(absent.body.outcome, 'owner_not_ready');
  const {admin} = fixture({success: false, error: 'owner permanently unavailable', errorCode: 'OWNER_CLOSED',
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED});
  const failed = await admin.scalePostgresWireListener(REQUEST);
  t.equal(failed.statusCode, 500);
  t.equal(failed.body.errorCode, 'OWNER_CLOSED');
  t.equal(failed.body.mutationOutcome, CONTROL_PLANE_MUTATION_OUTCOME.REJECTED);
  const invalid = await fixture().admin.scalePostgresWireListener();
  t.equal(invalid.statusCode, 400);
});
