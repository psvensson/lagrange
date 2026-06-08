import t from 'tap';
import {
  isControlPlanePublicationsWriteLeader,
  CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
} from '../../src/control-plane/control-plane-publications-leadership.js';

t.test('partition id resolves', async (t) => {
  t.equal(CONTROL_PLANE_PUBLICATIONS_PARTITION_ID, 'control_plane_publications-p1');
});

t.test('tier 1: partitions row leader_node_id', async (t) => {
  const cache = {
    get: (table, key) =>
      table === 'partitions' && key === CONTROL_PLANE_PUBLICATIONS_PARTITION_ID ?
        {leader_node_id: 'seed'} :
        null,
    find: () => null,
  };
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'seed'), true, 'leader');
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'rejoiner'), false, 'non-leader');
});

t.test('tier 2: live services raft_role witness (case-insensitive)', async (t) => {
  const cache = {
    get: () => null,
    find: (table, predicate) =>
      table === 'services' &&
      predicate({
        partition_id: CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        node_id: 'seed',
        raft_role: 'LEADER',
      }) ?
        {} :
        null,
  };
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'seed'), true);
  t.equal(isControlPlanePublicationsWriteLeader(cache, 'other'), false);
});

t.test('fail-safe: null cache / nodeId / throwing cache -> false', async (t) => {
  t.equal(isControlPlanePublicationsWriteLeader(null, 'seed'), false);
  t.equal(isControlPlanePublicationsWriteLeader({get: () => null, find: () => null}, null), false);
  t.equal(
    isControlPlanePublicationsWriteLeader(
      {get: () => {throw new Error('x');}, find: () => {throw new Error('y');}},
      'seed',
    ),
    false,
  );
});
