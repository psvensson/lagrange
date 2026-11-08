// The answer of one runtime turn, named once where the turn produced it
// (R07): SETTLED when the work completed within the call that asked for it,
// PENDING when it waits on I/O - a peer delivery its transport has not yet
// answered, the store's persistence admission, or a turn queued behind the
// group's in-flight work. Every consumer switches on `settled`; none inspects
// an answer for a `then`. A settled turn keeps every synchronous path
// synchronous: continuing it runs the continuation in the same run.
//
// A foreign answer - a transport's send, a user callback's result - has an
// unknown shape by nature. turnFromForeignAnswer is the one place in src that
// names such an answer, and the designated adapter the value-or-promise
// budget row excludes by name. It reads the answer's `then` once, through
// captured intrinsics, so a hostile getter or replaced prototype method
// cannot change what it decides.

import {types as utilTypes} from 'node:util';

const PromiseConstructor = Promise;
const promiseResolve = Promise.resolve;
const queueMicrotaskFunction = queueMicrotask;
const reflectApply = Reflect.apply;
const objectFreeze = Object.freeze;
const {isPromise} = utilTypes;

/**
 * A turn that completed within the call.
 * @param {*} result - The turn's result.
 * @return {{settled: true, result: *}} The settled turn.
 */
function settledTurn(result) {
  return objectFreeze({settled: true, result});
}

/**
 * A turn waiting on I/O.
 * @param {Promise<*>} pending - Settles with the turn's result.
 * @return {{settled: false, pending: Promise<*>}} The pending turn.
 */
function pendingTurn(pending) {
  return objectFreeze({settled: false, pending});
}

/**
 * What a turn contributes to a promise chain it continues: its result when
 * settled, its promise when pending. Only a promise reaction (or the
 * runtime's single boundary to its callers) reads a turn this way; promise
 * resolution adopts either.
 * @param {Object} turn - A settled or pending turn.
 * @return {*} The result, or the promise of it.
 */
function turnChainValue(turn) {
  return turn.settled ? turn.result : turn.pending;
}

/**
 * Continue a turn with the next step, which answers a turn of its own: at
 * once when the turn settled, after its promise when it is pending (taking
 * the reactions a `then` of that promise takes).
 * @param {Object} turn - A settled or pending turn.
 * @param {function(*): Object} continuation - The next step.
 * @return {Object} The continued turn.
 */
function continueTurn(turn, continuation) {
  if (turn.settled) {
    return continuation(turn.result);
  }
  return pendingTurn(turn.pending.then(
    (result) => turnChainValue(continuation(result))));
}

/**
 * Name a foreign answer as a turn: a native promise is pending on itself; a
 * thenable is pending on a promise that adopts it in a later microtask (its
 * `then` read exactly once); any other value is settled.
 * @param {*} value - The foreign answer.
 * @return {Object} The settled or pending turn.
 */
function turnFromForeignAnswer(value) {
  if (isPromise(value)) {
    return pendingTurn(
      reflectApply(promiseResolve, PromiseConstructor, [value]));
  }
  if (value === null ||
      (typeof value !== 'object' && typeof value !== 'function')) {
    return settledTurn(value);
  }
  const then = value.then;
  if (typeof then !== 'function') {
    return settledTurn(value);
  }
  return pendingTurn(new PromiseConstructor((resolve, reject) => {
    queueMicrotaskFunction(() => {
      try {
        reflectApply(then, value, [resolve, reject]);
      } catch (error) {
        reject(error);
      }
    });
  }));
}

export {
  continueTurn,
  pendingTurn,
  settledTurn,
  turnChainValue,
  turnFromForeignAnswer,
};
