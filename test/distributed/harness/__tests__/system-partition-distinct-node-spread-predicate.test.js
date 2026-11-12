/**
 * The lab predicate "every system partition is on the declared number of
 * distinct nodes", evaluated against known-bad placements (the 2026-11-11
 * shape: 39 system partitions on the seed alone) and a satisfying one.
 */

import {test} from '../../../../src/test-helpers/tap.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../../../src/bootstrap/system-partition-classification.js';
import {SYSTEM_TABLE_NAME} from
  '../../../../src/bootstrap/system-table-schemas-constants.js';
import {SERVICE_STATUS, SERVICE_TYPE} from
  '../../../../src/constants/index.js';
import {RAFT_ROLE} from '../../../../src/raft/constants.js';
import {
  SYSTEM_PARTITION_DISTINCT_NODE_SPREAD_PREDICATE,
  SYSTEM_PARTITION_DISTINCT_NODE_SPREAD_REASON as REASON,
  evaluateSystemPartitionDistinctNodeSpread,
} from '../system-partition-distinct-node-spread-predicate.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const SEED = 'node-seed';
const NODES = Object.freeze([SEED, 'node-b', 'node-c']);
const REQUIRED = 3;
const SYSTEM_PARTITION_IDS = Object.freeze(arrayMap(
  Object.values(SYSTEM_TABLE_NAME), (tableName) => `${tableName}-p1`));
// The partitions that did spread on 2026-11-11: the six priority
// control-plane partitions and nodes-p1.
const SPREAD_ON_THE_DAY = new Set([
  ...arrayMap([...PRIORITY_CONTROL_PLANE_TABLE_IDS],
    (tableId) => `${tableId}-p1`),
  `${SYSTEM_TABLE_NAME.NODES}-p1`,
]);

function partitionRow(partitionId, replicaCount = REQUIRED) {
  return {
    partition_id: partitionId,
    table_id: stringReplace(partitionId, /-p\d+$/, ''),
    replica_count: replicaCount,
  };
}

function serviceRow(partitionId, nodeId, index, overrides = {}) {
  return {
    service_id: `${partitionId}-r${index}`,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
    status: SERVICE_STATUS.ACTIVE,
    ...overrides,
  };
}

// placementOf(partitionId) answers the node of each of the three replicas.
function buildAuthority(placementOf, options = {}) {
  const partitions = arrayMap(SYSTEM_PARTITION_IDS, (partitionId) =>
    partitionRow(partitionId));
  const services = arrayFlatMap(SYSTEM_PARTITION_IDS, (partitionId) =>
    arrayMap(placementOf(partitionId), (nodeId, index) =>
      serviceRow(partitionId, nodeId, index)));
  return {
    partitions: {rows: partitions, complete: true},
    services: {rows: services, complete: true},
    controlPlanePublications: {
      rows: [{
        publication_epoch: 4,
        status: 'PUBLISHED',
        published_active_node_ids: JSON.stringify(NODES),
      }],
      complete: true,
    },
    ...options,
  };
}

const allSpread = () => [...NODES];
const seedOnly = () => [SEED, SEED, SEED];
const asOnTheDay = (partitionId) =>
  SPREAD_ON_THE_DAY.has(partitionId) ? allSpread() : seedOnly();

function evaluate(authority, requiredDistinctNodeCount = REQUIRED) {
  return evaluateSystemPartitionDistinctNodeSpread({
    authority, requiredDistinctNodeCount,
  });
}

test('met: every system partition has voters on three distinct nodes',
  async (t) => {
    const result = evaluate(buildAuthority(allSpread));
    t.equal(result.name, SYSTEM_PARTITION_DISTINCT_NODE_SPREAD_PREDICATE);
    t.equal(result.met, true);
    t.same(result.reasonCodes, []);
    t.equal(result.detail.observedPartitionCount,
      SYSTEM_PARTITION_IDS.length, 'every system partition is inspected');
    t.same(result.detail.partitionCountByDistinctNodeCount,
      {[REQUIRED]: SYSTEM_PARTITION_IDS.length});
  });

test('known-bad: the 2026-11-11 placement (39 system partitions on the ' +
  'seed alone) is unmet and names each of them', async (t) => {
  const stuckCount = SYSTEM_PARTITION_IDS.length - SPREAD_ON_THE_DAY.size;
  t.equal(stuckCount, 39, 'the fixture is the measured shape: 39 of 46');
  const result = evaluate(buildAuthority(asOnTheDay));
  t.equal(result.met, false);
  t.equal(result.reasonCodes.length, stuckCount,
    'one reason per partition that never left the seed');
  t.ok(arrayEvery(result.reasonCodes, (reason) =>
    stringStartsWith(reason, `${REASON.PARTITION_NOT_SPREAD}:`) &&
    stringEndsWith(reason, ':1/3')),
  'each names one distinct node of three');
  t.same(result.detail.partitionCountByDistinctNodeCount,
    {1: stuckCount, 3: SPREAD_ON_THE_DAY.size});
  t.equal(result.detail.partitionCountByNodeId[SEED],
    SYSTEM_PARTITION_IDS.length, 'the seed holds every system partition');
  t.equal(result.detail.pendingPartitionIds.length, stuckCount);
});

test('known-bad: one system partition short of three distinct nodes fails ' +
  'the whole predicate', async (t) => {
  const stuck = `${SYSTEM_TABLE_NAME.TABLES}-p1`;
  const result = evaluate(buildAuthority((partitionId) =>
    partitionId === stuck ? [SEED, 'node-b', 'node-b'] : allSpread()));
  t.equal(result.met, false);
  t.same(result.reasonCodes,
    [`${REASON.PARTITION_NOT_SPREAD}:${stuck}:2/3`],
    'two replicas on one node count as one distinct node');
});

test('known-bad: a replica that is not a voter, or not active, is not a ' +
  'holder', async (t) => {
  const stuck = `${SYSTEM_TABLE_NAME.CONFIG}-p1`;
  for (const overrides of [
    {raft_role: RAFT_ROLE.LEARNER},
    {status: SERVICE_STATUS.INACTIVE},
  ]) {
    const authority = buildAuthority(allSpread);
    const third = arrayFind(authority.services.rows, (row) =>
      row.partition_id === stuck && row.node_id === 'node-c');
    Object.assign(third, overrides);
    const result = evaluate(authority);
    t.equal(result.met, false, JSON.stringify(overrides));
    t.same(result.reasonCodes,
      [`${REASON.PARTITION_NOT_SPREAD}:${stuck}:2/3`]);
  }
});

test('known-bad: a set converged against a policy below the declared ' +
  'spread is not spread', async (t) => {
  const authority = buildAuthority(seedOnly);
  for (const row of authority.partitions.rows) {
    row.replica_count = 1;
  }
  const result = evaluate(authority);
  t.equal(result.detail.evidenceState, 'known_converged',
    'the owner answers converged for a policy of one replica');
  t.equal(result.met, false, 'and the predicate still refuses it');
  t.equal(result.reasonCodes.length, SYSTEM_PARTITION_IDS.length);
  t.ok(arrayEvery(result.reasonCodes, (reason) =>
    stringStartsWith(reason, `${REASON.POLICY_BELOW_REQUIRED}:`) &&
    stringEndsWith(reason, ':1/3')));
});

test('known-bad: a system partition with no persisted policy row is ' +
  'unknown, never spread', async (t) => {
  const missing = `${SYSTEM_TABLE_NAME.SERVICES}-p1`;
  const authority = buildAuthority(allSpread);
  authority.partitions.rows = arrayFilter(authority.partitions.rows,
    (row) => row.partition_id !== missing);
  const result = evaluate(authority);
  t.equal(result.met, false);
  t.equal(result.reasonCodes.length, 1);
  t.ok(stringStartsWith(result.reasonCodes[0],
    `${REASON.PARTITION_EVIDENCE_UNKNOWN}:${missing}:`));
});

test('a later partition of a system table is held to the same decision',
  async (t) => {
    const split = `${SYSTEM_TABLE_NAME.NODES}-p2`;
    const authority = buildAuthority(allSpread);
    authority.partitions.rows.push(partitionRow(split));
    authority.services.rows.push(serviceRow(split, SEED, 0));
    const stuck = evaluate(authority);
    t.same(stuck.reasonCodes, [`${REASON.PARTITION_NOT_SPREAD}:${split}:1/3`]);
    authority.services.rows.push(
      serviceRow(split, 'node-b', 1), serviceRow(split, 'node-c', 2));
    const spread = evaluate(authority);
    t.equal(spread.met, true);
    t.equal(spread.detail.observedPartitionCount,
      SYSTEM_PARTITION_IDS.length + 1);
  });

test('integrity: a failed, absent or incomplete read is a named unmet ' +
  'reason, and the declared count has no default', async (t) => {
  const failed = evaluate(buildAuthority(allSpread,
    {services: {error: 'QUERY_TIMEOUT'}}));
  t.equal(failed.met, false);
  t.same(failed.reasonCodes, [`${REASON.READ_FAILED}:services:QUERY_TIMEOUT`]);

  const incomplete = evaluate(buildAuthority(allSpread,
    {partitions: {rows: [], complete: false}}));
  t.same(incomplete.reasonCodes,
    [`${REASON.OBSERVATION_INCOMPLETE}:partitions`]);

  const absent = evaluate(buildAuthority(allSpread,
    {controlPlanePublications: undefined}));
  t.same(absent.reasonCodes,
    [`${REASON.ROWS_ABSENT}:controlPlanePublications`]);

  const emptyServices = evaluate(buildAuthority(allSpread,
    {services: {rows: [], complete: true}}));
  t.equal(emptyServices.met, false, 'no holders is not spread');
  t.equal(emptyServices.reasonCodes.length, SYSTEM_PARTITION_IDS.length);

  for (const undeclared of [undefined, 0, 2.5, '3']) {
    t.same(evaluateSystemPartitionDistinctNodeSpread({
      authority: buildAuthority(allSpread),
      requiredDistinctNodeCount: undeclared,
    }).reasonCodes, [REASON.REQUIRED_COUNT_UNDECLARED],
    `declared count ${JSON.stringify(undeclared)} is refused`);
  }
});
