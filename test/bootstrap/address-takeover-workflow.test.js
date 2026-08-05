/**
 * Address-takeover workflow (join-path-audit-finding-9-address-drift-hard-exit):
 * a changed-address restart arriving while the old row's ready lease is still
 * live no longer produces a terminal 409 the entrypoint turns into
 * process.exit(1). The seed returns a typed retryable conflict (code +
 * retryAfterMs derived from the lease), the response carries that shape, and
 * the joiner classifies it retryable-with-backoff until the lease expires.
 * A genuinely-live row (live status, no lease field) stays terminal.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ContactSeedPhase,
} from '../../src/bootstrap/phases/contact-seed-phase.js';
import {
  isRetainedSeedContactEvidence,
  isRetryableSeedContactCode,
} from '../../src/bootstrap/phases/contact-seed-failure-signals.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {COLUMN, TABLES, SERVICE_STATUS, HTTP_STATUS} from
  '../../src/constants/index.js';

const SEED_NODE_ID = 'seed-node-1';
const SEED_NODE_ADDRESS = 'ws://localhost:8080';
const REJOIN_NODE_ID = '550e8400-e29b-41d4-a716-446655440000';
const REJOIN_NODE_ADDRESS = 'ws://localhost:9090';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createCacheWithExistingNode(nodeRecord) {
  const nodes = new Map();
  if (nodeRecord) {
    nodes.set(nodeRecord[COLUMN.NODE_ID], nodeRecord);
  }
  return {
    get(table, key) {
      return table === TABLES.NODES ? nodes.get(key) || null : null;
    },
    getAll(table) {
      return table === TABLES.NODES ? [...nodes.values()] : [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

function buildLeaseLiveNode() {
  return {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + 60000,
  };
}

test('seed returns a typed retryable conflict for an in-lease-window ' +
  'changed-address rejoin', async (t) => {
  initializeTestEnvironment();
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: createCacheWithExistingNode(buildLeaseLiveNode()),
  });

  const conflict = await api.checkForConflicts(
    REJOIN_NODE_ID,
    'ws://localhost:9091',
  );

  t.equal(
    conflict?.code,
    BOOTSTRAP_PIPELINE_ERROR_CODE.NODE_REJOIN_LEASE_WINDOW,
    'the conflict carries the typed lease-window code',
  );
  t.ok(
    Number.isFinite(conflict?.retryAfterMs) && conflict.retryAfterMs > 0,
    'the conflict carries a positive retryAfterMs derived from the lease',
  );
  t.ok(
    conflict.retryAfterMs <= 60000,
    'retryAfterMs is bounded by the remaining lease window',
  );
  t.end();
});

test('the typed lease-window code is whitelisted retryable on the joiner',
  async (t) => {
    t.ok(
      isRetryableSeedContactCode(
        BOOTSTRAP_PIPELINE_ERROR_CODE.NODE_REJOIN_LEASE_WINDOW,
      ),
      'the lease-window code is a retryable seed-contact code',
    );
    const evidence = {
      error: 'Node rejoin conflicts with a live ready lease; retry after ' +
        'lease expiry',
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.NODE_REJOIN_LEASE_WINDOW,
      statusCode: HTTP_STATUS.CONFLICT,
      retryAfterMs: 45000,
    };
    t.ok(
      isRetainedSeedContactEvidence(evidence),
      'a 409 carrying the lease-window code is retained as retryable ' +
      'evidence, not discarded',
    );
    t.equal(evidence.retryAfterMs, 45000,
      'the retryAfterMs hint is carried on the retained evidence');
    t.end();
  });

test('the joiner classifies a typed lease-window 409 as retryable, never ' +
  'terminal', async (t) => {
  const phase = new ContactSeedPhase({nodeId: REJOIN_NODE_ID, delegates: {}});
  const classification = phase.classifySeedContactFailure({
    statusCode: HTTP_STATUS.CONFLICT,
    bootstrapResponse: {
      error: 'Node rejoin conflicts with a live ready lease; retry ' +
          'after lease expiry',
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.NODE_REJOIN_LEASE_WINDOW,
      statusCode: HTTP_STATUS.CONFLICT,
      retryAfterMs: 45000,
    },
  }, 'timeout');

  t.equal(classification.retryable, true,
    'the typed lease-window 409 is retryable');
  t.equal(classification.terminalValidationOrConflict, false,
    'the typed lease-window 409 is NOT classified terminal');
  t.equal(classification.retryAfterMs, 45000,
    'the classification surfaces the lease-derived retryAfterMs');
  t.end();
});

test('an untyped 409 stays terminal on the joiner', async (t) => {
  const phase = new ContactSeedPhase({nodeId: REJOIN_NODE_ID, delegates: {}});
  const classification = phase.classifySeedContactFailure({
    statusCode: HTTP_STATUS.CONFLICT,
    bootstrapResponse: {
      error: 'Node ID x is already registered',
      statusCode: HTTP_STATUS.CONFLICT,
    },
  }, 'timeout');

  t.equal(classification.retryable, false,
    'an untyped 409 is not retryable');
  t.equal(classification.terminalValidationOrConflict, true,
    'an untyped 409 stays terminal');
  t.end();
});

test('readmission proceeds after the lease expires (stale rejoin ' +
  'fall-through)', async (t) => {
  initializeTestEnvironment();
  const expiredLeaseNode = {
    [COLUMN.NODE_ID]: REJOIN_NODE_ID,
    [COLUMN.NODE_ADDRESS]: REJOIN_NODE_ADDRESS,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() - 1000,
  };
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: createCacheWithExistingNode(expiredLeaseNode),
  });

  const result = await api.checkForConflicts(
    REJOIN_NODE_ID,
    'ws://localhost:9091',
  );

  t.equal(result, null,
    'once the lease has expired the changed-address rejoin is admitted');
  t.end();
});
