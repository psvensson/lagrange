from pathlib import Path
p=Path('test/integration/message-group-learner-runtime-authorization.integration.test.js')
s=p.read_text()
replacements=[
("const removed = await f.port[portContract.RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](removal);", "const removed = await f.port[\n          portContract.RAFT_OPERATION.PROPOSE_MEMBERSHIP_TRANSITION](removal);"),
("!f.cluster.node(id).readStatus().confState.learners.includes(deriveRaftRsPeerId(TARGET))", "!f.cluster.node(id).readStatus().confState.learners.includes(\n            deriveRaftRsPeerId(TARGET))")]
for a,b in replacements:
 assert s.count(a)==1,(a,'target drift')
 s=s.replace(a,b,1)
a="""        assert.equal((await recordLearner(f)).outcome, 'unknown');
        assert.equal(crossed, true, 'terminal race must execute before the actual conditional write');
        assert.equal(f.row().message_group_learner_stamp, null,
          'terminal-state changes must defeat the earlier recording basis');"""
b="""        const recordingOutcome = (await recordLearner(f)).outcome;
        assert.equal(crossed, true, 'terminal race must execute before the actual conditional write');
        assert.equal(f.row().message_group_learner_stamp, null,
          'terminal-state changes must defeat the earlier recording basis');
        assert.equal(recordingOutcome, 'unknown');"""
assert s.count(a)==1,'terminal assertion order drift'
s=s.replace(a,b,1)
p.write_text(s)
