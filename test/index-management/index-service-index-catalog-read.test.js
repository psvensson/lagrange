// How IndexService takes the control-plane gateway's answer to its index
// catalog read (loadIndicesFromCache): the gateway's typed outcome decides.
// AUTHORITATIVE, OWNER_LOCAL_NON_PROPAGATED, CACHE_HIT and BOOTSTRAP_SNAPSHOT
// carry rows; OWNER_NOT_READY, DEFERRED, REJECTED and STALE_NOT_ALLOWED refuse
// the load; an answer without one of these outcomes (the real gateway always
// names one) is malformed and refuses it too. A refusal is one typed error
// that carries the gateway's outcome, with the gateway's error as its cause.
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READ_OUTCOME as OUTCOME,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {IndexService} from '../../src/index-management/index-service.js';
import {
  GLOBAL_INDEX_ERROR_CODE,
  INDEX_LOG_MSG,
} from '../../src/index-management/index-constants.js';

const INDEX_ROW = Object.freeze({
  index_id: 'idx-1',
  table_id: 'table-1',
  index_name: 'idx_name',
  column_names: '["name"]',
  index_type: 'btree',
  created_at: 1,
});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function serviceAnswering(indicesAnswer) {
  return new IndexService({
    systemTableCache: {},
    controlPlaneSystemTableGateway: {
      async readRows(tableName) {
        return tableName === TABLES.INDICES ? indicesAnswer :
          {success: true, outcome: OUTCOME.AUTHORITATIVE, rows: []};
      },
    },
  });
}

async function loadRefusal(answer) {
  const service = serviceAnswering(answer);
  try {
    await service.loadIndicesFromCache();
  } catch (error) {
    return error;
  }
  return null;
}

function assertRefused(t, error, outcome, label) {
  t.ok(error instanceof Error, `${label}: the load is refused`);
  t.equal(error?.message, INDEX_LOG_MSG.INDICES_LOAD_FAILED, `${label}: one message`);
  t.equal(error?.code, GLOBAL_INDEX_ERROR_CODE.DEPENDENCY_UNAVAILABLE, `${label}: typed`);
  t.equal(error?.outcome, outcome, `${label}: carries the gateway outcome`);
}

test('an authoritative not-ready answer without success:false refuses the load', async (t) => {
  const error = await loadRefusal({outcome: OUTCOME.OWNER_NOT_READY, rows: []});
  assertRefused(t, error, OUTCOME.OWNER_NOT_READY, 'not ready, no success flag');
});

test('an answer without an outcome is malformed and refuses the load', async (t) => {
  const error = await loadRefusal({rows: [INDEX_ROW]});
  assertRefused(t, error, null, 'no outcome');
  const unknown = await loadRefusal({success: true, outcome: 'unheard-of', rows: []});
  assertRefused(t, unknown, 'unheard-of', 'unknown outcome');
});

test('every named not-answered outcome refuses, with the gateway error as cause', async (t) => {
  for (const outcome of [OUTCOME.OWNER_NOT_READY, OUTCOME.DEFERRED, OUTCOME.REJECTED,
    OUTCOME.STALE_NOT_ALLOWED]) {
    const error = await loadRefusal({success: false, outcome, error: `refused ${outcome}`,
      rows: []});
    assertRefused(t, error, outcome, outcome);
    t.equal(error?.cause, `refused ${outcome}`, `${outcome}: the gateway error is the cause`);
  }
});

test('every named answered outcome loads its rows; rows that are not a list refuse',
  async (t) => {
    for (const outcome of [OUTCOME.AUTHORITATIVE, OUTCOME.OWNER_LOCAL_NON_PROPAGATED,
      OUTCOME.CACHE_HIT, OUTCOME.BOOTSTRAP_SNAPSHOT]) {
      const service = serviceAnswering({success: true, outcome, rows: [INDEX_ROW]});
      await service.loadIndicesFromCache();
      t.ok(service.indexExists('table-1', 'idx_name'), `${outcome}: the index is loaded`);
      const malformed = await loadRefusal({success: true, outcome, rows: null});
      assertRefused(t, malformed, outcome, `${outcome} without a row list`);
    }
  });

test('a gateway read that throws propagates unchanged', async (t) => {
  const service = new IndexService({
    systemTableCache: {},
    controlPlaneSystemTableGateway: {
      async readRows(tableName) {
        if (tableName === TABLES.INDICES) throw new Error('gateway read failure');
        return {success: true, outcome: OUTCOME.AUTHORITATIVE, rows: []};
      },
    },
  });
  await t.rejects(service.loadIndicesFromCache(), /gateway read failure/u);
});
