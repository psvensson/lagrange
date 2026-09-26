/**
 * I4 adversarial outcome cases, observed where a public caller observes
 * them: a real `pg` client, password mode, against a real PG-wire listener
 * (PostgresWireRuntimeModule) whose SQL executor is the composed engine's
 * canonical executeRequest -> ServiceLifecycleCommandOwner -> CallCellInvoker
 * path over the two-node production composition
 * (call-cell-two-node-deployment-fixture.js: real route resolver, real
 * statement adapter, real receivers, real WASI Cells).
 *
 * Each case is produced through existing infrastructure only - the
 * replicated services rows the resolvers read, the shared message router
 * the dispatcher delivers through, the invoker's own tunables, or the
 * deployed component - and asserts the public outcome class, `retrySafe`,
 * and that nothing the client receives names a node, partition, or
 * replica. Expected classes follow docs/execution-semantics.md (retry only
 * when retryable AND guest code provably did not run).
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {buildPgwireCredentialVerifier} from
  '../../src/runtime/pgwire-credential-verifier.js';
import {PostgresWireRuntimeModule} from
  '../../src/runtime/pgwire-runtime-module.js';
import {
  CALL_CELL_ROUTE_ERROR_CODE,
  CALL_OUTCOME_CLASS,
} from '../../src/service/call-cell-routing-contract.js';
import {
  SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
  ServiceLifecycleCommandOwner,
} from '../../src/service/service-lifecycle-command-owner.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {
  LIFECYCLE_ERROR_ALLOWED_KEYS,
  findTopologyLeaks,
} from '../../src/test-helpers/topology-leak-check.js';
import {
  CALL_SERVICE_NAME,
  DECLARED_TABLE,
  EXPECTED_RESULT_JSON,
  NODE_A,
  NODE_B,
  SECURITY_CONTEXT,
  TENANT_ID,
  TOP_N,
  composeTwoNodeDeployment,
} from './call-cell-two-node-deployment-fixture.js';
import {componentizeCallCellGuest} from
  './helpers/call-cell-guest-componentizer.js';
import {
  callBinding,
  observeFailure,
  openConsumerSession,
} from './helpers/public-binding-consumer.js';

const ADVERSARIAL_TIMEOUT_MS = 180_000;
const PROBE_GUARD_SUBJECT =
  'call-cell-public-outcome-adversarial composes two in-process nodes';
const LISTENER_HOST = '127.0.0.1';
const EPHEMERAL_PORT = 0;
const LISTENER_PASSWORD = 'adversarial-outcome-password';
const PASSWORD_MODE = 'password';
const TLS_DISABLED = 'disable';
const RUNTIME_HANDLER_ADDRESS_SUFFIX = '/service/runtime-service-handler';
const STALE_REPLICA_SUFFIX = '-r9';
const INTERNAL_SQLSTATE = 'XX000';
const UNKNOWN_BINDING_NAME = 'images-seam-no-such-binding';
const SEVERED_TRANSPORT_MESSAGE = `transport to ${NODE_B} was severed`;
// Transport-level acknowledgement with no handler completion evidence: the
// dispatcher refuses it before the call adapter sees a delivery.
const TRANSPORT_ACK_DELIVERY = Object.freeze({acknowledged: true, success: true});
// The handler reports it processed the message but returns no invocation
// outcome: the call adapter's own ack-only refusal.
const HANDLER_ACK_ONLY_DELIVERY = Object.freeze({
  acknowledged: true,
  handlerProcessed: true,
  success: true,
});
const CALL_ARGUMENTS = Object.freeze({topN: TOP_N});
const SINGLE_ADMISSION = Object.freeze({
  activationRetryIntervalMs: 25,
  activationWaitMs: 150,
  maxAttempts: 1,
  maxConcurrentShardRuns: 1,
});
const PARALLEL_ADMISSION = Object.freeze({
  ...SINGLE_ADMISSION,
  maxConcurrentShardRuns: 2,
});
const THROWING_GUEST_SOURCE = `
export function run(batch, argumentsJson) {
  throw new Error('guest rejected the batch');
}
export function reduce(partials, argumentsJson) {
  return '[]';
}
`;
const SILENT_LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

async function startPasswordListener(testContext, engine) {
  const listener = new PostgresWireRuntimeModule({
    credentialVerifier: buildPgwireCredentialVerifier({
      PGWIRE_AUTH_DATABASE: TENANT_ID,
      PGWIRE_AUTH_PASSWORD: LISTENER_PASSWORD,
      PGWIRE_AUTH_USER: SECURITY_CONTEXT.principal,
    }),
    logger: SILENT_LOGGER,
  });
  await listener.prepare({
    runtimeConfig: JSON.stringify({
      authMode: PASSWORD_MODE,
      host: LISTENER_HOST,
      tlsMode: TLS_DISABLED,
    }),
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
  });
  const context = {
    host: LISTENER_HOST,
    port: EPHEMERAL_PORT,
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    sqlRequestExecutor: (request) => engine.executeRequest(request),
  };
  const started = await listener.start(context);
  testContext.after(() => listener.stop(context));
  const client = await openConsumerSession({
    database: TENANT_ID,
    host: LISTENER_HOST,
    password: LISTENER_PASSWORD,
    port: started.endpointIntent.port,
    user: SECURITY_CONTEXT.principal,
  });
  testContext.after(() => client.end());
  return client;
}

async function composeObservedDeployment(testContext, options = {}) {
  refuseUnderProbe(PROBE_GUARD_SUBJECT);
  const deployment = await composeTwoNodeDeployment(testContext, options);
  const useInvoker = (tunables) => {
    const {invoker} = deployment.attachInvoker({tunables});
    deployment.engine.setServiceLifecycleCommandOwner(
      new ServiceLifecycleCommandOwner({
        artifactResolver: {},
        callCellInvoker: invoker,
        catalogOwner: {},
        signaturePolicy: SERVICE_LIFECYCLE_DEFAULT_SIGNATURE_POLICY,
      }));
  };
  useInvoker(SINGLE_ADMISSION);
  const client = await startPasswordListener(testContext, deployment.engine);
  const partitionIds = deployment.engine.getTablePartitions(DECLARED_TABLE)
    .map((partition) => partition.partition_id || partition.partitionId);
  const topology = [
    NODE_A,
    NODE_B,
    ...partitionIds,
    ...Object.values(deployment.replicaByNode),
    `${deployment.rows.serviceId}${STALE_REPLICA_SUFFIX}`,
  ];
  return {client, deployment, topology, useInvoker};
}

function actualRow(deployment, nodeId) {
  return (deployment.systemTableCache.getAll(TABLES.SERVICES) || [])
    .find((row) => row.service_id === deployment.replicaByNode[nodeId]);
}

// Retire the ready Cell actual on one node through the replicated services
// rows the resolvers read; returns the restore step.
function retireActual(deployment, nodeId) {
  const row = {...actualRow(deployment, nodeId)};
  deployment.systemTableCache.applySystemTableChange(
    TABLES.SERVICES, CDC_OPERATION.DELETE, row);
  return () => deployment.systemTableCache.applySystemTableChange(
    TABLES.SERVICES, CDC_OPERATION.UPSERT, row);
}

// Intercept the next Cell delivery on the shared message router; returns
// the restore step.
function interceptNextCellDelivery(deployment, intercept) {
  const router = deployment.messageRouter;
  const deliver = router.deliver;
  let fired = false;
  router.deliver = async (address, message) => {
    if (!fired && address.endsWith(RUNTIME_HANDLER_ADDRESS_SUFFIX)) {
      fired = true;
      return intercept(address, message, deliver);
    }
    return deliver(address, message);
  };
  return () => {
    router.deliver = deliver;
  };
}

async function observeCall(observed, name = CALL_SERVICE_NAME) {
  return observeFailure(callBinding(observed.client, name, CALL_ARGUMENTS));
}

function assertPublicOutcome(testContext, observed, failure, expected) {
  assert.ok(failure, 'the CALL must fail for this case');
  testContext.diagnostic(`pg receives: ${JSON.stringify(failure)}`);
  assert.equal(failure.code, INTERNAL_SQLSTATE);
  const detail = JSON.parse(failure.detail);
  assert.equal(detail.ownerCode, expected.ownerCode);
  assert.equal(detail.outcomeClass, expected.outcomeClass);
  assert.equal(detail.retrySafe, expected.retrySafe);
  // Every field the client receives, plus the parsed detail's keys; the
  // lifecycle owner code is the one detail key exempted.
  assert.deepEqual(findTopologyLeaks({failure, parsedDetail: detail}, {
    allowedKeys: LIFECYCLE_ERROR_ALLOWED_KEYS,
    forbiddenValues: observed.topology,
  }), [], 'nothing the client receives names a node, partition or replica');
}

describe('public CALL outcome classes through a real pg client', () => {
  it('classifies success, pre-dispatch, placement and delivery failures',
    {timeout: ADVERSARIAL_TIMEOUT_MS}, async (t) => {
      const observed = await composeObservedDeployment(t);
      const {deployment} = observed;

      await t.test('executes and returns (success)', async () => {
        assert.deepEqual(
          await callBinding(
            observed.client, CALL_SERVICE_NAME, CALL_ARGUMENTS),
          JSON.parse(EXPECTED_RESULT_JSON));
      });

      await t.test('unknown Binding: definitely not executed', async (st) => {
        assertPublicOutcome(st, observed,
          await observeCall(observed, UNKNOWN_BINDING_NAME), {
            outcomeClass: CALL_OUTCOME_CLASS.DEFINITELY_NOT_EXECUTED,
            ownerCode: CALL_CELL_ROUTE_ERROR_CODE.ROUTE_NOT_FOUND,
            retrySafe: false,
          });
      });

      await t.test('no ready Cell anywhere: temporarily unavailable',
        async (st) => {
          const restoreA = retireActual(deployment, NODE_A);
          const restoreB = retireActual(deployment, NODE_B);
          try {
            assertPublicOutcome(st, observed, await observeCall(observed), {
              outcomeClass: CALL_OUTCOME_CLASS.TEMPORARILY_UNAVAILABLE,
              ownerCode: CALL_CELL_ROUTE_ERROR_CODE.ROUTE_UNAVAILABLE,
              retrySafe: true,
            });
          } finally {
            restoreA();
            restoreB();
          }
        });

      await t.test('no ready Cell on the first shard host, nothing ran: ' +
        'temporarily unavailable after the activation window', async (st) => {
        const restore = retireActual(deployment, NODE_A);
        try {
          assertPublicOutcome(st, observed, await observeCall(observed), {
            outcomeClass: CALL_OUTCOME_CLASS.TEMPORARILY_UNAVAILABLE,
            ownerCode: CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE,
            retrySafe: true,
          });
        } finally {
          restore();
        }
      });

      await t.test('no ready Cell on one host while the other shard ran: ' +
        'uncertain, never retry-safe', async (st) => {
        observed.useInvoker(PARALLEL_ADMISSION);
        const restore = retireActual(deployment, NODE_A);
        try {
          assertPublicOutcome(st, observed, await observeCall(observed), {
            outcomeClass: CALL_OUTCOME_CLASS.OUTCOME_UNCERTAIN,
            ownerCode: CALL_CELL_ROUTE_ERROR_CODE.HOST_CELL_UNAVAILABLE,
            retrySafe: false,
          });
        } finally {
          restore();
          observed.useInvoker(SINGLE_ADMISSION);
        }
      });

      await t.test('Cell moved between resolve and delivery: retryable ' +
        'stale target', async (st) => {
        const original = {...actualRow(deployment, NODE_A)};
        const moved = {
          ...original,
          service_id: `${deployment.rows.serviceId}${STALE_REPLICA_SUFFIX}`,
        };
        const cache = deployment.systemTableCache;
        const restoreRouter = interceptNextCellDelivery(deployment,
          (address, message, deliver) => {
            cache.applySystemTableChange(
              TABLES.SERVICES, CDC_OPERATION.DELETE, original);
            cache.applySystemTableChange(
              TABLES.SERVICES, CDC_OPERATION.UPSERT, moved);
            return deliver(address, message);
          });
        try {
          assertPublicOutcome(st, observed, await observeCall(observed), {
            outcomeClass: CALL_OUTCOME_CLASS.RETRYABLE_STALE_TARGET,
            ownerCode: CALL_CELL_ROUTE_ERROR_CODE.TARGET_STALE,
            retrySafe: true,
          });
        } finally {
          restoreRouter();
          cache.applySystemTableChange(
            TABLES.SERVICES, CDC_OPERATION.DELETE, moved);
          cache.applySystemTableChange(
            TABLES.SERVICES, CDC_OPERATION.UPSERT, original);
        }
      });

      await t.test('handler acknowledged without an outcome: uncertain',
        async (st) => {
          const restore = interceptNextCellDelivery(deployment,
            async () => HANDLER_ACK_ONLY_DELIVERY);
          try {
            assertPublicOutcome(st, observed, await observeCall(observed), {
              outcomeClass: CALL_OUTCOME_CLASS.OUTCOME_UNCERTAIN,
              ownerCode: CALL_CELL_ROUTE_ERROR_CODE.ACK_ONLY,
              retrySafe: false,
            });
          } finally {
            restore();
          }
        });

      await t.test('transport acknowledged without handler evidence: ' +
        'uncertain', async (st) => {
        const restore = interceptNextCellDelivery(deployment,
          async () => TRANSPORT_ACK_DELIVERY);
        try {
          assertPublicOutcome(st, observed, await observeCall(observed), {
            outcomeClass: CALL_OUTCOME_CLASS.OUTCOME_UNCERTAIN,
            ownerCode: CALL_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED,
            retrySafe: false,
          });
        } finally {
          restore();
        }
      });

      await t.test('transport failure after dispatch: uncertain',
        async (st) => {
          const restore = interceptNextCellDelivery(deployment, async () => {
            throw new Error(SEVERED_TRANSPORT_MESSAGE);
          });
          try {
            assertPublicOutcome(st, observed, await observeCall(observed), {
              outcomeClass: CALL_OUTCOME_CLASS.OUTCOME_UNCERTAIN,
              ownerCode: CALL_CELL_ROUTE_ERROR_CODE.HANDLER_FAILED,
              retrySafe: false,
            });
          } finally {
            restore();
          }
        });

      await t.test('the Cell serves again after every case', async () => {
        assert.deepEqual(
          await callBinding(
            observed.client, CALL_SERVICE_NAME, CALL_ARGUMENTS),
          JSON.parse(EXPECTED_RESULT_JSON));
      });
    });

  it('classifies a guest failure as a terminal application failure',
    {timeout: ADVERSARIAL_TIMEOUT_MS}, async (t) => {
      const observed = await composeObservedDeployment(t, {
        componentBytesProvider: () =>
          componentizeCallCellGuest(THROWING_GUEST_SOURCE),
      });
      assertPublicOutcome(t, observed, await observeCall(observed), {
        outcomeClass: CALL_OUTCOME_CLASS.TERMINAL_APPLICATION_FAILURE,
        ownerCode: CALL_CELL_ROUTE_ERROR_CODE.COMPONENT_FAILED,
        retrySafe: false,
      });
    });
});
