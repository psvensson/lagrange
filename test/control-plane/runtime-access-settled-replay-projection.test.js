/**
 * F1 of attempt 2's verification (quest
 * replica-admission-from-committed-operation, corrective 2b): a retry after a
 * lost answer is answered from the settled outcome row. No change event
 * carries the asking command's timestamp, so a replay that answered it as a
 * position would never be reached and CONFIGURE would hang on a healthy node.
 * A replay proves no position: the wait ends position_unknown, the DDL answers
 * typed unavailable, and the write stays committed. A client retry is a new
 * write with a real position. Composed from the real owner, gateway, CDC
 * write path, projection wait, cache and settled-outcome answer; only the
 * engine's commit is the fixture's.
 */

import assert from 'node:assert/strict';
import {test, beforeEach, afterEach} from 'node:test';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  RUNTIME_ACCESS_POLICY_ERROR_CODE,
  RuntimeAccessPolicyOwner,
} from '../../src/control-plane/owners/runtime-access-policy-owner.js';
import {TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {answerSettledStatement} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const PROMPT_MS = 1000;
const PENDING = Symbol('pending');
const LOST_ANSWER = 'Message timeout';
const hlc = (logical) =>
  new HLCTimestamp(1793615397288, logical, 'node-1').toString();
const SECURITY_CONTEXT = Object.freeze({principal: 'alice',
  roles: Object.freeze(['deployer']), tenantId: 'tenant-a'});
const PAYLOAD = Object.freeze({binding_name: 'orders-api', schema_version: 1,
  tables: Object.freeze([])});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function within(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(PENDING), ms);
  });
  return Promise.race([
    promise.then((value) => ({value}), (error) => ({error})),
    timeout]).finally(() => clearTimeout(timer));
}

// The partition: a first statement commits and projects, and its answer is
// lost; the retry of that entry is answered from the settled outcome row, as
// partition-service-write-metrics-base does; a later statement is a new write.
function composeLostAnswer() {
  const cache = new SystemTableCache();
  const commits = {count: 0, attempts: 0, nextLogical: 3, loseFirst: true};
  const commit = (params) => {
    commits.count += 1;
    const originHlc = hlc(commits.nextLogical);
    commits.nextLogical += 2;
    cache.applySystemTableChange(TABLES.CONFIG, 'UPSERT',
      {config_key: params[0], updated_at_hlc: originHlc});
    return originHlc;
  };
  const engine = {
    async executeQuery(_sql, params) {
      commits.attempts += 1;
      if (commits.loseFirst && commits.attempts === 1) {
        commit(params);
        throw new Error(LOST_ANSWER);
      }
      if (commits.loseFirst && commits.attempts === 2) {
        commits.loseFirst = false;
        const answer = answerSettledStatement(
          {partitionId: 'config-p1', nodeId: 'node-1', replicaId: 'config-p1-r1'},
          {recorded: {outcome: PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
            logIndex: 9, term: 2, changes: 1, lastInsertRowid: 0},
          command: {timestamp: hlc(commits.nextLogical + 10)}});
        return {...answer, affectedRows: answer.changes};
      }
      return {success: true, affectedRows: 1, originHlc: commit(params)};
    },
  };
  const service = new CDCIntegrationService({nodeId: 'node-1',
    sqlQueryEngine: engine, systemTableCache: cache});
  service.initialize();
  const gateway = new ControlPlaneSystemTableGateway({nodeId: 'node-1',
    cdcIntegrationService: service, sqlQueryEngine: engine,
    systemTableCache: cache});
  const owner = new RuntimeAccessPolicyOwner({
    bindingOwner: {getBindingByName: async () => ({
      bindingVersionId: 'binding-version-orders', tenantId: 'tenant-a'})},
    controlPlaneSystemTableGateway: gateway,
    systemTableCache: cache,
    now: () => 1000,
  });
  return {commits, owner, service};
}

test('a retry answered from the settled row proves no position: the DDL ' +
  'answers typed unavailable, the write stays committed, and a client retry ' +
  'is a new write with a real position', async () => {
  const {commits, owner, service} = composeLostAnswer();

  const first = await within(owner.configureBindingAccess(
    {...PAYLOAD}, SECURITY_CONTEXT), PROMPT_MS);
  assert.notEqual(first, PENDING,
    'the DDL does not hang on a position no change event reaches');
  assert.equal(first.error?.code,
    RUNTIME_ACCESS_POLICY_ERROR_CODE.PROJECTION_UNAVAILABLE,
    first.error?.message);
  assert.equal(first.error.detail.projectionOutcome, 'position_unknown');
  assert.equal(commits.count, 1, 'the write committed once');
  assert.equal(commits.attempts, 2, 'through one lost answer and a retry');

  const retried = await within(owner.configureBindingAccess(
    {...PAYLOAD}, SECURITY_CONTEXT), PROMPT_MS);
  assert.notEqual(retried, PENDING);
  assert.equal(retried.error, undefined, retried.error?.message);
  assert.equal(commits.count, 2, 'the client retry is a new write');
  service.markShuttingDown();
});
