#!/usr/bin/env python3
"""Answer the actual failures of 37917632948; no timeout or runtime tuning changes."""
from pathlib import Path
import sys

def replace(path, old, new):
    p = Path(path); text = p.read_text()
    assert text.count(old) == 1, (path, 'anchor changed', old)
    p.write_text(text.replace(old, new, 1))

if sys.argv[1] == 'tests':
    p = 'test/integration/message-group-learner-runtime-authorization.integration.test.js'
    replace(p, 'async function fixture(t, {issue = true, permitChanges = {}} = {}) {\n'
        '  const cluster = new PartitionNodeCluster({partitionId: GROUP, replicaIds: FOUNDERS});',
        'async function fixture(t, {issue = true, permitChanges = {}, nativeTimeSource = null} = {}) {\n'
        '  const cluster = new PartitionNodeCluster({partitionId: GROUP, replicaIds: FOUNDERS,\n'
        '    substrateFor: nativeTimeSource === null ? null : () => ({timeSource: nativeTimeSource})});')
    replace(p, "    await t.test('origin and ConfState roll back together when the actual apply transaction fails',\n"
        '      async (t) => {\n        const f = await fixture(t);',
        "    await t.test('origin and ConfState roll back together when the actual apply transaction fails',\n"
        '      async (t) => {\n'
        '        const nativeTimeSource = new VirtualTimeSource({startMs: NOW});\n'
        '        const f = await fixture(t, {nativeTimeSource});')
    replace(p, "        db.exec('DROP TRIGGER fail_origin_apply');\n"
        '        assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>',
        "        db.exec('DROP TRIGGER fail_origin_apply');\n"
        '        const resumed = await f.port.tick();\n'
        '        if (resumed.recoveryRequired === true) {\n'
        '          assert.ok(Number.isSafeInteger(resumed.retryAfterMs) && resumed.retryAfterMs > 0,\n'
        "            'the recovery owner must name the remaining retry delay');\n"
        '          nativeTimeSource.advance(resumed.retryAfterMs);\n'
        '          assert.equal((await f.port.tick()).outcome, RAFT_OPERATION_OUTCOME.CORE_OK,\n'
        "            'replay must recover after the unchanged owner deadline');\n"
        '        } else {\n'
        '          assert.equal(resumed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);\n'
        '        }\n'
        '        assert.ok(f.cluster.settle(() => FOUNDERS.every((id) =>')
    replace(p, '        assert.equal((await readLearnerAction(f)).kind, \'committed-action\');\n'
        '      });\n    await t.test(\'checkpoint scrubs native history',
        '        assert.equal((await readLearnerAction(f)).kind, \'committed-action\');\n'
        '        assert.equal(f.row().message_group_membership_permit, f.request.permit,\n'
        "          'recovery cannot rewrite the original issued action');\n"
        '      });\n    await t.test(\'checkpoint scrubs native history')
elif sys.argv[1] == 'source':
    p = 'src/raft/raft-rs-committed-membership-context.js'
    replace(p, "const LEARNER_ORIGIN_ERROR = 'invalid committed learner origin';",
        "const LEARNER_ORIGIN_ERROR = 'invalid committed learner origin';\n"
        "const INVALID_COMMITTED_LEARNER_ADMISSION = Object.freeze({kind: 'invalid-learner-origin'});")
    replace(p, '        encodeCommittedLearnerAdmission(value) !== encoded) return null;',
        '        encodeCommittedLearnerAdmission(value) !== encoded) {\n'
        '      return INVALID_COMMITTED_LEARNER_ADMISSION;\n    }')
    replace(p, '    return Object.freeze({...value, context: Object.freeze(value.context)});\n'
        '  } catch {\n    return null;\n  }',
        '    return Object.freeze({...value, context: Object.freeze(value.context)});\n'
        '  } catch {\n    return INVALID_COMMITTED_LEARNER_ADMISSION;\n  }')
    replace(p, '  return origin !== null && origin.groupId === boundary.groupId &&',
        '  return origin !== INVALID_COMMITTED_LEARNER_ADMISSION &&\n'
        '    origin.groupId === boundary.groupId &&')
    replace(p, 'export {\n  canonicalLearnerContext,',
        'export {\n  INVALID_COMMITTED_LEARNER_ADMISSION,\n  canonicalLearnerContext,')
    p = 'src/raft/raft-rs-committed-membership-read.js'
    replace(p, 'import {canonicalLearnerContext, decodeCommittedLearnerAdmission} from',
        'import {INVALID_COMMITTED_LEARNER_ADMISSION,\n  canonicalLearnerContext, decodeCommittedLearnerAdmission} from')
    replace(p, '    if (origin === null) return learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.CORRUPT);',
        '    if (origin === INVALID_COMMITTED_LEARNER_ADMISSION) {\n'
        '      return learnerActionAnswer(ACTION_KIND.REFUSED, ACTION_REASON.CORRUPT);\n    }')
    p = 'src/raft/raft-rs-peer-identity-constants.js'
    replace(p, "const RAFT_RS_PEER_IDENTITY_TABLE = 'raft_rs_peer_identity';",
        "const RAFT_RS_PEER_IDENTITY_TABLE = 'raft_rs_peer_identity';\n"
        "const RAFT_RS_LEARNER_ADMISSION_COLUMN = 'learner_admission';")
    replace(p, 'export {\n  RAFT_RS_PEER_IDENTITY_ERROR_MSG,',
        'export {\n  RAFT_RS_LEARNER_ADMISSION_COLUMN,\n  RAFT_RS_PEER_IDENTITY_ERROR_MSG,')
    p = 'src/raft/raft-rs-peer-identity.js'
    replace(p, 'import {\n  RAFT_RS_PEER_IDENTITY_ERROR_MSG,',
        'import {\n  RAFT_RS_LEARNER_ADMISSION_COLUMN,\n  RAFT_RS_PEER_IDENTITY_ERROR_MSG,')
    replace(p, "name === 'learner_admission'", 'name === RAFT_RS_LEARNER_ADMISSION_COLUMN')
else:
    raise SystemExit('expected tests or source')
