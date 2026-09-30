/**
 * I3 - the public application -> Binding invocation seam, end to end.
 *
 * One embedded Lagrange runtime starts in this process; the application
 * owns its schema through the public application-database facade, and the
 * "application" (test/integration/helpers/public-binding-consumer.js)
 * reaches Binding invocation with nothing but the `pg` client, a host:port
 * and password-mode credentials: INSTALL SERVICE -> CREATE BINDING ->
 * CONFIGURE SERVICE ACCESS -> CALL BINDING over the node's own
 * authenticated PostgreSQL-wire listener. No new API is involved.
 *
 * What is proved, each against an oracle that does not come from the call
 * path under test:
 *  - immutable Artifact identity: re-INSTALL of the same layout replays the
 *    same identity; a modified manifest has a different digest and package
 *    id, and a Binding cannot pin the old package to the new digest;
 *  - Binding is the durable execution-intent owner: byte-identical replay
 *    is accepted, any change under the same name is refused;
 *  - canonical routing selects placement: a Binding whose declared
 *    statement carries a literal key predicate runs exactly the owning
 *    partition's rows (oracle: the inserted rows filtered by the literal
 *    predicate), the durable coordination table records one shard slot,
 *    and the canonical planner (harness evidence) plans one shard; the
 *    unbounded Binding over the same table fans out to both partitions;
 *  - no topology from the consumer: the CALL payload contract rejects
 *    node / partition / replica keys; the consumer module imports only
 *    `pg`; the proof never touches a legacy callback axis.
 *
 * Harness-only steps (never consumer code) are labelled in
 * helpers/public-binding-seam-harness.js: PG-wire enablement (no product
 * surface starts the listener) and one managed split for shaping.
 */

import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {monitorEventLoopDelay} from 'node:perf_hooks';

import {test} from '../../src/test-helpers/tap.js';
import {
  managedSleep,
  reportOpenHandlesOnTeardown,
} from '../../src/test-helpers/managed-timers.js';
import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
import {refuseUnderProbe} from '../../src/test-helpers/probe-guard.js';
import {
  LIFECYCLE_ERROR_ALLOWED_KEYS,
  findTopologyLeaks,
} from '../../src/test-helpers/topology-leak-check.js';
import {
  CONSUMER_RETRY_OUTCOME,
  LIFECYCLE_SQL,
  callBinding,
  callBindingWhileRetrySafe,
  isPublicRetrySafe,
  observeFailure,
  openConsumerSession,
  runLifecycle,
} from './helpers/public-binding-consumer.js';
import {
  acceptsConnections,
  buildCallArtifact,
  enablePasswordPgwire,
  planShardPartitions,
  newReducedShardCounts,
  readReducedShardCounts,
  splitTableOnce,
  startSeamRuntime,
  stopPlacedPgwireReplicas,
  useSingleNodeReplicaShape,
} from './helpers/public-binding-seam-harness.js';
import {scaleByMachineFactor} from './helpers/test-machine-factor.js';

const SEAM_TEST_TIMEOUT_MS = 360_000;
const SEAM_WAIT_MS = scaleByMachineFactor(60_000);
const CELL_READY_WAIT_MS = scaleByMachineFactor(120_000);
const SEAM_POLL_MS = 100;
const LOOP_DELAY_RESOLUTION_MS = 20;
const LOOP_DELAY_PERCENTILE = 99;
const NANOS_PER_MS = 1e6;
const CONSUMER_RETRY_PAUSE_MS = 250;
const PGWIRE_LOOPBACK = '127.0.0.1';
const seamPorts = createPortAllocator(import.meta.url);
const PROBE_GUARD_SUBJECT =
  'public-binding-invocation-seam starts an embedded runtime';
const TEMPORARY_PREFIX = 'lagrange-public-binding-seam-';
const APPLICATION_ID = 'lagrange-images-seam';
const NODE_ID = 'public-binding-seam-node';
const CREDENTIALS = Object.freeze({
  database: 'images_seam',
  password: 'images-seam-password',
  user: 'images_seam_app',
});
const WRONG_PASSWORD = 'not-the-images-seam-password';
const SERVICE_IDENTITY = Object.freeze({
  name: 'images-seam-ratings',
  ref: 'registry.example.test/images-seam/ratings:1.0.0',
  version: '1.0.0',
});
const MODIFIED_VERSION = '1.0.1';
const INSTALL_IDEMPOTENCY_KEY = 'install-images-seam-ratings-v1';
const MODIFIED_INSTALL_IDEMPOTENCY_KEY = 'install-images-seam-ratings-v1-0-1';
const LOCAL_OCI_LAYOUT_SOURCE = 'local_oci_layout';
const OPERATION_STATUS = Object.freeze({
  DURABLE: 'durable',
  REPLAYED: 'replayed',
});
const TABLE = 'seam_ratings';
const TABLE_DDL =
  `CREATE TABLE ${TABLE} (id INTEGER PRIMARY KEY, score REAL, label TEXT)`;
// The application facade binds integers, strings, booleans, null and bytes
// only (src/query/application-database-input.js rejects non-integer
// numbers), so the REAL score the guest requires travels as a literal.
const rowInsert = (score) =>
  `INSERT INTO ${TABLE} (id, score, label) VALUES (?, ${score}, ?)`;
const LOW_RANGE = Object.freeze({FIRST: 1, LAST: 10});
const HIGH_RANGE = Object.freeze({FIRST: 1001, LAST: 1010});
const SCORE_FRACTION = 0.25;
const SCORE_SCALE = 100;
const OWNED_RANGE_STATEMENT =
  `SELECT id, score, label FROM ${TABLE} ` +
  `WHERE id >= ${LOW_RANGE.FIRST} AND id <= ${LOW_RANGE.LAST}`;
const UNBOUNDED_STATEMENT = `SELECT id, score, label FROM ${TABLE}`;
const BINDING_NAME = Object.freeze({
  OWNED_RANGE: 'images-seam-owned-range',
  UNBOUNDED: 'images-seam-all-ratings',
  UNKNOWN: 'images-seam-no-such-binding',
});
const PUBLIC_OUTCOME = Object.freeze({
  DEFINITELY_NOT_EXECUTED: 'definitely_not_executed',
});
const OWNER_CODE = Object.freeze({
  ROUTE_NOT_FOUND: 'call_cell_route_not_found',
});
const BINDING_SCHEMA_VERSION = 2;
const ACCESS_POLICY_SCHEMA_VERSION = 2;
const CALL_SOURCE_KIND = 'call';
const READ_OPERATION = 'read';
const TABLE_IDENTITY = `table:global.${TABLE}`;
const BINDING_BUDGETS = Object.freeze({
  context_bytes: 4096,
  cpu_time_ms: 10_000,
  input_bytes: 1_048_576,
  memory_bytes: 256 * 1024 * 1024,
  output_bytes: 1_048_576,
  wall_time_ms: 30_000,
});
const TOP_N_ALL = 100;
const TOPOLOGY_KEYS = Object.freeze(['node', 'partition', 'replica']);
const TOPOLOGY_PROBE_VALUE = 'public-binding-seam-node';
const CONSUMER_HELPER_URL =
  new URL('./helpers/public-binding-consumer.js', import.meta.url);
const HARNESS_HELPER_URL =
  new URL('./helpers/public-binding-seam-harness.js', import.meta.url);
const IMPORT_SPECIFIER_PATTERN =
  /^\s*import\b[^'";]*?from\s*['"]([^'"]+)['"]/gmu;
const SIDE_EFFECT_IMPORT_PATTERN = /^\s*import\s*['"]([^'"]+)['"]/gmu;
// Module-loading forms the static census cannot see through; the consumer
// must use none of them.
const DYNAMIC_LOADING_PATTERNS = Object.freeze([
  /\bimport\s*\(/u,
  /\bcreateRequire\b/u,
  /\brequire\s*\(/u,
  /\bimport\.meta\.resolve\b/u,
]);
const CONSUMER_ALLOWED_IMPORTS = Object.freeze(['pg']);
// Forbidden legacy axes, assembled so the tokens never occur literally in
// the scanned sources (this file included).
const LEGACY_AXIS_TOKENS = Object.freeze([
  ['partition', 'callback'].join('_'),
  ['DB', 'call'].join('.'),
  ['Wasm', 'Call', 'Adapter'].join(''),
  ['debug', 'runtime'].join('-'),
]);

function seamRows() {
  const rows = [];
  for (const range of [LOW_RANGE, HIGH_RANGE]) {
    for (let id = range.FIRST; id <= range.LAST; id += 1) {
      rows.push(Object.freeze({
        id,
        label: null,
        score: (id % SCORE_SCALE) + SCORE_FRACTION,
      }));
    }
  }
  return Object.freeze(rows);
}

// The guest's reduce output for topN >= row count: every emitted key with
// its score, highest score first. Derived from the inserted rows and the
// literal predicate only.
function expectedReduction(rows, predicate) {
  return rows
    .filter(predicate)
    .map((row) => ({key: String(row.id), score: row.score}))
    .sort((left, right) => right.score - left.score);
}

function partitionBound(partition, field) {
  const value = partition[field];
  return value === null || value === undefined ? null : Number(value);
}

// Oracle for key-anchored placement from the partition ranges alone
// ([start, end) with null as unbounded): which partitions can hold a key
// in the literal range.
function partitionsIntersecting(partitions, range) {
  return partitions.filter((partition) => {
    const start = partitionBound(partition, 'partition_key_start');
    const end = partitionBound(partition, 'partition_key_end');
    const startsBeforeLast = start === null || start <= range.LAST;
    const endsAfterFirst = end === null || end > range.FIRST;
    return startsBeforeLast && endsAfterFirst;
  }).map((partition) => partition.partition_id || partition.partitionId);
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(IMPORT_SPECIFIER_PATTERN),
    ...source.matchAll(SIDE_EFFECT_IMPORT_PATTERN),
  ].map((match) => match[1]);
}

function callBindingPayload(name, statement, artifact) {
  return {
    budgets: {...BINDING_BUDGETS},
    name,
    schema_version: BINDING_SCHEMA_VERSION,
    source: {kind: CALL_SOURCE_KIND, name, statement},
    target: {
      export_name: artifact.callExport,
      manifest_digest: artifact.manifestDigest,
      package_id: artifact.packageId,
    },
  };
}

function accessPolicy(bindingName) {
  return {
    binding_name: bindingName,
    calls: [],
    schema_version: ACCESS_POLICY_SCHEMA_VERSION,
    tables: [{operations: [READ_OPERATION], slot: 0, table: TABLE_IDENTITY}],
  };
}

function installPayload(artifact, manifest, idempotencyKey) {
  return {
    artifact_source: {
      kind: LOCAL_OCI_LAYOUT_SOURCE,
      location: artifact.layoutPath,
    },
    config: {},
    idempotency_key: idempotencyKey,
    manifest,
  };
}

// Owner errors can be frozen (ApplicationDatabaseError); tap cannot annotate
// a frozen rejection, so surface its typed fields on a plain Error instead.
async function readable(operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(
      `${error?.code}: ${error?.message} (${error?.cause?.message})`);
  }
}

test('public Binding invocation through the authenticated PostgreSQL-wire ' +
  'seam: Artifact, Binding, key-anchored call, no topology in consumer input',
{timeout: SEAM_TEST_TIMEOUT_MS}, async (t) => {
  refuseUnderProbe(PROBE_GUARD_SUBJECT);
  reportOpenHandlesOnTeardown(t);
  const clock = {startedAt: Date.now(), marks: {}};
  const mark = (label) => {
    clock.marks[label] = Date.now() - clock.startedAt;
  };
  const root = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
  t.teardown(() => rm(root, {force: true, recursive: true}));
  const wait = () => ({
    deadlineMs: Date.now() + SEAM_WAIT_MS,
    pause: () => managedSleep(t, SEAM_POLL_MS),
  });

  // Deploy-time tooling (the CLI's build step) runs before the runtime
  // starts: componentize is CPU-bound on this thread and must not overlap
  // startup or the listener placement (see the progress/finding notes).
  const artifact = {...await buildCallArtifact(root, SERVICE_IDENTITY)};
  mark('artifactBuilt');
  // Event-loop delay across runtime start: startup runs on this thread,
  // so a starved loop (not a slow host) would show here.
  const startLoopDelay = monitorEventLoopDelay({resolution: LOOP_DELAY_RESOLUTION_MS});
  startLoopDelay.enable();
  // REST, admin and transport derive from one base (the listener-port
  // model), so the allocator reserves the runtime's whole listener block.
  const {restApiPort: restPort} = seamPorts.getListenerPorts();
  const pgwirePort = seamPorts.getPort();
  const runtime = await startSeamRuntime({
    credentials: CREDENTIALS,
    dataDir: path.join(root, 'node-data'),
    nodeId: NODE_ID,
    restPort,
  });
  // Harness: the application facade reads system tables and performs the
  // operator PG-wire enablement; the consumer only gets host:port.
  const db = runtime.handle.openApplicationDatabase({
    applicationId: APPLICATION_ID,
  });
  let endpoint = null;
  t.teardown(async () => {
    const stopStartedAt = Date.now();
    const stoppedReplicas = endpoint ?
      await stopPlacedPgwireReplicas(runtime, db) : [];
    await runtime.handle.stop();
    runtime.restoreEnvironment();
    t.comment(`teardown: harness-stopped pgwire replicas=${
      JSON.stringify(stoppedReplicas)}; stop ms=${
      Date.now() - stopStartedAt}; rest accepting after stop=${
      await acceptsConnections(PGWIRE_LOOPBACK, restPort)}; pgwire ` +
      `accepting after stop=${
        await acceptsConnections(PGWIRE_LOOPBACK, pgwirePort)}`);
  });
  startLoopDelay.disable();
  mark('runtimeStarted');
  t.comment(`runtime start event-loop delay ms: max=${
    Math.round(startLoopDelay.max / NANOS_PER_MS)} p99=${
    Math.round(startLoopDelay.percentile(LOOP_DELAY_PERCENTILE) / NANOS_PER_MS)}`);
  endpoint = await enablePasswordPgwire(
    db, pgwirePort, {...wait(), restPort});
  mark('pgwireListening');

  // The application owns its schema through the public facade.
  useSingleNodeReplicaShape(runtime.engine);
  const rows = seamRows();
  await readable(async () => {
    await db.query(TABLE_DDL, []);
    mark('tableCreated');
    for (const row of rows) {
      await db.query(rowInsert(row.score), [row.id, row.label]);
    }
  });
  mark('rowsInserted');
  const partitions = await readable(
    () => splitTableOnce(runtime.engine, TABLE, wait()));
  mark('tableSplit');
  const ownedPartitions = partitionsIntersecting(partitions, LOW_RANGE);
  t.equal(ownedPartitions.length, 1,
    'harness: the literal key range lies inside exactly one partition');


  await t.test('password mode: wrong credentials are refused', async (st) => {
    const refused = await observeFailure(openConsumerSession({
      ...endpoint, ...CREDENTIALS, password: WRONG_PASSWORD,
    }));
    st.ok(refused, 'the listener refuses a wrong password before any SQL');
    st.comment(`pg receives on bad password: ${JSON.stringify(refused)}`);
  });

  const client = await openConsumerSession({...endpoint, ...CREDENTIALS});
  t.teardown(() => client.end());
  // Readiness, consumer style: re-issue the CALL while the public contract
  // says the failure is retry-safe (a new Binding's Cell is activating).
  const callWhenReady = (name) => callBindingWhileRetrySafe(client, {
    callArguments: {topN: TOP_N_ALL},
    name,
  }, {
    deadlineMs: Date.now() + CELL_READY_WAIT_MS,
    isRetrySafe: isPublicRetrySafe,
    pause: () => managedSleep(t, CONSUMER_RETRY_PAUSE_MS),
  });

  await t.test('Artifact identity is immutable', async (st) => {
    const install = installPayload(
      artifact, artifact.manifest, INSTALL_IDEMPOTENCY_KEY);
    const [installed] = await runLifecycle(
      client, LIFECYCLE_SQL.INSTALL_SERVICE, install);
    st.equal(installed.operation_status, OPERATION_STATUS.DURABLE);
    st.match(installed.package_id, /\S/u, 'INSTALL returns a package id');
    artifact.packageId = installed.package_id;
    mark('installed');

    const [replayed] = await runLifecycle(
      client, LIFECYCLE_SQL.INSTALL_SERVICE, install);
    st.equal(replayed.operation_status, OPERATION_STATUS.REPLAYED,
      'the identical INSTALL is an idempotent replay');
    st.equal(replayed.package_id, installed.package_id);
    st.equal(replayed.revision_id, installed.revision_id);

    const modified = artifact.withVersion(MODIFIED_VERSION);
    st.not(modified.manifestDigest, artifact.manifestDigest,
      'a modified manifest has a different canonical digest');
    const [modifiedInstall] = await runLifecycle(
      client,
      LIFECYCLE_SQL.INSTALL_SERVICE,
      installPayload(
        artifact, modified.manifest, MODIFIED_INSTALL_IDEMPOTENCY_KEY),
    );
    st.not(modifiedInstall.package_id, installed.package_id,
      'a modified manifest is a different immutable package');

    const crossPinned = await observeFailure(runLifecycle(
      client,
      LIFECYCLE_SQL.CREATE_BINDING,
      callBindingPayload(BINDING_NAME.OWNED_RANGE, OWNED_RANGE_STATEMENT, {
        ...artifact, manifestDigest: modified.manifestDigest,
      }),
    ));
    st.ok(crossPinned,
      'a Binding cannot pin the original package to the modified digest');
    st.comment(`pg receives on cross-pinned Binding: ${
      JSON.stringify(crossPinned)}`);
  });

  await t.test('Binding is the durable, create-only execution intent',
    async (st) => {
      for (const [name, statement] of [
        [BINDING_NAME.OWNED_RANGE, OWNED_RANGE_STATEMENT],
        [BINDING_NAME.UNBOUNDED, UNBOUNDED_STATEMENT],
      ]) {
        const payload = callBindingPayload(name, statement, artifact);
        const [created] = await runLifecycle(
          client, LIFECYCLE_SQL.CREATE_BINDING, payload);
        st.equal(created.operation_status, OPERATION_STATUS.DURABLE);
        st.equal(created.manifest_digest, artifact.manifestDigest);
        st.equal(created.package_id, artifact.packageId);
        const [replayed] = await runLifecycle(
          client, LIFECYCLE_SQL.CREATE_BINDING, payload);
        st.equal(replayed.operation_status, OPERATION_STATUS.REPLAYED,
          `${name}: byte-identical replay is accepted`);
        st.equal(replayed.binding_version_id, created.binding_version_id);
        await runLifecycle(
          client, LIFECYCLE_SQL.CONFIGURE_ACCESS, accessPolicy(name));
      }
      const changed = await observeFailure(runLifecycle(
        client,
        LIFECYCLE_SQL.CREATE_BINDING,
        callBindingPayload(
          BINDING_NAME.OWNED_RANGE, UNBOUNDED_STATEMENT, artifact),
      ));
      st.ok(changed, 'a changed declaration under the same name is refused');
      st.comment(`pg receives on changed Binding: ${JSON.stringify(changed)}`);
    });
  mark('deployed');

  await t.test('key-anchored call runs only the owning partition',
    async (st) => {
      mark('callStart');
      const served = await callWhenReady(BINDING_NAME.OWNED_RANGE);
      mark('firstCallServed');
      st.equal(served.outcome, CONSUMER_RETRY_OUTCOME.SERVED,
        JSON.stringify(served.lastFailure));
      st.comment(`consumer attempts until served: ${served.attempts}; ` +
        `retried (all retry-safe on the wire): ${
          JSON.stringify(served.retriedDetails)}`);
      const expected = expectedReduction(rows,
        (row) => row.id >= LOW_RANGE.FIRST && row.id <= LOW_RANGE.LAST);
      st.same(served.result, expected,
        'the reduced result is exactly the literal key range\'s rows');
      // Placement evidence from one call on a ready Cell. The row set above
      // is the independent oracle; this witness is NOT independent of the
      // invoker: the reduce coordinator publishes the slots the invoker
      // itself seeded, so it confirms the invoker's own plan (as the
      // planner check below does), not placement from outside.
      const before = await readReducedShardCounts(db);
      st.same(await callBinding(
        client, BINDING_NAME.OWNED_RANGE, {topN: TOP_N_ALL}), expected);
      const witnessed = await newReducedShardCounts(db, before, wait());
      st.comment(`witnessed shard slots of the new result: ${witnessed}`);
      st.same(witnessed, [ownedPartitions.length],
        'the published result snapshot witnesses exactly one shard');
      st.same(planShardPartitions(runtime.engine, OWNED_RANGE_STATEMENT),
        ownedPartitions,
        'harness evidence: the canonical planner plans the owning shard only');
    });

  await t.test('the unbounded Binding fans out to every partition',
    async (st) => {
      const served = await callWhenReady(BINDING_NAME.UNBOUNDED);
      st.equal(served.outcome, CONSUMER_RETRY_OUTCOME.SERVED,
        JSON.stringify(served.lastFailure));
      const expected = expectedReduction(rows, () => true);
      st.same(served.result, expected);
      const before = await readReducedShardCounts(db);
      st.same(await callBinding(
        client, BINDING_NAME.UNBOUNDED, {topN: TOP_N_ALL}), expected);
      st.same(await newReducedShardCounts(db, before, wait()),
        [partitions.length],
        'the published result snapshot witnesses every shard');
      st.equal(
        planShardPartitions(runtime.engine, UNBOUNDED_STATEMENT).length,
        partitions.length);
    });
  mark('callsServed');

  // What a pg client receives for pre-dispatch failures over the live seam.
  // The expected public values are the documented wire contract
  // (docs/execution-semantics.md "Public outcome classes"), written here as
  // the consumer would read them, not imported from the owner.
  const topology = [
    NODE_ID,
    ...partitions.map((partition) =>
      partition.partition_id || partition.partitionId),
  ];
  await t.test('pre-dispatch failures are public, typed and topology-free',
    async (st) => {
      const unknown = await observeFailure(callBinding(
        client, BINDING_NAME.UNKNOWN, {topN: TOP_N_ALL}));
      st.comment(`pg receives for an unknown Binding: ${
        JSON.stringify(unknown)}`);
      st.same(JSON.parse(unknown.detail), {
        ...JSON.parse(unknown.detail),
        outcomeClass: PUBLIC_OUTCOME.DEFINITELY_NOT_EXECUTED,
        ownerCode: OWNER_CODE.ROUTE_NOT_FOUND,
        retrySafe: false,
      });
      st.same(findTopologyLeaks(
        {failure: unknown, parsedDetail: JSON.parse(unknown.detail)}, {
          allowedKeys: LIFECYCLE_ERROR_ALLOWED_KEYS,
          forbiddenValues: topology,
        }), []);
    });

  await t.test('the consumer cannot name an execution target (F2/F5)',
    async (st) => {
      for (const key of TOPOLOGY_KEYS) {
        const refused = await observeFailure(runLifecycle(
          client, LIFECYCLE_SQL.CALL_BINDING, {
            arguments: {topN: TOP_N_ALL},
            name: BINDING_NAME.OWNED_RANGE,
            [key]: TOPOLOGY_PROBE_VALUE,
            schema_version: BINDING_SCHEMA_VERSION,
          }));
        st.ok(refused, `a CALL payload carrying '${key}' is rejected`);
        st.notOk(isPublicRetrySafe(refused),
          'a payload-contract refusal is never retry-safe');
        st.comment(`pg receives for '${key}': ${JSON.stringify(refused)}`);
      }
    });

  await t.test('consumer import census and no legacy axis (F5/F6)',
    async (st) => {
      const consumerSource = await readFile(CONSUMER_HELPER_URL, 'utf8');
      st.same(importSpecifiers(consumerSource), CONSUMER_ALLOWED_IMPORTS,
        'the consumer imports only pg');
      for (const pattern of DYNAMIC_LOADING_PATTERNS) {
        st.notOk(pattern.test(consumerSource),
          `the consumer loads no module through ${pattern}`);
      }
      const scanned = [
        consumerSource,
        await readFile(HARNESS_HELPER_URL, 'utf8'),
        await readFile(new URL(import.meta.url), 'utf8'),
      ].join('\n');
      for (const token of LEGACY_AXIS_TOKENS) {
        st.notOk(scanned.includes(token), `no reference to ${token}`);
      }
    });

  t.comment(`seam wall-clock ms: ${JSON.stringify(clock.marks)}`);
});
