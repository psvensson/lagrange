// Seam proof (formation-sim, bounded-seams constraint): the table policy
// cache's TTL is measured on the service's injectable clock, so a virtual
// clock expires it. RED on revert: with a bare Date.now() in the cache
// checks, advancing the injected clock past the TTL would leave the entry
// fresh and the final policy identity would not change.

import {test} from '../../src/test-helpers/tap.js';
import {TablePolicyService} from '../../src/policy/table-policy-service.js';

const TABLE_ID = 'calibration-table';
const STORED_TRAFFIC_THRESHOLD = 5;
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
          table_policies: JSON.stringify({splitTrafficThreshold: STORED_TRAFFIC_THRESHOLD}),
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
  t.equal(first.splitTrafficThreshold, STORED_TRAFFIC_THRESHOLD, 'the stored policy is read');
  t.equal(await service.getTablePolicy(TABLE_ID), first, 'within TTL the parsed policy is reused');
  t.equal(reads(), 2, 'row availability is still observed');
  clock.nowMs = service.cacheTTLMs - ONE_MS;
  t.equal(await service.getTablePolicy(TABLE_ID), first, 'one millisecond before expiry the cache still answers');
  clock.nowMs = service.cacheTTLMs;
  t.not(await service.getTablePolicy(TABLE_ID), first, 'at the TTL on the injected clock policy is resolved again');
  t.equal(reads(), 4, 'each call observes the table row');
  t.end();
});

test('without an injected clock the service keeps the ambient one', (t) => {
  const service = new TablePolicyService();
  t.equal(service.now, Date.now, 'default clock is Date.now, byte-identical');
  t.end();
});
