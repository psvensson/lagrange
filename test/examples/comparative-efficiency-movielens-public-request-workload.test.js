import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  REQUEST_ACCEPT,
} from '../../examples/request-binding-deployment/run-request-binding-deployment.js';
import {
  shutdownExampleNodeResources,
} from '../../examples/request-binding-deployment/request-binding-example-node.js';
import {
  MOVIELENS_PUBLIC_REQUEST,
  MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY,
  MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER,
  MOVIELENS_PUBLIC_REQUEST_TABLE,
  assertMovielensPublicRequestResult,
  buildMovielensPublicRequestAccessPayload,
  buildMovielensPublicRequestBinding,
  buildMovielensPublicRequestInstallPayload,
  buildMovielensPublicRequestManifest,
} from '../../examples/service-data-affinity/movielens-public-request-workload-contract.js';
import {
  packMovieRating,
  loadMovielensPublicRequestDataset,
  loadMovielensPublicRequestDatasetVariant,
  parseRatingsText,
  unpackMovieRating,
} from '../../examples/service-data-affinity/movielens-public-request-workload-dataset.js';
import {
  assertJournalMatchesRequest,
  assertOperation,
  buildOperationRequest,
  prepareMovielensPublicRequestWorkload,
  projectCompletedJournalRow,
} from '../../examples/service-data-affinity/movielens-public-request-workload-adapter.js';
import {
  LIVE_FAILURE_STAGE,
  MovielensPublicRequestLiveFailure,
  buildMovielensPublicRequestLiveEnvelope,
  closeFailedOpening,
  openMovielensPublicRequestWorkloadLive,
  preregisterRequestWitness,
  runMovielensPublicRequestWorkloadSession,
} from '../../examples/service-data-affinity/run-movielens-public-request-workload.js';
import {
  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE,
} from '../../examples/service-data-affinity/movielens-public-request-evidence-schema.js';
import {
  writeJsonArtifact,
} from '../../examples/service-data-affinity/movielens-public-request-evidence-artifacts.js';
import {
  snapshotPlainData,
} from '../../examples/service-data-affinity/evidence-exact-plain-data.js';
import {
  RATINGS_TOP_QUALITY_SQL,
} from '../../examples/service-data-affinity/movie-ranking.js';
import {
  PostgresBaselineFailure,
  projectPostgresTopMovies,
} from '../../examples/service-data-affinity/run-postgres-baseline.js';
import {
  createPostgresSessionCleanupController,
} from '../../examples/service-data-affinity/postgres-baseline-session.js';
import {
  createInvocationIntentDigest,
  createRequestDigest,
} from '../../src/service/request-cell-routing-contract.js';
import {
  WASM_OPERATIONS_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  COLUMN_TYPE,
} from '../../src/bootstrap/system-table-schema-shared-constants.js';
import {
  RequestCellHttpAdapter,
} from '../../src/service/request-cell-http-adapter.js';
import {
  collectLiveEvidence,
  evidenceIndexValue,
  replayRetainedEvidence,
} from '../../scripts/run-comparative-efficiency-movielens-public-request-workload.js';
import {
  createOperation,
  transitionOperation,
} from '../../src/wasm-service/operation-lifecycle.js';

function fixtureGitValue(command, value) {
  if (command === 'status') return '';
  return value === 'HEAD' ? '1'.repeat(40) : '2'.repeat(40);
}

const PACKAGE_ID = `service-package-${'a'.repeat(64)}`;
const OCI_DIGEST = `sha256:${'b'.repeat(64)}`;
const COMPLETED_JOURNAL_RESULT = JSON.stringify(JSON.stringify({
  body: MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY,
  headers: [[
    MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER,
    MOVIELENS_PUBLIC_REQUEST.BINDING_NAME,
  ]],
  status: 200,
}));
const TOP_MOVIES = Object.freeze([
  {movieId: 318, score: 4.362676},
  {movieId: 64, score: 4.338784},
  {movieId: 483, score: 4.335462},
  {movieId: 50, score: 4.302482},
  {movieId: 12, score: 4.279332},
  {movieId: 408, score: 4.262973},
  {movieId: 603, score: 4.258149},
  {movieId: 169, score: 4.251174},
  {movieId: 98, score: 4.216850},
  {movieId: 127, score: 4.213981},
]);

function fixtureReceipt() {
  return {
    layoutPath: '/tmp/movielens-public-request-oci-layout',
    topManifestDescriptor: {
      digest: OCI_DIGEST,
      sizeBytes: 1234,
    },
  };
}

function completedJournalRowFixture() {
  const command = 'invoke:binding-service-live:sha256:command';
  const created = createOperation(
    'request_binding_example',
    command,
    'request-invocation-live-regression',
  );
  const completed = transitionOperation(
    'request-cell-operation-live-regression',
    'in_progress',
    'completed',
    JSON.stringify({
      body: MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY,
      headers: [[
        MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER,
        MOVIELENS_PUBLIC_REQUEST.BINDING_NAME,
      ]],
      status: 200,
    }),
  );
  if (!created.success || !completed.success) {
    throw new Error('authoritative journal fixture transition failed');
  }
  return {
    command,
    created_at: created.params[7],
    error: created.params[6],
    idempotency_key: 'request-invocation-live-regression',
    operation_id: 'request-cell-operation-live-regression',
    result: completed.params[2],
    state: completed.params[0],
    tenant_id: 'request_binding_example',
    updated_at: completed.params[1],
  };
}

function resultRows() {
  return {
    movieRows: TOP_MOVIES.map((row, index) => ({
      key: index + 1,
      value: row.movieId,
    })),
    scoreRows: TOP_MOVIES.map((row, index) => ({
      key: index + 1,
      value: Math.trunc(row.score * 1_000_000),
    })),
  };
}

describe('MovieLens public request workload contract', () => {
  it('installs a WASM component on one immutable public request Binding', () => {
    const receipt = fixtureReceipt();
    const manifest = buildMovielensPublicRequestManifest(receipt);
    const install =
      buildMovielensPublicRequestInstallPayload(manifest, receipt);
    const binding =
      buildMovielensPublicRequestBinding(PACKAGE_ID, manifest);
    const access = buildMovielensPublicRequestAccessPayload();

    assert.equal(manifest.runtime.kind, 'wasm_component');
    assert.equal(install.artifact_source.kind, 'local_oci_layout');
    assert.deepEqual(binding.source, {
      kind: 'request',
      method: MOVIELENS_PUBLIC_REQUEST.METHOD,
      path: MOVIELENS_PUBLIC_REQUEST.PATH,
    });
    assert.equal(binding.target.package_id, PACKAGE_ID);
    assert.equal(binding.target.export_name, 'run');
    assert.deepEqual(
      access.tables.map(({operations, slot, table}) => ({
        operations,
        slot,
        table,
      })),
      [
        {
          operations: ['read'],
          slot: 0,
          table: `table:${MOVIELENS_PUBLIC_REQUEST_TABLE.RATINGS}`,
        },
        {
          operations: ['write'],
          slot: 1,
          table: `table:${MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_MOVIES}`,
        },
        {
          operations: ['write'],
          slot: 2,
          table: `table:${MOVIELENS_PUBLIC_REQUEST_TABLE.RESULT_SCORES}`,
        },
      ],
    );
  });

  it('commits a component that imports table read/write and exports run',
    async () => {
      const source = await readFile(
        new URL(
          '../../examples/service-data-affinity/' +
            'movielens-public-grouped-reduce-component.wat',
          import.meta.url,
        ),
        'utf8',
      );
      assert.match(source, /^\(component/u);
      assert.match(source, /import "lagrange:cell\/context"/u);
      assert.match(source, /call \$read/u);
      assert.match(source, /call \$write/u);
      assert.match(source, /i32\.const 117[\s\S]*call \$matches-marker/u);
      assert.match(source, /i32\.const 58[\s\S]*call \$matches-marker/u);
      assert.match(source, /local\.set \$result-offset/u);
      assert.match(source, /block \$clear-complete/u);
      assert.match(source, /export "run"/u);
      assert.doesNotMatch(source, /native_js/u);
      assert.equal(typeof prepareMovielensPublicRequestWorkload, 'function');
      assert.equal(typeof openMovielensPublicRequestWorkloadLive, 'function');
    });

  it('keeps the bounded component request body canonical', () => {
    const request = buildOperationRequest(
      {
        cardinality: 100_000,
        digest: `sha256:${'c'.repeat(64)}`,
        source: 'MovieLens 100K u.data',
      },
      'operation-with-signal',
      10,
    );
    assert.equal(request.body.resultKeyOffset, 10);
    assert.equal(Object.hasOwn(request.body, 'signal'), false);
    assert.equal(Object.hasOwn(request, 'signal'), false);
  });

  it('preregisters the exact forwarded request behind the journal command',
    async () => {
      const invocation = buildOperationRequest(
        {
          cardinality: 100_000,
          digest: `sha256:${'c'.repeat(64)}`,
          source: 'MovieLens 100K u.data',
        },
        'live-mismatch-regression',
        0,
      );
      const route = {
        bindingVersionId: 'binding-version-live-regression',
        serviceId: 'binding-service-live-regression',
      };
      const witness = preregisterRequestWitness(
        MOVIELENS_PUBLIC_REQUEST,
        invocation,
        route,
      );
      const missingAcceptRequest = {
        ...witness.normalizedRequest,
        headers: {'content-type': 'application/json'},
      };
      const missingAcceptIntent = createInvocationIntentDigest({
        bindingVersionId: route.bindingVersionId,
        method: MOVIELENS_PUBLIC_REQUEST.METHOD,
        path: MOVIELENS_PUBLIC_REQUEST.PATH,
        requestDigest: createRequestDigest(missingAcceptRequest),
        tenantId: 'request_binding_example',
      });
      const executedIntent = createInvocationIntentDigest({
        bindingVersionId: route.bindingVersionId,
        method: MOVIELENS_PUBLIC_REQUEST.METHOD,
        path: MOVIELENS_PUBLIC_REQUEST.PATH,
        requestDigest: createRequestDigest(witness.normalizedRequest),
        tenantId: 'request_binding_example',
      });
      assert.notEqual(missingAcceptIntent, executedIntent);
      assert.deepEqual(witness.normalizedRequest.headers, {
        'accept': REQUEST_ACCEPT,
        'content-type': 'application/json',
      });
      assert.equal(witness.intentDigest, executedIntent);
      assert.equal(
        witness.journalCommand,
        `invoke:${route.serviceId}:${executedIntent}`,
      );
      let dispatchedEnvelope = null;
      const adapter = new RequestCellHttpAdapter({
        authenticateRequest: async () => ({
          principal: 'request-binding-example-user',
          roles: ['application'],
          tenantId: 'request_binding_example',
        }),
        routeResolver: {
          resolve() {
            return {
              ...route,
              replicaId: 'replica-live-regression',
              targetAddress:
                'node-live/service/runtime-service-handler',
              targetNodeId: 'node-live',
            };
          },
        },
        serviceDispatcher: {
          async dispatch(envelope) {
            dispatchedEnvelope = envelope;
            return {
              delivery: {
                componentResponse: {
                  body: 'completed',
                  headers: [],
                  status: 200,
                },
                processed: true,
              },
            };
          },
        },
      });
      await adapter.invoke({
        body: invocation.body,
        headers: {
          'accept': REQUEST_ACCEPT,
          'content-type': 'application/json',
          'idempotency-key': invocation.idempotencyKey,
        },
        id: 'live-mismatch-regression',
        method: MOVIELENS_PUBLIC_REQUEST.METHOD,
        query: {},
        server: {nodeId: 'node-live'},
        url: MOVIELENS_PUBLIC_REQUEST.PATH,
      });
      assert.deepEqual(
        dispatchedEnvelope.payload.request,
        witness.normalizedRequest,
      );
      assert.equal(
        dispatchedEnvelope.payload.invocation.intentDigest,
        witness.intentDigest,
      );
    });

  it('preserves exact cleanup when journal identity fails before retention',
    async () => {
      const cleanup = Object.freeze({
        cellAbsent: true,
        nodeStopped: true,
        postgres: Object.freeze({
          containersAbsent: true,
          networkAbsent: true,
          networkName: 'movielens-pg-baseline-regression',
          removedContainerIds: Object.freeze([
            'primary',
            'replica-1',
            'replica-2',
          ]),
        }),
        replicaId: 'replica-live-regression',
        temporaryDirectoryAbsent: true,
      });
      let closeCalls = 0;
      const session = {
        async close() {
          closeCalls += 1;
          return cleanup;
        },
        prepared: {
          async executeOperation() {
            throw new assert.AssertionError({
              actual:
                'invoke:binding-service-live:' +
                'sha256:fcf687fc73bc93afaa65dc9a89a24500943e042bd68b89a992c44b8645193db0',
              expected:
                'invoke:binding-service-live:' +
                'sha256:362f66372def30a270bd0eabd561f06cc8817c003a28adc7d5b9d9a9976772d7',
              operator: 'strictEqual',
            });
          },
        },
      };
      await assert.rejects(
        runMovielensPublicRequestWorkloadSession(
          session,
          'live-mismatch-regression',
        ),
        (error) => {
          assert.equal(
            error instanceof MovielensPublicRequestLiveFailure,
            true,
          );
          assert.deepEqual(error.teardown, cleanup);
          assert.match(error.failure.message, /Expected values/u);
          assert.equal(
            error.failure.stage,
            LIVE_FAILURE_STAGE.OPERATION,
          );
          return true;
        },
      );
      assert.equal(closeCalls, 1);
    });

  it('retains both operation and cleanup failures in causal order',
    async () => {
      const teardown = Object.freeze({
        cellAbsent: true,
        nodeStopped: null,
        postgres: Object.freeze({
          containersAbsent: true,
          networkAbsent: true,
          networkName: 'movielens-combined-failure',
          removedContainerIds: Object.freeze([
            'primary',
            'replica-1',
            'replica-2',
          ]),
        }),
        replicaId: 'replica-combined-failure',
        temporaryDirectoryAbsent: true,
      });
      const session = {
        async close() {
          throw new MovielensPublicRequestLiveFailure(
            new Error('node cleanup failed'),
            teardown,
            LIVE_FAILURE_STAGE.CLEANUP,
          );
        },
        prepared: {
          async executeOperation() {
            throw new Error('operation failed');
          },
        },
      };
      let combinedFailure;
      await assert.rejects(
        runMovielensPublicRequestWorkloadSession(session),
        (error) => {
          combinedFailure = error;
          assert.deepEqual(error.teardown, teardown);
          assert.equal(
            error.failure.stage,
            LIVE_FAILURE_STAGE.OPERATION,
          );
          assert.deepEqual(
            error.failure.causes.map(({message, role}) => ({
              message,
              role,
            })),
            [
              {
                message: 'operation failed',
                role:
                  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.OPERATION,
              },
              {
                message: 'node cleanup failed',
                role:
                  MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.CLEANUP,
              },
            ],
          );
          return true;
        },
      );
      const collected = await collectLiveEvidence(
        '2026-07-27T17:10:10.000Z',
        {
          gitValue: fixtureGitValue,
          async runLive() {
            throw combinedFailure;
          },
        },
      );
      const indexDescriptor = await writeJsonArtifact({
        name: 'evidence-index',
        value: evidenceIndexValue(collected.retained),
      });
      const replayed = await replayRetainedEvidence(
        {
          digest: indexDescriptor.digest,
          path: indexDescriptor.path,
        },
        collected.validation,
        collected.failure,
        collected.evidenceKind,
      );
      assert.equal(replayed.validation.replay.passed, true);
      assert.deepEqual(
        replayed.validation.replay.failure.causes.map(
          ({message, role}) => ({message, role}),
        ),
        combinedFailure.failure.causes.map(
          ({message, role}) => ({message, role}),
        ),
      );
    });

  it('retains failed-opening cleanup causes including null throws',
    async () => {
      const failedOpening = await closeFailedOpening({
        node: {
          async shutdown() {
            // Deliberately prove that non-Error cleanup throws are retained.
            // eslint-disable-next-line prefer-promise-reject-errors
            return Promise.reject(null);
          },
        },
        nodeBootAttempted: true,
        postgresCleanup: null,
        prepareAttempted: false,
        prepared: null,
        temporaryRoot: null,
      });
      const failure = new MovielensPublicRequestLiveFailure(
        undefined,
        failedOpening.teardown,
        LIVE_FAILURE_STAGE.NODE,
        failedOpening.cleanupCauses,
      );
      assert.deepEqual(
        failure.failure.causes.map(({message, role}) => ({
          message,
          role,
        })),
        [
          {
            message: 'thrown undefined',
            role:
              MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.PRIMARY,
          },
          {
            message: 'thrown null',
            role:
              MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE.NODE_CLEANUP,
          },
        ],
      );
      assert.equal(failedOpening.teardown.nodeStopped, null);
    });

  it('surfaces every node shutdown failure before teardown can pass',
    async () => {
      const calls = [];
      const resources = {
        bootstrapApi: {
          async shutdown() {
            calls.push('bootstrap-api');
            throw new Error('bootstrap API shutdown failed');
          },
        },
        bootstrapService: {
          async shutdown() {
            calls.push('bootstrap-service');
          },
        },
        async shutdownSingletonsOperation() {
          calls.push('singletons');
        },
        sqlAdapter: {
          closeSession() {
            calls.push('sql-adapter');
          },
        },
        sqlRuntime: {
          detachMigrationRecovery() {
            calls.push('migration-recovery');
          },
          sqlQueryEngine: {
            async shutdown() {
              calls.push('sql-engine');
              throw new Error('SQL engine shutdown failed');
            },
          },
        },
      };
      await assert.rejects(
        shutdownExampleNodeResources(resources),
        (error) => {
          assert.equal(error instanceof AggregateError, true);
          assert.deepEqual(
            error.errors.map((failure) => failure.message),
            [
              'bootstrap API shutdown failed',
              'SQL engine shutdown failed',
            ],
          );
          return true;
        },
      );
      assert.deepEqual(calls, [
        'sql-adapter',
        'migration-recovery',
        'bootstrap-api',
        'sql-engine',
        'bootstrap-service',
        'singletons',
      ]);
    });

  it('preserves PostgreSQL operation and cleanup children explicitly', () => {
    const cleanupReceipt = Object.freeze({
      containersAbsent: null,
      networkAbsent: null,
      networkName: 'movielens-postgres-causes',
      removedContainerIds: Object.freeze([]),
    });
    const postgresFailure = new PostgresBaselineFailure(
      new Error('PostgreSQL operation failed'),
      cleanupReceipt,
      [
        Object.freeze({
          cause: new Error('PostgreSQL operation failed'),
          role:
            MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
              .POSTGRES_OPERATION,
        }),
        Object.freeze({
          cause: new Error('PostgreSQL cleanup failed'),
          role:
            MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
              .POSTGRES_CLEANUP,
        }),
      ],
    );
    const failure = new MovielensPublicRequestLiveFailure(
      postgresFailure,
      undefined,
      LIVE_FAILURE_STAGE.POSTGRES,
    );
    assert.deepEqual(
      failure.failure.causes.map(({message, role}) => ({
        message,
        role,
      })),
      [
        {
          message: 'PostgreSQL operation failed',
          role:
            MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
              .POSTGRES_OPERATION,
        },
        {
          message: 'PostgreSQL cleanup failed',
          role:
            MOVIELENS_PUBLIC_REQUEST_FAILURE_CAUSE_ROLE
              .POSTGRES_CLEANUP,
        },
      ],
    );
  });

  it('retains setup failures with source state and explicit teardown unknowns',
    async () => {
      const timestamp = '2026-07-27T17:00:00.000Z';
      const collected = await collectLiveEvidence(timestamp, {
        gitValue: fixtureGitValue,
        async runLive() {
          throw new Error('setup failed before a live session existed');
        },
      });
      assert.equal(collected.evidenceKind, 'failure');
      assert.equal(collected.live, null);
      assert.equal(collected.retained.sourceState.sources.length > 0, true);
      assert.equal(
        collected.retained.descriptors.some(
          (descriptor) => descriptor.name === 'teardown-receipt',
        ),
        true,
      );
      const indexDescriptor = await writeJsonArtifact({
        name: 'evidence-index',
        value: evidenceIndexValue(collected.retained),
      });
      const replayed = await replayRetainedEvidence(
        {
          digest: indexDescriptor.digest,
          path: indexDescriptor.path,
        },
        collected.validation,
        collected.failure,
        collected.evidenceKind,
      );
      assert.equal(replayed.validation.replay.passed, true);
      assert.equal(
        replayed.validation.replay.failure.stage,
        LIVE_FAILURE_STAGE.RUNNER,
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(
          replayed.validation.replay.teardown,
        )),
        {
          cellAbsent: null,
          nodeStopped: null,
          postgres: {
            containersAbsent: null,
            networkAbsent: null,
            networkName: null,
            removedContainerIds: [],
          },
          replicaId: null,
          temporaryDirectoryAbsent: null,
        },
      );
    });

  it('retains arbitrary raw throws without getters or coercion',
    async () => {
      let hostileExecutions = 0;
      const hostile = Object.create(null, {
        message: {
          enumerable: true,
          get() {
            hostileExecutions += 1;
            throw new Error('message getter must not execute');
          },
        },
        [Symbol.toPrimitive]: {
          value() {
            hostileExecutions += 1;
            throw new Error('coercion must not execute');
          },
        },
      });
      const thrownValues = [null, undefined, hostile];
      const expectedMessages = [
        'thrown null',
        'thrown undefined',
        'thrown object',
      ];
      for (let index = 0; index < thrownValues.length; index += 1) {
        const collected = await collectLiveEvidence(
          `2026-07-27T17:10:0${index}.000Z`,
          {
            gitValue: fixtureGitValue,
            async runLive() {
              throw thrownValues[index];
            },
          },
        );
        const indexDescriptor = await writeJsonArtifact({
          name: 'evidence-index',
          value: evidenceIndexValue(collected.retained),
        });
        const replayed = await replayRetainedEvidence(
          {
            digest: indexDescriptor.digest,
            path: indexDescriptor.path,
          },
          collected.validation,
          collected.failure,
          collected.evidenceKind,
        );
        assert.equal(collected.evidenceKind, 'failure');
        assert.equal(replayed.validation.replay.passed, true);
        assert.equal(
          replayed.validation.replay.failure.message,
          expectedMessages[index],
        );
      }
      assert.equal(hostileExecutions, 0);
    });

  it('retains the partial cleanup receipt when teardown itself fails',
    async () => {
      const teardown = Object.freeze({
        cellAbsent: true,
        nodeStopped: null,
        postgres: Object.freeze({
          containersAbsent: true,
          networkAbsent: true,
          networkName: 'movielens-cleanup-failure',
          removedContainerIds: Object.freeze([
            'primary',
            'replica-1',
            'replica-2',
          ]),
        }),
        replicaId: 'replica-cleanup-failure',
        temporaryDirectoryAbsent: true,
      });
      const collected = await collectLiveEvidence(
        '2026-07-27T17:00:01.000Z',
        {
          gitValue: fixtureGitValue,
          async runLive() {
            throw new MovielensPublicRequestLiveFailure(
              new Error('node shutdown failed'),
              teardown,
              LIVE_FAILURE_STAGE.CLEANUP,
            );
          },
        },
      );
      const indexDescriptor = await writeJsonArtifact({
        name: 'evidence-index',
        value: evidenceIndexValue(collected.retained),
      });
      const replayed = await replayRetainedEvidence(
        {
          digest: indexDescriptor.digest,
          path: indexDescriptor.path,
        },
        collected.validation,
        collected.failure,
        collected.evidenceKind,
      );
      assert.equal(replayed.validation.replay.passed, true);
      assert.equal(
        replayed.validation.replay.failure.stage,
        LIVE_FAILURE_STAGE.CLEANUP,
      );
      assert.deepEqual(
        JSON.parse(JSON.stringify(
          replayed.validation.replay.teardown,
        )),
        JSON.parse(JSON.stringify(teardown)),
      );
    });

  it('separates retained binary inputs from the plain live observation', () => {
    const retained = Object.freeze({
      datasetBytes: Buffer.from('ratings'),
      executableBytes: Buffer.from('component'),
      postgresLogs: Object.freeze({
        primary: 'primary log',
        replica1: 'replica 1 log',
        replica2: 'replica 2 log',
      }),
    });
    const envelope = buildMovielensPublicRequestLiveEnvelope(
      {
        alternative: Object.freeze({engine: 'postgresql'}),
        artifact: Object.freeze({digest: OCI_DIGEST}),
        dataset: Object.freeze({cardinality: 100_000}),
        retained,
      },
      Object.freeze({
        oracle: Object.freeze({passed: true}),
      }),
      Object.freeze({nodeStopped: true}),
    );
    assert.deepEqual(Object.keys(envelope), [
      'observation',
      'retained',
    ]);
    assert.deepEqual(Object.keys(envelope.observation), [
      'alternative',
      'artifact',
      'dataset',
      'oracle',
      'teardown',
    ]);
    assert.equal(
      Object.hasOwn(envelope.observation, 'retained'),
      false,
    );
    assert.equal(envelope.retained, retained);
    assert.doesNotThrow(
      () => snapshotPlainData(envelope.observation),
    );
    assert.throws(
      () => snapshotPlainData(envelope),
      /plain evidence record/u,
    );
  });

  it('projects only exact completed journal rows with canonical timestamps',
    () => {
      const row = completedJournalRowFixture();
      const projected = projectCompletedJournalRow(row);
      assert.deepEqual(projected, {
        command: row.command,
        created_at: new Date(row.created_at).toISOString(),
        error: '{}',
        idempotency_key: row.idempotency_key,
        operation_id: row.operation_id,
        result: row.result,
        state: 'completed',
        tenant_id: row.tenant_id,
        updated_at: new Date(row.updated_at).toISOString(),
      });
      assert.equal(Object.isFrozen(projected), true);
      const maximumDate = projectCompletedJournalRow({
        ...row,
        updated_at: 8_640_000_000_000_000,
      });
      assert.equal(
        maximumDate.updated_at,
        '+275760-09-13T00:00:00.000Z',
      );
      const requestWitness = {
        invocationIdentity: row.idempotency_key,
        journalCommand: row.command,
        journalOperationId: row.operation_id,
        tenantId: row.tenant_id,
      };
      assert.equal(
        assertJournalMatchesRequest(projected, requestWitness),
        projected,
      );
      for (const key of [
        'invocationIdentity',
        'journalCommand',
        'journalOperationId',
        'tenantId',
      ]) {
        assert.throws(
          () => assertJournalMatchesRequest(projected, {
            ...requestWitness,
            [key]: `forged-${key}`,
          }),
          /Expected values to be strictly equal/u,
        );
      }

      for (const timestamp of [
        1_721_000_000,
        row.created_at + 0.5,
        -1,
        Number.MAX_SAFE_INTEGER + 1,
        8_640_000_000_000_001,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        String(row.created_at),
        Object(row.created_at),
        new Date(row.created_at),
        new Proxy(new Date(row.created_at), {}),
        '2026-07-27T14:04:39Z',
        '2026-07-27T14:04:39.388+00:00',
        new Date('invalid'),
        new (class extends Date {})('2026-07-27T14:04:39.388Z'),
      ]) {
        assert.throws(
          () => projectCompletedJournalRow({
            ...row,
            created_at: timestamp,
          }),
          /canonical journal timestamp/u,
        );
      }

      let getterReads = 0;
      const accessor = {...row};
      Object.defineProperty(accessor, 'created_at', {
        enumerable: true,
        get() {
          getterReads += 1;
          return new Date('2026-07-27T14:04:39.388Z');
        },
      });
      assert.throws(
        () => projectCompletedJournalRow(accessor),
        /exact invocation journal row/u,
      );
      assert.equal(getterReads, 0);
      assert.throws(
        () => projectCompletedJournalRow({
          ...row,
          extra: 'ambiguous',
        }),
        /exact invocation journal row/u,
      );
      assert.throws(
        () => projectCompletedJournalRow(Object.assign(
          Object.create({inherited: true}),
          row,
        )),
        /exact invocation journal row/u,
      );
      let proxyTraps = 0;
      const proxy = new Proxy(row, {
        getOwnPropertyDescriptor() {
          proxyTraps += 1;
          return undefined;
        },
        getPrototypeOf() {
          proxyTraps += 1;
          return Object.prototype;
        },
        ownKeys() {
          proxyTraps += 1;
          return [];
        },
      });
      assert.throws(
        () => projectCompletedJournalRow(proxy),
        /exact invocation journal row/u,
      );
      assert.equal(proxyTraps, 0);
    });

  it('binds completed evidence to the authoritative journal transition',
    () => {
      for (const columnName of ['created_at', 'updated_at']) {
        const column = WASM_OPERATIONS_SCHEMA.columns.find(
          ({name}) => name === columnName,
        );
        assert.equal(column.type, COLUMN_TYPE.INTEGER);
        assert.equal(column.notNull, true);
      }
      const created = createOperation(
        'request_binding_example',
        'invoke:binding-service-live:sha256:command',
        'request-invocation-live-regression',
      );
      assert.equal(created.success, true);
      assert.equal(created.params[5], '{}');
      assert.equal(created.params[6], '{}');
      assert.equal(Number.isSafeInteger(created.params[7]), true);
      assert.equal(created.params[7] >= 1_000_000_000_000, true);
      assert.equal(created.params[8], created.params[7]);
      const componentResult = JSON.stringify({
        body: MOVIELENS_PUBLIC_REQUEST_RESPONSE_BODY,
        headers: [[
          MOVIELENS_PUBLIC_REQUEST_RESPONSE_HEADER,
          MOVIELENS_PUBLIC_REQUEST.BINDING_NAME,
        ]],
        status: 200,
      });
      const completed = transitionOperation(
        'request-cell-operation-live-regression',
        'in_progress',
        'completed',
        componentResult,
      );
      assert.equal(completed.success, true);
      assert.equal(Number.isSafeInteger(completed.params[1]), true);
      assert.equal(completed.params[1] >= created.params[7], true);
      assert.equal(completed.params[2], COMPLETED_JOURNAL_RESULT);
      assert.match(completed.sql, /\bresult = \$3\b/u);
      assert.doesNotMatch(completed.sql, /\berror =/u);
      const failure = {
        code: 'component_failed',
        message: 'component rejected input',
        safeToRetry: false,
      };
      const failed = transitionOperation(
        'request-cell-operation-live-regression',
        'in_progress',
        'failed',
        failure,
      );
      assert.equal(failed.success, true);
      assert.equal(failed.params[2], JSON.stringify(failure));
      assert.match(failed.sql, /\berror = \$3\b/u);
      assert.doesNotMatch(failed.sql, /\bresult =/u);
    });

  it('distinguishes completed journal sentinels from failed outcomes', () => {
    const completed = completedJournalRowFixture();
    assert.deepEqual(
      projectCompletedJournalRow(completed),
      {
        ...completed,
        created_at: new Date(completed.created_at).toISOString(),
        updated_at: new Date(completed.updated_at).toISOString(),
      },
    );
    for (const forgedError of [
      null,
      {},
      '{ }',
      '{"code":"none"}',
      '{"message":"","safeToRetry":false}',
    ]) {
      assert.throws(
        () => projectCompletedJournalRow({
          ...completed,
          error: forgedError,
        }),
        /completed invocation journal row/u,
      );
    }
    const failedError = JSON.stringify({
      code: 'component_failed',
      message: 'component rejected input',
      safeToRetry: false,
    });
    const actualFailure = {
      ...completed,
      error: failedError,
      result: '{}',
      state: 'failed',
    };
    assert.throws(
      () => projectCompletedJournalRow(actualFailure),
      /completed invocation journal row/u,
    );
    for (const contradiction of [
      {...completed, error: failedError},
      {...completed, result: '{}'},
      {...completed, result: '{"status":"completed"}'},
      {
        ...completed,
        error: '{}',
        state: 'failed',
      },
      {
        ...actualFailure,
        error: '{}',
        result: COMPLETED_JOURNAL_RESULT,
      },
    ]) {
      assert.throws(
        () => projectCompletedJournalRow(contradiction),
        /completed invocation journal row/u,
      );
    }
  });

  it('accepts only exact plain operation identities without accessors', () => {
    assert.deepEqual(assertOperation({
      idempotencyKey: 'request-key',
      operationId: 'operation-key',
    }), {
      idempotencyKey: 'request-key',
      operationId: 'operation-key',
    });
    let getterReads = 0;
    const accessor = {operationId: 'operation-key'};
    Object.defineProperty(accessor, 'idempotencyKey', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 'request-key';
      },
    });
    assert.throws(() => assertOperation(accessor), /canonical/u);
    assert.equal(getterReads, 0);
    assert.throws(
      () => assertOperation({
        idempotencyKey: 'request-key',
        operationId: 'operation-key',
        signal: new AbortController().signal,
      }),
      /canonical/u,
    );
    assert.throws(
      () => assertOperation(Object.assign(
        Object.create({inherited: true}),
        {
          idempotencyKey: 'request-key',
          operationId: 'operation-key',
        },
      )),
      /canonical/u,
    );
  });

  it('makes PostgreSQL own score, ordering, and top-ten projection', () => {
    assert.match(RATINGS_TOP_QUALITY_SQL, /SUM\(rating\)/u);
    assert.match(RATINGS_TOP_QUALITY_SQL, /SQRT\(rating_count\)/u);
    assert.match(
      RATINGS_TOP_QUALITY_SQL,
      /ORDER BY score DESC, movie_id ASC/u,
    );
    assert.match(RATINGS_TOP_QUALITY_SQL, /LIMIT 10/u);
    assert.deepEqual(projectPostgresTopMovies([{
      avg_rating: '4.5',
      movie_id: '318',
      rating_count: '298',
      score: '4.36',
    }]), [{
      avgRating: 4.5,
      movieId: 318,
      ratingCount: 298,
      score: 4.36,
    }]);
  });

  it('forces a hanging PostgreSQL graceful close without stranding cleanup',
    async () => {
      const pool = new EventEmitter();
      const events = [];
      let completePoolClose;
      let completeProvenance;
      const poolClose = new Promise((resolve) => {
        completePoolClose = resolve;
      });
      const provenance = new Promise((resolve) => {
        completeProvenance = resolve;
      });
      pool.end = () => {
        events.push('pool-end');
        return poolClose;
      };
      const cleanupReceipt = {
        containersAbsent: true,
        networkAbsent: true,
      };
      const initialProvenance = {logs: {primary: 'initial'}};
      const controller = createPostgresSessionCleanupController({
        pool,
        initialProvenance,
        collectFinalProvenance: () => provenance,
        async cleanupBaseline() {
          events.push('baseline-cleanup');
          pool.emit('error', Object.assign(
            new Error('terminating connection due to administrator command'),
            {code: '57P01'},
          ));
          completePoolClose();
          return cleanupReceipt;
        },
        unconfirmedCleanupReceipt: {
          containersAbsent: null,
          networkAbsent: null,
        },
      });
      const gracefulClose = controller.close();
      await Promise.resolve();
      const forcedReceipt = await controller.forceClose();
      assert.deepEqual(events, ['baseline-cleanup', 'pool-end']);
      assert.equal(forcedReceipt.forced, true);
      assert.equal(forcedReceipt.cleanupReceipt, cleanupReceipt);
      completeProvenance(initialProvenance);
      await assert.rejects(
        gracefulClose,
        /PostgreSQL session cleanup failed/u,
      );
    });

  it('pins the row packing and confidence-adjusted result oracle', () => {
    const packed = packMovieRating(318, 5);
    assert.deepEqual(unpackMovieRating(packed), {
      movieId: 318,
      rating: 5,
    });
    const parsed = parseRatingsText(
      '1\t318\t5\t874965758\n2\t64\t4\t876893171\n',
    );
    assert.equal(parsed.cardinality, 2);
    assert.deepEqual(parsed.packedRows, [
      {key: 1, value: packMovieRating(318, 5)},
      {key: 2, value: packMovieRating(64, 4)},
    ]);

    const oracle = assertMovielensPublicRequestResult({
      alternative: {topMovies: TOP_MOVIES},
      ...resultRows(),
    });
    assert.equal(oracle.passed, true);
    assert.deepEqual(
      oracle.observed.map(({movieId}) => movieId),
      TOP_MOVIES.map(({movieId}) => movieId),
    );
  });

  it('rejects alternate bytes unless the explicit variant API pins them',
    async () => {
      const temporaryRoot = await mkdtemp(
        path.join(tmpdir(), 'movielens-dataset-identity-'),
      );
      const ratingsPath = path.join(temporaryRoot, 'u.data');
      const bytes = Buffer.from('1\t318\t5\t874965758\n');
      await writeFile(ratingsPath, bytes);
      try {
        await assert.rejects(
          loadMovielensPublicRequestDataset(ratingsPath),
          /identity mismatch/u,
        );
        const digest = `sha256:${createHash('sha256')
          .update(bytes)
          .digest('hex')}`;
        const variant = await loadMovielensPublicRequestDatasetVariant(
          ratingsPath,
          {
            cardinality: 1,
            digest,
            source: 'explicit-test-variant',
          },
        );
        assert.equal(variant.digest, digest);
        assert.equal(variant.cardinality, 1);
      } finally {
        await rm(temporaryRoot, {force: true, recursive: true});
      }
    });

  it('rejects accessor, boxed, sparse, and prototype-forged oracle rows',
    () => {
      let getterReads = 0;
      const accessorRow = {movieId: 318};
      Object.defineProperty(accessorRow, 'score', {
        enumerable: true,
        get() {
          getterReads += 1;
          return 4.362676;
        },
      });
      assert.throws(
        () => assertMovielensPublicRequestResult({
          alternative: {
            topMovies: [accessorRow, ...TOP_MOVIES.slice(1)],
          },
          ...resultRows(),
        }),
        /plain data record/u,
      );
      assert.equal(getterReads, 0);

      const boxed = TOP_MOVIES.map((row) => ({...row}));
      boxed[0].score = Object(4.362676);
      assert.throws(
        () => assertMovielensPublicRequestResult({
          alternative: {topMovies: boxed},
          ...resultRows(),
        }),
        /must be numeric/u,
      );

      const sparse = TOP_MOVIES.slice();
      delete sparse[3];
      assert.throws(
        () => assertMovielensPublicRequestResult({
          alternative: {topMovies: sparse},
          ...resultRows(),
        }),
        /exactly ten/u,
      );

      const forged = TOP_MOVIES.map((row) => ({...row}));
      Object.setPrototypeOf(forged[0], {polluted: true});
      assert.throws(
        () => assertMovielensPublicRequestResult({
          alternative: {topMovies: forged},
          ...resultRows(),
        }),
        /plain data record/u,
      );
    });
});
