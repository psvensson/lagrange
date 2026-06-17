import t from 'tap';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createTimeoutTestCoordinator} from '../rebalancer/timeout-test-coordinator.js';

// DT6 item 6 — drive the REAL terminal timeout-reconcile MUTATION on the virtual clock. Step 12
// drove the reconcile-trigger branch but stubbed reconcileTimeoutOperation (the actual state
// transition). This guard closes that gap: a real RebalanceCoordinator (the shared timeout fixture,
// backed by an in-memory SQL operation store) runs its real checkTimeouts -> reconcileTimeoutOperation
// -> failOperation pipeline, and the timeout decision is driven by an injected VirtualTimeSource via
// the step-9/11 clock seam (coordinator.timeSource -> workflowOwner -> resolveTimeoutCheckNowMs).
//
// A real ADD operation in PENDING is given a virtual-time updated_at; while virtual time is within
// the step timeout the real reconcile leaves it PENDING, and once the VirtualTimeSource advances past
// the timeout the real failOperation transition fires and persists the operation as FAILED — the
// genuine terminal mutation, on the virtual clock, deterministically.
//
// HONEST SCOPE: the coordinator, the operation store, checkTimeouts, reconcileTimeoutOperation, and
// failOperation are all real production code (the same fixture used by timeout-triggers-failure's
// Property 7 wall-clock tests). The durable store is the established in-memory mock SQL engine; only
// the clock is virtualized. This is the real timeout->FAILED transition step 12 deferred.

const START_MS = 1_000_000;
const PENDING_TIMEOUT_MS = 10;

async function runVirtualTimeout({advanceMs}) {
  const timeSource = new VirtualTimeSource({startMs: START_MS});
  const {coordinator, setOperationUpdatedAt, getTrackedOperation} =
    createTimeoutTestCoordinator({timeSource, pendingTimeoutMs: PENDING_TIMEOUT_MS});
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.ADD,
      partitionId: 'test-partition',
      nodeId: 'test-node',
    });
    // Anchor the operation's updated_at on the virtual clock.
    setOperationUpdatedAt(operation.operationId, START_MS);

    // First check at virtual now == START_MS (elapsed 0): real reconcile leaves it PENDING.
    await coordinator.checkTimeouts();
    const afterFirstCheck = getTrackedOperation(operation.operationId);

    // Advance virtual time, then check again: past the timeout the real failOperation fires.
    timeSource.advance(advanceMs);
    await coordinator.checkTimeouts();
    const afterAdvance = getTrackedOperation(operation.operationId);

    return {afterFirstCheck, afterAdvance};
  } finally {
    await coordinator.shutdown();
  }
}

t.test('the real timeout->FAILED transition fires only once VIRTUAL time passes the step timeout',
  async (t) => {
    const m = await runVirtualTimeout({advanceMs: 100});
    t.equal(m.afterFirstCheck.status, ReplicaStatus.PENDING,
      'at virtual now == updated_at (elapsed 0) the real reconcile left the operation PENDING');
    t.equal(m.afterFirstCheck.workflow_step, 'PENDING', 'workflow step still PENDING before timeout');

    t.equal(m.afterAdvance.status, ReplicaStatus.FAILED,
      'once virtual time advanced past the step timeout, the real failOperation transition fired');
    t.equal(m.afterAdvance.workflow_step, 'FAILED', 'the real terminal mutation set workflow step FAILED');
    t.ok(String(m.afterAdvance.error_message).includes('Timeout'),
      'the persisted failure carries the real timeout error message');
    t.ok(String(m.afterAdvance.error_message).includes('PENDING'),
      'the failure names the PENDING step that timed out');
  });

t.test('within the timeout the real reconcile does NOT fail the operation (virtual-clock gated)',
  async (t) => {
    // Advance by less than the step timeout: the real reconcile must leave it PENDING.
    const m = await runVirtualTimeout({advanceMs: PENDING_TIMEOUT_MS - 1});
    t.equal(m.afterAdvance.status, ReplicaStatus.PENDING,
      'elapsed < timeout in virtual time -> the real reconcile keeps the operation PENDING');
    t.equal(m.afterAdvance.workflow_step, 'PENDING', 'no terminal transition before the timeout');
  });

t.test('the real terminal-mutation drive is deterministic across runs', async (t) => {
  const a = await runVirtualTimeout({advanceMs: 100});
  const b = await runVirtualTimeout({advanceMs: 100});
  t.same(
    {status: a.afterAdvance.status, step: a.afterAdvance.workflow_step,
      error: a.afterAdvance.error_message},
    {status: b.afterAdvance.status, step: b.afterAdvance.workflow_step,
      error: b.afterAdvance.error_message},
    'identical virtual drive -> identical persisted FAILED transition (incl. deterministic elapsed)',
  );
});
