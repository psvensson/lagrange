"""Bounded test-only correction after external PR117 review; never a probe."""
import json
from pathlib import Path

ROOT = Path.cwd()
TARGET = ROOT / 'test/raft/raft-rs-backend/operation-port-throw-containment.test.js'
source = TARGET.read_text()

def replace_once(old, new):
    global source
    assert source.count(old) == 1, f'changed timing-test anchor: {old[:80]!r}'
    source = source.replace(old, new, 1)

replace_once("import {test} from 'node:test';", "import {test} from 'node:test';\nimport {setImmediate as nextEventLoopTurn} from 'node:timers/promises';\nimport {VirtualTimeSource} from '../../../src/time/time-source.js';")
replace_once("function lonePort(groupId, {deferElection, db = new Database(IN_MEMORY)}) {", "function lonePort(groupId, {deferElection, db = new Database(IN_MEMORY), timeSource = null}) {")
replace_once("[RAFT_OPERATION_PORT_REQUEST.SUBSTRATE]: {},", "[RAFT_OPERATION_PORT_REQUEST.SUBSTRATE]: timeSource === null ? {} : {timeSource},")
replace_once("function throwingLeaderListener(port) {\n  return port.subscribe(RAFT_EVENT.LEADER, () => {\n    throw new Error(LISTENER_FAILURE);", "function throwingLeaderListener(port, observed = () => undefined) {\n  return port.subscribe(RAFT_EVENT.LEADER, () => {\n    observed();\n    throw new Error(LISTENER_FAILURE);")
replace_once("function sleep(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}", "function sleep(ms) {\n  return new Promise((resolve) => setTimeout(resolve, ms));\n}\n\n// Preserve every production tick and the full simulated interval; flush the\n// real microtask turn before the next due instant, rather than batching ticks.\nasync function advanceScheduledClock(clock, spanMs) {\n  const end = clock.now() + spanMs;\n  while (clock.now() < end) {\n    clock.advance(Math.min(TIMING.tickIntervalMs, end - clock.now()));\n    await nextEventLoopTurn();\n  }\n}")
replace_once("  const {port, dispose} = lonePort('containment-scheduled',\n    {deferElection: false});\n  try {\n    const unsubscribe = throwingLeaderListener(port);\n    const startedAt = Date.now();\n    await sleep(SCHEDULED_SPAN_MS);", "  const clock = new VirtualTimeSource({startMs: 1000});\n  const {port, dispose} = lonePort('containment-scheduled',\n    {deferElection: false, timeSource: clock});\n  let leaderAnnouncements = 0;\n  try {\n    const unsubscribe = throwingLeaderListener(port, () => { leaderAnnouncements += 1; });\n    const startedAt = clock.now();\n    await advanceScheduledClock(clock, SCHEDULED_SPAN_MS);\n    assert.ok(leaderAnnouncements > 0, 'actual scheduled leader callback must run');")
replace_once("    const spanMs = Date.now() - startedAt;", "    const spanMs = clock.now() - startedAt;\n    assert.equal(spanMs, SCHEDULED_SPAN_MS, 'the complete original observation interval is retained');")
# Only the scheduled-tick test is changed. The called-operation witness remains untouched.
replace_once("    unsubscribe();\n    await sleep(recoveryRetryWindowMsOf(TIMING) + WINDOW_MARGIN_MS);\n    assert.equal(port.readStatus().role, RAFT_ROLE.LEADER,", "    unsubscribe();\n    await advanceScheduledClock(clock, recoveryRetryWindowMsOf(TIMING) + WINDOW_MARGIN_MS);\n    assert.equal(port.readStatus().role, RAFT_ROLE.LEADER,")
replace_once("    dispose();\n    escapes.stop();\n  }\n});\n\ntest('F-ah (b): a throw inside a port operation", "    dispose();\n    escapes.stop();\n    assert.equal(clock.pendingTimerCount(), 0, 'all scheduled ticks are owned by the disposed port');\n  }\n});\n\ntest('F-ah (b): a throw inside a port operation")
TARGET.write_text(source)

registry = ROOT / 'test/shards/impact-contracts.json'
data = json.loads(registry.read_text())
name = 'raft-rs-runtime-application-transaction'
new_tests = [
    'test/raft/raft-rs-backend/runtime-load-recovery.integration.test.js',
    'test/raft/raft-rs-backend/runtime-replacement-review.integration.test.js',
]
changed = []
for section, value in data.items():
    if isinstance(value, dict) and name in value:
        contract = value[name]
        field = 'witnessTests' if 'witnessTests' in contract else 'tests'
        assert field in contract
        for test in new_tests:
            assert (ROOT / test).is_file()
            assert test not in contract[field], f'already registered {test}'
            contract[field].append(test)
        changed.append((section, field))
assert len(changed) == 2 and {entry[1] for entry in changed} == {'tests', 'witnessTests'}, changed
registry.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'scope': 'test only; production unchanged', 'registryChanges': changed, 'registered': new_tests}))
