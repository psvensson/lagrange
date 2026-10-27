// Volatile trigger/custody adapter of WasmServiceLifecycle, not another genesis
// or permission owner. Both START and native events use the same keyed queue,
// and the one keyed run owns genesis AND publication (design
// SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D1'): explicit, wake-driven
// and native triggers coalesce on the key, and the shutdown join covers an
// in-flight grant.
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';
import {RAFT_EVENT} from '../raft/raft-operation-port-constants.js';
import {WRITER_REASON} from './wasm-writer-profile.js';
import {progressWasmCreationGenesis, WASM_CREATION_GENESIS} from './wasm-creation-genesis.js';
import {publishWasmCreation, WASM_CREATION_PUBLICATION as PUBLICATION} from
  './wasm-creation-publication.js';
import {deliverWasmCreationWake} from './wasm-creation-wake.js';
import {WASM_SERVICE_SERVING_STATE as SERVING} from './wasm-service-serving-state.js';

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
      reconcileFn: (_key, reasons, context) => this.reconcile(reasons, context)});
  }

  current(context) {
    return !this.closed && !this.lifecycle.consensusClosing && this.replica.initialized &&
      this.lifecycle.activeReplicas.get(this.replica.serviceDefinitionId) === this.replica &&
      this.replica.raft === context.port && this.replica.consensusCreation === context.creation;
  }

  // A native event has work only while the replica is still held: a serving
  // replica runs no genesis read or grant per committed entry (N16).
  admitsNativeWake(context) {
    return this.current(context) && this.replica.servingState !== SERVING.SERVING;
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
        if (this.admitsNativeWake(context)) {
          this.queue.enqueue(this.replica.replicaId, RECONCILE_REASON.CREATION_NATIVE_PROGRESS,
            context);
        }
      }));
    }
  }

  request() {
    const context = this.capture();
    if (!this.current(context)) return Promise.resolve(this.stoppedResult());
    return this.queue.enqueueAndWait(this.replica.replicaId,
      RECONCILE_REASON.PROGRESS_RECONCILE, context);
  }

  async reconcile(reasons, context) {
    if (!this.current(context)) return this.stoppedResult();
    const genesis = await progressWasmCreationGenesis(this.replica);
    if (!this.current(context)) return this.stoppedResult();
    if (genesis.outcome !== WASM_CREATION_GENESIS.OBSERVED) return genesis;
    return this.publish(reasons, context, genesis);
  }

  // The grant steps of the same run, then the wake predicate (N2/N7): only a
  // run no START waits on wakes the operation owner, once per run, and the
  // genesis wake only on the HELD -> SERVING edge this run performed.
  async publish(reasons, context, genesis) {
    const published = await publishWasmCreation(this.replica, () => this.current(context));
    if (published.publication === PUBLICATION.STOPPED) return this.stoppedResult();
    const waited = reasons.includes(RECONCILE_REASON.PROGRESS_RECONCILE);
    if (published.publication === PUBLICATION.HELD) {
      return {...genesis, grant: published.grant, ...this.wake(waited,
        RECONCILE_REASON.CREATION_GRANT_HELD, {grant: published.grant})};
    }
    this.retireNativeWakes();
    return {...genesis, outcome: WASM_CREATION_GENESIS.PUBLISHED, grant: published.grant,
      ...this.wake(waited || !published.flipped, RECONCILE_REASON.CREATION_GENESIS_OBSERVED)};
  }

  wake(suppressed, reason, detail) {
    if (suppressed) return {};
    return {wake: deliverWasmCreationWake(this.lifecycle, this.replica.consensusCreation,
      reason, detail)};
  }

  // After the local grant the events have no further work (D6'). A failed
  // unsubscribe keeps its custody for the shutdown's retirement, and the
  // listener's own serving check already ignores it meanwhile.
  retireNativeWakes() {
    const result = this.unbind();
    if (result.outcome === LISTENER_RETIREMENT.FAILED) {
      this.lifecycle.logger.warn(UNSUBSCRIBE_FAILED, {replicaId: this.replica.replicaId,
        errors: result.errors.map((error) => error.message)});
    }
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
