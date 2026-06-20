import {test} from '../../src/test-helpers/tap.js';
import {MembershipPublicationCoordinatorReconcile} from
  '../../src/control-plane/membership-publication-coordinator-reconcile.js';
import {hydrateCdcPropagatedTablesFromAuthority} from
  '../../src/cdc/cdc-integration-service-authoritative-catchup.js';
import {executeAuthoritativeOwnerRpcRead} from
  '../../src/cdc/cdc-integration-service-owner-rpc-read-execution.js';
import {AUTHORITATIVE_READ_SOURCE} from
  '../../src/cdc/cdc-integration-service-shared-constants.js';
import {TABLES} from '../../src/constants/index.js';

// The variant-D publications catch-up exists to escape a frozen follower's own
// stale local control_plane_publications replica. preferOwnerRpcRead alone routes
// to "an owner" with preferLeader=false, so the read can be self-served from the
// stale local replica and the node stays frozen at its stale epoch forever
// (observed: a node PINNED 4 epochs behind for the whole post-restart window).
// The fix pins the catch-up read to the partition LEADER. These falsifiers prove
// the leader-pin flag threads from the catch-up to executeOnPartition's
// preferLeader argument — the seam the prior deferred-catchup test stubbed past.

const PUBLICATIONS = TABLES.CONTROL_PLANE_PUBLICATIONS;

// Part A — the catch-up requests a leader-pinned owner-RPC read and the CL-014
// hydrate forwards the flag to the authoritative read options.
test('deferred publications catch-up requests a LEADER-pinned owner-RPC read',
  async (t) => {
    const seenReadOptions = [];
    const service = {
      logger: {warn() {}, info() {}, debug() {}, error() {}},
      async executeAuthoritativeSystemTableRead(_table, _sql, _params, options) {
        seenReadOptions.push(options);
        return {
          success: true,
          source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
          rows: [],
        };
      },
    };
    service.hydrateCdcPropagatedTablesFromAuthority = (opts) =>
      hydrateCdcPropagatedTablesFromAuthority(service, opts);

    const coordinator = Object.create(
      MembershipPublicationCoordinatorReconcile.prototype,
    );
    coordinator.nodeId = 'N1';
    coordinator.logger = service.logger;
    coordinator.now = () => 1000;
    coordinator.cdcIntegrationService = service;
    coordinator._lastDeferredPublicationsCatchupAtMs = null;

    await coordinator.refreshDeferredPublicationsCacheFromAuthority();

    t.equal(seenReadOptions.length, 1, 'the catch-up issues one authoritative read');
    t.equal(
      seenReadOptions[0]?.preferOwnerRpcRead,
      true,
      'the read routes through the authoritative owner',
    );
    t.equal(
      seenReadOptions[0]?.preferOwnerRpcReadLeader,
      true,
      'the read is pinned to the partition LEADER (not a stale local replica)',
    );
  });

// Part B — executeAuthoritativeOwnerRpcRead honors the leader-pin flag by passing
// preferLeader=true to executeOnPartition (default owner-RPC reads stay
// preferLeader=false so other callers are unaffected).
test('owner-RPC read pins to the leader only when the flag is set', async (t) => {
  const calls = [];
  function buildService() {
    return {
      nodeId: 'N1',
      logger: {warn() {}, info() {}, debug() {}, error() {}},
      sqlQueryEngine: {
        queryExecutor: {
          async executeOnPartition(
            partitionId,
            statement,
            params,
            requireAuthoritative,
            preferLeader,
          ) {
            calls.push({partitionId, preferLeader});
            return {success: true, rows: []};
          },
        },
      },
    };
  }

  await executeAuthoritativeOwnerRpcRead(
    buildService(),
    PUBLICATIONS,
    `SELECT * FROM ${PUBLICATIONS}`,
    [],
    {preferOwnerRpcRead: true, preferOwnerRpcReadLeader: true},
    {},
  );
  t.equal(
    calls[calls.length - 1]?.preferLeader,
    true,
    'preferOwnerRpcReadLeader pins the read to the leader',
  );

  await executeAuthoritativeOwnerRpcRead(
    buildService(),
    PUBLICATIONS,
    `SELECT * FROM ${PUBLICATIONS}`,
    [],
    {preferOwnerRpcRead: true},
    {},
  );
  t.equal(
    calls[calls.length - 1]?.preferLeader,
    false,
    'without the flag the owner-RPC read is not leader-pinned (unchanged)',
  );
});
