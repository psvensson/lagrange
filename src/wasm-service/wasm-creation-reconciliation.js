// Volatile trigger/custody adapter of WasmServiceLifecycle, not another genesis
// or permission owner. Both START and native events use the same keyed queue.
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {WRITER_REASON} from './wasm-writer-profile.js';
import {progressWasmCreationGenesis, WASM_CREATION_GENESIS} from './wasm-creation-genesis.js';

const QUEUE_NAME = 'wasm-creation-reconciliation';
const UNSUBSCRIBE_FAILED = 'WASM creation event retirement failed';
const LISTENER_RETIREMENT = Object.freeze({RETIRED: 'RETIRED', FAILED: 'FAILED'});
const WAKE_EVENTS = Object.freeze([
  RAFT_EVENT.LEADER, RAFT_EVENT.FOLLOWER, RAFT_EVENT.CANDIDATE,
  RAFT_EVENT.LEADER_CHANGE, RAFT_EVENT.TERM_CHANGE, RAFT_EVENT.APPLIED_PROGRESS,
]);

class WasmCreationReconciliation {
  constructor(lifecycle, replica) {
    this.lifecycle = lifecycle;
    this.replica = replica;
    this.closed = false;
    this.subscriptions = [];
    this.shutdownSettlement = null;
    this.queue = new OwnerKeyReconcileQueue({name: QUEUE_NAME,
      reconcileFn: (_key, _reasons, context) => this.reconcile(context)});
  }

  current(context) {
    return !this.closed && !this.lifecycle.consensusClosing && this.replica.initialized &&
      this.lifecycle.activeReplicas.get(this.replica.serviceDefinitionId) === this.replica &&
      this.replica.raft === context.port && this.replica.consensusCreation === context.creation;
  }

  capture() {
    return Object.freeze({port: this.replica.raft, creation: this.replica.consensusCreation});
  }

  stoppedResult() {
    return {outcome: WASM_CREATION_GENESIS.HELD, reason: WRITER_REASON.SHUTDOWN};
  }

  bind() {
    this.requireRetirement(this.unbind());
    const context = this.capture();
    for (const event of WAKE_EVENTS) {
      this.subscriptions.push(context.port.subscribe(event, () => {
        // Never read membership, submit INIT, await or retain event payloads here.
        if (this.current(context)) this.queue.enqueue(this.replica.replicaId, event, context);
      }));
    }
  }

  request() {
    const context = this.capture();
    if (!this.current(context)) return Promise.resolve(this.stoppedResult());
    return this.queue.enqueueAndWait(this.replica.replicaId,
      RECONCILE_REASON.PROGRESS_RECONCILE, context);
  }

  async reconcile(context) {
    if (!this.current(context)) return this.stoppedResult();
    const result = await progressWasmCreationGenesis(this.replica);
    return this.current(context) ? result : this.stoppedResult();
  }

  closeAdmission() {
    this.closed = true;
  }

  shutdown() {
    if (this.shutdownSettlement !== null) return this.shutdownSettlement;
    this.closeAdmission();
    this.shutdownSettlement = this.retire().catch((error) => {
      // Failure stays visible to the current caller. A later explicit shutdown
      // may retry the retained unsubscribe; this never schedules a retry itself.
      this.shutdownSettlement = null;
      throw error;
    });
    return this.shutdownSettlement;
  }

  unbind() {
    const result = {outcome: LISTENER_RETIREMENT.RETIRED, errors: []};
    for (const unsubscribe of this.subscriptions.splice(0)) {
      try {
        unsubscribe();
      } catch (error) {
        this.subscriptions.push(unsubscribe);
        result.outcome = LISTENER_RETIREMENT.FAILED;
        result.errors.push(error);
      }
    }
    return result;
  }

  requireRetirement(result) {
    if (result.outcome === LISTENER_RETIREMENT.FAILED) {
      throw new AggregateError(result.errors, UNSUBSCRIBE_FAILED);
    }
  }

  async retire() {
    const result = this.unbind();
    // The replica's shutdown already aborted writer interest. Do not call the
    // queue's shutdown until its *actual* current work has ended: shutdown()
    // clears its bookkeeping and therefore is not a join operation.
    await this.queue.awaitCurrentWorkIdle();
    this.queue.shutdown();
    this.requireRetirement(result);
  }
}

export {WasmCreationReconciliation};
