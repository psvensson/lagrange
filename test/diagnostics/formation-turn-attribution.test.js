import {readFileSync} from 'node:fs';

import {test} from '../../src/test-helpers/tap.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
  runFormationOwner,
} from '../../src/diagnostics/formation-turn-attribution.js';

function createHarness(
  extraOptions = {},
  AttributionClass = FormationTurnAttribution,
) {
  let nowUs = 0;
  let callbacks = null;
  let enabled = false;
  const attribution = new AttributionClass({
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

async function loadAttributionWithMutation(target, replacement) {
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
  if (!source.includes(target)) {
    throw new Error('formation attribution mutation target changed');
  }
  const mutated = source
    .replace(importSpecifier, contractDataUrl)
    .replace(target, replacement);
  const moduleUrl = 'data:text/javascript;base64,' +
    Buffer.from(mutated).toString('base64');
  return import(moduleUrl);
}

async function loadMutatedAttribution(replacement) {
  const registrationOwner = `    const owner = this.depth > ZERO ?
      this.activeOwner : this.context.getStore();`;
  return loadAttributionWithMutation(registrationOwner, replacement);
}

function activationRollbackState(attribution) {
  return {
    asyncOwners: attribution.asyncOwners.size,
    ownerDurations: attribution.ownerDurationsUs.size,
    dispatchCounts: attribution.dispatchCounts.size,
    handoffCounts: attribution.handoffCounts.size,
    ownerStack: attribution.ownerStack.length,
    activeOwner: attribution.activeOwner,
    activeSegmentStartedAtUs: attribution.activeSegmentStartedAtUs,
    depth: attribution.depth,
    turnCount: attribution.turnCount,
    windowStartedAtUs: attribution.windowStartedAtUs,
    lastClockUs: attribution.lastClockUs,
    started: attribution.started,
    completed: attribution.completed,
  };
}

function cleanActivationRollbackState() {
  return {
    asyncOwners: 0,
    ownerDurations: 0,
    dispatchCounts: 0,
    handoffCounts: 0,
    ownerStack: 0,
    activeOwner: null,
    activeSegmentStartedAtUs: null,
    depth: 0,
    turnCount: 0,
    windowStartedAtUs: null,
    lastClockUs: null,
    started: false,
    completed: false,
  };
}

function exerciseFailedActivation(attributionModule) {
  const AttributionClass = attributionModule.FormationTurnAttribution;
  const contender = createHarness({}, AttributionClass);
  let activationCallbacks = null;
  let activationCount = 0;
  let hookDisabled = false;
  let contenderError = null;
  let contenderStarted = false;
  const activationFailure = new Error('hook activation failed');
  const failed = createHarness({
    hookFactory: (callbacks) => {
      activationCallbacks = callbacks;
      return {
        disable: () => {
          hookDisabled = true;
          if (activationCount !== 1) return;
          try {
            contender.attribution.start();
            contenderStarted = true;
          } catch (error) {
            contenderError = error;
          }
        },
        enable: () => {
          activationCount += 1;
          if (activationCount !== 1) return;
          activationCallbacks.init(41, 'Immediate', 1);
          activationCallbacks.before(41);
          attributionModule.runFormationOwner(
            FORMATION_OWNER.READINESS,
            () => {
              activationCallbacks.init(42, 'Promise', 41);
              failed.setNow(5);
            },
          );
          throw activationFailure;
        },
      };
    },
  }, AttributionClass);
  let observedFailure = null;
  try {
    failed.attribution.start();
  } catch (error) {
    observedFailure = error;
  }
  const rollbackState = activationRollbackState(failed.attribution);
  if (contenderStarted) {
    contender.setNow(1);
    contender.attribution.stop();
  }
  return {
    activationFailure,
    contender,
    contenderError,
    contenderStarted,
    failed,
    hookDisabled,
    observedFailure,
    rollbackState,
  };
}

function exerciseReentrantStopDisable(attributionModule) {
  const AttributionClass = attributionModule.FormationTurnAttribution;
  const contender = createHarness({}, AttributionClass);
  let contenderError = null;
  let contenderStarted = false;
  const first = createHarness({
    hookFactory: () => ({
      disable: () => {
        try {
          contender.attribution.start();
          contenderStarted = true;
        } catch (error) {
          contenderError = error;
        }
      },
      enable: () => {},
    }),
  }, AttributionClass);
  first.attribution.start();
  first.setNow(1);
  const snapshot = first.attribution.stop();
  if (contenderStarted) {
    contender.setNow(1);
    contender.attribution.stop();
  }
  return {contender, contenderError, contenderStarted, snapshot};
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
  let terminalNowUs = 0;
  const invalidStop = createHarness({
    clock: () => terminalNowUs,
  });
  invalidStop.attribution.start();
  invalidStop.callbacks().init(51, 'Immediate', 1);
  invalidStop.callbacks().before(51);
  invalidStop.attribution.run(FORMATION_OWNER.READINESS, () => {
    invalidStop.callbacks().init(52, 'Promise', 51);
    terminalNowUs = 5;
  });
  terminalNowUs = Number.NaN;
  t.throws(
    () => invalidStop.attribution.stop(),
    /clock must return a non-negative safe integer/,
    'an invalid stop clock cannot enter a snapshot',
  );
  t.same(
    activationRollbackState(invalidStop.attribution),
    {...cleanActivationRollbackState(), completed: true},
    'failed snapshot clears every retained owner, counter, stack, and clock',
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

  const disableFailure = new Error('hook disable failed');
  let disableNowUs = 0;
  const failedDisable = createHarness({
    clock: () => disableNowUs,
    hookFactory: (callbacks) => ({
      disable: () => {
        throw disableFailure;
      },
      enable: () => {
        callbacks.init(53, 'Immediate', 1);
        callbacks.before(53);
      },
    }),
  });
  failedDisable.attribution.start();
  disableNowUs = 5;
  let observedDisableFailure = null;
  try {
    failedDisable.attribution.stop();
  } catch (error) {
    observedDisableFailure = error;
  }
  t.equal(observedDisableFailure, disableFailure,
    'hook disable failure reaches the caller');
  t.same(
    activationRollbackState(failedDisable.attribution),
    {...cleanActivationRollbackState(), completed: true},
    'failed hook disable clears the complete retained window state',
  );
  t.equal(
    runFormationOwner(FORMATION_OWNER.READINESS, () => 'released'),
    'released',
    'failed hook disable still releases the public owner wrapper',
  );
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

test('clock observation cannot reentrantly steal the active window', (t) => {
  const contender = createHarness();
  const clockFailure = new Error('clock observation failed');
  let contenderError = null;
  let clockReads = 0;
  let nowUs = 0;
  const first = createHarness({
    clock: () => {
      clockReads += 1;
      if (clockReads === 1) {
        try {
          contender.attribution.start();
        } catch (error) {
          contenderError = error;
        }
        throw clockFailure;
      }
      return nowUs;
    },
  });
  let observedFailure = null;
  try {
    first.attribution.start();
  } catch (error) {
    observedFailure = error;
  }

  t.equal(observedFailure, clockFailure,
    'the injected clock failure reaches the caller');
  t.match(contenderError?.message, /already has an active window/,
    'singleton ownership is claimed before observing the injected clock');
  t.equal(contender.attribution.started, false,
    'the reentrant clock contender never starts');
  t.equal(first.enabled(), false,
    'clock failure runs the same hook-disable transaction as activation');
  t.same(
    activationRollbackState(first.attribution),
    cleanActivationRollbackState(),
    'clock failure resets the complete provisional window before release',
  );

  nowUs = 6;
  t.doesNotThrow(() => first.attribution.start(),
    'the same instance can retry after clock rollback');
  nowUs = 7;
  const retrySnapshot = first.attribution.stop();
  t.equal(retrySnapshot.windowDurationUs, 1,
    'clock retry starts a fresh accounting window');
  t.end();
});

test('failed hook activation rolls back the singleton claim', (t) => {
  const mapClearDescriptor =
    Object.getOwnPropertyDescriptor(Map.prototype, 'clear');
  let result = null;
  try {
    replaceWritableProperty(Map.prototype, 'clear', () => {
      throw new Error('hostile Map.prototype.clear executed');
    });
    result = exerciseFailedActivation({
      FormationTurnAttribution,
      runFormationOwner,
    });
  } finally {
    restoreProperty(Map.prototype, 'clear', mapClearDescriptor);
  }
  t.equal(result.observedFailure, result.activationFailure,
    'hook activation failure reaches the caller through captured rollback');
  t.equal(result.hookDisabled, true,
    'failed activation disables any partially enabled hook');
  t.match(result.contenderError?.message, /already has an active window/,
    'the singleton stays claimed throughout hook disable and reset');
  t.equal(result.contenderStarted, false,
    'the rollback contender cannot start before singleton release');
  t.equal(result.contender.enabled(), false,
    'the refused rollback contender never enables its hook');
  t.same(
    result.rollbackState,
    cleanActivationRollbackState(),
    'every async owner, counter, map, stack, segment, and clock is reset',
  );

  result.failed.setNow(6);
  t.doesNotThrow(() => result.failed.attribution.start(),
    'the same instance can retry after complete activation rollback');
  result.failed.setNow(7);
  const retrySnapshot = result.failed.attribution.stop();
  t.equal(
    ownerRow(retrySnapshot, FORMATION_OWNER.READINESS).durationUs,
    0,
    'retry contains no owner duration from the failed activation',
  );
  t.equal(retrySnapshot.windowDurationUs, 1,
    'retry starts a fresh accounting window');
  t.equal(retrySnapshot.turnCount, 0,
    'retry contains no dispatch count from the failed activation');
  t.equal(
    retrySnapshot.owners.some((row) =>
      row.durationUs !== 0 || row.dispatchCount !== 0 ||
      row.handoffCount !== 0),
    false,
    'retry contains no stale duration, dispatch, or handoff accounting',
  );
  t.end();
});

test('activation rollback cleanup and claim order are red on revert',
  async (t) => {
    const resetCall = '        resetWindowAccounting(this);';
    const incompleteResetModule = await loadAttributionWithMutation(
      resetCall,
      '        mapClear(this.ownerDurationsUs);',
    );
    const incompleteReset = exerciseFailedActivation(incompleteResetModule);
    t.notSame(
      incompleteReset.rollbackState,
      cleanActivationRollbackState(),
      'removing complete reset leaves provisional activation state visible',
    );
    t.ok(incompleteReset.rollbackState.asyncOwners > 0,
      'the incomplete-reset control retains scheduled async ownership');
    t.ok(incompleteReset.rollbackState.depth > 0,
      'the incomplete-reset control retains an active dispatch segment');

    const rollbackBlock = `      try {
        this.hook.disable();
      } finally {
        resetWindowAccounting(this);
        if (activeAttribution === this) activeAttribution = null;
      }`;
    const releaseBeforeDisable = `      if (activeAttribution === this) {
        activeAttribution = null;
      }
      try {
        this.hook.disable();
      } finally {
        resetWindowAccounting(this);
      }`;
    const earlyReleaseModule = await loadAttributionWithMutation(
      rollbackBlock,
      releaseBeforeDisable,
    );
    const earlyRelease = exerciseFailedActivation(earlyReleaseModule);
    t.equal(earlyRelease.contenderStarted, true,
      'releasing before disable lets the rollback contender start');
    t.equal(earlyRelease.contenderError, null,
      'the early-release control loses the exclusive-window refusal');
    t.end();
  });

test('stop keeps the singleton claimed through hook disable and is red on revert',
  async (t) => {
    const current = exerciseReentrantStopDisable({
      FormationTurnAttribution,
    });
    t.match(current.contenderError?.message, /already has an active window/,
      'normal stop refuses a contender until hook disable returns');
    t.equal(current.contenderStarted, false,
      'normal stop does not overlap enabled attribution windows');
    t.equal(current.contender.enabled(), false,
      'the refused stop contender never enables its hook');
    t.equal(current.snapshot.windowDurationUs, 1,
      'exclusive disable ordering preserves the successful snapshot');

    const exclusiveStopBlock = `    } finally {
      this.started = false;
      this.completed = true;
      let hookDisabled = false;
      try {
        this.hook.disable();
        hookDisabled = true;
      } finally {
        if (!snapshotReady || !hookDisabled) resetWindowAccounting(this);
        if (activeAttribution === this) activeAttribution = null;
      }
    }`;
    const earlyReleaseStopBlock = `    } finally {
      this.started = false;
      this.completed = true;
      if (activeAttribution === this) activeAttribution = null;
      let hookDisabled = false;
      try {
        this.hook.disable();
        hookDisabled = true;
      } finally {
        if (!snapshotReady || !hookDisabled) resetWindowAccounting(this);
      }
    }`;
    const earlyReleaseModule = await loadAttributionWithMutation(
      exclusiveStopBlock,
      earlyReleaseStopBlock,
    );
    const reverted = exerciseReentrantStopDisable(earlyReleaseModule);
    t.equal(reverted.contenderStarted, true,
      'releasing before hook disable lets a second enabled window overlap');
    t.equal(reverted.contenderError, null,
      'the early-release stop control loses the singleton refusal');
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
