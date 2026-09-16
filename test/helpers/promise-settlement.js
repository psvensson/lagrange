// Observing whether a promise has settled, without counting host turns.
//
// Several owner-completion witnesses ask the same question: is this owner
// still busy? Answering it by awaiting a fixed number of microtask turns
// makes the witness a measurement of host speed, so the observation is done
// once, here, and the same way everywhere.

/**
 * A promise the caller settles explicitly.
 * @return {{promise: Promise, release: Function, fail: Function}}
 */
function heldPromise() {
  let release = null;
  let fail = null;
  const promise = new Promise((resolve, reject) => {
    release = resolve;
    fail = reject;
  });
  return {promise, release, fail};
}

/**
 * Whether a promise is still pending. A genuinely held promise never settles,
 * and the sentinel is deferred past an async function's own continuation so a
 * resolved-but-chained promise is not misread as pending.
 * @param {Promise} promise - The promise to observe.
 * @return {Promise<boolean>} true while the promise has not settled.
 */
async function isPending(promise) {
  const sentinel = Symbol('pending');
  let deferred = Promise.resolve(sentinel);
  for (let turn = 0; turn < 8; turn += 1) deferred = deferred.then((v) => v);
  const winner = await Promise.race([
    promise.then(() => 'settled', () => 'settled'), deferred]);
  return winner === sentinel;
}

export {heldPromise, isPending};
