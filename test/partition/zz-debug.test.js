import {afterEach, beforeEach, test} from 'node:test';
import {unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {addSourceRow, fixture, recipientAnswer} from '../test-helpers/cdc-delivery-progress-fixture.js';
beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);
test('dbg', async (t) => {
  const f = await fixture(t, {rows: ['a','b'], subscribers: 2});
  let xAnswers = true;
  f.behavior = (index, events, _c, groupId) => index === 0 && !xAnswers ? unknownCdcAcceptance() : recipientAnswer(events, groupId, true);
  console.log((await f.drive()).state);
  xAnswers = false; f.ready = false;
  addSourceRow(f.leader, 'c'); await settleTicks(); f.ready = true;
  const d = await f.drive();
  console.log(JSON.stringify(d), JSON.stringify(f.leader.cdcDelivery.getCdcObligationDiagnostics().recipients), f.clock.now());
});
