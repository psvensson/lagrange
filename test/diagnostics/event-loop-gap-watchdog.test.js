/**
 * Guard for the event-loop gap watchdog (closure ledger CL-008 next
 * falsification step): it must detect a synchronous loop blockage, attribute
 * tagged sync sections with an exclusive (non-double-counted) total, expose
 * the unexplained remainder, and stay silent while the loop is healthy.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  EventLoopGapWatchdog,
  GapSamplingProfiler,
  SyncSectionRegistry,
  trackSyncSection,
} from '../../src/diagnostics/event-loop-gap-watchdog.js';
import {
  aggregateProfileCallerAttribution,
  aggregateTopInclusiveProfileFrames,
  aggregateTopProfileFrames,
} from '../../src/diagnostics/event-loop-gap-profile-aggregation.js';

function busyWaitMs(durationMs) {
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    // synchronous block
  }
}

function profilerTargetBusyLoop(durationMs) {
  const start = Date.now();
  let accumulator = 0;
  while (Date.now() - start < durationMs) {
    accumulator += Math.sqrt(accumulator + 1);
  }
  return accumulator;
}

test('event loop gap watchdog', async (t) => {
  await t.test('registry accrues exclusive time across nested sections',
    async (t) => {
      const registry = new SyncSectionRegistry();
      const outerToken = registry.enter('outer');
      busyWaitMs(20);
      const innerToken = registry.enter('inner');
      busyWaitMs(20);
      registry.exit('inner', innerToken);
      busyWaitMs(5);
      registry.exit('outer', outerToken);

      const snapshot = registry.snapshot();
      t.ok(
        snapshot.sites.outer.totalMs >= 40,
        `outer inclusive total covers nested time (${snapshot.sites.outer.totalMs}ms)`,
      );
      t.ok(
        snapshot.sites.inner.totalMs >= 15,
        'inner section measured',
      );
      t.ok(
        snapshot.exclusiveTaggedMs >= 40 &&
          snapshot.exclusiveTaggedMs <=
            snapshot.sites.outer.totalMs + 5,
        `exclusive total is the union, not the sum (${snapshot.exclusiveTaggedMs}ms)`,
      );
      t.equal(snapshot.sites.outer.count, 1, 'outer counted once');
    });

  await t.test(
    'detects a blockage, attributes tagged work, reports remainder',
    async (t) => {
      const registry = new SyncSectionRegistry();
      const watchdog = new EventLoopGapWatchdog({
        thresholdMs: 50,
        intervalMs: 10,
        registry,
      });
      const reports = [];
      watchdog.logConsoleOnly = (level, message, context) => {
        if (message === 'Event loop gap detected') {
          reports.push({level, context});
        }
      };
      watchdog.start();
      await new Promise((resolve) => setTimeout(resolve, 30));

      // Tagged blockage (~60ms) plus untagged blockage (~40ms) in one
      // synchronous turn.
      const token = registry.enter('cdc_update_row_fetch');
      busyWaitMs(60);
      registry.exit('cdc_update_row_fetch', token);
      busyWaitMs(40);

      await new Promise((resolve) => setTimeout(resolve, 50));
      watchdog.stop();

      t.ok(reports.length >= 1, `gap reported (${reports.length})`);
      const report = reports[0].context;
      t.ok(report.gapMs >= 80, `gap magnitude captured (${report.gapMs}ms)`);
      const fetchDelta = report.siteDeltas.find(
        (delta) => delta.site === 'cdc_update_row_fetch',
      );
      t.ok(fetchDelta, 'tagged site appears in the report');
      t.ok(
        fetchDelta.totalMs >= 50,
        `tagged time attributed (${fetchDelta.totalMs}ms)`,
      );
      t.ok(
        report.unexplainedMs >= 25,
        `untagged remainder quantified (${report.unexplainedMs}ms)`,
      );
      t.ok(
        report.cumulative.gapCount >= 1,
        'cumulative gap stats carried',
      );
    },
  );

  await t.test('silent while healthy; thresholdMs=0 disables', async (t) => {
    const watchdog = new EventLoopGapWatchdog({
      thresholdMs: 500,
      intervalMs: 10,
    });
    const reports = [];
    watchdog.logConsoleOnly = (_level, message) => {
      if (message === 'Event loop gap detected') {
        reports.push(message);
      }
    };
    watchdog.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    watchdog.stop();
    t.equal(reports.length, 0, 'no reports on a healthy loop');

    const disabled = new EventLoopGapWatchdog({thresholdMs: 0});
    t.equal(disabled.start(), false, 'thresholdMs=0 never starts');
  });

  await t.test('sampling profiler names the blocking function', async (t) => {
    const profiler = new GapSamplingProfiler({
      windowMs: 10,
      samplingIntervalUs: 1000,
    });
    await profiler.start();
    profilerTargetBusyLoop(150);
    const windowReport = await profiler.rotateWindow();
    profiler.stop();

    t.ok(windowReport, 'window report produced');
    t.ok(
      windowReport.totalSamples > 0,
      `samples collected (${windowReport.totalSamples})`,
    );
    const target = windowReport.topFrames.find(
      (frame) => frame.fn === 'profilerTargetBusyLoop',
    );
    t.ok(
      target,
      'blocking function appears in top frames ' +
        `(got ${windowReport.topFrames.map((f) => f.fn).join(', ')})`,
    );
    t.ok(
      target && target.share > 0.3,
      `blocking function dominates the window (share=${target?.share})`,
    );
    const inclusiveTarget = windowReport.topInclusiveFrames.find(
      (frame) => frame.fn === 'profilerTargetBusyLoop',
    );
    t.ok(
      inclusiveTarget && inclusiveTarget.inclusiveShare > 0.3,
      'blocking function ranks by inclusive time ' +
        `(share=${inclusiveTarget?.inclusiveShare})`,
    );
  });

  await t.test('sampling profiler aggregates caller edges and call paths ' +
    'for readiness targets', async (t) => {
    const profiler = new GapSamplingProfiler({samplingIntervalUs: 1000});
    const profile = {
      nodes: [
        {
          id: 1,
          callFrame: {functionName: '(root)', url: '', lineNumber: 0},
          hitCount: 0,
          children: [2],
        },
        {
          id: 2,
          callFrame: {
            functionName: 'resolvePartitionServiceCandidates',
            url: 'file:///app/src/query/query-executor.js',
            lineNumber: 20,
          },
          hitCount: 2,
          children: [3],
        },
        {
          id: 3,
          callFrame: {
            functionName: 'getNodeReadinessSync',
            url: 'file:///app/src/control-plane/readiness.js',
            lineNumber: 30,
          },
          hitCount: 3,
          children: [4],
        },
        {
          id: 4,
          callFrame: {
            functionName: 'executeAuthoritativeOwnerRpcRead',
            url: 'file:///app/src/cdc/owner-rpc.js',
            lineNumber: 40,
          },
          hitCount: 5,
          children: [],
        },
      ],
    };

    const attribution = profiler.aggregateCallerAttribution(profile);

    const ownerRpcEdge = attribution.topCallerEdges.find(
      (edge) => edge.callee.fn === 'executeAuthoritativeOwnerRpcRead',
    );
    t.match(ownerRpcEdge, {
      caller: {fn: 'getNodeReadinessSync'},
      callee: {fn: 'executeAuthoritativeOwnerRpcRead'},
      inclusiveHits: 5,
      inclusiveMs: 5,
    }, 'direct readiness-to-owner-RPC edge carries descendant samples');
    const ownerRpcPath = attribution.topCallPaths.find(
      (path) => path.targetFn === 'executeAuthoritativeOwnerRpcRead',
    );
    t.same(
      ownerRpcPath.frames.map((frame) => frame.fn),
      [
        'resolvePartitionServiceCandidates',
        'getNodeReadinessSync',
        'executeAuthoritativeOwnerRpcRead',
      ],
      'full application caller path names the outer routing caller',
    );
  });

  await t.test('sampling profiler rejects cyclic hostile child graphs',
    async (t) => {
      const profiler = new GapSamplingProfiler({samplingIntervalUs: 1000});
      const cyclicProfile = {
        nodes: [
          {
            id: 1,
            callFrame: {functionName: '(root)', url: '', lineNumber: 0},
            hitCount: 0,
            children: [2],
          },
          {
            id: 2,
            callFrame: {
              functionName: 'getNodeReadinessSync',
              url: 'file:///app/src/control-plane/readiness.js',
              lineNumber: 10,
            },
            hitCount: 2,
            children: [3],
          },
          {
            id: 3,
            callFrame: {
              functionName: 'executeAuthoritativeOwnerRpcRead',
              url: 'file:///app/src/cdc/owner-rpc.js',
              lineNumber: 20,
            },
            hitCount: 3,
            children: [2],
          },
        ],
      };

      const attribution = profiler.aggregateCallerAttribution(cyclicProfile);
      t.same(attribution, {topCallerEdges: [], topCallPaths: []},
        'cyclic graphs fail closed instead of emitting corrupt attribution');
    });

  await t.test('profile canonicalization reads accessors once and ignores ' +
    'mutable intrinsics and exotic primitives', async (t) => {
    const getterReads = {nodes: 0, children: 0, hitCount: 0, callFrame: 0};
    const node = {
      id: 1,
      get children() {
        getterReads.children++;
        return [];
      },
      get hitCount() {
        getterReads.hitCount++;
        return 2;
      },
      get callFrame() {
        getterReads.callFrame++;
        return {
          functionName: 'stableFrame',
          url: 'file:///app/src/stable.js',
          lineNumber: 4,
        };
      },
    };
    const profile = {
      get nodes() {
        getterReads.nodes++;
        return [node];
      },
    };
    const inclusive = aggregateTopInclusiveProfileFrames(profile, {
      samplingIntervalUs: 1000,
      topFrames: 5,
    });
    t.same(getterReads, {nodes: 1, children: 1, hitCount: 1, callFrame: 1},
      'each caller-owned field is captured exactly once per aggregation');
    t.equal(inclusive[0].inclusiveMs, 2,
      'canonical records preserve valid profile timing');

    const originalFinite = Number.isFinite;
    const originalSort = Array.prototype.sort;
    const originalMapGet = Map.prototype.get;
    const originalLastIndexOf = String.prototype.lastIndexOf;
    let hostileResult;
    try {
      Reflect.set(Number, 'isFinite', () => true);
      Reflect.set(Array.prototype, 'sort', () => {
        throw new Error('hostile sort');
      });
      Reflect.set(Map.prototype, 'get', () => {
        throw new Error('hostile map get');
      });
      Reflect.set(String.prototype, 'lastIndexOf', () => {
        throw new Error('hostile string lookup');
      });
      hostileResult = aggregateTopProfileFrames({
        nodes: [
          {
            id: 1,
            children: [],
            hitCount: '0hostile',
            callFrame: {
              functionName: Reflect.construct(String, ['boxed']),
              url: {toString: () => 'hostile'},
              lineNumber: Number.POSITIVE_INFINITY,
            },
          },
          {
            id: 2,
            children: [],
            hitCount: 3,
            callFrame: {
              functionName: 'valid',
              url: 'file:///app/src/valid.js',
              lineNumber: 1,
            },
          },
        ],
      }, {samplingIntervalUs: 1000, topFrames: 5});
    } finally {
      Reflect.set(Number, 'isFinite', originalFinite);
      Reflect.set(Array.prototype, 'sort', originalSort);
      Reflect.set(Map.prototype, 'get', originalMapGet);
      Reflect.set(String.prototype, 'lastIndexOf', originalLastIndexOf);
    }
    t.equal(hostileResult.totalSamples, 3,
      'boxed, coercive, and string numeric inputs fail closed');
    t.match(hostileResult.topFrames, [{fn: 'valid', hits: 3, selfMs: 3}],
      'captured intrinsics produce stable finite numeric diagnostics');
  });

  await t.test('production profile window canonicalizes changing input once',
    async (t) => {
      let nodesReads = 0;
      const profile = {
        get nodes() {
          nodesReads += 1;
          return [{
            id: nodesReads,
            children: [],
            hitCount: nodesReads,
            callFrame: {
              functionName: `frame${nodesReads}`,
              url: 'file:///app/src/changing.js',
              lineNumber: nodesReads,
            },
          }];
        },
      };
      const profiler = new GapSamplingProfiler({samplingIntervalUs: 1000});
      profiler.session = {};
      profiler.windowStartedAtMs = Date.now();
      profiler.post = async (method) => method === 'Profiler.stop' ?
        {profile} : {};

      const window = await profiler.rotateWindow();

      t.equal(nodesReads, 1, 'one production window reads profile nodes once');
      t.equal(window.totalSamples, 1,
        'every projection shares the same canonical sample count');
      t.match(window.topInclusiveFrames, [{fn: 'frame1', inclusiveHits: 1}],
        'inclusive attribution comes from the same canonical profile');
    });

  await t.test('malformed profile identities and parentage fail closed',
    async (t) => {
      const frame = (functionName) => ({
        functionName,
        url: 'file:///app/src/malformed.js',
        lineNumber: 1,
      });
      const malformedProfiles = [
        {
          nodes: [
            {id: 1, children: [2, 2], hitCount: 0, callFrame: frame('root')},
            {id: 2, children: [], hitCount: 3, callFrame: frame('leaf')},
          ],
        },
        {
          nodes: [
            {id: 7, children: [], hitCount: 1, callFrame: frame('first')},
            {id: 7, children: [], hitCount: 2, callFrame: frame('second')},
          ],
        },
        {
          nodes: [
            {id: 1, children: [3], hitCount: 0, callFrame: frame('callerA')},
            {id: 2, children: [3], hitCount: 0, callFrame: frame('callerB')},
            {id: 3, children: [], hitCount: 1,
              callFrame: frame('getNodeReadinessSync')},
          ],
        },
      ];

      for (const profile of malformedProfiles) {
        t.same(aggregateTopInclusiveProfileFrames(profile, {
          samplingIntervalUs: 1000,
          topFrames: 5,
        }), [], 'duplicate identity, edge, or parent emits no attribution');
      }
    });

  await t.test('profile aggregation rejects polluted descriptors, revoked ' +
    'arrays, partial nodes, and frame-key collisions', async (t) => {
    const frame = (functionName, url = 'file:///app/src/integrity.js') => ({
      functionName,
      url,
      lineNumber: 1,
    });
    const originalPrototypeGet = Object.getOwnPropertyDescriptor(
      Object.prototype,
      'get',
    );
    let polluted;
    try {
      Reflect.defineProperty(Object.prototype, 'get', {
        configurable: true,
        value: () => {
          throw new Error('polluted descriptor getter');
        },
      });
      polluted = aggregateTopProfileFrames({
        nodes: [{
          id: 1,
          children: [],
          hitCount: 3,
          callFrame: frame('valid'),
        }],
      }, {samplingIntervalUs: 1000, topFrames: 5});
    } finally {
      if (originalPrototypeGet) {
        Reflect.defineProperty(Object.prototype, 'get', originalPrototypeGet);
      } else {
        Reflect.deleteProperty(Object.prototype, 'get');
      }
    }
    t.equal(polluted.totalSamples, 3,
      'inherited descriptor fields cannot alter valid attribution');

    const revokedNodes = Proxy.revocable([], {});
    revokedNodes.revoke();
    t.doesNotThrow(() => aggregateTopProfileFrames({
      nodes: revokedNodes.proxy,
    }), 'a revoked nodes proxy fails closed without escaping');
    const revokedChildren = Proxy.revocable([], {});
    revokedChildren.revoke();
    t.same(aggregateTopInclusiveProfileFrames({
      nodes: [{
        id: 1,
        children: revokedChildren.proxy,
        hitCount: 1,
        callFrame: frame('revoked-child'),
      }],
    }), [], 'a revoked children proxy rejects the complete graph');

    const trappedRoot = {
      children: [2],
      hitCount: 0,
      callFrame: frame('root'),
    };
    Object.defineProperty(trappedRoot, 'id', {
      enumerable: true,
      get: () => {
        throw new Error('trapped root id');
      },
    });
    t.same(aggregateTopInclusiveProfileFrames({
      nodes: [
        trappedRoot,
        {id: 2, children: [], hitCount: 3, callFrame: frame('child')},
      ],
    }), [], 'one trapped node invalidates the graph instead of promoting children');

    const collision = aggregateTopProfileFrames({
      nodes: [
        {id: 1, children: [], hitCount: 1, callFrame: frame('a@b', 'c')},
        {id: 2, children: [], hitCount: 2, callFrame: frame('a', 'b@c')},
      ],
    }, {samplingIntervalUs: 1000, topFrames: 5});
    t.equal(collision.topFrames.length, 2,
      'length-prefixed frame identities keep delimiter-bearing frames distinct');
    t.same(collision.topFrames.map(({hits}) => hits).sort(), [1, 2],
      'distinct collision candidates retain their own hit counts');
  });

  await t.test('profile aggregation bounds path depth and hostile descriptors',
    async (t) => {
      const chainLength = 70;
      const nodes = Array.from({length: chainLength}, (_unused, index) => ({
        id: index + 1,
        children: index + 1 < chainLength ? [index + 2] : [],
        hitCount: index + 1 === chainLength ? 1 : 0,
        callFrame: {
          functionName: index + 1 === chainLength ?
            'getNodeReadinessSync' : `caller${index}`,
          url: 'file:///app/src/deep.js',
          lineNumber: index,
        },
      }));
      const deep = aggregateProfileCallerAttribution({nodes}, {
        samplingIntervalUs: 1000,
        topFrames: 5,
        maxCallPathDepth: Number.MAX_SAFE_INTEGER,
      });
      t.ok(deep.topCallPaths.every((path) => path.frames.length <= 64),
        'configured call-path depth has a hard ceiling');

      const hostileNodes = new Proxy([], {
        getOwnPropertyDescriptor() {
          throw new Error('hostile descriptor');
        },
      });
      const originalString = globalThis.String;
      try {
        Reflect.set(globalThis, 'String', () => {
          throw new Error('hostile String');
        });
        t.doesNotThrow(() => aggregateTopProfileFrames({nodes: hostileNodes}, {
          samplingIntervalUs: 1000,
          topFrames: 5,
        }), 'descriptor traps fail closed without consulting mutable String');
      } finally {
        Reflect.set(globalThis, 'String', originalString);
      }
    });

  await t.test('profile aggregation rejects the numeric edge lattice and ' +
    'saturates derived arithmetic', async (t) => {
    const invalidNumbers = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      Number.MAX_SAFE_INTEGER + 1,
    ];
    const invalidNumericProfile = {
      nodes: invalidNumbers.map((value, index) => ({
        id: index + 1,
        children: [],
        hitCount: value,
        callFrame: {
          functionName: `invalid${index}`,
          url: 'file:///app/src/numeric.js',
          lineNumber: value,
        },
      })),
    };
    const invalidInclusive = aggregateTopInclusiveProfileFrames(
      invalidNumericProfile,
      {samplingIntervalUs: 1000, topFrames: 10},
    );
    t.ok(invalidInclusive.every((entry) => entry.line === null),
      'non-finite, negative-zero, and unsafe line numbers fail closed');
    t.ok(invalidInclusive.every((entry) =>
      entry.inclusiveHits === 0 && entry.inclusiveMs === 0 &&
        entry.inclusiveShare === 0),
    'invalid hit counts cannot reintroduce unsafe derived values');

    const maximum = Number.MAX_SAFE_INTEGER;
    const saturated = aggregateTopProfileFrames({
      nodes: [
        {id: 1, children: [], hitCount: maximum,
          callFrame: {functionName: 'same', url: '', lineNumber: 1}},
        {id: 2, children: [], hitCount: maximum,
          callFrame: {functionName: 'same', url: '', lineNumber: 1}},
      ],
    }, {samplingIntervalUs: maximum, topFrames: 1});
    t.equal(saturated.totalSamples, maximum,
      'sample totals saturate at the safe-integer ceiling');
    t.match(saturated.topFrames, [{hits: maximum, selfMs: maximum, share: 1}],
      'frame sums, timing, and ratios remain finite and safe');
  });

  await t.test('profile aggregation enforces one total graph-work budget',
    async (t) => {
      const oversizedGraphNodeCount = 450;
      const childIds = Array.from(
        {length: oversizedGraphNodeCount},
        (_unused, index) => index + 1,
      );
      const nodes = Array.from(
        {length: oversizedGraphNodeCount},
        (_unused, index) => ({
          id: index + 1,
          children: childIds,
          hitCount: 1,
          callFrame: {
            functionName: `wide${index}`,
            url: 'file:///app/src/wide.js',
            lineNumber: index,
          },
        }),
      );

      t.same(aggregateTopInclusiveProfileFrames({nodes}, {
        samplingIntervalUs: 1000,
        topFrames: 10,
      }), [], 'aggregate edge work above the global budget fails closed');
    });

  await t.test('profile window remains silent when it contains no gap',
    async (t) => {
      const watchdog = new EventLoopGapWatchdog({
        thresholdMs: 1,
        profileEnabled: false,
      });
      let rotateCount = 0;
      const reports = [];
      watchdog.profiler = {
        rotateWindow: async () => {
          rotateCount += 1;
          return {
            windowMs: 30,
            totalSamples: 1,
            topFrames: [],
            topInclusiveFrames: [],
            topCallerEdges: [{inclusiveMs: 1}],
            topCallPaths: [{inclusiveMs: 1}],
          };
        },
      };
      watchdog.logConsoleOnly = (_level, message, context) => {
        reports.push({message, context});
      };

      watchdog.rotateProfileWindow();
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(rotateCount, 1, 'elapsed profile window still rotates');
      t.equal(reports.length, 0, 'gap-free profile payload is discarded');
    });

  await t.test('trackSyncSection records into the shared registry and ' +
    'propagates return values and exceptions', async (t) => {
    const value = trackSyncSection('test_site', () => 42);
    t.equal(value, 42, 'return value propagated');
    let thrown = null;
    try {
      trackSyncSection('test_site', () => {
        throw new Error('boom');
      });
    } catch (error) {
      thrown = error;
    }
    t.equal(thrown?.message, 'boom', 'exception propagated');
  });
});
