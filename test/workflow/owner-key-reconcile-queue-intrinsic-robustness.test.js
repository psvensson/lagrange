// The reconcile queue's hardening against a replaced intrinsic: a patched
// collection iterator prototype or an inherited Array index setter can neither
// stop nor strand owner progress, because the queue reads its collections
// through captured intrinsics.
import {test} from '../../src/test-helpers/tap.js';
import {OwnerKeyReconcileQueue} from
  '../../src/workflow/owner-key-reconcile-queue.js';

test('OwnerKeyReconcileQueue - collection iterator prototypes cannot stop ' +
  'or strand owner progress', async (t) => {
  const mapIteratorPrototype = Object.getPrototypeOf(new Map().entries());
  const setIteratorPrototype = Object.getPrototypeOf(new Set().values());
  const sharedIteratorPrototype = Object.getPrototypeOf(mapIteratorPrototype);

  const drainWithHostileDescriptor = async (prototype, property, message) => {
    const scheduled = [];
    const reconciled = [];
    const queue = new OwnerKeyReconcileQueue({
      maxConcurrency: 2,
      scheduleDrainFn: (callback) => scheduled.push(callback),
      reconcileFn: async (ownerKey) => reconciled.push(ownerKey),
    });
    queue.enqueue('owner-a', 'source_changed');
    queue.enqueue('owner-b', 'source_changed');
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      prototype,
      property,
    );
    let escaped = null;
    try {
      Object.defineProperty(prototype, property, {
        configurable: true,
        value: () => {
          throw new Error(message);
        },
        writable: true,
      });
      scheduled.shift()();
      await Promise.resolve();
      await Promise.resolve();
    } catch (error) {
      escaped = error;
    } finally {
      Object.defineProperty(prototype, property, originalDescriptor);
    }
    const diagnostics = queue.getDiagnostics();
    queue.shutdown();
    return {diagnostics, escaped, reconciled};
  };

  const hostileMapNext = await drainWithHostileDescriptor(
    mapIteratorPrototype,
    'next',
    'hostile MapIterator.next',
  );
  t.equal(hostileMapNext.escaped, null,
    'Map iterator next mutation cannot escape drain');
  t.same(hostileMapNext.reconciled.sort(), ['owner-a', 'owner-b'],
    'Map iterator next mutation cannot stop unrelated owners');
  t.same(hostileMapNext.diagnostics.pendingKeys, [],
    'Map iterator next mutation leaves no stranded pending work');

  const hostileSharedIterator = await drainWithHostileDescriptor(
    sharedIteratorPrototype,
    Symbol.iterator,
    'hostile Iterator.iterator',
  );
  t.equal(hostileSharedIterator.escaped, null,
    'shared iterator mutation cannot escape drain');
  t.same(hostileSharedIterator.reconciled.sort(), ['owner-a', 'owner-b'],
    'shared iterator mutation cannot stop owner progress');

  const reconciled = [];
  const queue = new OwnerKeyReconcileQueue({
    reconcileFn: async (ownerKey) => reconciled.push(ownerKey),
  });
  const originalSetNext = Object.getOwnPropertyDescriptor(
    setIteratorPrototype,
    'next',
  );
  let setIteratorError = null;
  try {
    Object.defineProperty(setIteratorPrototype, 'next', {
      configurable: true,
      value: () => {
        throw new Error('hostile SetIterator.next');
      },
      writable: true,
    });
    await queue._startReconcile('owner-c', {
      context: null,
      reasons: new Set(['source_changed']),
    });
  } catch (error) {
    setIteratorError = error;
  } finally {
    Object.defineProperty(setIteratorPrototype, 'next', originalSetNext);
  }
  t.equal(setIteratorError, null,
    'Set iterator next mutation cannot escape before retry ownership');
  t.same(reconciled, ['owner-c'],
    'Set iterator mutation cannot lose the claimed owner work');
  t.notOk(queue.isInFlight('owner-c'),
    'Set iterator mutation cannot strand an owner in flight');
  queue.shutdown();
});

test('OwnerKeyReconcileQueue - inherited Array setters cannot swallow ' +
  'collection snapshots', async (t) => {
  const scheduled = [];
  const reconciled = Object.create(null);
  const queue = new OwnerKeyReconcileQueue({
    maxConcurrency: 2,
    scheduleDrainFn: (callback) => scheduled.push(callback),
    reconcileFn: async (ownerKey) => {
      reconciled[ownerKey] = true;
    },
  });
  queue.logger = {debug() {}, error() {}, warn() {}};
  queue.enqueue('owner-a', 'source_changed');
  queue.enqueue('owner-b', 'source_changed');
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    Array.prototype,
    '0',
  );
  const definePrototypeProperty = (target, property, descriptor) =>
    Reflect.defineProperty(target, property, descriptor);
  let escaped = null;
  try {
    definePrototypeProperty(Array.prototype, '0', {
      configurable: true,
      enumerable: true,
      get: () => undefined,
      set: () => {},
    });
    scheduled.shift()();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  } catch (error) {
    escaped = error;
  } finally {
    if (originalDescriptor) {
      definePrototypeProperty(Array.prototype, '0', originalDescriptor);
    } else {
      delete Array.prototype[0];
    }
  }
  const diagnostics = queue.getDiagnostics();
  t.equal(escaped, null,
    'an inherited Array index setter cannot escape drain');
  t.same(Object.keys(reconciled).sort(), ['owner-a', 'owner-b'],
    'an inherited Array index setter cannot swallow owner progress');
  t.same(diagnostics.pendingKeys, [],
    'an inherited Array index setter leaves no stranded pending work');
  t.same(diagnostics.inFlightKeys, [],
    'an inherited Array index setter leaves no stranded in-flight owner');
  queue.shutdown();
});
