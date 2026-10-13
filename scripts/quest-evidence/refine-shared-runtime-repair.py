"""Second measured attempt: fix resumption ordering; classify loader reads exactly."""
from pathlib import Path
import hashlib
p=Path('src/raft/raft-rs-runtime-owner.js');s=p.read_text()
assert hashlib.sha256(s.encode()).hexdigest()=='449936171210389c5adabf3a928f2a17e1b33893d232296d1184026aa9407883'
def edit(old,new):
    global s
    assert s.count(old)==1, old[:100]
    s=s.replace(old,new,1)
edit('  RUNTIME_REASON,\n', '  RUNTIME_REASON,\n  RUNTIME_RESUME_DELAY_MS,\n')
edit('    group.pendingRuntimeResume = null;\n    group.health = RECOVERY_REQUIRED;', '    group.pendingRuntimeResume = null;\n    cancelRuntimeResumption(group);\n    group.health = RECOVERY_REQUIRED;')
edit('function resumeRuntimeGroup(group) {\n', 'function resumeRuntimeGroup(group) {\n  cancelRuntimeResumption(group);\n')
edit('    pendingRuntimeResume: null,\n', '    pendingRuntimeResume: null,\n    runtimeResumeTimer: null,\n')
edit('      group.closed = true;\n', '      group.closed = true;\n      cancelRuntimeResumption(group);\n')
edit('// Account for every registered group while the barrier is closed.', '''function cancelRuntimeResumption(group) {
  if (group.runtimeResumeTimer !== null) {
    group.timers.clearTimeout(group.runtimeResumeTimer);
    group.runtimeResumeTimer = null;
  }
}

// An old Ready's completion must itself make no new-generation core entry.
// When its queue is occupied, schedule the owed resumption on the next owned
// clock turn after that queue settles, not inside the old completion's
// microtask chain. A genuine intervening operation can consume the same
// pending generation; close/replacement/resumption cancel the timer.
function scheduleRuntimeResumption(group, generation) {
  const current = () => !group.closed &&
    generation === runtimeGeneration &&
    group.pendingRuntimeResume === generation;
  const run = () => {
    cancelRuntimeResumption(group);
    if (!current()) return;
    const resumed = group.admitScheduledEntry(() =>
      enqueue(group, () => ensureExecution(group)));
    if (resumed && typeof resumed.catch === 'function') {
      resumed.catch((error) => containUnexpectedThrow(group, error));
    }
  };
  if (group.tail === null) return run();
  const schedule = () => {
    if (!current() || group.runtimeResumeTimer !== null) return;
    group.runtimeResumeTimer = group.timers.setTimeout(run,
      RUNTIME_RESUME_DELAY_MS);
  };
  group.tail.then(schedule, schedule).catch((error) =>
    containUnexpectedThrow(group, error));
}

// Account for every registered group while the barrier is closed.''')
edit('''    const resumed = enqueue(group, () => ensureExecution(group));
    if (resumed && typeof resumed.catch === 'function') {
      resumed.catch((error) => containUnexpectedThrow(group, error));
    }''','''    scheduleRuntimeResumption(group, generation);''')
p.write_text(s)
p=Path('src/raft/raft-rs-runtime-owner-constants.js');s=p.read_text()
edit("const REPLACING = 'replacing';", "const REPLACING = 'replacing';\nconst RUNTIME_RESUME_DELAY_MS = 0;")
idx=s.index('export {');a=s[:idx];b=s[idx:];assert b.count('  REPLACING,')==1
p.write_text(a+b.replace('  REPLACING,','  REPLACING,\n  RUNTIME_RESUME_DELAY_MS,',1))
p=Path('test/raft/raft-rs-backend/runtime-replacement-review-child.js');s=p.read_text()
# The old pressure assertions are unchanged: 25 calls inside the window
# still permit precisely one actual failed artifact read.
edit("      assert.equal((await pb.readStatus()).outcome, OUTCOME.CORE_OK);\n      assert.equal(receipt.loadAttempts, initialAttempts + 1, 'another group resumes the one due attempt');", """      const resumed = await pb.readStatus();
      assert.equal(resumed.outcome, OUTCOME.CORE_OK);
      assert.equal(resumed.runtimeGeneration, receipt.initial.runtimeGeneration + 1,
        'the due caller causes exactly one successful native instantiation');
      // instantiateRaftRsCore verifies integrity before AND after executing
      // the glue. Two successful manifest reads are one load, not two loads.
      assert.equal(receipt.loadAttempts, initialAttempts + 2,
        'one successful load keeps both pre-load and post-load integrity checks');
      const creates = receipt.entries.filter((entry) =>
        entry.operation === 'create_node' &&
        entry.runtimeGeneration === resumed.runtimeGeneration);
      assert.equal(creates.length, 3, 'one due shared attempt reconstructs each group once');""")
# Name the diagnostic counter after what is actually observed. Historical
# receipts are untouched; they retain their original name and failed count.
s=s.replace('loadAttempts', 'manifestReads')
p.write_text(s)
print('Retained the old Ready assertion; bounded owned timer defers only resumption. Counted successful pre/post integrity checks honestly.')
