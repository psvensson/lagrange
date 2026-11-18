/**
 * One reservation sweep reads each operation once and both of its arms (TTL
 * expiry, orphan release) decide on that one snapshot. The snapshot has ONE
 * shape, {action, state}, whether it was just read or already held by the
 * sweep: a caller must never have to know which of the two it received.
 */
import {test} from '../../src/test-helpers/tap.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';

const TEST_OPERATION_ID = 'op-reservation-sweep-shape';
const TEST_SNAPSHOT_KEYS = Object.freeze(['action', 'state']);
const TEST_RESERVATION_ID = 'res-reservation-sweep-shape';
const TEST_EXPIRY_SQL_FRAGMENT = 'expires_at';

function buildReservationProbe() {
  const observed = {operationReads: 0};
  const probe = Object.create(RebalanceCoordinator.prototype);
  probe.isOperationTerminal = () => true;
  probe.getReservationOperationVisibilityObservation = async () => {
    observed.operationReads += 1;
    return {operation: {operationId: TEST_OPERATION_ID}, deferredOutcome: null};
  };
  return {probe, observed};
}

test('a reservation sweep snapshot has one shape on read and on reuse',
  async (t) => {
    const {probe, observed} = buildReservationProbe();
    const sweepSnapshots = new Map();

    const firstRead = await probe.buildReservationExpirySnapshot(
      TEST_OPERATION_ID,
      sweepSnapshots,
    );
    const reused = await probe.buildReservationExpirySnapshot(
      TEST_OPERATION_ID,
      sweepSnapshots,
    );

    t.same(Object.keys(firstRead).sort(), [...TEST_SNAPSHOT_KEYS],
      'the freshly read snapshot is {action, state}');
    t.same(Object.keys(reused).sort(), [...TEST_SNAPSHOT_KEYS],
      'the reused snapshot is {action, state} too');
    t.equal(reused, firstRead,
      'both arms of the sweep decide on the same snapshot object');
    t.equal(observed.operationReads, 1,
      'the operation is read once per sweep');
    t.ok(Object.isFrozen(reused), 'the sweep snapshot is immutable');
  });

test('a snapshot read outside a sweep is not retained', async (t) => {
  const {probe, observed} = buildReservationProbe();

  await probe.buildReservationExpirySnapshot(TEST_OPERATION_ID);
  await probe.buildReservationExpirySnapshot(TEST_OPERATION_ID);

  t.equal(observed.operationReads, 2,
    'without a sweep the operation is read each time');
});

// The TTL arm and the orphan arm are independent reads of the reservation
// table: a failed TTL read must not skip the orphan release, nor the
// RECONCILED event, for that sweep.
test('a failed stale-reservation read still runs the orphan arm', async (t) => {
  const {probe} = buildReservationProbe();
  const emitted = [];
  const transitions = [];
  Object.assign(probe, {
    logger: {info() {}, warn() {}},
    stats: {reservationsReconciled: 0},
    emit: (eventName, payload) => emitted.push({eventName, payload}),
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(_tableName, sql) {
        return String(sql).includes(TEST_EXPIRY_SQL_FRAGMENT) ?
          {success: false, error: 'stale reservation read failed'} :
          {
            success: true,
            rows: [{
              reservation_id: TEST_RESERVATION_ID,
              operation_id: TEST_OPERATION_ID,
            }],
          };
      },
    },
    async transitionActiveReservationById(reservationId, status) {
      transitions.push({reservationId, status});
      return {success: true, changed: true};
    },
  });

  const result = await probe.runReservationReconcileSweep();

  t.same(result, {expired: 0, orphansReleased: 1},
    'the orphan of a terminal operation is released in the same sweep');
  t.equal(transitions.length, 1, 'through one reservation transition');
  t.equal(emitted.length, 1, 'and the sweep still emits its reconciled event');
  t.same(emitted[0].payload, {expired: 0, orphansReleased: 1},
    'with the sweep counts');
});
