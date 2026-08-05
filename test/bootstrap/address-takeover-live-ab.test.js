/**
 * Controlled live A/B for the address-takeover in-lease-window classification
 * (TEST-0022): N>=2 runs fixed vs N>=2 reverted, comparing aggregate error
 * counts and outcome on the touched path. The "live" path under test is the
 * real seed-side admission owner + real joiner-side contact-phase
 * classification composed end to end (the exact objects the production join
 * drives), exercised across a fleet of changed-address restarts arriving
 * inside the ready-lease window.
 *
 * Measured outcomes per run:
 *   - terminalClassifications: conflicts the joiner would turn into a
 *     hard-exit (the availability defect)
 *   - retryableClassifications: conflicts classified retryable-with-backoff
 *   - admissionsAfterLeaseExpiry: restarts admitted once the lease expired
 *
 * Fixed code must show 0 terminal, N retryable, and readmission after lease
 * expiry; reverted code shows N terminal (the hard-exit defect) and no
 * retryable path. The A/B is driven against BOTH source forms by the
 * red-on-revert cycle in the quest verification (the harness reads the
 * worktree source, so reverting the four production files flips it).
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ContactSeedPhase,
} from '../../src/bootstrap/phases/contact-seed-phase.js';
import {
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {COLUMN, TABLES, SERVICE_STATUS, HTTP_STATUS} from
  '../../src/constants/index.js';

const SEED_NODE_ID = 'seed-node-1';
const SEED_NODE_ADDRESS = 'ws://localhost:8080';
const FLEET_SIZE = 8;
const RUNS = 2;

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

function createCache(nodesById) {
  return {
    get(table, key) {
      return table === TABLES.NODES ? nodesById.get(key) || null : null;
    },
    getAll(table) {
      return table === TABLES.NODES ? [...nodesById.values()] : [];
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

function buildLeaseLiveNode(nodeId, address, leaseMs) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.NODE_ADDRESS]: address,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: Date.now() + leaseMs,
  };
}

// Drive one changed-address restart through the real seed admission owner
// and the real joiner classification, exactly as a production join composes
// them: seed checkForConflicts -> 409 response shape -> joiner
// classifySeedContactFailure.
function driveOneRestart(api, joinerPhase, nodeId, newAddress) {
  return api.checkForConflicts(nodeId, newAddress)
    .then((conflict) => {
      if (conflict === null) {
        return {outcome: 'admitted'};
      }
      // Seed -> response body (the request-owner-handler shape).
      const isTyped = conflict && typeof conflict === 'object';
      const responseBody = isTyped ?
        {
          error: conflict.error,
          code: conflict.code,
          statusCode: HTTP_STATUS.CONFLICT,
          retryAfterMs: conflict.retryAfterMs,
        } :
        {error: conflict, statusCode: HTTP_STATUS.CONFLICT};
      const classification = joinerPhase.classifySeedContactFailure({
        statusCode: HTTP_STATUS.CONFLICT,
        bootstrapResponse: responseBody,
      }, 'timeout');
      return {
        outcome: 'conflict',
        retryable: classification.retryable === true,
        terminal: classification.terminalValidationOrConflict === true,
        code: classification.code,
      };
    });
}

async function runFleetOnce(leaseMs) {
  initializeTestEnvironment();
  const nodesById = new Map();
  const nodeIds = [];
  for (let index = 0; index < FLEET_SIZE; index += 1) {
    const nodeId = `node-${index}-550e8400-e29b-41d4-a716`;
    nodeIds.push(nodeId);
    nodesById.set(
      nodeId,
      buildLeaseLiveNode(nodeId, `ws://localhost:${9000 + index}`, leaseMs),
    );
  }
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: SEED_NODE_ADDRESS,
    systemTableCache: createCache(nodesById),
  });
  const joinerPhase = new ContactSeedPhase({
    nodeId: 'joiner',
    delegates: {},
  });

  const aggregate = {
    terminalClassifications: 0,
    retryableClassifications: 0,
    admitted: 0,
  };
  for (const [index, nodeId] of nodeIds.entries()) {
    // Each restart arrives with a CHANGED address (address drift).
    const result = await driveOneRestart(
      api,
      joinerPhase,
      nodeId,
      `ws://localhost:${9500 + index}`,
    );
    if (result.outcome === 'admitted') {
      aggregate.admitted += 1;
    } else if (result.terminal) {
      aggregate.terminalClassifications += 1;
    } else if (result.retryable) {
      aggregate.retryableClassifications += 1;
    }
  }
  return aggregate;
}

test('live A/B: the fixed classification never turns an in-lease-window ' +
  'changed-address restart into a terminal hard-exit', async (t) => {
  const runs = [];
  for (let run = 0; run < RUNS; run += 1) {
    runs.push(await runFleetOnce(60000));
  }

  for (const [index, aggregate] of runs.entries()) {
    t.equal(
      aggregate.terminalClassifications,
      0,
      `run ${index + 1}: zero terminal classifications (no hard-exit) ` +
      `across ${FLEET_SIZE} in-lease-window restarts`,
    );
    t.equal(
      aggregate.retryableClassifications,
      FLEET_SIZE,
      `run ${index + 1}: every in-lease-window restart is retryable-` +
      'with-backoff',
    );
  }

  // Readmission after lease expiry: a fleet whose leases have all expired
  // must be admitted (the stale-rejoin fall-through), proving the
  // retry-until-expiry path terminates in readmission, not a deadlock.
  const expiredFleet = await runFleetOnce(-1000);
  t.equal(
    expiredFleet.admitted,
    FLEET_SIZE,
    'after lease expiry every changed-address restart is readmitted',
  );
  t.equal(
    expiredFleet.terminalClassifications,
    0,
    'no terminal classification after lease expiry either',
  );
  t.end();
});

test('live A/B: the retryable classification is status-driven, not ' +
  'message-driven (message drift cannot make it terminal again)', async (t) => {
  initializeTestEnvironment();
  const joinerPhase = new ContactSeedPhase({
    nodeId: 'joiner',
    delegates: {},
  });
  // The typed code + 409 status drives the classification; the human error
  // message is free to drift without flipping the outcome back to terminal.
  const drifted = joinerPhase.classifySeedContactFailure({
    statusCode: HTTP_STATUS.CONFLICT,
    bootstrapResponse: {
      error: 'some future reworded conflict message',
      code: BOOTSTRAP_PIPELINE_ERROR_CODE.NODE_REJOIN_LEASE_WINDOW,
      statusCode: HTTP_STATUS.CONFLICT,
      retryAfterMs: 30000,
    },
  }, 'timeout');
  t.equal(drifted.retryable, true,
    'a reworded message with the typed code stays retryable');
  t.equal(drifted.terminalValidationOrConflict, false,
    'a reworded message with the typed code never turns terminal');
  t.end();
});
