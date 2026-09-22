// Test-only host retained for the historical trap probes. The production
// runtime owner deliberately exposes no host, group, handle, or raw work hook.
import {
  createRaftRsGroup,
  restoreRaftRsGroup,
} from './raw-raft-rs-test-core.js';

const RAFT_RS_RUNTIME_HEALTH = Object.freeze({
  HEALTHY: 'healthy',
  UNHEALTHY_AFTER_TRAP: 'unhealthy-after-trap',
});
const RAFT_RS_CALL_OUTCOME = Object.freeze({
  COMPLETED: 'completed',
  CORE_REFUSED: 'core-refused',
  TRAPPED: 'trapped',
  RUNTIME_UNHEALTHY: 'runtime-unhealthy',
});

function runCaptured(work) {
  const captured = [];
  const original = console.error;
  console.error = (...args) => captured.push(args.map(String).join(' '));
  try {
    return {ok: true, value: work(), diagnosis: null};
  } catch (error) {
    return {
      ok: false,
      fatal: error instanceof Error,
      error: String(error?.message || error),
      diagnosis: captured.join('\n'),
    };
  } finally {
    console.error = original;
  }
}

class RaftRsRuntimeHost {
  constructor({instantiate}) {
    this.instantiate = instantiate;
    this.runtime = instantiate();
    this.groupsById = new Map();
    this.healthState = RAFT_RS_RUNTIME_HEALTH.HEALTHY;
    this.trap = null;
  }

  get core() {
    return this.runtime;
  }

  get health() {
    return this.healthState;
  }

  get lastTrap() {
    return this.trap;
  }

  groups() {
    return [...this.groupsById.keys()];
  }

  hostedGroup(key) {
    const group = this.groupsById.get(key);
    if (!group) {
      throw new Error(`unknown test group ${key}`);
    }
    return group;
  }

  handleOf(key) {
    return this.hostedGroup(key).handle;
  }

  openGroup({key, groupId, peerId, store, voters, learners, tuning}) {
    const resumed = store.hasDurableRecord(groupId);
    const handle = resumed ? restoreRaftRsGroup({
      core: this.runtime, store, groupId, peerId, tuning,
    }) : createRaftRsGroup({
      core: this.runtime, store, groupId, peerId, voters, learners, tuning,
    });
    this.groupsById.set(key ?? groupId, {
      key: key ?? groupId,
      groupId,
      peerId,
      store,
      handle,
      origin: resumed ? 'restored-from-durable-record' : 'created-fresh',
    });
    return handle;
  }

  originOf(key) {
    return this.hostedGroup(key).origin;
  }

  adoptGroup({key, groupId, peerId, store, handle}) {
    this.groupsById.set(key ?? groupId, {
      key: key ?? groupId,
      groupId,
      peerId,
      store,
      handle,
      origin: 'adopted-already-running',
    });
  }

  run(key, work) {
    if (this.healthState !== RAFT_RS_RUNTIME_HEALTH.HEALTHY) {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY,
        error: 'test runtime remains unhealthy until replacement',
        diagnosis: this.trap?.diagnosis ?? null,
      });
    }
    const hosted = this.hostedGroup(key);
    const ran = runCaptured(() => work(this.runtime, hosted.handle));
    if (ran.ok) {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.COMPLETED,
        value: ran.value,
        error: null,
        diagnosis: null,
      });
    }
    if (!ran.fatal) {
      return Object.freeze({
        outcome: RAFT_RS_CALL_OUTCOME.CORE_REFUSED,
        error: ran.error,
        diagnosis: null,
      });
    }
    this.healthState = RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP;
    this.trap = Object.freeze({
      key,
      groupId: hosted.groupId,
      error: ran.error,
      diagnosis: ran.diagnosis,
    });
    return Object.freeze({
      outcome: RAFT_RS_CALL_OUTCOME.TRAPPED,
      error: ran.error,
      diagnosis: ran.diagnosis,
    });
  }

  replaceRuntime() {
    this.runtime = this.instantiate();
    const restored = [];
    for (const hosted of this.groupsById.values()) {
      hosted.handle = restoreRaftRsGroup({
        core: this.runtime,
        store: hosted.store,
        groupId: hosted.groupId,
        peerId: hosted.peerId,
      });
      hosted.origin = 'restored-from-durable-record';
      restored.push(hosted.key);
    }
    this.healthState = RAFT_RS_RUNTIME_HEALTH.HEALTHY;
    return Object.freeze({
      restored: Object.freeze(restored),
      health: this.healthState,
    });
  }
}

export {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_RUNTIME_HEALTH,
  RaftRsRuntimeHost,
};
