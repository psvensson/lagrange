import {test} from '../../src/test-helpers/tap.js';
import {
  MembershipPublicationCoordinatorReads,
} from '../../src/control-plane/membership-publication-coordinator-reads.js';

const MEMBERSHIP_PUBLICATION_KIND = 'cluster_membership';

// Drive the real class via the prototype with preloaded rows (no live cache).
function makeReads() {
  return Object.create(MembershipPublicationCoordinatorReads.prototype);
}

function pub(overrides) {
  return {
    publication_id: 'pub',
    publication_kind: MEMBERSHIP_PUBLICATION_KIND,
    publication_epoch: 1,
    status: 'PUBLISHED',
    published_active_node_ids: ['node-1', 'node-2', 'node-3'],
    required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
    acknowledged_node_ids: ['node-1'],
    updated_at: 1000,
    ...overrides,
  };
}

// The probe must return byte-identical (epoch, status) to the full read it
// replaces — any drift is an under-invalidation (stale-projection) hazard.
function fullProbe(reads, nodeId, rows) {
  const row = reads.getLatestPublicationForNodeSync(nodeId, {publicationRows: rows});
  return row ? {publicationEpoch: row.publicationEpoch, status: row.status} : null;
}

test('epoch/status probe ≡ full getLatestPublicationForNodeSync across cases', async (t) => {
  const reads = makeReads();
  const cases = {
    'highest-epoch membership winner includes node': [
      pub({publication_id: 'a', publication_epoch: 3, status: 'PUBLISHED'}),
      pub({publication_id: 'b', publication_epoch: 5, status: 'OPEN'}),
      pub({publication_id: 'c', publication_epoch: 2, status: 'PUBLISHED'}),
    ],
    'non-membership kinds are ignored': [
      pub({publication_id: 'a', publication_epoch: 9, publication_kind: 'other_kind'}),
      pub({publication_id: 'b', publication_epoch: 4, status: 'PUBLISHED'}),
    ],
    'highest-epoch winner excludes node -> null (even if lower epoch includes)': [
      pub({publication_id: 'a', publication_epoch: 2, published_active_node_ids: ['node-1'], required_ack_node_ids: ['node-1'], acknowledged_node_ids: ['node-1']}),
      pub({publication_id: 'b', publication_epoch: 6, published_active_node_ids: ['node-x'], required_ack_node_ids: ['node-x'], acknowledged_node_ids: ['node-x']}),
    ],
    'no membership rows -> null': [
      pub({publication_id: 'a', publication_epoch: 7, publication_kind: 'other_kind'}),
    ],
    'string epoch coerces the same way': [
      pub({publication_id: 'a', publication_epoch: '8', status: 'PUBLISHED'}),
      pub({publication_id: 'b', publication_epoch: 3}),
    ],
    'epoch tie -> first row wins (stable sort parity)': [
      pub({publication_id: 'a', publication_epoch: 5, status: 'PUBLISHED'}),
      pub({publication_id: 'b', publication_epoch: 5, status: 'OPEN'}),
    ],
    'missing epoch treated as 0': [
      pub({publication_id: 'a', publication_epoch: undefined, status: 'OPEN'}),
      pub({publication_id: 'b', publication_epoch: 1, status: 'PUBLISHED'}),
    ],
  };
  for (const [label, rows] of Object.entries(cases)) {
    const probe = reads.getLatestMembershipPublicationEpochStatusForNodeSync(
      'node-1', {publicationRows: rows});
    const full = fullProbe(reads, 'node-1', rows);
    t.same(probe, full, label);
  }
  t.end();
});

test('probe normalizes ONLY the winning row (loser JSON columns never parsed)', async (t) => {
  const reads = makeReads();
  // A losing (lower-epoch) row whose JSON column THROWS if accessed/parsed.
  const poisonLoser = pub({publication_id: 'loser', publication_epoch: 2});
  Object.defineProperty(poisonLoser, 'published_active_node_ids', {
    enumerable: true,
    get() {
      throw new Error('loser JSON column must not be parsed by the cheap probe');
    },
  });
  const winner = pub({publication_id: 'winner', publication_epoch: 9, status: 'PUBLISHED'});
  const rows = [poisonLoser, winner];

  // The cheap probe selects the winner by scalar reads and normalizes only it —
  // so the poisoned loser column is never touched and nothing throws.
  let result;
  t.doesNotThrow(() => {
    result = reads.getLatestMembershipPublicationEpochStatusForNodeSync(
      'node-1', {publicationRows: rows});
  }, 'probe does not parse the losing row');
  t.same(
    result,
    {publicationEpoch: 9, status: 'PUBLISHED'},
    'probe returns the winning row epoch/status',
  );

  // Red-on-revert guard: the full read (which the probe replaces) DOES normalize
  // every row, so it throws on the poisoned loser — proving the probe's N→1
  // normalize is the real behavioral difference.
  t.throws(
    () => reads.getLatestPublicationForNodeSync('node-1', {publicationRows: rows}),
    /must not be parsed/,
    'the full read normalizes all rows (the optimized-away cost)',
  );
  t.end();
});
