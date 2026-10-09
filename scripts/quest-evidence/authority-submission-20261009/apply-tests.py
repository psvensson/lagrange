from pathlib import Path
import os

p = Path('test/integration/message-group-learner-recipient.integration.test.js')
s = p.read_text()
def replace(before, after):
    global s
    assert s.count(before) == 1, ('test anchor drift', before)
    s = s.replace(before, after)

anchor = "import {MessageRouter} from '../../src/transport/message-router.js';"
replace(anchor, anchor + "\nimport {OperationLane} from '../../src/workflow/operation-lane.js';\nimport {DurableWorkflowCoordinator} from '../../src/workflow/durable-workflow-coordinator.js';\nimport {PARTITION_SERVICE_ERROR_MSG} from '../../src/partition/partition-service-constants.js';")
replace('async function receiverFixture(t, {commit = true} = {}) {', 'async function receiverFixture(t, {commit = true, timeoutMs = 5000} = {}) {')
replace('  const owner = new OperationWorkflowOwner({nodeId: NODE, repository: f.repository,', '  const coordinator = new DurableWorkflowCoordinator();\n  const operationLane = new OperationLane({workflowCoordinator: coordinator});\n  const owner = new OperationWorkflowOwner({nodeId: NODE, repository: f.repository,')
replace('    messageRouter: source, logger: noLog, config: {}, stats: {},', '    messageRouter: source, logger: noLog, config: {}, stats: {},\n    replicaOperationDispatchTimeoutMs: timeoutMs,')
replace('    operationLane: {run: (_key, work) => work()}, getActualReplicaStatus: async () => null,', '    operationLane, operationWorkflowCoordinator: coordinator,\n    getActualReplicaStatus: async () => null,')
replace('  return {f, source, recipient, replicaId, native, service, handler, owner, deliver,', '  return {f, source, recipient, replicaId, native, service, handler, owner, deliver, coordinator,')
assert 'registered learner invocation and owner-submission fences' not in s
p.write_text(s + '\n' + (Path(os.environ['CARRIER']) / 'tests-additions.js').read_text())
