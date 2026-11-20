// Component discriminator on the existing public embedded three-process
// runtime. A physical formation receipt is a separate proof.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {managedTimeout} from '../../src/test-helpers/managed-timers.js';
import {
  isReplicaOperationTerminalSuccess, normalizeReplicaOperationRecord,
} from '../../src/rebalancer/replica-operation-liveness.js';
import {
  createEmbeddedCluster, readUntil,
} from './helpers/embedded-cluster-harness.js';

const EVENT = 'held-add-authority-reply';
const PRELOAD = new URL('./helpers/held-add-authority-reply-preload.js', import.meta.url);
const NODE_COUNT = 3;
const SUITE_BOUND_MS = 600_000;
const OBSERVATION_BOUND_MS = 20_000;
const APPLICATION = 'formation-held-admission';
const ADD_TABLE = 'held_admission_add_target';
const SCHEMA_TABLE = 'held_admission_schema_control';
const READ_ADD = 'SELECT * FROM replica_operations WHERE operation_id = ?';
const RESUMED = new Set(['proposed', 'in_flight', 'already_member']);
const CONTROL = Object.freeze({NODES: 'nodes-write', SCHEMA: 'schema-write'});

function observeChildMessages(t, nodes) {
  const events = [];
  const waiters = new Set();
  const listeners = nodes.map((node) => {
    const capture = (message) => {
      if (message?.event !== EVENT) return;
      const event = {...message, childNodeId: node.nodeId};
      events.push(event);
      for (const waiter of waiters) waiter(event);
    };
    node.child.on('message', capture);
    return () => node.child.off('message', capture);
  });

  function waitFor(predicate, description) {
    const observed = events.find(predicate);
    if (observed) return Promise.resolve(observed);
    return new Promise((resolve, reject) => {
      const waiter = {timer: null};
      function onEvent(event) {
        if (!predicate(event)) return;
        clearTimeout(waiter.timer);
        waiters.delete(onEvent);
        resolve(event);
      }
      waiter.timer = managedTimeout(t, () => {
        waiters.delete(onEvent);
        reject(new Error(description));
      }, OBSERVATION_BOUND_MS);
      waiters.add(onEvent);
    });
  }

  return {events, waitFor, stop: () => listeners.forEach((stop) => stop())};
}

function send(node, kind, data = {}) {
  node.child.send({event: EVENT, kind, ...data});
}

function matchesHeldRoute(route, held) {
  return route.sourceNodeId === held.sourceNodeId && route.targetNodeId === held.targetNodeId;
}

function completesControl(event, kind, held) {
  return event.kind === kind && event.childNodeId === held.sourceNodeId &&
    event.originalWaiterPending && event.result.applied &&
    event.routes.some((route) => matchesHeldRoute(route, held) &&
      route.delivered && route.ownerSuccess);
}

function controlRefusal(events, held, kind) {
  const attempts = events.filter((event) =>
    event.kind === 'control-attempt' && event.control === kind);
  const reached = attempts.some((attempt) => matchesHeldRoute(attempt, held));
  const committedAfterWaiterRetired = events.some((event) =>
    event.kind === kind && !event.originalWaiterPending && event.result.applied &&
    event.routes.some((route) => matchesHeldRoute(route, held) && route.ownerSuccess));
  return {control: kind, reachedHeldPeer: reached, attempts,
    committedAfterWaiterRetired,
    outcome: reached ? 'same_peer_commit_not_observed_with_waiter_pending' :
      'same_peer_route_unengaged'};
}

function observeQuery(node, session, table) {
  return node.query(session, `CREATE TABLE ${table} (id TEXT PRIMARY KEY)`)
    .then((answer) => ({answer}), (error) => ({error: error.message}));
}

async function waitForSameAdmission(t, observer, released, held, requester, session) {
  const sameOperation = (event) => event.kind === 'admission' &&
    event.operationId === held.operationId && event.replicaIdentity === held.replicaIdentity;
  const releaseIndex = observer.events.indexOf(released);
  try {
    return await observer.waitFor((event) => sameOperation(event) &&
      RESUMED.has(event.result.outcome) && observer.events.indexOf(event) > releaseIndex,
    'same ADD admission did not re-engage after releasing its original authority reply');
  } catch (error) {
    const beforeRelease = observer.events.slice(0, releaseIndex).filter(sameOperation);
    const readback = await requester.query(session, READ_ADD, [held.operationId])
      .then((answer) => ({answer}), (failure) => ({error: failure.message}));
    t.comment(JSON.stringify({beforeRelease, readback}));
    throw error;
  }
}

async function waitForControls(observer, held) {
  const verdicts = await Promise.allSettled(Object.values(CONTROL).map((kind) =>
    observer.waitFor((event) => completesControl(event, kind, held), kind)));
  const failures = Object.values(CONTROL).filter((_, index) =>
    verdicts[index].status === 'rejected');
  if (failures.length > 0) {
    throw new Error(JSON.stringify(failures.map((kind) =>
      controlRefusal(observer.events, held, kind))));
  }
  return verdicts.map((verdict) => verdict.value);
}

test('one committed ADD read reply does not serialize other owner writes to its peer',
  {timeout: SUITE_BOUND_MS}, async (t) => {
    const cluster = createEmbeddedCluster(t);
    await cluster.formCluster(NODE_COUNT, {env: {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${PRELOAD.href}`,
    }});
    assert.equal(new Set(cluster.nodes.map((node) => node.child.pid)).size, NODE_COUNT);
    const observer = observeChildMessages(t, cluster.nodes);
    t.teardown(observer.stop);

    const scope = {addTable: ADD_TABLE, schemaTable: SCHEMA_TABLE,
      claimFile: join(cluster.rootDir, 'one-held-add-reply.json')};
    const sessions = new Map(await Promise.all(cluster.nodes.map(async (node) =>
      [node.nodeId, await node.openApplicationDatabase(APPLICATION)])));

    for (const node of cluster.nodes) send(node, 'arm', {scope});
    await Promise.all(cluster.nodes.map((node) => observer.waitFor(
      (event) => event.kind === 'armed' && event.childNodeId === node.nodeId,
      `fixture did not arm in ${node.nodeId}`)));

    const [starter] = cluster.nodes;
    const started = observeQuery(starter, sessions.get(starter.nodeId), ADD_TABLE);
    const held = await observer.waitFor((event) => event.kind === 'held',
      'engagement unavailable: no original remote authority reply for the new user-table ADD');
    const requester = cluster.nodes.find((node) => node.nodeId === held.sourceNodeId);
    assert.ok(requester, 'held reply names the actual embedded requester');

    const schema = observeQuery(requester, sessions.get(requester.nodeId), SCHEMA_TABLE);
    let releaseFailure = null;
    try {
      assert.notEqual(held.sourceNodeId, held.targetNodeId);
      assert.equal(held.ledgerWitness.servingNodeId, held.targetNodeId);
      const [renewal, schemaIntent] = await waitForControls(observer, held);
      assert.equal(renewal.result.incarnation, renewal.incarnation);
      assert.ok(Number(renewal.result.leaseExpiresAt) > Number(renewal.result.heartbeat),
        'the ordinary committed heartbeat advances a READY lease on the same peer');
      assert.equal(schemaIntent.jobId, schemaIntent.result.jobId);
      t.comment(JSON.stringify({held, renewal, schemaIntent}));
    } catch (error) {
      releaseFailure = error;
    } finally {
      send(requester, 'release', {messageId: held.id});
    }

    const released = await observer.waitFor(
      (event) => event.kind === 'released' && event.id === held.id,
      'the original response was not released to its actual pending-response owner');
    t.comment(JSON.stringify({released}));
    if (releaseFailure) throw releaseFailure;

    const session = sessions.get(requester.nodeId);
    const resumed = await waitForSameAdmission(t, observer, released, held, requester, session);
    const committed = await readUntil(t, requester, session, READ_ADD,
      [held.operationId], (rows) => rows.length === 1 &&
        rows[0].replica_id === held.replicaIdentity &&
        isReplicaOperationTerminalSuccess(normalizeReplicaOperationRecord(rows[0])));
    const applicationResults = (await Promise.all([started, schema]))
      .map((result) => result.error ?? result.answer.outcome);
    t.comment(JSON.stringify({resumed, committed: committed.rows, applicationResults}));
  });
