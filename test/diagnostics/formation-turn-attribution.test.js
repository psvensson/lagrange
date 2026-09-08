import {readFileSync} from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
  runFormationOwner,
} from '../../src/diagnostics/formation-turn-attribution.js';

function createHarness(extraOptions = {}) {
  let nowUs = 0;
  let callbacks = null;
  let enabled = false;
  const attribution = new FormationTurnAttribution({
    clock: () => nowUs,
    context: {
      getStore: () => null,
      run: (_owner, callback) => callback(),
    },
    hookFactory: (configuredCallbacks) => {
      callbacks = configuredCallbacks;
      return {
        disable: () => {
          enabled = false;
        },
        enable: () => {
          enabled = true;
        },
      };
    },
    ...extraOptions,
  });
  return {
    attribution,
    callbacks: () => callbacks,
    enabled: () => enabled,
    setNow: (value) => {
      nowUs = value;
    },
  };
}

function ownerRow(snapshot, owner) {
  return snapshot.owners.find((entry) => entry.owner === owner);
}

function replaceWritableProperty(target, name, value) {
  if (!Reflect.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  })) {
    throw new Error(`cannot replace ${name}`);
  }
}

function restoreProperty(target, name, descriptor) {
  const restored = descriptor ?
    Reflect.defineProperty(target, name, descriptor) :
    Reflect.deleteProperty(target, name);
  if (!restored) throw new Error(`cannot restore ${name}`);
}

async function measureAwaitingCaller(AttributionClass) {
  let nowUs = 0;
  const attribution = new AttributionClass({clock: () => nowUs});
  attribution.start();

  await attribution.run(FORMATION_OWNER.READINESS, async () => {
    nowUs = 5;
    await Promise.resolve();
    nowUs = 10;
    await new Promise((resolvePromise) => setImmediate(() => {
      nowUs = 20;
      resolvePromise();
    }));
    nowUs = 25;
  });
  nowUs = 30;
  return attribution.stop();
}

async function measureReleasedGenerations(AttributionClass) {
  let nowUs = 0;
  const attribution = new AttributionClass({clock: () => nowUs});
  attribution.start();

  await new Promise((resolvePromise) => {
    attribution.run(FORMATION_OWNER.BOOTSTRAP, () => {
      setImmediate(() => {
        nowUs = 10;
        setImmediate(() => {
          nowUs = 20;
          resolvePromise();
        });
      });
    });
    attribution.releaseOwnerDescendants(FORMATION_OWNER.BOOTSTRAP);
  });
  nowUs = 30;
  return attribution.stop();
}

async function loadMutatedAttribution(replacement) {
  const contractUrl = new URL(
    '../../src/diagnostics/formation-diagnostics-contract.js',
    import.meta.url,
  );
  const sourceUrl = new URL(
    '../../src/diagnostics/formation-turn-attribution.js',
    import.meta.url,
  );
  const contractSource = readFileSync(contractUrl, 'utf8');
  const contractDataUrl = 'data:text/javascript;base64,' +
    Buffer.from(contractSource).toString('base64');
  const source = readFileSync(sourceUrl, 'utf8');
  const importSpecifier = './formation-diagnostics-contract.js';
  const registrationOwner = `    const owner = this.depth > ZERO ?
      this.activeOwner : this.context.getStore();`;
  if (!source.includes(registrationOwner)) {
    throw new Error('formation attribution registration owner changed');
  }
  const mutated = source
    .replace(importSpecifier, contractDataUrl)
    .replace(registrationOwner, replacement);
  const moduleUrl = 'data:text/javascript;base64,' +
    Buffer.from(mutated).toString('base64');
  return import(moduleUrl);
}

test('formation attribution owner partitions turns into exclusive buckets',
  (t) => {
    const harness = createHarness();
    const {attribution} = harness;
    attribution.start();
    t.equal(harness.enabled(), true, 'async dispatch hook is enabled');

    attribution.run(FORMATION_OWNER.BOOTSTRAP, () => {
      harness.setNow(10);
      harness.callbacks().init(7, 'Timeout', 1);
    });
    harness.setNow(20);
    harness.callbacks().before(7);
    harness.setNow(30);
    attribution.run(FORMATION_OWNER.READINESS, () => {
      harness.setNow(45);
    });
    harness.setNow(50);
    harness.callbacks().after(7);

    harness.callbacks().init(8, 'Immediate', 99);
    harness.setNow(60);
    harness.callbacks().before(8);
    harness.setNow(70);
    harness.callbacks().after(8);
    harness.setNow(100);
    const snapshot = attribution.stop();

    t.equal(harness.enabled(), false, 'async dispatch hook is disabled');
    t.equal(snapshot.windowDurationUs, 100, 'window uses injected clock');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).durationUs, 25,
      'bootstrap includes only its non-nested segments');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.READINESS).durationUs, 15,
      'nested readiness is charged once to readiness');
    t.equal(snapshot.unattributedDurationUs, 10,
      'unowned dispatch remains explicit');
    t.equal(snapshot.busyDurationUs, 50, 'busy time is the owner sum');
    t.equal(snapshot.idleDurationUs, 50, 'idle is the wall-time remainder');
    t.equal(snapshot.accountedDurationUs, snapshot.windowDurationUs,
      'owner plus idle buckets partition the wall window');
    t.equal(
      snapshot.owners.reduce(
        (total, row) => total + row.durationUs,
        snapshot.unattributedDurationUs + snapshot.idleDurationUs,
      ),
      snapshot.windowDurationUs,
      'owner, unattributed, and idle buckets are exactly exhaustive',
    );
    t.equal(snapshot.partitionDeltaUs, 0, 'partition has no missing time');
    t.equal(snapshot.overlapDurationUs, 0, 'partition has no overlap');
    t.equal(snapshot.turnCount, 2, 'top-level scheduled turns are counted');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).dispatchCount, 1,
      'scheduled timer inherited its dispatch owner');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.READINESS).handoffCount, 1,
      'explicit readiness entry records its turn handoff');
    t.equal(snapshot.unattributedDispatchCount, 1,
      'unowned scheduled entry is counted, never hidden');
    t.end();
  });

test('formation attribution owner keeps an awaiting caller unattributed',
  async (t) => {
    const snapshot = await measureAwaitingCaller(FormationTurnAttribution);

    t.equal(ownerRow(snapshot, FORMATION_OWNER.READINESS).durationUs, 25,
      'owner-internal Promise and timer descendants retain ownership');
    t.equal(snapshot.unattributedDurationUs, 5,
      'the external awaiting continuation remains unattributed');
    t.equal(snapshot.accountedDurationUs, snapshot.windowDurationUs,
      'the corrected Promise boundary still partitions the whole window');
    t.end();
  });

test('formation attribution owner releases bootstrap descendants', (t) => {
  const harness = createHarness();
  harness.attribution.start();
  harness.attribution.run(FORMATION_OWNER.BOOTSTRAP, () => {
    harness.callbacks().init(21, 'Timeout', 1);
  });
  harness.attribution.releaseOwnerDescendants(FORMATION_OWNER.BOOTSTRAP);
  harness.setNow(10);
  harness.callbacks().before(21);
  harness.setNow(20);
  harness.callbacks().after(21);
  harness.setNow(30);
  const snapshot = harness.attribution.stop();
  t.equal(snapshot.unattributedDurationUs, 10,
    'long-lived startup resources cannot hide in the bootstrap bucket');
  t.equal(snapshot.unattributedDispatchCount, 1,
    'released resources remain explicit in dispatch accounting');
  t.end();
});

test('formation attribution owner keeps later released generations unattributed',
  async (t) => {
    const snapshot = await measureReleasedGenerations(FormationTurnAttribution);

    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).durationUs, 0,
      'released callbacks and their descendants stay outside bootstrap');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).dispatchCount, 0,
      'no later generation regains a bootstrap dispatch tag');
    t.equal(snapshot.unattributedDurationUs, 30,
      'both callback generations and the caller continuation are explicit');
    t.equal(snapshot.accountedDurationUs, snapshot.windowDurationUs,
      'multi-generation release preserves the exclusive partition');
    t.end();
  });

test('formation attribution owner is transparent while inactive', (t) => {
  const value = runFormationOwner(FORMATION_OWNER.READINESS, () => 'preserved');
  t.equal(value, 'preserved', 'inactive attribution preserves behavior');
  t.end();
});

test('formation attribution validates the complete clock edge lattice', (t) => {
  const invalidClockValues = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  for (const value of invalidClockValues) {
    const harness = createHarness({clock: () => value});
    t.throws(
      () => harness.attribution.start(),
      /clock must return a non-negative safe integer/,
      `clock rejects ${String(value)}`,
    );
  }

  let nowUs = Number.MAX_SAFE_INTEGER - 1;
  const boundary = createHarness({clock: () => nowUs});
  boundary.attribution.start();
  nowUs = Number.MAX_SAFE_INTEGER;
  const snapshot = boundary.attribution.stop();
  t.equal(snapshot.windowDurationUs, 1,
    'safe-integer boundary arithmetic stays finite and exact');
  t.end();
});

test('invalid terminal clocks cleanly close their one-shot window', (t) => {
  let clockReads = 0;
  const invalidStop = createHarness({
    clock: () => {
      clockReads += 1;
      return clockReads === 1 ? 0 : Number.NaN;
    },
  });
  invalidStop.attribution.start();
  t.throws(
    () => invalidStop.attribution.stop(),
    /clock must return a non-negative safe integer/,
    'an invalid stop clock cannot enter a snapshot',
  );
  t.equal(
    runFormationOwner(FORMATION_OWNER.READINESS, () => 'inactive'),
    'inactive',
    'failed snapshot cleanup releases the public owner wrapper',
  );

  let nowUs = 5;
  const backwards = createHarness({clock: () => nowUs});
  backwards.attribution.start();
  nowUs = 4;
  t.throws(
    () => backwards.attribution.stop(),
    /clock moved backwards/,
    'a regressing safe clock is rejected',
  );
  t.equal(backwards.enabled(), false,
    'clock failure still disables the async hook');
  t.end();
});

test('formation attribution ignores inherited constructor options', (t) => {
  let inheritedReadCount = 0;
  const inheritedOptions = {
    clock: () => {
      inheritedReadCount += 1;
      return 0;
    },
    context: {
      getStore: () => {
        inheritedReadCount += 1;
        return FORMATION_OWNER.BOOTSTRAP;
      },
    },
    hookFactory: () => {
      inheritedReadCount += 1;
      throw new Error('inherited hook factory executed');
    },
  };
  const options = Object.create(inheritedOptions);
  const attribution = new FormationTurnAttribution(options);
  attribution.start();
  const snapshot = attribution.stop();

  t.equal(inheritedReadCount, 0,
    'prototype properties cannot configure the diagnostics owner');
  t.ok(Number.isSafeInteger(snapshot.windowDurationUs),
    'ignored inherited clock leaves a valid monotonic window');
  t.end();
});

test('formation attribution ignores enumerable Object prototype options',
  (t) => {
    const optionNames = ['clock', 'context', 'hookFactory'];
    const originalDescriptors = optionNames.map((name) =>
      Object.getOwnPropertyDescriptor(Object.prototype, name));
    let pollutedOptionUsed = false;
    try {
      replaceWritableProperty(
        Object.prototype,
        'clock',
        () => {
          pollutedOptionUsed = true;
          return Number.NaN;
        },
      );
      replaceWritableProperty(Object.prototype, 'context', null);
      replaceWritableProperty(
        Object.prototype,
        'hookFactory',
        () => {
          pollutedOptionUsed = true;
          throw new Error('polluted hook factory executed');
        },
      );
      const attribution = new FormationTurnAttribution({});
      attribution.start();
      attribution.stop();
    } finally {
      optionNames.forEach((name, index) => {
        restoreProperty(
          Object.prototype,
          name,
          originalDescriptors[index],
        );
      });
    }

    t.equal(pollutedOptionUsed, false,
      'enumerable prototype properties cannot alter default construction');
    t.end();
  });

test('formation attribution snapshots option accessors exactly once', (t) => {
  let clockAccessorReads = 0;
  let nowUs = 0;
  const options = {
    hookFactory: () => ({disable: () => {}, enable: () => {}}),
  };
  Object.defineProperty(options, 'clock', {
    enumerable: true,
    get: () => {
      clockAccessorReads += 1;
      return () => nowUs;
    },
  });
  const attribution = new FormationTurnAttribution(options);
  attribution.start();
  nowUs = 1;
  attribution.stop();

  t.equal(clockAccessorReads, 1,
    'constructor reads an own option accessor once before use');
  t.end();
});

test('formation attribution is independent of mutable accounting intrinsics',
  (t) => {
    const harness = createHarness();
    const {attribution} = harness;
    attribution.start();
    const intrinsicProperties = [
      [Array.prototype, 'forEach'],
      [Array.prototype, 'map'],
      [Array.prototype, 'pop'],
      [Array.prototype, 'push'],
      [Array.prototype, 'sort'],
      [Map.prototype, 'clear'],
      [Map.prototype, 'delete'],
      [Map.prototype, 'forEach'],
      [Map.prototype, 'get'],
      [Map.prototype, 'set'],
      [Object, 'values'],
    ];
    const originalDescriptors = intrinsicProperties.map(([target, name]) =>
      Object.getOwnPropertyDescriptor(target, name));
    const hostile = () => {
      throw new Error('hostile mutable intrinsic executed');
    };
    let snapshot;
    try {
      for (const [target, name] of intrinsicProperties) {
        replaceWritableProperty(target, name, hostile);
      }
      attribution.run(FORMATION_OWNER.READINESS, () => {
        harness.setNow(5);
        harness.callbacks().init(31, 'Immediate', 1);
      });
      harness.setNow(10);
      snapshot = attribution.stop();
    } finally {
      for (let index = 0; index < intrinsicProperties.length; index += 1) {
        const [target, name] = intrinsicProperties[index];
        restoreProperty(target, name, originalDescriptors[index]);
      }
    }

    t.equal(ownerRow(snapshot, FORMATION_OWNER.READINESS).durationUs, 5,
      'captured intrinsics preserve owner accounting after mutation');
    t.equal(snapshot.accountedDurationUs, snapshot.windowDurationUs,
      'captured intrinsics preserve the exclusive partition');
    t.end();
  });

test('formation attribution admits only one active window', (t) => {
  const first = createHarness();
  const second = createHarness();
  first.attribution.start();
  t.throws(
    () => second.attribution.start(),
    /already has an active window/,
    'a second instance cannot steal the public owner wrapper',
  );
  first.attribution.run(FORMATION_OWNER.READINESS, () => {
    first.setNow(5);
  });
  first.setNow(10);
  const snapshot = first.attribution.stop();

  t.equal(ownerRow(snapshot, FORMATION_OWNER.READINESS).durationUs, 5,
    'the admitted window remains authoritative after refused overlap');
  t.equal(second.enabled(), false,
    'the refused window never enables its async hook');
  t.end();
});

test('hook activation cannot reentrantly steal the active window', (t) => {
  const second = createHarness();
  let activationError = null;
  const first = createHarness({
    hookFactory: () => ({
      disable: () => {},
      enable: () => {
        try {
          second.attribution.start();
        } catch (error) {
          activationError = error;
        }
      },
    }),
  });
  first.attribution.start();
  first.attribution.run(FORMATION_OWNER.READINESS, () => {
    first.setNow(5);
  });
  first.setNow(10);
  const snapshot = first.attribution.stop();

  t.match(activationError?.message, /already has an active window/,
    'singleton ownership is claimed before hook activation');
  t.equal(second.attribution.started, false,
    'the reentrant contender never enters started state');
  t.equal(ownerRow(snapshot, FORMATION_OWNER.READINESS).durationUs, 5,
    'the original window remains the public attribution owner');
  t.end();
});

test('failed hook activation rolls back the singleton claim', (t) => {
  let hookDisabled = false;
  let activationCount = 0;
  const activationFailure = new Error('hook activation failed');
  const failed = createHarness({
    hookFactory: () => ({
      disable: () => {
        hookDisabled = true;
      },
      enable: () => {
        activationCount += 1;
        if (activationCount === 1) {
          runFormationOwner(FORMATION_OWNER.READINESS, () => {
            failed.setNow(5);
          });
          throw activationFailure;
        }
      },
    }),
  });
  const mapClearDescriptor =
    Object.getOwnPropertyDescriptor(Map.prototype, 'clear');
  let observedFailure = null;
  try {
    replaceWritableProperty(Map.prototype, 'clear', () => {
      throw new Error('hostile Map.prototype.clear executed');
    });
    failed.attribution.start();
  } catch (error) {
    observedFailure = error;
  } finally {
    restoreProperty(Map.prototype, 'clear', mapClearDescriptor);
  }
  t.equal(observedFailure, activationFailure,
    'hook activation failure reaches the caller through captured rollback');
  t.equal(hookDisabled, true,
    'failed activation disables any partially enabled hook');

  failed.setNow(6);
  t.doesNotThrow(() => failed.attribution.start(),
    'the same instance can retry after complete activation rollback');
  failed.setNow(7);
  const retrySnapshot = failed.attribution.stop();
  t.equal(
    ownerRow(retrySnapshot, FORMATION_OWNER.READINESS).durationUs,
    0,
    'retry contains no owner duration from the failed activation',
  );
  t.equal(retrySnapshot.windowDurationUs, 1,
    'retry starts a fresh accounting window');
  t.end();
});

test('formation attribution instances refuse stale stop-start replay', (t) => {
  const harness = createHarness();
  harness.attribution.start();
  harness.setNow(1);
  harness.attribution.stop();

  t.throws(
    () => harness.attribution.start(),
    /instances are one-shot/,
    'a completed window cannot replay stale accounting',
  );
  t.equal(harness.enabled(), false,
    'refused restart leaves the async hook disabled');
  t.end();
});

test('formation attribution propagation counterexamples are red on revert',
  async (t) => {
    const triggerFallback = `    const contextualOwner = this.context.getStore();
    const owner = contextualOwner ||
      this.asyncOwners.get(_triggerAsyncId);`;
    const contextOnly =
      '    const owner = this.context.getStore();';
    const triggerFallbackModule = await loadMutatedAttribution(triggerFallback);
    const leakedCaller = await measureAwaitingCaller(
      triggerFallbackModule.FormationTurnAttribution,
    );
    t.not(ownerRow(leakedCaller, FORMATION_OWNER.READINESS).durationUs, 25,
      'restoring trigger fallback leaks ownership into the awaiting caller');
    t.not(leakedCaller.unattributedDurationUs, 5,
      'trigger fallback destroys the expected unattributed caller segment');

    const contextOnlyModule = await loadMutatedAttribution(contextOnly);
    const retaggedGeneration = await measureReleasedGenerations(
      contextOnlyModule.FormationTurnAttribution,
    );
    t.not(ownerRow(retaggedGeneration, FORMATION_OWNER.BOOTSTRAP).durationUs, 0,
      'restoring context-only propagation retags a released generation');
    t.not(retaggedGeneration.unattributedDurationUs, 30,
      'context-only propagation destroys the released partition');
    t.end();
  });
