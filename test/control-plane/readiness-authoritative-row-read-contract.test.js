/**
 * One availability rule for authoritative control-plane row reads (fix-f6,
 * F-4 of the F4 round-1 verification).
 *
 * The readiness list readers claim the membership publication coordinator's
 * read-source contract (authoritative-preferred: an authoritative read that
 * is not an answer falls back to the row source, never to "no rows"). The
 * oracle is that coordinator itself: for every shape an authoritative row
 * read can take, the coordinator's readTableRows and the readiness
 * readNodeRows, reading the same authoritative result over the same cache,
 * must answer the same row set. The single-row owner read keeps its own
 * outcome (NodesOwner.getNode throws its typed unavailability, which the
 * readiness caller receives); that path is witnessed in
 * readiness-liveness-projection-single-source.test.js.
 */
import {test} from '../../src/test-helpers/tap.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {MembershipPublicationCoordinatorReads} from
  '../../src/control-plane/membership-publication-coordinator-reads.js';
import {
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  createActiveNode,
  createCache,
} from './control-plane-readiness-service-test-support.js';

ConfigurationManager.getInstance().initialize();

const CACHE_NODE_ID = 'node-cache-visible';
const AUTHORITATIVE_NODE_ID = 'node-authoritative-only';
const UNAVAILABLE_ERROR = 'authoritative_row_source_unavailable';

// Every shape an authoritative row read answers with: an explicit success
// with rows or none, an explicit failure, a result without an outcome (with
// or without rows), and no result at all.
const AUTHORITATIVE_RESULT_SHAPES = [
  ['explicit success with rows', () => ({
    success: true,
    rows: [createActiveNode(AUTHORITATIVE_NODE_ID)],
  })],
  ['explicit success without rows', () => ({success: true, rows: []})],
  ['explicit failure', () => ({success: false, error: UNAVAILABLE_ERROR})],
  ['rows without an outcome', () => ({
    rows: [createActiveNode(AUTHORITATIVE_NODE_ID)],
  })],
  ['an error without an outcome', () => ({error: UNAVAILABLE_ERROR})],
  ['no result', () => null],
];

function nodeIdsOf(rows) {
  return rows.map((row) => row[COLUMN.NODE_ID]).sort();
}

test('the readiness list reader and the membership publication coordinator ' +
  'answer every authoritative row-read shape alike', async (t) => {
  for (const [label, buildResult] of AUTHORITATIVE_RESULT_SHAPES) {
    const cache = createCache({nodes: [createActiveNode(CACHE_NODE_ID)]});
    const coordinator = new MembershipPublicationCoordinatorReads({
      nodeId: 'seed-node',
      systemTableCache: cache,
    });
    coordinator.authoritativeControlPlaneView = {
      canRead: () => true,
      readRows: async () => buildResult(),
    };
    const readiness = new ControlPlaneReadinessService({
      nodeId: 'seed-node',
      systemTableCache: cache,
      nodesOwner: {
        listNodes: async () => buildResult(),
        listNodesFromCache: async () =>
          ({success: true, rows: cache.getAll(TABLES.NODES)}),
      },
    });
    const coordinatorRows = await coordinator.readTableRows(TABLES.NODES, {
      readSource: MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
      // Availability only: the planning profile additionally merges the
      // cache's planning evidence into an authoritative answer, a separate
      // policy the readiness reader does not claim.
      readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.DIAGNOSTICS,
    });
    const readinessRows = await readiness.readNodeRows({
      allowAuthoritativeRefresh: true,
    });
    t.same(nodeIdsOf(readinessRows), nodeIdsOf(coordinatorRows),
      `${label}: both readers answer the same rows`);
    readiness.shutdown();
  }
});
