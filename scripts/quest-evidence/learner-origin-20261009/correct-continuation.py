#!/usr/bin/env python3
"""Reconcile the retained failed origin attempt; never edit outside its scope."""
from pathlib import Path
import sys

def replace(path, before, after):
    p = Path(path)
    text = p.read_text()
    assert text.count(before) == 1, (path, 'source anchor drift', before)
    p.write_text(text.replace(before, after, 1))

test = 'test/integration/message-group-learner-runtime-authorization.integration.test.js'
if sys.argv[1] == 'tests':
    replace(test, "  const leader = cluster.leaderReplicaId();\n  const port = cluster.node(leader);",
        "  const leader = cluster.leaderReplicaId();\n"
        "  assert.ok(cluster.settle(() => FOUNDERS.every((id) =>\n"
        "    BigInt(cluster.node(id).readStatus().appliedIndex) > 0n)),\n"
        "  'the founding no-op must be committed and applied before the operation fixture');\n"
        "  const port = cluster.node(leader);")
    replace(test, "        const oldLifecycle = old.readStatus().lifecycleIncarnation;\n"
        "        f.cluster.restart(f.leader);\n"
        "        assert.notEqual(f.cluster.node(f.leader).readStatus().lifecycleIncarnation, oldLifecycle);",
        "        const oldLifecycle = old.readStatus().lifecycleIncarnation;\n"
        "        const oldDatabase = f.cluster.replica(f.leader).db;\n"
        "        f.cluster.restart(f.leader);\n"
        "        assert.equal(oldDatabase.open, false, 'the prior database must actually close');\n"
        "        assert.equal(f.cluster.node(f.leader) === old, false, 'the port must be reconstructed');\n"
        "        assert.equal(f.cluster.replica(f.leader).db === oldDatabase, false,\n"
        "          'reconstruction must acquire a different database connection');\n"
        "        assert.equal(f.cluster.node(f.leader).readStatus().lifecycleIncarnation, oldLifecycle,\n"
        "          'same durable replica reopening preserves its physical lifecycle identity');")
    replace(test, "        const trapped = trapSharedCore(f.cluster, f.leader);",
        "        const previousRuntime = f.cluster.node(f.leader).readStatus().runtimeGeneration;\n"
        "        const trapped = trapSharedCore(f.cluster, f.leader);")
    replace(test, "        for (const id of FOUNDERS) f.cluster.node(id).readStatus();\n"
        "        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);",
        "        for (const id of FOUNDERS) f.cluster.node(id).readStatus();\n"
        "        assert.notEqual(f.cluster.node(f.leader).readStatus().runtimeGeneration, previousRuntime,\n"
        "          'the actual fatal boundary must reconstruct the shared native runtime');\n"
        "        assertExactLearnerOrigin(f, await readLearnerAction(f), proposed.proposalIndex);")
    replace(test, "        f.cluster.isolate(f.leader); f.cluster.tickers = [successor];",
        "        f.cluster.isolate(f.leader);\n"
        "        // Both surviving voters must advance their election/leader leases.\n"
        "        f.cluster.tickers = FOUNDERS.filter((id) => id !== f.leader);")
    replace(test, "        assert.ok(f.cluster.settle(() => f.cluster.node(successor).readStatus().role === 'leader'),",
        "        assert.ok(f.cluster.settle(() =>\n"
        "          f.cluster.tickers.some((id) => f.cluster.node(id).readStatus().role === 'leader')),")
    replace(test, "        const successor = FOUNDERS.find((id) => id !== f.leader);",
        "        let successor = null;")
    replace(test, "        assert.ok(f.cluster.node(successor).readStatus().term > oldTerm);",
        "        successor = f.cluster.tickers.find((id) =>\n"
        "          f.cluster.node(id).readStatus().role === 'leader');\n"
        "        assert.ok(f.cluster.node(successor).readStatus().term > oldTerm);")
    replace(test, "        db.exec('DROP TRIGGER fail_origin_apply');",
        "        const committedState = db.prepare('SELECT learners FROM _raft_rs_applied_state ' +\n"
        "          'WHERE group_id = ?').get(GROUP);\n"
        "        assert.equal(JSON.parse(committedState.learners).includes(deriveRaftRsPeerId(TARGET)),\n"
        "          false, 'rolled-back ConfState cannot expose the failed learner origin');\n"
        "        db.exec('DROP TRIGGER fail_origin_apply');")
elif sys.argv[1] == 'source':
    replace('src/raft/raft-rs-peer-identity.js',
        '    return Object.freeze({replicaIdentity, peerId, learnerAdmission});',
        '    return Object.freeze({replicaIdentity, peerId,\n'
        '      ...(learnerAdmission === null ? {} : {learnerAdmission})});')
    replace('src/raft/raft-rs-committed-membership-context.js',
        '  if (encoded === null) return true;',
        '  if (encoded === undefined) return true;')
    replace('src/raft/snapshot-checkpoint-constants.js',
        "const RAFT_RS_CHECKPOINT_PEER_RESERVATION_FIELDS = Object.freeze([\n"
        "  'replicaIdentity', 'peerId', 'learnerAdmission',\n]);",
        "const RAFT_RS_CHECKPOINT_PEER_RESERVATION_FIELDS = Object.freeze([\n"
        "  'replicaIdentity', 'peerId',\n]);\n"
        "const RAFT_RS_CHECKPOINT_ADMITTED_PEER_FIELDS = Object.freeze([\n"
        "  ...RAFT_RS_CHECKPOINT_PEER_RESERVATION_FIELDS, 'learnerAdmission',\n]);")
    replace('src/raft/snapshot-checkpoint-constants.js',
        '  RAFT_RS_CHECKPOINT_CONF_STATE_FIELDS,',
        '  RAFT_RS_CHECKPOINT_ADMITTED_PEER_FIELDS,\n  RAFT_RS_CHECKPOINT_CONF_STATE_FIELDS,')
    replace('src/raft/snapshot-checkpoint-format.js',
        '  RAFT_RS_CHECKPOINT_CONF_STATE_FIELDS,',
        '  RAFT_RS_CHECKPOINT_ADMITTED_PEER_FIELDS,\n  RAFT_RS_CHECKPOINT_CONF_STATE_FIELDS,')
    replace('src/raft/snapshot-checkpoint-format.js',
        '      exactKeys(reservation, RAFT_RS_CHECKPOINT_PEER_RESERVATION_FIELDS) &&',
        '      exactKeys(reservation, reservation.learnerAdmission === undefined ?\n'
        '        RAFT_RS_CHECKPOINT_PEER_RESERVATION_FIELDS :\n'
        '        RAFT_RS_CHECKPOINT_ADMITTED_PEER_FIELDS) &&')
    replace('src/raft/snapshot-checkpoint-format.js',
        '      (reservation.learnerAdmission === null ||',
        '      (reservation.learnerAdmission === undefined ||')
else:
    raise SystemExit('expected tests or source')
