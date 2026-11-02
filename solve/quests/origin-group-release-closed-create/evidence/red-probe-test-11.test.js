// Red probe of quest origin-group-release-closed-create, moved unchanged from
// fresh-create-release-authority-cross-node.integration.test.js (test 11). Lives
// outside test/ because it is red until that quest is worked: the origin
// shortcut in localReleaseRefusal answers before any operation-row read, so a
// CLOSED completed create reaches cut_over. Not an assertion of that behaviour.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {ConfigurationManager} from '../../../../src/config/configuration-manager.js';
import {LoggingService} from '../../../../src/logging/logging-service.js';
import {readPartitionWriteOrigin} from
  '../../../../src/partition/partition-participant-transaction-store.js';
import {PARTICIPANT_CUTOVER_OUTCOME as OUTCOME} from
  '../../../../src/partition/partition-participant-transaction-cutover-constants.js';
import {formFoundingGroup} from
  '../../../../test/partition/fresh-create-release-authority-fixture.js';

const TEST_TIMEOUT_MS = 120000;

function environment(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  t.after(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
}

async function releaseOutcome(group, index, evidence, budgetMs) {
  try {
    return {answer: await group.release(index, evidence, budgetMs), error: null};
  } catch (error) {
    return {answer: null, error};
  }
}

test('11: a create no longer open is refused on a group that already has an origin',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    environment(t);
    const group = await formFoundingGroup(t, {founderCount: 3});
    const evidenceC = await group.evidenceFor(2);
    const first = await releaseOutcome(group, 1, await group.evidenceFor(1));
    assert.equal(first.answer?.outcome, OUTCOME.CUT_OVER, 'setup: the group is released');
    assert.notEqual(readPartitionWriteOrigin(group.services[0].db), null, 'setup: origin');
    group.rows[2].completed_at = group.rows[2].created_at + 20;
    group.rows[2].create_admission_state = 'CLOSED';
    const {answer, error} = await releaseOutcome(group, 2, evidenceC, 4000);
    assert.equal(answer, null, 'a closed create never releases');
    assert.match(String(error?.message), /create_operation_not_open/u);
  });
