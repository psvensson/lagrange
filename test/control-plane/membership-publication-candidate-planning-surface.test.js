import {test} from '../../src/test-helpers/tap.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';

// The publication coordinator derives the membership CANDIDATE with the
// planner's recovery evidence: the AVAILABLE planning answer. The owner-read
// surface composes the durable publication row, which can say a publication
// is steady and satisfied while the planner still holds the priority
// partitions unspread. A candidate built on the owner read told readiness
// that priority recovery was inactive, and under degraded publication the
// source quorum lost its transport-backed recovery grace and its routability
// (managed-split-admission-reliability, run against the substrate branch).
// The read-policy owner names AUTHORITATIVE as the REMOVE-safety contract
// only; planning consumers read AVAILABLE, and this is one of them.

const NODE_ID = 'node-planning-surface';
const NOW_MS = 1_700_000_000_000;

function createCoordinator({availableAnswer, ownerReadAnswer, calls}) {
  return new MembershipPublicationCoordinator({
    nodeId: NODE_ID,
    controlPlanePublicationsOwner: {
      async listPublications() {
        return {rows: []};
      },
    },
    authoritativeControlPlaneView: {
      canRead() {
        return true;
      },
      async readRows() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: {
      async getAllNodeReadiness() {
        return [];
      },
      getRecoveryEpochHistoryByNodeId() {
        return {};
      },
      async getPriorityRecoveryPlanningSnapshotBestEffort() {
        calls.push('available');
        return availableAnswer;
      },
      async getPriorityRecoveryPlanningAnswerForOwnerRead() {
        calls.push('owner-read');
        return ownerReadAnswer;
      },
    },
    systemTableCache: {
      getAll() {
        return [];
      },
    },
    now: () => NOW_MS,
  });
}

test('the membership candidate carries the AVAILABLE planning answer, never the owner read',
  async (t) => {
    const calls = [];
    const availableAnswer = Object.freeze({
      admissionState: 'priority_spread_pending',
      priorityRecoveryActive: true,
    });
    const ownerReadAnswer = Object.freeze({
      admissionState: 'steady_published',
      priorityRecoveryActive: false,
    });
    const coordinator = createCoordinator({availableAnswer, ownerReadAnswer, calls});
    const snapshot = await coordinator.readPublicationPlanningSnapshot();
    t.equal(snapshot.priorityRecoveryPlanningSnapshot, availableAnswer,
      'the candidate holds the planner answer, by identity');
    t.same(calls, ['available'],
      'the AVAILABLE surface was read once and the owner read not at all');
    t.end();
  });

test('a nested derivation still derives no planning evidence', async (t) => {
  const calls = [];
  const coordinator = createCoordinator({
    availableAnswer: {priorityRecoveryActive: true},
    ownerReadAnswer: {priorityRecoveryActive: false},
    calls,
  });
  const snapshot = await coordinator.readPublicationPlanningSnapshot({
    deferNestedPriorityRecoveryPlanning: true,
  });
  t.equal(snapshot.priorityRecoveryPlanningSnapshot, null,
    'the recursion-breaking contract is untouched');
  t.same(calls, [], 'and reads neither surface');
  t.end();
});

test('synchronous planning selects both publication answers from one inventory', (t) => {
  const row = (id, epoch, status, kind = 'cluster_membership') => ({
    publication_id: id, publication_kind: kind, publication_epoch: epoch, status,
    published_active_node_ids: JSON.stringify([id]),
  });
  const pending = row('pending-first', '9', 'pending');
  const published = row('previous-first', 8, 'published');
  const mixed = [row('foreign', 30, 'published', 'other'), pending,
    row('pending-tie', 9, 'pending'), published, row('previous-tie', '8', 'published')];
  const supplied = {publicationId: 'supplied', status: 'PENDING'};
  const previous = {publicationId: 'prior', status: 'PUBLISHED'};
  const reference = createCoordinator({calls: []});
  reference.resolvePlanningPublicationRowsSync = (options) => {
    const latestPublicationRow = options.latestPublicationRow ||
        reference.getLatestPublicationRowSync(options);
    const latestPublishedPublicationRow = options.latestPublishedPublicationRow ||
      (latestPublicationRow?.status?.toUpperCase() === 'PUBLISHED' ? latestPublicationRow :
        reference.getLatestPublishedPublicationRowSync(options));
    return {latestPublicationRow, latestPublishedPublicationRow};
  };
  const coordinator = createCoordinator({calls: []});
  for (const [rows, inputs, scans, preloaded = false] of [
    [mixed, {}, 1], [[published], {}, 1],
    [[pending], {}, 1], [[], {}, 1], [mixed, {}, 1, true],
    [mixed, {latestPublicationRow: supplied}, 1],
    [mixed, {latestPublishedPublicationRow: previous}, 1],
    [mixed, {latestPublicationRow: previous}, 0],
    [mixed, {latestPublicationRow: supplied, latestPublishedPublicationRow: previous}, 0],
  ]) {
    let reads = 0;
    let normalizations = 0;
    const observed = rows.map((raw) => ({...raw,
      // The canonical normalizer reads publication_id exactly once on entry.
      get publication_id() {
        normalizations++; return raw.publication_id;
      },
    }));
    coordinator.systemTableCache.getAll = () => {
      reads++; return observed;
    };
    const options = {nodeRows: [], serviceRows: [], nodeEndpointRows: [], replicaOperationRows: [],
      partitionRows: [], readinessEntries: [], ...inputs};
    reference.systemTableCache.getAll = coordinator.systemTableCache.getAll;
    const request = preloaded ? {...options, publicationRows: observed} : options;
    const expected = reference.readPublicationPlanningSnapshotSync(request);
    const originalScans = scans + Number(!inputs.latestPublicationRow &&
        !inputs.latestPublishedPublicationRow &&
      expected.latestPublicationRow?.status !== 'PUBLISHED');
    t.equal(reads, preloaded ? 0 : originalScans, 'original inventory reads');
    t.equal(normalizations, originalScans * rows.length, 'original normalized row count');
    reads = 0;
    normalizations = 0;
    const actual = coordinator.readPublicationPlanningSnapshotSync(request);
    t.same(actual, expected, 'complete planning outcome matches independent selectors');
    t.equal(reads, preloaded ? 0 : scans, 'publication inventory reads');
    t.equal(normalizations, scans * rows.length, 'actual normalized row count');
  }
  // The tie rule, by its literal answer: among equal epochs the inventory's
  // first row is the latest, of any status (9) and PUBLISHED (8).
  coordinator.systemTableCache.getAll = () => mixed;
  const tied = coordinator.readPublicationPlanningSnapshotSync({nodeRows: [], serviceRows: [],
    nodeEndpointRows: [], replicaOperationRows: [], partitionRows: [], readinessEntries: []});
  t.equal(tied.latestPublicationRow.publicationId, 'pending-first', 'planning: latest');
  t.equal(tied.latestPublishedPublicationRow.publicationId, 'previous-first',
    'planning: latest PUBLISHED');
  t.equal(coordinator.getLatestPublicationRowSync({publicationRows: mixed}).publicationId,
    'pending-first', 'selector: latest');
  t.equal(coordinator.getLatestPublishedPublicationRowSync({publicationRows: mixed}).publicationId,
    'previous-first', 'selector: latest PUBLISHED');
  t.end();
});
