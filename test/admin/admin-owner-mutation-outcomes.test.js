// Actual HTTP -> semantic owner -> canonical gateway. CDC outcomes are the
// controlled input; no adapter or cache is allowed to invent application.
import Fastify from 'fastify';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DynamicConfigService} from '../../src/config/dynamic-config-service.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';
import {CDC_TABLE_POLICY_REFUSAL} from '../../src/cache/cdc-table-policy.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {AdminOwnerOperations, registerAdminOwnerOperationRoutes} from
  '../../src/admin/admin-owner-operations.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'fatal'});
const TABLE_ID = 'owner-effect-table';
const CONFIG_KEY = 'logging.level';
const APPLIED = Object.freeze({success: true, affectedRows: 1});
const OPERATIONS = [
  {kind: 'config', existing: false, method: 'PUT', url: '/api/admin/config/' + CONFIG_KEY,
    payload: {value: 'warn'}, prefix: 'CONFIG_MUTATION'},
  {kind: 'config', existing: true, method: 'PUT', url: '/api/admin/config/' + CONFIG_KEY,
    payload: {value: 'warn'}, prefix: 'CONFIG_MUTATION'},
  {kind: 'policy', method: 'PATCH', url: '/api/admin/tables/' + TABLE_ID + '/policy',
    payload: {policy: {replicaCount: 3}}, prefix: 'TABLE_POLICY_MUTATION'},
];

function fixture(t, operation, initialResult) {
  let result = initialResult;
  const writes = [];
  const receipts = [];
  const events = [];
  const write = async (tableName, ...args) => {
    writes.push({tableName, args});
    if (result instanceof Error) throw result;
    return result;
  };
  const cdc = {insertSystemTableRow: write, updateSystemTableRow: write};
  const gateway = new ControlPlaneSystemTableGateway({nodeId: 'owner-effect-node',
    cdcIntegrationService: cdc});
  const normalize = gateway.normalizeMutationResult.bind(gateway);
  gateway.normalizeMutationResult = (answer) => {
    const receipt = normalize(answer);
    receipts.push(receipt);
    return receipt;
  };
  gateway.readRows = async (tableName) => ({success: true, rows: tableName === 'tables' ?
    [{table_id: TABLE_ID, table_name: 'events', table_policies: '{}'}] :
    (operation.existing ? [{config_key: CONFIG_KEY, config_value: 'info',
      value_type: 'string'}] : [])});
  const config = new DynamicConfigService({nodeId: 'owner-effect-node',
    controlPlaneSystemTableGateway: gateway});
  const policy = new TablePolicyService({controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService: cdc});
  const cachedPolicy = Object.freeze({retained: 'original policy cache'});
  policy.policyCache.set(TABLE_ID, cachedPolicy);
  policy.on('policyUpdated', (event) => events.push(event));
  const app = Fastify();
  t.teardown(() => app.close());
  registerAdminOwnerOperationRoutes(app, new AdminOwnerOperations({
    getDynamicConfigService: () => config, getTablePolicyService: () => policy,
  }, 'owner-effect-node'));
  return {app, config, policy, writes, receipts, events, cachedPolicy,
    setResult(answer) {
      result = answer;
    },
    callOwner: () => operation.kind === 'config' ? config.set(CONFIG_KEY, 'warn') :
      policy.updateTablePolicy(TABLE_ID, {replicaCount: 3})};
}

function assertNoPublication(t, f) {
  t.equal(f.config.stats.writes, 0, 'no successful-write statistic');
  t.equal(f.policy.policyCache.get(TABLE_ID), f.cachedPolicy, 'no cache invalidation');
  t.equal(f.events.length, 0, 'no policy-updated event');
}

test('owners preserve negative gateway outcomes without publishing applied success', async (t) => {
  const outcomes = [
    {answer: {success: false, outcome: 'deferred', deferRetry: true,
      retryAfterMs: 17, error: 'authority held', errorCode: 'AUTHORITY_HELD'},
    status: 503, code: 'AUTHORITY_HELD'},
    {answer: {success: false, outcome: 'rejected', error: 'rejected',
      errorCode: 'WRITE_REJECTED'}, status: 500, code: 'WRITE_REJECTED'},
    {answer: {success: true, affectedRows: 0}, status: 409, suffix: '_OBSERVATION_CHANGED'},
    {answer: {success: true}, status: 503, suffix: '_OUTCOME_UNCONFIRMED'},
    {answer: {success: true, affectedRows: '1'}, status: 503, suffix: '_OUTCOME_UNCONFIRMED'},
    {answer: {success: true, affectedRows: 1, visibilityState: 'pending_visibility'},
      status: 503, suffix: '_OUTCOME_UNCONFIRMED'},
  ];
  for (const operation of OPERATIONS) {
    for (const outcome of outcomes) {
      const f = fixture(t, operation, outcome.answer);
      const response = await f.app.inject(operation);
      t.equal(f.writes.length, 1, 'real gateway reached CDC once');
      t.equal(response.statusCode, outcome.status);
      t.equal(response.json().success, false);
      t.equal(response.json().errorCode, outcome.code || operation.prefix + outcome.suffix);
      if (outcome.answer.retryAfterMs) t.equal(response.json().retryAfterMs, 17);
      assertNoPublication(t, f);
    }
  }
});

test('confirmed single-row insert/update publishes once and clears prior deferral', async (t) => {
  for (const operation of OPERATIONS) {
    const f = fixture(t, operation, {success: false, outcome: 'deferred', deferRetry: true,
      error: 'held', errorCode: 'AUTHORITY_HELD'});
    t.equal((await f.app.inject(operation)).statusCode, 503);
    assertNoPublication(t, f);
    f.setResult(APPLIED);
    const response = await f.app.inject(operation);
    t.equal(response.statusCode, 200);
    t.equal(response.json().success, true);
    t.equal(response.json().outcome, 'applied');
    t.equal(f.writes.length, 2, 'fresh call re-enters the owner/gateway path');
    if (operation.kind === 'config') {
      t.equal(f.config.stats.writes, 1);
      t.equal(response.json().value, 'warn');
    } else {
      t.equal(f.policy.policyCache.has(TABLE_ID), false);
      t.equal(f.events.length, 1);
      t.equal(response.json().policy.replicaCount, 3);
    }
  }
});

test('HTTP preserves the CDC policy owner refusal and permits explicit false', async (t) => {
  const operation = {kind: 'policy', method: 'PATCH',
    url: '/api/admin/tables/' + TABLE_ID + '/policy'};
  const f = fixture(t, operation, APPLIED);
  for (const policy of [{externalCdcAllowed: true},
    {changeDataCapture: {externalCdcAllowed: true}}]) {
    const response = await f.app.inject({...operation, payload: {policy}});
    t.equal(response.statusCode, 400, 'the owner refusal remains a bad request');
    t.equal(response.json().success, false);
    t.equal(response.json().outcome, 'refused');
    t.equal(response.json().errorCode,
      CDC_TABLE_POLICY_REFUSAL.EXTERNAL_CDC_UNSUPPORTED);
    t.equal(f.writes.length, 0, 'the refused policy never reaches mutation');
    assertNoPublication(t, f);
  }
  const response = await f.app.inject({...operation, payload: {policy: {
    externalCdcAllowed: false,
    changeDataCapture: {externalCdcAllowed: false},
  }}});
  t.equal(response.statusCode, 200, 'explicit false reaches the supported owner');
  t.equal(response.json().success, true);
  t.equal(response.json().outcome, 'applied');
  t.equal(f.writes.length, 1, 'the real gateway reaches CDC once');
  t.equal(f.policy.policyCache.has(TABLE_ID), false);
  t.equal(f.events.length, 1, 'only the confirmed supported request publishes');
});

test('owner errors retain the exact gateway receipt and lower-level write identity', async (t) => {
  const lowerCause = Object.assign(new Error('original uncertain transport'),
    {entryId: 'original-entry'});
  for (const operation of OPERATIONS) {
    const f = fixture(t, operation, {success: false, outcome: 'deferred', deferRetry: true,
      errorCode: 'ORIGINAL_GATEWAY_CODE', error: 'original gateway outcome',
      entryId: 'original-entry', idempotencyKey: 'original-write', cause: lowerCause});
    let observed;
    try {
      await f.callOwner();
    } catch (error) {
      observed = error;
    }
    t.equal(observed?.code, 'ORIGINAL_GATEWAY_CODE');
    t.equal(observed?.cause, f.receipts[0]);
    t.equal(observed?.cause.entryId, 'original-entry');
    t.equal(observed?.cause.idempotencyKey, 'original-write');
    t.equal(observed?.cause.cause, lowerCause);
    assertNoPublication(t, f);
    f.setResult(lowerCause);
    let thrown;
    try {
      await f.callOwner();
    } catch (error) {
      thrown = error;
    }
    t.equal(thrown, lowerCause, 'a thrown owner dependency error keeps its original identity');
    assertNoPublication(t, f);
  }
});
