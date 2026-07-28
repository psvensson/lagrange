import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

// The raw-index replay case reads the real MovieLens 100k ratings file, which
// lives under the gitignored data/ tree; CI fetches it digest-pinned before
// the gate runs.
const MOVIELENS_DATASET_URL =
  new URL('../../data/examples/movielens-100k/u.data', import.meta.url);

import {
  replayEvidenceIndex,
  resolveContentArtifact,
  sha256,
  validateArtifactBindings,
  validateLiveObservation,
  writeContentArtifact,
  writeJsonArtifact,
} from '../../examples/service-data-affinity/movielens-public-request-evidence-artifacts.js';
import {
  FAILURE_FIDELITY,
  FAILURE_OBSERVATION_NAME,
  FAILURE_PRODUCER,
  FAILURE_SCENARIO,
  replayFailureEvidenceIndex,
} from '../../examples/service-data-affinity/movielens-public-request-failure-evidence.js';
import {
  createInvocationIdentity,
  createInvocationIntentDigest,
  createRequestDigest,
} from '../../src/service/request-cell-routing-contract.js';
import {
  canonicalJson,
} from '../../src/control-plane/owners/deployment-binding-contract.js';

const DATASET_DIGEST =
  'sha256:06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490';
const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const SHA_C = `sha256:${'c'.repeat(64)}`;
const SHA_D = `sha256:${'d'.repeat(64)}`;
const SHA_E = `sha256:${'e'.repeat(64)}`;
const PUBLIC_PATH = '/benchmarks/movielens/grouped-reduce';
const PUBLIC_BINDING = 'movielens-public-grouped-reduce';
const PUBLIC_TENANT = 'request_binding_example';
const VERSION = 'movielens-public-request-workload-v1';
const COMPLETED_JOURNAL_RESULT = JSON.stringify(JSON.stringify({
  body: 'MovieLens grouped reduce completed',
  headers: [['x-lagrange-cell', PUBLIC_BINDING]],
  status: 200,
}));
const ARTIFACT_NAMES = Object.freeze([
  'movielens-input-bytes',
  'movielens-component-executable',
  'invocation-journal',
  'manifest-and-binding',
  'postgres-logs',
  'postgres-query',
  'public-request-bytes',
  'public-responses',
  'teardown-receipt',
  'source:fixture.js',
  'source-state',
  'raw-live-observation',
]);

function rankingRows() {
  return Array.from({length: 10}, (_, index) => ({
    movieId: index + 1,
    rank: index + 1,
    scoreMicros: (10 - index) * 1_000_000,
  }));
}

function journalRow(request) {
  return {
    command: request.journalCommand,
    created_at: '2026-07-27T00:00:00.000Z',
    error: '{}',
    idempotency_key: request.invocationIdentity,
    operation_id: request.journalOperationId,
    result: COMPLETED_JOURNAL_RESULT,
    state: 'completed',
    tenant_id: request.tenantId,
    updated_at: '2026-07-27T00:00:01.000Z',
  };
}

function requestWitness(idempotencyKey, resultKeyOffset, deployment) {
  const body = {
    datasetDigest: DATASET_DIGEST,
    resultKeyOffset,
    workloadVersion: VERSION,
  };
  const normalizedRequest = {
    body,
    headers: {
      'accept': '*/*',
      'content-type': 'application/json',
    },
    method: 'POST',
    path: PUBLIC_PATH,
    query: {},
  };
  const invocationIdentity = createInvocationIdentity(
    PUBLIC_TENANT,
    idempotencyKey,
  );
  const requestDigest = createRequestDigest(normalizedRequest);
  const intentDigest = createInvocationIntentDigest({
    bindingVersionId: deployment.readyCell.bindingVersionId,
    method: 'POST',
    path: PUBLIC_PATH,
    requestDigest,
    tenantId: PUBLIC_TENANT,
  });
  const journalOperationId = `request-cell-operation-${
    createHash('sha256')
      .update(JSON.stringify([PUBLIC_TENANT, invocationIdentity]))
      .digest('hex')
  }`;
  return {
    bindingVersionId: deployment.readyCell.bindingVersionId,
    body: JSON.stringify(body),
    idempotencyKey,
    intentDigest,
    invocationIdentity,
    journalCommand:
      `invoke:${deployment.readyCell.serviceId}:${intentDigest}`,
    journalOperationId,
    method: 'POST',
    normalizedRequest,
    path: PUBLIC_PATH,
    requestDigest,
    routeServiceId: deployment.readyCell.serviceId,
    tenantId: PUBLIC_TENANT,
  };
}

function responseWitness(request) {
  return {
    body: 'MovieLens grouped reduce completed',
    headers: {'x-lagrange-cell': PUBLIC_BINDING},
    requestWitness: request,
    status: 200,
  };
}

function liveFixture() {
  const expected = rankingRows();
  const deployment = {
    binding: {
      budgets: {
        context_bytes: 16_777_216,
        cpu_time_ms: 60_000,
        input_bytes: 4_096,
        memory_bytes: 67_108_864,
        output_bytes: 4_096,
        wall_time_ms: 60_000,
      },
      name: PUBLIC_BINDING,
      schema_version: 2,
      source: {kind: 'request', method: 'POST', path: PUBLIC_PATH},
      target: {
        export_name: 'run',
        manifest_digest: SHA_E,
        package_id: 'service-package-fixture',
      },
    },
    bindingReceipt: {manifest_digest: SHA_E},
    manifest: {
      artifact: {
        digest: SHA_B,
        media_type: 'application/wasm',
        ref:
          'registry.example.test/examples/' +
          'movielens-public-grouped-reduce:1.0.0',
        size_bytes: 123,
        type: 'oci',
      },
      capabilities: [],
      exports: [{interface: 'request_v1', name: 'run'}],
      name: PUBLIC_BINDING,
      runtime: {kind: 'wasm_component'},
      schema_version: 3,
      version: '1.0.0',
    },
    packageId: 'service-package-fixture',
    readyCell: {
      bindingDigest: SHA_E,
      bindingVersionId: 'binding-version-fixture',
      method: 'POST',
      nodeId: 'node-fixture',
      path: PUBLIC_PATH,
      replicaId: 'replica-fixture',
      serviceId: 'pending-service-fixture',
      targetAddress: 'node-fixture/service/runtime-service-handler',
      targetNodeId: 'node-fixture',
      tenantId: PUBLIC_TENANT,
    },
  };
  const manifestDigest =
    `sha256:${createHash('sha256')
      .update(canonicalJson(deployment.manifest))
      .digest('hex')}`;
  deployment.binding.target.manifest_digest = manifestDigest;
  deployment.bindingReceipt.manifest_digest = manifestDigest;
  const fixtureDigest = (value) =>
    createHash('sha256')
      .update(canonicalJson(value))
      .digest('hex');
  const bindingId = `binding-${fixtureDigest({
    bindingName: PUBLIC_BINDING,
    tenantId: PUBLIC_TENANT,
  })}`;
  deployment.readyCell.bindingDigest =
    `sha256:${fixtureDigest({
      ...deployment.binding,
      capabilities: deployment.manifest.capabilities,
    })}`;
  deployment.readyCell.bindingVersionId =
    `binding-version-${fixtureDigest({
      bindingId,
      generation: 1,
    })}`;
  deployment.readyCell.serviceId =
    `binding-service-${createHash('sha256')
      .update(deployment.readyCell.bindingVersionId)
      .digest('hex')}`;
  const firstRequest = requestWitness('first-key', 0, deployment);
  const distinctRequest =
    requestWitness('distinct-key', 10, deployment);
  const firstJournal = journalRow(firstRequest);
  const distinctJournal = journalRow(distinctRequest);
  const postgresCleanup = {
    containersAbsent: true,
    networkAbsent: true,
    networkName: 'fixture-network',
    removedContainerIds: ['primary', 'replica-1', 'replica-2'],
  };
  return {
    alternative: {
      cleanupReceipt: postgresCleanup,
      engine: 'PostgreSQL 16',
      imageId: SHA_A,
      imageInspection: {
        id: SHA_A,
        repoDigests: [
          `postgres@sha256:${'1'.repeat(64)}`,
        ],
      },
      imageRepoDigests: [
        `postgres@sha256:${'1'.repeat(64)}`,
      ],
      inputDigest: DATASET_DIGEST,
      inputSizeBytes: 123,
      postgresLogDigests: {
        'primary': SHA_A,
        'replica-1': SHA_B,
        'replica-2': SHA_C,
      },
      postgresVersion: 'PostgreSQL 16.9 fixture',
      postgresVersionSql: 'SELECT version()',
      querySql:
        'SELECT AVG(rating) AS avg_rating, ' +
        'COUNT(*) AS rating_count, SUM(rating) AS rating_sum, ' +
        '((rating_sum + 87.5) / (rating_count + 25) - ' +
        '0.5 / SQRT(rating_count)) AS score FROM ratings ' +
        'GROUP BY movie_id ORDER BY score DESC, movie_id ASC LIMIT 10',
      replicationFactor: 3,
      replicationState: {ready: true, replicaCount: 2},
      returnedAggregateRows: 10,
      measuredContainerImages: [
        {containerId: 'primary', inspectImage: SHA_A},
        {containerId: 'replica-1', inspectImage: SHA_A},
        {containerId: 'replica-2', inspectImage: SHA_A},
      ],
      topMovies: expected.map((row) => ({
        avgRating: 4,
        movieId: row.movieId,
        ratingCount: 10,
        score: row.scoreMicros / 1_000_000,
      })),
      totalRows: 100_000,
    },
    artifact: {
      buildInputFingerprint: SHA_D,
      componentSource:
        'examples/service-data-affinity/' +
        'movielens-public-grouped-reduce-component.wat',
      executableDigest: SHA_C,
      ociManifestDigest: SHA_B,
      ociPayloadDigest: SHA_C,
    },
    authentication: {
      deniedStatus: 401,
      durableInvocationJournalRowsAfterDenial: 0,
      durableResultRowsAfterDenial: 0,
      durableTableRowsAfterDenial: {
        'global.movielens_public_result_movies': 0,
        'global.movielens_public_result_scores': 0,
      },
      principal: 'request-binding-example-user',
      unauthenticatedInvoked: false,
    },
    dataset: {
      cardinality: 100_000,
      digest: DATASET_DIGEST,
      sizeBytes: 123,
      source: 'MovieLens 100K u.data',
    },
    deployment,
    drainReceipt: {inFlight: 0, status: 'drained'},
    durability: {
      contract: 'acknowledged_write_visible_after_completion',
      expected: 20,
      observed: 20,
      replayPreserved: true,
      status: 'pass',
    },
    inputDurability: {expected: 100_001, observed: 100_001},
    journalEvidence: {
      distinct: distinctJournal,
      first: firstJournal,
      replayAfter: {...firstJournal},
      replayBefore: {...firstJournal},
    },
    operationBoundary: {
      authenticatedHttp: true,
      componentHeader: PUBLIC_BINDING,
      distinctIdempotencyKey: 'distinct-key',
      idempotencyKey: 'first-key',
      journalReplayPreserved: true,
      method: 'POST',
      path: PUBLIC_PATH,
      principal: 'request-binding-example-user',
      status: 200,
    },
    oracle: {
      expected,
      observed: structuredClone(expected),
      passed: true,
      version: 'confidence-adjusted-top-ten-v1',
    },
    repeatedOperation: {
      distinctDurableKeyRange: {lowerInclusive: 11, upperInclusive: 20},
      distinctGeneration: 'generation-1',
      distinctInvocationCount: 2,
      distinctOperationOracle: {
        expected: structuredClone(expected),
        observed: structuredClone(expected),
        passed: true,
        version: 'confidence-adjusted-top-ten-v1',
      },
      distinctOperationResultKeyOffset: 10,
      firstInvocationCount: 1,
      firstOperationResultKeyOffset: 0,
      generation: 'generation-1',
      replayGeneration: 'generation-1',
      replayInvocationCount: 2,
      sameGenerationDistinctOperationsEquivalent: true,
      semanticStatus: 'equivalent',
    },
    requestEvidence: {
      distinct: distinctRequest,
      first: firstRequest,
      replay: structuredClone(firstRequest),
    },
    responseEvidence: {
      distinct: responseWitness(distinctRequest),
      first: responseWitness(firstRequest),
      replay: responseWitness(structuredClone(firstRequest)),
    },
    teardown: {
      cellAbsent: true,
      nodeStopped: true,
      postgres: postgresCleanup,
      replicaId: 'replica-fixture',
      temporaryDirectoryAbsent: true,
    },
    timeoutSemantics: 'ambiguous_until_drain_verified',
    workloadManifest: {
      alternative: 'postgresql-16-grouped-sql',
      consistency: 'statement_reads_committed_state',
      dataset: {
        cardinality: 100_000,
        digest: DATASET_DIGEST,
        source: 'MovieLens 100K u.data',
      },
      durability: 'acknowledged_write_visible_after_completion',
      operationBoundary: {method: 'POST', path: PUBLIC_PATH},
      resultOracle: 'confidence-adjusted-top-ten-v1',
      version: VERSION,
    },
  };
}

function sourceStateFixture() {
  const sources = [{
    byteLength: 17,
    digest: SHA_A,
    path: 'fixture.js',
  }];
  return {
    gitHead: '1'.repeat(40),
    gitHeadTree: '2'.repeat(40),
    sourceSetDigest:
      `sha256:${createHash('sha256')
        .update(JSON.stringify(sources))
        .digest('hex')}`,
    sources,
    worktreeStatus: '',
  };
}

function descriptorFixture(live) {
  return ARTIFACT_NAMES.map((name) => ({
    byteLength:
      name === 'movielens-input-bytes' ?
        live.dataset.sizeBytes :
        name === 'source:fixture.js' ? 17 : 1,
    digest:
      name === 'movielens-input-bytes' ?
        live.dataset.digest :
        name === 'movielens-component-executable' ?
          live.artifact.executableDigest :
          name === 'source:fixture.js' ? SHA_A : SHA_B,
    mediaType: 'application/octet-stream',
    name,
    path: `/retained/${name}`,
  }));
}

describe('MovieLens public request evidence artifacts', () => {
  it('resolves digest-named bytes and rejects post-write corruption',
    async () => {
      const root = await mkdtemp(
        path.join(tmpdir(), 'movielens-evidence-artifacts-'),
      );
      try {
        const descriptor = await writeContentArtifact({
          bytes: Buffer.from('retained evidence'),
          mediaType: 'text/plain',
          name: 'fixture',
          root,
        });
        assert.match(
          descriptor.path,
          new RegExp(descriptor.digest.slice('sha256:'.length), 'u'),
        );
        const resolved =
          await resolveContentArtifact(descriptor, {root});
        assert.equal(resolved.bytes.toString(), 'retained evidence');

        const pathOriginals = [
          ['dirname', Object.getOwnPropertyDescriptor(path, 'dirname')],
          ['join', Object.getOwnPropertyDescriptor(path, 'join')],
          ['resolve', Object.getOwnPropertyDescriptor(path, 'resolve')],
        ];
        let pathPollutionResolved;
        try {
          for (const [key] of pathOriginals) {
            Object.defineProperty(path, key, {
              configurable: true,
              value() {
                throw new Error(`polluted path.${key} executed`);
              },
              writable: true,
            });
          }
          pathPollutionResolved =
            await resolveContentArtifact(descriptor, {root});
        } finally {
          for (const [key, original] of pathOriginals) {
            Object.defineProperty(path, key, original);
          }
        }
        assert.equal(
          pathPollutionResolved.bytes.toString(),
          'retained evidence',
        );

        let accessorReads = 0;
        const accessorDescriptor = {...descriptor};
        Object.defineProperty(accessorDescriptor, 'digest', {
          enumerable: true,
          get() {
            accessorReads += 1;
            return descriptor.digest;
          },
        });
        await assert.rejects(
          resolveContentArtifact(accessorDescriptor, {root}),
          /exact plain data/u,
        );
        assert.equal(accessorReads, 0);

        let proxyTraps = 0;
        const proxyDescriptor = new Proxy({...descriptor}, {
          get(target, key, receiver) {
            proxyTraps += 1;
            return Reflect.get(target, key, receiver);
          },
          ownKeys(target) {
            proxyTraps += 1;
            return Reflect.ownKeys(target);
          },
        });
        await assert.rejects(
          resolveContentArtifact(proxyDescriptor, {root}),
          /exact plain data/u,
        );
        assert.equal(proxyTraps, 0);

        const inheritedDescriptor = Object.assign(
          Object.create({unexpected: true}),
          descriptor,
        );
        await assert.rejects(
          resolveContentArtifact(inheritedDescriptor, {root}),
          /exact plain data/u,
        );

        const symbolDescriptor = {...descriptor};
        symbolDescriptor[Symbol('unexpected')] = true;
        await assert.rejects(
          resolveContentArtifact(symbolDescriptor, {root}),
          /exact plain data/u,
        );

        const hiddenDescriptor = {...descriptor};
        Object.defineProperty(hiddenDescriptor, 'unexpected', {
          value: true,
        });
        await assert.rejects(
          resolveContentArtifact(hiddenDescriptor, {root}),
          /exact plain data/u,
        );

        let digestCoercions = 0;
        const hostileDigestDescriptor = {
          ...descriptor,
          digest: {
            [Symbol.toPrimitive]() {
              digestCoercions += 1;
              return descriptor.digest;
            },
          },
        };
        await assert.rejects(
          resolveContentArtifact(hostileDigestDescriptor, {root}),
          /descriptor fields are invalid/u,
        );
        assert.equal(digestCoercions, 0);

        await writeFile(
          descriptor.path,
          'x'.repeat(descriptor.byteLength),
        );
        await assert.rejects(
          resolveContentArtifact(descriptor, {root}),
          /rehash failed/u,
        );
        const symlinkTarget = path.join(root, 'symlink-target');
        await writeFile(
          symlinkTarget,
          'x'.repeat(descriptor.byteLength),
        );
        await unlink(descriptor.path);
        await symlink(symlinkTarget, descriptor.path);
        await assert.rejects(
          resolveContentArtifact(descriptor, {root}),
          /file invalid/u,
        );
      } finally {
        await rm(root, {force: true, recursive: true});
      }
    });

  it('rejects symlinked content-addressed directory ancestry',
    async () => {
      const temporaryRoot = await mkdtemp(
        path.join(tmpdir(), 'movielens-evidence-ancestry-'),
      );
      try {
        const root = path.join(temporaryRoot, 'sha256');
        const outside = path.join(temporaryRoot, 'outside');
        await mkdir(root, {recursive: true});
        await mkdir(outside, {recursive: true});
        const bytes = Buffer.from('symlink ancestry evidence');
        const digest = sha256(bytes);
        const hex = digest.slice('sha256:'.length);
        const prefix = hex.slice(0, 2);
        await symlink(outside, path.join(root, prefix), 'dir');
        await writeFile(path.join(outside, `${hex}.blob`), bytes);
        const descriptor = {
          byteLength: bytes.length,
          digest,
          mediaType: 'text/plain',
          name: 'symlink-ancestor',
          path: path.join(root, prefix, `${hex}.blob`),
        };
        await assert.rejects(
          resolveContentArtifact(descriptor, {root}),
          /file invalid/u,
        );
        await assert.rejects(
          writeContentArtifact({
            bytes,
            mediaType: 'text/plain',
            name: 'symlink-ancestor-write',
            root,
          }),
          /directory ancestry/u,
        );
      } finally {
        await rm(temporaryRoot, {force: true, recursive: true});
      }
    });

  it('derives its verdict from the complete exact witness set', () => {
    const validation = validateLiveObservation(liveFixture());
    assert.equal(validation.passed, true);
    assert.deepEqual(validation.failures, []);
  });

  it('rejects ambiguous or noncanonical journal timestamps', () => {
    const supportedBoundary = liveFixture();
    for (const row of Object.values(supportedBoundary.journalEvidence)) {
      row.created_at = '+275760-09-13T00:00:00.000Z';
      row.updated_at = '+275760-09-13T00:00:00.000Z';
    }
    assert.equal(
      validateLiveObservation(supportedBoundary).passed,
      true,
    );
    for (const timestamp of [
      1_721_000_000_000,
      new Date(1_721_000_000).toISOString(),
      '2026-07-27T00:00:00Z',
      '2026-07-27T00:00:00.000+00:00',
      '2026-02-30T00:00:00.000Z',
      'not-a-date',
    ]) {
      const live = liveFixture();
      for (const row of Object.values(live.journalEvidence)) {
        row.created_at = timestamp;
        row.updated_at = timestamp;
      }
      assert.equal(
        validateLiveObservation(live).passed,
        false,
        String(timestamp),
      );
    }
  });

  it('rejects failed and contradictory journal outcome sentinels', () => {
    const failedError = JSON.stringify({
      code: 'component_failed',
      message: 'component rejected input',
      safeToRetry: false,
    });
    const attacks = [
      {error: '{ }'},
      {error: failedError},
      {result: '{}'},
      {
        error: failedError,
        result: '{}',
        state: 'failed',
      },
      {
        error: '{}',
        result: COMPLETED_JOURNAL_RESULT,
        state: 'failed',
      },
    ];
    for (const attack of attacks) {
      const live = liveFixture();
      for (const row of Object.values(live.journalEvidence)) {
        Object.assign(row, attack);
      }
      assert.equal(validateLiveObservation(live).passed, false);
    }
  });

  it('fails closed when any terminal witness category is changed', () => {
    const attacks = [
      ['dataset', (live) => {
        live.dataset.cardinality = 99_999;
      }],
      ['manifest', (live) => {
        live.workloadManifest.version = 'wrong';
      }],
      ['oracle', (live) => {
        live.oracle.observed[0].movieId = 999;
      }],
      ['distinct oracle', (live) => {
        live.repeatedOperation.distinctOperationOracle.passed = false;
      }],
      ['durability', (live) => {
        live.durability.observed = 19;
      }],
      ['input', (live) => {
        live.inputDurability.observed = 100_000;
      }],
      ['operation', (live) => {
        live.operationBoundary.status = 202;
      }],
      ['authentication', (live) => {
        live.authentication.durableResultRowsAfterDenial = 1;
      }],
      ['authentication journal census', (live) => {
        live.authentication.durableInvocationJournalRowsAfterDenial = 1;
      }],
      ['journal', (live) => {
        live.journalEvidence.replayAfter.state = 'pending';
      }],
      ['journal tenant identity', (live) => {
        live.journalEvidence.first.tenant_id = 'unrelated_tenant';
      }],
      ['journal invocation identity', (live) => {
        live.journalEvidence.first.idempotency_key =
          `request-invocation-${'a'.repeat(64)}`;
      }],
      ['journal operation identity', (live) => {
        live.journalEvidence.first.operation_id =
          `request-cell-operation-${'a'.repeat(64)}`;
      }],
      ['journal command identity', (live) => {
        live.journalEvidence.first.command =
          `invoke:unrelated:${SHA_A}`;
      }],
      ['generation', (live) => {
        live.repeatedOperation.replayInvocationCount = 3;
      }],
      ['drain', (live) => {
        live.drainReceipt.inFlight = 1;
      }],
      ['request', (live) => {
        live.requestEvidence.first.body = '{"signal":true}';
      }],
      ['request digest', (live) => {
        live.requestEvidence.first.requestDigest = SHA_E;
      }],
      ['request route service', (live) => {
        live.requestEvidence.first.routeServiceId =
          'unrelated-valid-service';
      }],
      ['response', (live) => {
        live.responseEvidence.first.status = 201;
      }],
      ['postgres version', (live) => {
        live.alternative.postgresVersionSql = 'SELECT 1';
      }],
      ['postgres image', (live) => {
        live.alternative.imageId = 'sha256:short';
      }],
      ['postgres inspected image identity', (live) => {
        live.alternative.imageInspection.id = SHA_B;
      }],
      ['postgres repository digest identity', (live) => {
        live.alternative.imageRepoDigests = [
          `postgres@sha256:${'2'.repeat(64)}`,
        ];
      }],
      ['postgres measured image identity', (live) => {
        live.alternative.measuredContainerImages[0].inspectImage = SHA_B;
      }],
      ['postgres measured container identity', (live) => {
        live.alternative.measuredContainerImages[0].containerId =
          'unrelated-valid-container';
      }],
      ['postgres duplicate measured container identity', (live) => {
        live.alternative.measuredContainerImages[1].containerId =
          live.alternative.measuredContainerImages[0].containerId;
      }],
      ['postgres input/RF3', (live) => {
        live.alternative.replicationState.replicaCount = 1;
      }],
      ['postgres SQL', (live) => {
        live.alternative.querySql = 'SELECT * FROM ratings';
      }],
      ['postgres top ten', (live) => {
        live.alternative.topMovies[0].movieId = 999;
      }],
      ['deployment', (live) => {
        live.deployment.binding.source.path = '/wrong';
      }],
      ['artifact', (live) => {
        live.artifact.ociPayloadDigest = SHA_E;
      }],
      ['cleanup', (live) => {
        live.teardown.nodeStopped = false;
      }],
    ];
    for (const [name, attack] of attacks) {
      const live = structuredClone(liveFixture());
      attack(live);
      assert.equal(
        validateLiveObservation(live).passed,
        false,
        name,
      );
    }
  });

  it('binds the route digest to the owner-normalized declaration', () => {
    const live = liveFixture();
    assert.equal(validateLiveObservation(live).passed, true);
    live.deployment.readyCell.bindingDigest =
      `sha256:${createHash('sha256')
        .update(canonicalJson(live.deployment.binding))
        .digest('hex')}`;
    const validation = validateLiveObservation(live);
    assert.equal(validation.passed, false);
    assert.deepEqual(validation.failures, [
      'WASM Component manifest/binding/ready-cell witness invalid',
    ]);
  });

  it('rejects non-plain live evidence without executing traps', () => {
    let accessorReads = 0;
    const accessorLive = liveFixture();
    Object.defineProperty(accessorLive.dataset, 'cardinality', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return 100_000;
      },
    });
    assert.equal(validateLiveObservation(accessorLive).passed, false);
    assert.equal(accessorReads, 0);

    let proxyTraps = 0;
    const proxyLive = liveFixture();
    proxyLive.dataset = new Proxy(proxyLive.dataset, {
      get(target, key, receiver) {
        proxyTraps += 1;
        return Reflect.get(target, key, receiver);
      },
      ownKeys(target) {
        proxyTraps += 1;
        return Reflect.ownKeys(target);
      },
    });
    assert.equal(validateLiveObservation(proxyLive).passed, false);
    assert.equal(proxyTraps, 0);

    const inheritedLive = liveFixture();
    Object.setPrototypeOf(inheritedLive.dataset, {cardinality: 100_000});
    assert.equal(validateLiveObservation(inheritedLive).passed, false);

    const symbolLive = liveFixture();
    symbolLive.dataset[Symbol('unexpected')] = true;
    assert.equal(validateLiveObservation(symbolLive).passed, false);

    const hiddenLive = liveFixture();
    Object.defineProperty(hiddenLive.dataset, 'unexpected', {
      configurable: true,
      value: true,
    });
    assert.equal(validateLiveObservation(hiddenLive).passed, false);

    const extraLive = liveFixture();
    extraLive.dataset.unexpected = true;
    assert.equal(validateLiveObservation(extraLive).passed, false);

    const objectSqlLive = liveFixture();
    objectSqlLive.alternative.querySql = {};
    const objectSqlValidation =
      validateLiveObservation(objectSqlLive);
    assert.equal(objectSqlValidation.passed, false);
    assert.equal(
      objectSqlValidation.failures.includes(
        'PostgreSQL grouped confidence ranking SQL invalid',
      ),
      true,
    );

    let sqlCoercions = 0;
    const hostileSqlLive = liveFixture();
    hostileSqlLive.alternative.querySql = {
      [Symbol.toPrimitive]() {
        sqlCoercions += 1;
        return liveFixture().alternative.querySql;
      },
    };
    assert.equal(validateLiveObservation(hostileSqlLive).passed, false);
    assert.equal(sqlCoercions, 0);
  });

  it('uses captured intrinsics under hostile global pollution', () => {
    const valid = liveFixture();
    const invalid = liveFixture();
    invalid.alternative.imageId = SHA_B;
    invalid.alternative.imageInspection.id = SHA_B;
    invalid.alternative.measuredContainerImages =
      invalid.alternative.measuredContainerImages.map((container) => ({
        ...container,
        inspectImage: SHA_B,
      }));
    invalid.alternative.querySql = 'SELECT * FROM ratings';

    const defineProperty = Object.defineProperty;
    const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const canonicalArrayPrototype = Object.getPrototypeOf([]);
    const canonicalObjectPrototype = Object.getPrototypeOf({});
    const canonicalRegexpPrototype = Object.getPrototypeOf(/fixture/u);
    const mutations = [
      [Array, 'isArray', () => true],
      [canonicalArrayPrototype, 'every', () => true],
      [canonicalArrayPrototype, 'push', () => 0],
      [JSON, 'parse', () => ({})],
      [JSON, 'stringify', () => '"polluted"'],
      [Object, 'getOwnPropertyDescriptor', () => ({
        enumerable: true,
        value: true,
      })],
      [Object, 'getPrototypeOf', () => canonicalObjectPrototype],
      [Object, 'hasOwn', () => true],
      [canonicalRegexpPrototype, 'exec', () => ['polluted']],
      [canonicalRegexpPrototype, 'test', () => true],
    ];
    const originals = mutations.map(([target, key]) => [
      target,
      key,
      getOwnPropertyDescriptor(target, key),
    ]);
    let inheritedReads = 0;
    const inheritedKey = '__evidence_intrinsic_pollution__';
    const inheritedDescriptor =
      getOwnPropertyDescriptor(canonicalObjectPrototype, inheritedKey);
    let validPassed;
    let invalidPassed;
    try {
      for (const [target, key, value] of mutations) {
        defineProperty(target, key, {
          configurable: true,
          value,
          writable: true,
        });
      }
      defineProperty(canonicalObjectPrototype, inheritedKey, {
        configurable: true,
        get() {
          inheritedReads += 1;
          return true;
        },
      });
      validPassed = validateLiveObservation(valid).passed;
      invalidPassed = validateLiveObservation(invalid).passed;
    } finally {
      for (const [target, key, descriptor] of originals) {
        defineProperty(target, key, descriptor);
      }
      if (inheritedDescriptor) {
        defineProperty(
          canonicalObjectPrototype,
          inheritedKey,
          inheritedDescriptor,
        );
      } else {
        Reflect.deleteProperty(canonicalObjectPrototype, inheritedKey);
      }
    }
    assert.equal(validPassed, true);
    assert.equal(invalidPassed, false);
    assert.equal(inheritedReads, 0);
  });

  it('fails closed on artifact set and source binding attacks', () => {
    const live = liveFixture();
    const sourceState = sourceStateFixture();
    const descriptors = descriptorFixture(live);
    assert.equal(
      validateArtifactBindings(
        live,
        descriptors,
        ARTIFACT_NAMES,
        sourceState,
      ).passed,
      true,
    );
    const attacks = [
      ['missing', (copy) => copy.pop()],
      ['duplicate', (copy) => {
        copy[1].name = copy[0].name;
      }],
      ['unexpected', (copy) => {
        copy[1].name = 'unexpected';
      }],
      ['dataset digest', (copy) => {
        copy[0].digest = SHA_E;
      }],
      ['dataset bytes', (copy) => {
        copy[0].byteLength += 1;
      }],
      ['executable digest', (copy) => {
        copy[1].digest = SHA_E;
      }],
      ['descriptor shape', (copy) => {
        copy[2].digest = 'invalid';
      }],
      ['source digest', (copy) => {
        copy.find((entry) => entry.name === 'source:fixture.js').digest =
          SHA_E;
      }],
    ];
    for (const [name, attack] of attacks) {
      const copy = structuredClone(descriptors);
      attack(copy);
      assert.equal(
        validateArtifactBindings(
          live,
          copy,
          ARTIFACT_NAMES,
          sourceState,
        ).passed,
        false,
        name,
      );
    }
    const changedSourceState = structuredClone(sourceState);
    changedSourceState.gitHeadTree = 'invalid';
    assert.equal(
      validateArtifactBindings(
        live,
        descriptors,
        ARTIFACT_NAMES,
        changedSourceState,
      ).passed,
      false,
    );
  });

  it('rehashes a raw index and re-derives every terminal verdict',
    async () => {
      assert.ok(
        existsSync(MOVIELENS_DATASET_URL),
        'MovieLens 100k dataset missing; run ' +
          'node examples/service-data-affinity/download-movielens.js',
      );
      const temporaryRoot = await mkdtemp(
        path.join(tmpdir(), 'movielens-evidence-replay-'),
      );
      const artifactRoot = path.join(temporaryRoot, 'sha256');
      try {
        const live = liveFixture();
        const datasetBytes = await readFile(MOVIELENS_DATASET_URL);
        live.dataset.sizeBytes = datasetBytes.length;
        live.alternative.inputSizeBytes = datasetBytes.length;
        const executableBytes = Buffer.from('fixture wasm executable');
        live.artifact.executableDigest = sha256(executableBytes);
        live.artifact.ociPayloadDigest = live.artifact.executableDigest;
        const postgresLogs = {
          'primary': 'primary fixture log\n',
          'replica-1': 'replica one fixture log\n',
          'replica-2': 'replica two fixture log\n',
        };
        for (const [containerId, logs] of Object.entries(postgresLogs)) {
          live.alternative.postgresLogDigests[containerId] =
            sha256(Buffer.from(logs));
        }
        const sourceBytes = Buffer.from('fixture source\n');
        const sources = [{
          byteLength: sourceBytes.length,
          digest: sha256(sourceBytes),
          path: 'fixture.js',
        }];
        const sourceState = {
          gitHead: '1'.repeat(40),
          gitHeadTree: '2'.repeat(40),
          sourceSetDigest: sha256(
            Buffer.from(JSON.stringify(sources)),
          ),
          sources,
          worktreeStatus: '',
        };
        const descriptors = [
          await writeContentArtifact({
            bytes: datasetBytes,
            mediaType: 'text/tab-separated-values',
            name: 'movielens-input-bytes',
            root: artifactRoot,
          }),
          await writeContentArtifact({
            bytes: executableBytes,
            mediaType: 'application/wasm',
            name: 'movielens-component-executable',
            root: artifactRoot,
          }),
        ];
        const retainedJsonValues = {
          'invocation-journal': live.journalEvidence,
          'manifest-and-binding': {
            binding: live.deployment.binding,
            manifest: live.deployment.manifest,
          },
          'postgres-logs': postgresLogs,
          'postgres-query': {
            imageId: live.alternative.imageId,
            imageInspection: live.alternative.imageInspection,
            imageRepoDigests: live.alternative.imageRepoDigests,
            measuredContainerImages:
              live.alternative.measuredContainerImages,
            queryRows: live.alternative.topMovies,
            sql: live.alternative.querySql,
            version: live.alternative.postgresVersion,
            versionSql: live.alternative.postgresVersionSql,
          },
          'public-request-bytes': live.requestEvidence,
          'public-responses': live.responseEvidence,
          'teardown-receipt': live.teardown,
        };
        for (const name of ARTIFACT_NAMES.slice(2, 9)) {
          descriptors.push(await writeJsonArtifact({
            name,
            root: artifactRoot,
            value: retainedJsonValues[name],
          }));
        }
        descriptors.push(await writeContentArtifact({
          bytes: sourceBytes,
          mediaType: 'text/javascript',
          name: 'source:fixture.js',
          root: artifactRoot,
        }));
        descriptors.push(await writeJsonArtifact({
          name: 'source-state',
          root: artifactRoot,
          value: sourceState,
        }));
        const observationArtifact = await writeJsonArtifact({
          name: 'raw-live-observation',
          root: artifactRoot,
          value: {
            fidelity: 'live-integration-raw',
            observation: live,
            producer:
              'comparative-efficiency-movielens-public-request-live-runner',
            scenario:
              'comparative-efficiency-movielens-public-request-workload',
            sourceState,
            timestamp: '2026-07-27T00:00:00.000Z',
          },
        });
        descriptors.push(observationArtifact);
        const raw = {
          artifacts: descriptors,
          observationArtifact,
          sourceState,
        };
        const indexDescriptor = await writeJsonArtifact({
          name: 'evidence-index',
          root: artifactRoot,
          value: raw,
        });
        const indexBytes = await readFile(indexDescriptor.path);
        const index = {
          digest: indexDescriptor.digest,
          path: indexDescriptor.path,
        };
        const replay = await replayEvidenceIndex(index, {
          expectedNames: ARTIFACT_NAMES,
          root: artifactRoot,
        });
        assert.equal(replay.passed, true);

        const extraFieldIndexDescriptor = await writeJsonArtifact({
          name: 'evidence-index',
          root: artifactRoot,
          value: {...raw, unexpected: true},
        });
        await assert.rejects(
          replayEvidenceIndex({
            digest: extraFieldIndexDescriptor.digest,
            path: extraFieldIndexDescriptor.path,
          }, {
            expectedNames: ARTIFACT_NAMES,
            root: artifactRoot,
          }),
          /artifact set is invalid/u,
        );

        for (const artifactName of [
          'invocation-journal',
          'manifest-and-binding',
          'postgres-logs',
          'postgres-query',
          'public-request-bytes',
          'public-responses',
          'teardown-receipt',
        ]) {
          const substitute = await writeJsonArtifact({
            name: artifactName,
            root: artifactRoot,
            value: {unrelated: artifactName},
          });
          const attackedRaw = structuredClone(raw);
          const attackedIndex = attackedRaw.artifacts.findIndex(
            (descriptor) => descriptor.name === artifactName,
          );
          attackedRaw.artifacts[attackedIndex] = substitute;
          const attackedIndexDescriptor = await writeJsonArtifact({
            name: 'evidence-index',
            root: artifactRoot,
            value: attackedRaw,
          });
          await assert.rejects(
            replayEvidenceIndex({
              digest: attackedIndexDescriptor.digest,
              path: attackedIndexDescriptor.path,
            }, {
              expectedNames: ARTIFACT_NAMES,
              root: artifactRoot,
            }),
            /(?:does|do) not bind live observation/u,
            artifactName,
          );
        }

        let accessorReads = 0;
        const accessorIndex = {...index};
        Object.defineProperty(accessorIndex, 'digest', {
          enumerable: true,
          get() {
            accessorReads += 1;
            return index.digest;
          },
        });
        await assert.rejects(
          replayEvidenceIndex(accessorIndex, {
            expectedNames: ARTIFACT_NAMES,
            root: artifactRoot,
          }),
          /exact evidence index/u,
        );
        assert.equal(accessorReads, 0);

        let proxyTraps = 0;
        const proxyIndex = new Proxy({...index}, {
          get(target, key, receiver) {
            proxyTraps += 1;
            return Reflect.get(target, key, receiver);
          },
          ownKeys(target) {
            proxyTraps += 1;
            return Reflect.ownKeys(target);
          },
        });
        await assert.rejects(
          replayEvidenceIndex(proxyIndex, {
            expectedNames: ARTIFACT_NAMES,
            root: artifactRoot,
          }),
          /exact evidence index/u,
        );
        assert.equal(proxyTraps, 0);

        for (const invalidIndex of [
          Object.assign(Object.create({unexpected: true}), index),
          {...index, [Symbol('unexpected')]: true},
          Object.defineProperty({...index}, 'unexpected', {value: true}),
        ]) {
          await assert.rejects(
            replayEvidenceIndex(invalidIndex, {
              expectedNames: ARTIFACT_NAMES,
              root: artifactRoot,
            }),
            /exact evidence index/u,
          );
        }

        const arbitraryIndexPath =
          path.join(temporaryRoot, 'arbitrary-index.json');
        await writeFile(arbitraryIndexPath, indexBytes);
        await assert.rejects(
          replayEvidenceIndex({
            digest: index.digest,
            path: arbitraryIndexPath,
          }, {
            expectedNames: ARTIFACT_NAMES,
            root: artifactRoot,
          }),
          /not content-addressed/u,
        );

        await writeFile(index.path, Buffer.from('corrupt'));
        await assert.rejects(
          replayEvidenceIndex(index, {
            expectedNames: ARTIFACT_NAMES,
            root: artifactRoot,
          }),
          /rehash failed/u,
        );
      } finally {
        await rm(temporaryRoot, {force: true, recursive: true});
      }
    });

  it('replays an exact retained failure with its cleanup receipt',
    async () => {
      const temporaryRoot = await mkdtemp(
        path.join(tmpdir(), 'movielens-failure-evidence-replay-'),
      );
      const artifactRoot = path.join(temporaryRoot, 'sha256');
      try {
        const sourceBytes = Buffer.from('failure fixture source\n');
        const sources = [{
          byteLength: sourceBytes.length,
          digest: sha256(sourceBytes),
          path: 'failure-fixture.js',
        }];
        const sourceState = {
          gitHead: '1'.repeat(40),
          gitHeadTree: '2'.repeat(40),
          sourceSetDigest: sha256(
            Buffer.from(JSON.stringify(sources)),
          ),
          sources,
          worktreeStatus: '',
        };
        const teardown = liveFixture().teardown;
        const descriptors = [
          await writeJsonArtifact({
            name: 'teardown-receipt',
            root: artifactRoot,
            value: teardown,
          }),
          await writeContentArtifact({
            bytes: sourceBytes,
            mediaType: 'text/javascript',
            name: 'source:failure-fixture.js',
            root: artifactRoot,
          }),
          await writeJsonArtifact({
            name: 'source-state',
            root: artifactRoot,
            value: sourceState,
          }),
        ];
        const failureObservation = {
          failure: {
            causes: [{
              message: 'journal command intent digest mismatch',
              name: 'AssertionError',
              role: 'operation',
              stack:
                'AssertionError: journal command intent digest mismatch',
            }],
            message: 'journal command intent digest mismatch',
            name: 'AssertionError',
            stack:
              'AssertionError: journal command intent digest mismatch',
            stage: 'operation',
          },
          fidelity: FAILURE_FIDELITY,
          producer: FAILURE_PRODUCER,
          scenario: FAILURE_SCENARIO,
          sourceState,
          teardown,
          timestamp: '2026-07-27T13:37:19.265Z',
        };
        const observationArtifact = await writeJsonArtifact({
          name: FAILURE_OBSERVATION_NAME,
          root: artifactRoot,
          value: failureObservation,
        });
        descriptors.push(observationArtifact);
        const failureNames = [
          'teardown-receipt',
          'source:failure-fixture.js',
          'source-state',
          FAILURE_OBSERVATION_NAME,
        ];
        const indexDescriptor = await writeJsonArtifact({
          name: 'evidence-index',
          root: artifactRoot,
          value: {
            artifacts: descriptors,
            observationArtifact,
            sourceState,
          },
        });
        const index = {
          digest: indexDescriptor.digest,
          path: indexDescriptor.path,
        };
        const replay = await replayFailureEvidenceIndex(index, {
          expectedNames: failureNames,
          root: artifactRoot,
        });
        assert.equal(replay.passed, true);
        assert.deepEqual(
          JSON.parse(JSON.stringify(replay.teardown)),
          teardown,
        );
        assert.equal(
          replay.failure.message,
          'journal command intent digest mismatch',
        );

        const forgedObservationArtifact = await writeJsonArtifact({
          name: FAILURE_OBSERVATION_NAME,
          root: artifactRoot,
          value: {
            ...failureObservation,
            failure: {
              ...failureObservation.failure,
              stage: 'forged-stage',
            },
          },
        });
        const forgedDescriptors = descriptors.map((descriptor) =>
          descriptor.name === FAILURE_OBSERVATION_NAME ?
            forgedObservationArtifact :
            descriptor,
        );
        const forgedIndexDescriptor = await writeJsonArtifact({
          name: 'evidence-index',
          root: artifactRoot,
          value: {
            artifacts: forgedDescriptors,
            observationArtifact: forgedObservationArtifact,
            sourceState,
          },
        });
        await assert.rejects(
          replayFailureEvidenceIndex({
            digest: forgedIndexDescriptor.digest,
            path: forgedIndexDescriptor.path,
          }, {
            expectedNames: failureNames,
            root: artifactRoot,
          }),
          /retained identity binding failed/u,
        );

        const emptyIndexDescriptor = await writeJsonArtifact({
          name: 'evidence-index',
          root: artifactRoot,
          value: {
            artifacts: [],
            observationArtifact: null,
            sourceState: null,
          },
        });
        await assert.rejects(
          replayFailureEvidenceIndex({
            digest: emptyIndexDescriptor.digest,
            path: emptyIndexDescriptor.path,
          }, {
            expectedNames: failureNames,
            root: artifactRoot,
          }),
          /artifact names are invalid/u,
        );
      } finally {
        await rm(temporaryRoot, {force: true, recursive: true});
      }
    });
});
