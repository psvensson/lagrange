// Local interest only. Durable outcomes and replay decisions belong to WasmWriterState.
import {resolveTimeSource} from '../time/time-source.js';
import {WASM_WRITER_PROFILE as P, WRITER_STATUS as S, WRITER_REASON as R} from
  './wasm-writer-profile.js';
import {canonicalWriterCommand, writerDigest, writerInterestKey} from './wasm-writer-codec.js';
import {responseIdentity, refused} from './wasm-writer-state.js';

function unknown(command, reason) {
  return {status: S.UNKNOWN, reason, identity: responseIdentity(command)};
}

class WasmWriterCompletion {
  constructor(replica, options = {}) {
    this.replica = replica;
    this.clock = resolveTimeSource(options);
    this.pending = new Map();
    this.waiterCount = 0;
  }

  submit(input, deadlineMs = P.interestMs) {
    let command;
    try {
      command = canonicalWriterCommand(input);
    } catch {
      return Promise.resolve({status: S.REFUSED, reason: R.INVALID, identity: null});
    }
    if (!this.replica.initialized) return Promise.resolve(refused(command, R.NOT_READY));
    if (!this.replica.isLeader) {
      return Promise.resolve({forwarded: true, leaderId: this.replica.leaderId});
    }
    if (!Number.isFinite(deadlineMs) || deadlineMs <= 0 || deadlineMs > P.interestMs) {
      return Promise.resolve(refused(command, R.INVALID));
    }
    const prior = this.replica.writerState.classify(command);
    if (prior.status !== S.NEW) return Promise.resolve(prior);
    const key = writerInterestKey(command);
    let interest = this.pending.get(key);
    const digest = writerDigest(command);
    if (interest && interest.digest !== digest) {
      return Promise.resolve(refused(command, R.CONFLICT));
    }
    if (this.waiterCount >= P.waiters || interest?.waiters.size >= P.duplicateWaiters ||
        (!interest && this.pending.size >= P.pendingIntents)) {
      return Promise.resolve(refused(command, R.FULL));
    }
    const isNew = interest === undefined;
    if (isNew) {
      interest = {key, command, digest, waiters: new Set()};
      this.pending.set(key, interest);
    }
    const {promise, resolve} = Promise.withResolvers();
    const waiter = {resolve, timer: null};
    interest.waiters.add(waiter);
    this.waiterCount += 1;
    waiter.timer = this.clock.setTimeout(() => {
      if (this.pending.get(key) !== interest) return;
      this.finishWaiter(interest, waiter, unknown(command, R.DEADLINE));
    }, deadlineMs);
    // Interest exists before even a synchronous application/proposal callback can occur.
    if (isNew) {
      try {
        Promise.resolve(this.replica.proposeEntry(command)).catch(() => {
          this.finish(interest, unknown(command, R.PROPOSAL));
        });
      } catch {
        this.finish(interest, unknown(command, R.PROPOSAL));
      }
    }
    return promise;
  }

  finishWaiter(interest, waiter, result) {
    if (!interest.waiters.delete(waiter)) return;
    this.clock.clearTimeout(waiter.timer);
    this.waiterCount -= 1;
    if (interest.waiters.size === 0 && this.pending.get(interest.key) === interest) {
      this.pending.delete(interest.key);
    }
    waiter.resolve(result);
  }

  finish(interest, result) {
    if (this.pending.get(interest.key) !== interest) return;
    for (const waiter of interest.waiters) this.finishWaiter(interest, waiter, result);
  }

  observeApplication(command, result, effects) {
    const interest = this.pending.get(writerInterestKey(command));
    if (!interest || interest.digest !== writerDigest(command)) return;
    effects.afterCommit.push(() => this.finish(interest, result));
    effects.afterRollback.push(() => this.finish(interest, unknown(command, R.ROLLBACK)));
  }

  abort(reason) {
    for (const interest of this.pending.values()) {
      this.finish(interest, unknown(interest.command, reason));
    }
  }
}

export {WasmWriterCompletion};
