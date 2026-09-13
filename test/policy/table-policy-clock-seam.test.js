// Seam proof (formation-sim, bounded-seams constraint): the table policy
// cache's TTL is measured on the service's injectable clock, so a virtual
// clock expires it. RED on revert: with a bare Date.now() in the cache
// checks, advancing the injected clock past the TTL would leave the entry
// fresh and the second read below would never happen.

import {test} from '../../src/test-helpers/tap.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';

const TABLE_ID = 'calibration-table';
const STORED_REPLICA_COUNT = 5;
const ONE_MS = 1;

function buildService(clock) {
  let reads = 0;
  const service = new TablePolicyService({
    now: () => clock.nowMs,
    controlPlaneSystemTableGateway: {
      async readRows() {
        reads += 1;
        return {rows: [{
          table_id: TABLE_ID,
          table_policies: JSON.stringify({replicaCount: STORED_REPLICA_COUNT}),
        }]};
      },
    },
  });
  return {service, reads: () => reads};
}

test('the policy cache expires on the injected clock, not the wall clock', async (t) => {
  const clock = {nowMs: 0};
  const {service, reads} = buildService(clock);
  const first = await service.getTablePolicy(TABLE_ID);
  t.equal(first.replicaCount, STORED_REPLICA_COUNT, 'the stored policy is read');
  await service.getTablePolicy(TABLE_ID);
  t.equal(reads(), 1, 'within the TTL the cache answers');
  clock.nowMs = service.cacheTTLMs - ONE_MS;
  await service.getTablePolicy(TABLE_ID);
  t.equal(reads(), 1, 'one millisecond before expiry the cache still answers');
  clock.nowMs = service.cacheTTLMs;
  await service.getTablePolicy(TABLE_ID);
  t.equal(reads(), 2, 'at the TTL on the injected clock the row is read again');
  t.end();
});

test('without an injected clock the service keeps the ambient one', (t) => {
  const service = new TablePolicyService();
  t.equal(service.now, Date.now, 'default clock is Date.now, byte-identical');
  t.end();
});
