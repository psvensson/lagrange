from pathlib import Path
import json
import shutil
import sys

carrier = Path(__file__).resolve().parent
test = Path('test/integration/message-group-learner-runtime-authorization.integration.test.js')
source = Path('src/rebalancer/replica-operation-message-group-membership-authorization.js')
process_test = 'test/integration/message-group-learner-process-loss.integration.test.js'

if sys.argv[1] == 'tests':
    s = test.read_text()
    start = s.index('async function fixture(')
    end = s.index('// Query identity', start)
    fixture = s[start:end]
    constants = s[s.index('const GROUP ='):start].replace(
        'const {RAFT_OPERATION_OUTCOME, RAFT_MEMBERSHIP_TRANSITION_REASON} = portContract;\n', '')
    imports = '''/** Shared canonical operation/native fixture; transport and metadata are supplied
 * test physics, not distributed SQL or physical networking. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createServiceDeliveryFixture} from './service-delivery-fixture.js';
import * as admission from '../../src/raft/raft-rs-group-membership-admission.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {NODES_SCHEMA, REPLICA_OPERATIONS_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL, generateCreateIndexSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {ReplicaStatus, OperationType} from '../../src/rebalancer/replica-status.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';
'''
    fixture = fixture.replace('nativeTimeSource = null} = {})',
        'nativeTimeSource = null,\n  tempRoot = os.tmpdir()} = {})')
    fixture = fixture.replace('partitionId: GROUP, replicaIds: FOUNDERS,',
        'partitionId: GROUP, replicaIds: FOUNDERS, tempRoot,')
    fixture = fixture.replace("path.join(os.tmpdir(), 'learner-authorization-')",
        "path.join(tempRoot, 'learner-authorization-')")
    Path('test/test-helpers/learner-operation-fixture.js').write_text(imports + '\n' + constants +
        fixture + '\nexport {fixture, GROUP, FOUNDERS, TARGET, NODE, SUCCESSOR, O, NOW};\n')
    s = s[:start] + s[end:]
    start = s.index('const GROUP ='); end = s.index('// Query identity', start)
    s = s[:start] + 'const {RAFT_OPERATION_OUTCOME, RAFT_MEMBERSHIP_TRANSITION_REASON} = portContract;\n' + s[end:]
    s = s.replace("import {createServiceDeliveryFixture} from '../test-helpers/service-delivery-fixture.js';\n",
        "import {fixture, GROUP, FOUNDERS, TARGET, NODE, SUCCESSOR, O, NOW} from\n  '../test-helpers/learner-operation-fixture.js';\n")
    for line in ["import os from 'node:os';\n",
        "import {NODES_SCHEMA, REPLICA_OPERATIONS_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';\n",
        "import {generateCreateTableSQL, generateCreateIndexSQL} from '../../src/bootstrap/system-table-schema-sql.js';\n",
        "import {PartitionNodeCluster} from '../raft/raft-rs-backend/partition-node-cluster.js';\n"]:
        s = s.replace(line, '')
    anchor = "    await t.test('holder renewal during native read prevents old-holder recording', async (t) => {"
    addition = '''    await t.test('native refusal classifications retain conflict versus unavailability', async (t) => {
      const f = await issuedAndCommitted(t);
      const before = f.row();
      const actual = await readLearnerAction(f);
      const kinds = membershipRead.COMMITTED_LEARNER_ACTION_KIND;
      const reasons = membershipRead.COMMITTED_LEARNER_ACTION_REASON;
      const refusal = (reason) => ({kind: kinds.REFUSED, reason});
      const witness = (reason) => ({...actual, membership: {
        kind: membershipRead.COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED, reason}});
      const cases = [
        [refusal(reasons.UNAVAILABLE), 'unavailable'],
        [refusal(reasons.MISMATCH), 'conflict'],
        [refusal(reasons.CORRUPT), 'conflict'],
        [refusal(reasons.BEYOND_APPLIED), 'conflict'],
        [refusal(reasons.INVALID), 'conflict'],
        [{kind: kinds.UNRESOLVED, reason: reasons.NOT_RECORDED}, 'unknown'],
        [{kind: kinds.UNRESOLVED, reason: reasons.CORRUPT}, 'conflict'],
        [null, 'conflict'],
        [{kind: kinds.COMMITTED, reason: reasons.UNAVAILABLE}, 'conflict'],
        [witness(membershipRead.COMMITTED_MEMBERSHIP_REFUSAL.HELD), 'unavailable'],
        [witness(membershipRead.COMMITTED_MEMBERSHIP_REFUSAL
          .CONFIGURATION_GENERATION_UNAVAILABLE), 'unavailable'],
        [witness(membershipRead.COMMITTED_MEMBERSHIP_REFUSAL.STAMP_INVALID), 'conflict'],
      ];
      for (const [answer, expected] of cases) {
        assert.equal((await recordOutcome(f, {read: async () => answer})).outcome, expected,
          'typed permanent native refusal must not become retryable unavailability');
        assert.deepEqual(f.row(), before, 'refusal must retain the row and membership debt');
      }
      const unavailable = async () => {throw new Error('read transport unavailable');};
      assert.equal((await recordOutcome(f, {read: unavailable})).outcome, 'unavailable');
      assert.equal((await recordOutcome(f)).outcome, 'recorded',
        'a later genuine committed native answer remains recoverable');
    });
    await t.test('terminal competition at learner CAS preserves exact terminal history', async (t) => {
      for (const successful of [false, true]) {
        const f = await issuedAndCommitted(t);
        const execute = f.repository.executeOperationMutationWithRetry.bind(f.repository);
        let terminal = null;
        f.repository.executeOperationMutationWithRetry = async (sql, params, ...rest) => {
          if (terminal === null && sql.includes('message_group_learner_stamp = ?')) {
            f.repository.executeOperationMutationWithRetry = execute;
            await settleOperation(f, successful);
            terminal = f.row();
          }
          return execute(sql, params, ...rest);
        };
        assert.equal((await recordOutcome(f)).outcome, 'unknown',
          'terminal-first competition must defeat the earlier learner CAS');
        assert.ok(terminal, 'actual recording CAS must meet a terminal competitor');
        assert.deepEqual(f.row(), terminal, 'losing CAS must preserve the exact winning row');
        assert.equal((await recordOutcome(f)).outcome, successful ? 'conflict' : 'recorded');
        assert.deepEqual(ordinaryAndDebt(f.row()), ordinaryAndDebt(terminal),
          'a failed ordinary operation keeps terminal history and unresolved membership debt');
      }
    });
'''
    assert s.count(anchor) == 1
    test.write_text(s.replace(anchor, addition + anchor))
    shutil.copyfile(carrier / 'worker.js', 'test/test-helpers/learner-process-loss-worker.js')
    shutil.copyfile(carrier / 'process.test.js.txt', process_test)
    p = Path('test/shards/impact-contracts.json'); data = json.loads(p.read_text())
    key = 'message-group-learner-outcome-recording'
    assert process_test not in data['contracts'][key]['tests']
    data['contracts'][key]['tests'].append(process_test)
    data['coupledPairs'][key]['witnessTests'].append(process_test)
    p.write_text(json.dumps(data, indent=2) + '\n')
elif sys.argv[1] == 'source':
    s = source.read_text()
    s = s.replace('  COMMITTED_MEMBERSHIP_READ_PURPOSE} from',
        '  COMMITTED_MEMBERSHIP_READ_PURPOSE, COMMITTED_MEMBERSHIP_ANSWER_KIND,\n  COMMITTED_MEMBERSHIP_REFUSAL} from')
    a = s.index('function learnerOutcomeEvidence('); b = s.index('  try {', a)
    s = s[:a] + '''// Preserve the native owner's distinction: unresolved history is not a conflict,
// and an invalid/mismatched origin is not transient transport unavailability.
function learnerObservationRefusal(observed) {
  if (observed?.kind === ACTION_KIND.UNRESOLVED &&
    observed.reason === ACTION_REASON.NOT_RECORDED) return OUTCOME.UNKNOWN;
  if (observed?.kind === ACTION_KIND.REFUSED &&
    observed.reason === ACTION_REASON.UNAVAILABLE) return OUTCOME.UNAVAILABLE;
  return observed?.kind === ACTION_KIND.COMMITTED && observed.reason === ACTION_REASON.APPLIED ?
    null : OUTCOME.CONFLICT;
}
function learnerWitnessUnavailable(membership) {
  return membership?.kind === COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED &&
    [COMMITTED_MEMBERSHIP_REFUSAL.HELD,
      COMMITTED_MEMBERSHIP_REFUSAL.CONFIGURATION_GENERATION_UNAVAILABLE]
      .includes(membership.reason);
}
function learnerOutcomeEvidence(observed, input, query) {
  const refusal = learnerObservationRefusal(observed);
  if (refusal !== null) return {refusal};
''' + s[b:]
    anchor = '    const encodedStamp = JSON.stringify(observed.membership);'
    assert s.count(anchor) == 1
    source.write_text(s.replace(anchor,
        '    if (learnerWitnessUnavailable(observed.membership)) return {refusal: OUTCOME.UNAVAILABLE};\n' + anchor))
else:
    raise ValueError('unknown phase')
