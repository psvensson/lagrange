import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATIONS,
  SystemTableCache,
} from '../../src/cache/system-table-cache.js';
import {
  SYSTEM_TABLE_CACHE_MUTATION_MODE,
} from '../../src/cache/cache-constants.js';
import {
  createReadOnlyCache,
} from '../../src/cache/read-only-system-table-cache.js';
import {
  CDCEvent,
  CDCHandler,
} from '../../src/message-group/cdc-handler.js';

const TABLE_NAME = 'nodes';
const NODE_ID = 'node-provenance';

function buildNodeRow(updatedAtHlc, overrides = {}) {
  return {
    node_id: NODE_ID,
    status: 'active',
    connection_state: 'ready',
    last_heartbeat: 1_000,
    ready_lease_expires_at: 61_000,
    updated_at_hlc: updatedAtHlc,
    ...overrides,
  };
}

function applyCdc(handler, operation, row, envelopeHlc, receivedAtMs) {
  const event = new CDCEvent(
    TABLE_NAME,
    operation,
    row,
    envelopeHlc,
  );
  event.receivedAt = receivedAtMs;
  handler.applyImmediate(event, {skipSubscriptionCheck: true});
}

test('cache records accepted per-key CDC provenance from the row origin HLC',
  (t) => {
    const cache = new SystemTableCache();
    const readOnlyCache = createReadOnlyCache(cache);
    const handler = new CDCHandler(cache);

    applyCdc(
      handler,
      CDC_OPERATIONS.INSERT,
      buildNodeRow('1000-0-write-owner'),
      '2000-0-receiving-replica',
      1_500,
    );

    t.same(cache.getLastCdcObservation(TABLE_NAME, NODE_ID), {
      observedAtMs: 1_500,
      originHlc: '1000-0-write-owner',
    }, 'provenance uses cache receipt time and the durable row origin');
    t.same(
      readOnlyCache.getLastCdcObservation(TABLE_NAME, NODE_ID),
      cache.getLastCdcObservation(TABLE_NAME, NODE_ID),
      'snapshot consumers can read provenance without writable cache access',
    );

    applyCdc(
      handler,
      CDC_OPERATIONS.INSERT,
      buildNodeRow('1000-0-other-owner', {node_id: 'node-other'}),
      '2100-0-receiving-replica',
      1_600,
    );
    t.equal(
      cache.getLastCdcObservation(TABLE_NAME, NODE_ID).observedAtMs,
      1_500,
      'another node row cannot overwrite the selected key chronology',
    );
    handler.shutdown();
    t.end();
  });

test('cache provenance advances only with the accepted row version', (t) => {
  const cache = new SystemTableCache();
  const handler = new CDCHandler(cache);

  applyCdc(
    handler,
    CDC_OPERATIONS.INSERT,
    buildNodeRow('2000-0-write-owner'),
    '3000-0-receiving-replica',
    2_500,
  );
  applyCdc(
    handler,
    CDC_OPERATIONS.UPDATE,
    buildNodeRow('1900-0-write-owner', {capabilities: '["late-backfill"]'}),
    '3100-0-receiving-replica',
    2_600,
  );
  t.same(cache.getLastCdcObservation(TABLE_NAME, NODE_ID), {
    observedAtMs: 2_500,
    originHlc: '2000-0-write-owner',
  }, 'causally older CDC and its allowed backfill cannot impersonate freshness');

  applyCdc(
    handler,
    CDC_OPERATIONS.UPDATE,
    buildNodeRow('2200-0-write-owner', {last_heartbeat: 2_200}),
    '3200-0-receiving-replica',
    2_700,
  );
  t.same(cache.getLastCdcObservation(TABLE_NAME, NODE_ID), {
    observedAtMs: 2_700,
    originHlc: '2200-0-write-owner',
  }, 'a newer accepted row advances the key-bound observation');

  cache.applySystemTableChange(
    TABLE_NAME,
    CDC_OPERATIONS.UPDATE,
    buildNodeRow('2250-0-bootstrap-owner'),
  );
  t.equal(
    cache.getLastCdcObservation(TABLE_NAME, NODE_ID),
    null,
    'bootstrap-style direct apply invalidates CDC-only provenance',
  );
  applyCdc(
    handler,
    CDC_OPERATIONS.UPDATE,
    buildNodeRow('2275-0-write-owner'),
    '3250-0-receiving-replica',
    2_750,
  );

  cache.applySystemTableChange(
    TABLE_NAME,
    CDC_OPERATIONS.UPSERT,
    buildNodeRow('2300-0-authoritative-owner'),
    {
      mutationMode:
        SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION,
    },
  );
  t.equal(
    cache.getLastCdcObservation(TABLE_NAME, NODE_ID),
    null,
    'authoritative replacement invalidates CDC-only provenance',
  );

  applyCdc(
    handler,
    CDC_OPERATIONS.UPDATE,
    buildNodeRow('2400-0-write-owner'),
    '3300-0-receiving-replica',
    2_900,
  );
  cache.applySystemTableChange(
    TABLE_NAME,
    CDC_OPERATIONS.DELETE,
    buildNodeRow('2500-0-write-owner'),
  );
  t.equal(
    cache.getLastCdcObservation(TABLE_NAME, NODE_ID),
    null,
    'delete or non-CDC replacement cannot leave row provenance behind',
  );

  applyCdc(
    handler,
    CDC_OPERATIONS.INSERT,
    buildNodeRow('2600-0-write-owner'),
    '3400-0-receiving-replica',
    3_000,
  );
  cache.reconcileAgainstAuthoritativeTruth({[TABLE_NAME]: []});
  t.equal(
    cache.getLastCdcObservation(TABLE_NAME, NODE_ID),
    null,
    'anti-entropy removal clears the deleted key observation',
  );

  applyCdc(
    handler,
    CDC_OPERATIONS.INSERT,
    buildNodeRow('2700-0-write-owner'),
    '3500-0-receiving-replica',
    3_100,
  );
  cache.clear();
  t.equal(
    cache.getLastCdcObservation(TABLE_NAME, NODE_ID),
    null,
    'cache clear removes all retained provenance',
  );
  handler.shutdown();
  t.end();
});
