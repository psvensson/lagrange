"""Prepare native witnesses on the retained PR117 test tree; no source writes."""
from pathlib import Path
import json
p=Path('test/raft/raft-rs-backend/runtime-load-recovery-child.js');s=p.read_text()
def edit(old,new):
    global s
    assert s.count(old)==1, old[:100]
    s=s.replace(old,new,1)
edit("import Database from 'better-sqlite3';", "import Database from 'better-sqlite3';\nimport {VirtualTimeSource} from '../../../src/time/time-source.js';")
edit("const groups = [];", "const groups = [];\nconst clock = new VirtualTimeSource({startMs: 1000});")
edit("replicaIds: [id], tempRoot: root,", "replicaIds: [id], tempRoot: root,\n    substrateFor: () => ({timeSource: clock}),")
edit("    restoreArtifacts();\n  }", "    restoreArtifacts();\n    // A restored artifact does not waive the runtime owner's retry window.\n    clock.advance(receipt.failures.at(-1).retryAfterMs ?? 0);\n  }")
p.write_text(s)
p=Path('test/raft/raft-rs-backend/runtime-replacement-review-child.js');s=p.read_text()
old="['control', 'partial-restore', 'reentrant-restore', 'reload-backoff']"
new="['control', 'partial-restore', 'reentrant-restore', 'reload-backoff', 'trap-during-restore', 'close-during-restore', 'mixed-clocks', 'last-close']"
edit(old,new)
edit("const readFault = {enabled: false};", "const readFault = {enabled: false, target: 'a'};\nconst otherClock = new VirtualTimeSource({startMs: 1000000});\nconst closedGroups = new Set();")
edit("substrateFor: () => ({timeSource: clock}),", "substrateFor: () => ({timeSource: scenario === 'mixed-clocks' && suffix === 'b' ? otherClock : clock}),")
edit("if (suffix === 'a' && readFault.enabled", "if (suffix === readFault.target && readFault.enabled")
edit("  } else if (scenario === 'reload-backoff') {", "  } else if (['reload-backoff', 'mixed-clocks', 'last-close'].includes(scenario)) {")
edit("    fs.writeFileSync(gluePath, originalGlue);\n    clock.advance(1);\n    assert.equal((await pb.readStatus()).outcome, OUTCOME.CORE_OK);\n    assert.equal(receipt.loadAttempts, initialAttempts + 1, 'another group resumes the one due attempt');", """    fs.writeFileSync(gluePath, originalGlue);
    if (scenario === 'last-close') {
      receipt.phase = 'last-close:new-opening';
      for (const group of [...clusters]) {
        assert.equal(portOf(group).close().outcome, OUTCOME.CORE_OK);
        closedGroups.add(group);
      }
      const d = makeGroup('d');
      assert.equal((await portOf(d).campaign()).outcome, OUTCOME.CORE_OK);
      assert.equal((await portOf(d).propose(`before:${d.partitionId}`)).outcome, OUTCOME.CORE_OK);
      assert.deepEqual(readRows(d), [`before:${d.partitionId}`]);
      receipt.openedAfterFinalClose = true;
    } else {
      clock.advance(1);
      assert.equal((await pb.readStatus()).outcome, OUTCOME.CORE_OK);
      assert.equal(receipt.loadAttempts, initialAttempts + 1, 'another group resumes the one due attempt');
    }""")
edit("  } else {\n    receipt.phase = 'control:recovery';", """  } else if (scenario === 'trap-during-restore') {
    receipt.phase = 'trap-during-restore:retry';
    receipt.restoreTraps = 0;
    setCoreFaultInjector((groupId, operation) => {
      if (groupId === b.partitionId && operation === 'create_node') {
        setCoreFaultInjector(null); receipt.restoreTraps += 1;
        throw new WebAssembly.RuntimeError('injected trap during reconstruction');
      }
    });
    const failed = await pa.readStatus();
    receipt.restoreFailure = failed;
    assert.equal(receipt.restoreTraps, 1);
    assert.equal(failed.outcome, OUTCOME.HOST_FAILURE);
    assert.equal(failed.recoveryRequired, true);
    assert.ok(failed.retryAfterMs > 0);
    const before = receipt.entries.length;
    assert.equal((await pc.readStatus()).outcome, OUTCOME.HOST_FAILURE);
    assert.equal(receipt.entries.length, before, 'partial new handles cannot escape the failed replacement');
    clock.advance(failed.retryAfterMs);
    const recovered = await pc.readStatus();
    assert.equal(recovered.outcome, OUTCOME.CORE_OK);
    assert.equal(recovered.runtimeGeneration, receipt.initial.runtimeGeneration + 2);
  } else if (scenario === 'close-during-restore') {
    receipt.phase = 'close-during-restore:callback';
    readFault.target = 'c';
    unsubscribe = pc.subscribe(RAFT_EVENT.FOLLOWER, () => {
      const before = receipt.entries.length;
      const closed = pb.close();
      closedGroups.add(b);
      receipt.callbacks.push({closed, enteredCore: receipt.entries.length - before});
    });
    readFault.enabled = true;
    receipt.initiator = await pa.readStatus();
    readFault.enabled = false;
    assert.equal(receipt.callbacks.length, 1);
    assert.equal(receipt.callbacks[0].closed.outcome, OUTCOME.CORE_OK);
    assert.equal(receipt.callbacks[0].enteredCore, 0, 'closing from a callback must not enter the replacing core');
    const freed = receipt.entries.filter((entry) => entry.operation === 'free' && entry.groupId === b.partitionId);
    assert.equal(freed.length, 1, 'the driver must discharge the exact newly created handle once');
    const atClose = receipt.entries.length;
    assert.notEqual((await pb.readStatus()).outcome, OUTCOME.CORE_OK);
    assert.equal(receipt.entries.length, atClose, 'closed group cannot be resumed by later work');
    unsubscribe(); unsubscribe = undefined;
  } else {
    receipt.phase = 'control:recovery';""")
edit("  for (const group of clusters) {\n    let status", "  for (const group of clusters) {\n    if (closedGroups.has(group)) continue;\n    let status")
p.write_text(s)
p=Path('test/raft/raft-rs-backend/runtime-replacement-review.integration.test.js');s=p.read_text();edit(old,new);p.write_text(s)
p=Path('test/shards/impact-contracts.json');d=json.loads(p.read_text());key='raft-rs-runtime-application-transaction'
d['contracts'][key]['description'] += ' Shared native replacement holds entry until every registered group is reconstructed or explicitly held; callbacks cannot use stale handles or cached healthy observations. A failed shared reload owns one captured clock and existing election-derived retry window, shared by all callers; caller changes cannot renew or bypass it. Resumption uses each existing group queue; close discharges exact-handle obligations and final close releases the shared retry record.'
for field in ['src/raft/raft-rs-binding-owner.js','src/raft/raft-rs-runtime-owner-constants.js','src/raft/raft-rs-runtime-faults.js']:
    if field not in d['contracts'][key]['owners']: d['contracts'][key]['owners'].append(field)
    endpoint=d['coupledPairs'][key]['endpoints'][0]['owners']
    if field not in endpoint: endpoint.append(field)
p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
print('Native witnesses extended; original failure evidence unchanged; shared-clock wait is explicit.')
