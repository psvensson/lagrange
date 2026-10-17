// The legacy MOVE_REPLICA handoff at POST /register-service is refused
// unconditionally (raft-rs full cutover, owner decision 2026-10-04): a
// joiner never moves a message-group replica any more, but the seed-side
// consumer stayed wire-reachable, and a pre-upgrade non-terminal
// MOVE_ASSIGNMENT reservation is force-renewed when its lease expired - an
// old-version joiner presenting that token could still complete a handoff of
// a seed message-group name onto itself (the identity-reuse defect).
//
// On a real BootstrapAPI over Fastify inject, with the reservation read
// answering an expired, non-terminal reservation that matches the request:
//   - a request carrying the MOVE assignment token is refused with the one
//     typed code; the reservation is not read, not renewed, no handoff
//     starts, no services row is written and no source replica is removed;
//   - a request naming a message-group replica the seed hosts, from another
//     node and without a token (the subsystem's own MOVE predicate), is
//     refused the same way;
//   - control: an ordinary registration on the same API still succeeds.

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  createCdcIntegrationServiceFixture,
  initializeTestEnvironment,
} from './move-replica-assignment-token-test-helpers.js';

const SEED_NODE_ID = 'seed-node-1';
const JOINER_NODE_ID = '550e8400-e29b-41d4-a716-446655440324';
const ASSIGNMENT_ID = 'pre-upgrade-assignment-1';
const MOVE_REFUSED =
  BOOTSTRAP_API_REGISTER_SERVICE_ERROR_CODE.MOVE_REPLICA_HANDOFF_UNSUPPORTED;
const HTTP_CONFLICT = 409;
const HTTP_OK = 200;

function emptyRows() {
  return {services: [], nodes: [], partitions: [], tables: [],
    message_groups: [], replica_operations: [], node_endpoints: []};
}

function messageGroupPayload(replicaId, extra = {}) {
  return {
    service_id: replicaId,
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    node_id: JOINER_NODE_ID,
    group_id: 'mg-1',
    replica_id: replicaId,
    status: SERVICE_STATUS.ACTIVE,
    address: `${JOINER_NODE_ID}/message-group/${replicaId}`,
    ...extra,
  };
}

// A seed API whose MOVE subsystem would complete a handoff if it were
// reached: every step is counted.
async function seedApi(t) {
  initializeTestEnvironment();
  const rows = emptyRows();
  const systemTableCache = {
    getAll: (tableName) => rows[tableName] || [],
    get: (tableName, id) =>
      (rows[tableName] || []).find((row) => row.service_id === id) || null,
    filter: (tableName, predicate) => (rows[tableName] || []).filter(predicate),
    getReadyNodes: () => [SEED_NODE_ID],
  };
  const api = new BootstrapAPI({
    seedNodeId: SEED_NODE_ID,
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache,
    // The seed hosts mg-1-r1 (a seed message-group name).
    messageGroupServices: new Map([['mg-1-r1', {replicaId: 'mg-1-r1'}]]),
    cdcIntegrationService: createCdcIntegrationServiceFixture(rows),
  });
  await api.initialize(0, {listen: false});
  const writes = [];
  api.setSqlQueryEngine({
    async executeQuery(sql) {
      if (/INSERT|UPDATE|DELETE/iu.test(sql)) {
        writes.push(sql);
      }
      return {success: true, rows: []};
    },
  });
  const steps = [];
  const count = (name, answer) => async (...args) => {
    steps.push(name);
    return answer(...args);
  };
  // The reservation owner answers a pre-upgrade reservation whose lease
  // expired: the validation force-renews it (the reachable hole).
  const assignmentOwner = api.moveReplicaAssignmentOwner;
  assignmentOwner.getMoveReplicaAssignmentReservationById = count(
    'reservation-read',
    async () => ({lookupUnavailable: false, reservation: {
      assignmentId: ASSIGNMENT_ID, replicaId: 'mg-1-r1', groupId: 'mg-1',
      targetNodeId: JOINER_NODE_ID, sourceNodeId: SEED_NODE_ID,
      status: 'creating', leaseExpiresAt: 1}}));
  assignmentOwner.renewMoveReplicaAssignmentReservation = count(
    'reservation-renew',
    async (reservation) => ({...reservation, leaseExpiresAt: Date.now() + 1e6}));
  api.moveReplicaHandoffOwner.startMoveReplicaHandoff = count(
    'handoff-start', async () => ({
      operationId: ASSIGNMENT_ID, replicaId: 'mg-1-r1',
      sourceNodeId: SEED_NODE_ID, targetNodeId: JOINER_NODE_ID}));
  api.executeMoveReplicaHandoffPhase = async (_c, phase, _w, _s, work) => {
    steps.push(`phase:${phase}`);
    return work();
  };
  api.verifyMoveReplicaHandoffTarget = count('verify-target', async () => {});
  api.waitForRegisteredServiceCacheVisibility = count('visibility',
    async () => {});
  api.removeLocalSourceReplicaForMoveReplica = count('remove-source',
    async () => {});
  api.completeMoveReplicaHandoff = count('handoff-complete', async () => {});
  api.failMoveReplicaHandoff = count('handoff-fail', async () => {});
  t.teardown(() => api.shutdown());
  return {api, rows, steps, writes};
}

function register(api, payload) {
  return api.getFastify().inject({
    method: 'POST', url: '/register-service', payload});
}

test('a register-service request carrying a MOVE assignment token is ' +
  'refused and nothing moves', async (t) => {
  const {api, rows, steps, writes} = await seedApi(t);
  const response = await register(api,
    messageGroupPayload('mg-1-r1', {assignment_id: ASSIGNMENT_ID}));
  t.equal(response.statusCode, HTTP_CONFLICT);
  t.equal(response.json().code, MOVE_REFUSED);
  t.same(steps, [], 'no reservation read or renewal, no handoff step');
  t.same(writes, [], 'no SQL write');
  t.same(rows.services, [], 'no services row');
});

test('a register-service request naming a seed-hosted message-group ' +
  'replica from another node, without a token, is refused', async (t) => {
  const {api, rows, steps, writes} = await seedApi(t);
  const response = await register(api, messageGroupPayload('mg-1-r1'));
  t.equal(response.statusCode, HTTP_CONFLICT);
  t.equal(response.json().code, MOVE_REFUSED);
  t.same(steps, []);
  t.same(writes, []);
  t.same(rows.services, []);
});

test('control: an ordinary registration on the same API still succeeds',
  async (t) => {
    const {api, steps} = await seedApi(t);
    const response = await register(api, {
      service_id: 'svc-ordinary-1',
      service_type: SERVICE_TYPE.PARTITION,
      node_id: JOINER_NODE_ID,
      partition_id: 'user_table-p1',
      status: SERVICE_STATUS.ACTIVE,
      address: `${JOINER_NODE_ID}/partition/svc-ordinary-1`,
    });
    t.equal(response.statusCode, HTTP_OK, JSON.stringify(response.json()));
    t.equal(response.json().success, true);
    t.same(steps, [], 'an ordinary registration touches no MOVE step');
  });
