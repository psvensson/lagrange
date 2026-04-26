export function registerLoadGeneratorTailTests({
  test,
  assert,
  LoadGenerator,
  LoadRun,
  createMockNode,
  createNodeInFlightTokens,
  ZERO,
  ONE,
  CANCEL_DISPATCH_SETTLE_MS,
  CANCEL_WAIT_TIMEOUT_MS,
  ADMISSION_BACKOFF_MS,
  BREAKER_OWNER_NODE_CLIENT,
  NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
  NODE_CLIENT_ERROR_CODE_OPERATION,
  SLOT_STALLED_QUERY_TIMEOUT_MS,
  SLOT_STALLED_MAX_IN_FLIGHT,
  SLOT_STALLED_NODE_MAX_IN_FLIGHT,
  SLOT_STALLED_OPERATION,
  SLOT_STALLED_STARTED_AT_OFFSET_MS,
  SLOT_STALLED_FRESH_STARTED_AT_OFFSET_MS,
  SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
  SLOT_STALLED_EXPECTED_DISPATCH_NODE_IDS,
  SLOT_STALLED_EXPECTED_EMPTY_CANDIDATE_IDS,
}) {
  test('wait-reason metrics capture per-node slot saturation', async () => {
    const nodes = [{
      id: 'slot-bound-node',
      async query(_sql) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {rows: []};
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 220,
      maxInFlight: 4,
      nodeMaxInFlight: ONE,
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      run.cancel();
      const metrics = await run.waitComplete();
      assert.ok(metrics.waitReasons, 'expected waitReasons metrics to be present');
      assert.ok(
        Number(metrics.waitReasons.nodeSlotUnavailable) > ZERO,
        'expected nodeSlotUnavailable wait reason to be recorded',
      );
      assert.ok(
        metrics.perNode['slot-bound-node'].waitReasons,
        'expected per-node waitReasons to be present',
      );
      assert.ok(
        Number(
          metrics.perNode['slot-bound-node'].waitReasons.nodeSlotUnavailable,
        ) > ZERO,
        'expected per-node nodeSlotUnavailable wait reason to be recorded',
      );
    } finally {
      run.cancel();
    }
  });

  test('wait-reason metrics capture retryable control-plane pressure', async () => {
    const nodes = [{
      id: 'pressure-node',
      breakerOwner: BREAKER_OWNER_NODE_CLIENT,
      async query(_sql) {
        const error = new Error(
          'Distributed operation failed due to participant failures',
        );
        error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
        error.deferRetry = true;
        error.retryAfterMs = 125;
        throw error;
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(metrics.waitReasons, 'expected waitReasons metrics to be present');
      assert.ok(
        Number(metrics.waitReasons.retryableControlPlanePressure) > ZERO,
        'expected retryable control-plane pressure wait reason to be recorded',
      );
      assert.ok(
        metrics.perNode['pressure-node'].waitReasons,
        'expected per-node waitReasons to be present',
      );
      assert.ok(
        Number(
          metrics.perNode['pressure-node'].waitReasons.retryableControlPlanePressure,
        ) > ZERO,
        'expected per-node retryable control-plane pressure to be recorded',
      );
    } finally {
      run.cancel();
    }
  });

  test('timeout-shaped node failures back off reprobes using query timeout', async () => {
    let timedOutNodeCalls = ZERO;
    let healthyNodeCalls = ZERO;
    const nodes = [
      {
        id: 'timed-out-node',
        async queryWithTimeout(_sql, _params, options = {}) {
          timedOutNodeCalls++;
          const timeoutMs = Number(options.timeoutMs || 75);
          await new Promise((resolve) => setTimeout(resolve, 5));
          const error = new Error(
            'Admin API query timed out for node timed-out-node on lane load ' +
              `after ${timeoutMs}ms`,
          );
          error.code = 'query_timeout';
          throw error;
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          healthyNodeCalls++;
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 180,
      admissionBackoffMs: 5,
      queryTimeoutMs: 80,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(
        healthyNodeCalls > ZERO,
        'expected healthy node to continue absorbing load',
      );
      assert.ok(
        timedOutNodeCalls < 6,
        'expected timeout-shaped node failures to suppress reprobe storms; got ' +
          `${timedOutNodeCalls} timed-out-node attempts`,
      );
      assert.ok(
        Number(metrics?.waitReasons?.timeoutWaits || ZERO) > ZERO,
        'expected timeout wait reasons to be recorded',
      );
    } finally {
      run.cancel();
    }
  });

  test('queue-delay metrics are emitted when dispatch pacing falls behind', async () => {
    const nodes = [{
      id: 'slow-node',
      async query(_sql) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {rows: []};
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 220,
      maxInFlight: ONE,
      nodeMaxInFlight: ONE,
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      run.cancel();
      const metrics = await run.waitComplete();
      assert.ok(metrics.queueDelay, 'expected queueDelay metrics to be present');
      assert.ok(
        Number(metrics.queueDelay.avg) >= ZERO,
        'expected queueDelay.avg to be numeric',
      );
      assert.ok(
        Number(metrics.queueDelay.max) >= Number(metrics.queueDelay.p99),
        'expected queueDelay max to be >= p99',
      );
    } finally {
      run.cancel();
    }
  });

  test('dispatch accounting balances target, dispatched, and undispatched operations',
    async () => {
      const nodes = [{
        id: 'slow-node',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {rows: []};
        },
      }];

      const gen = new LoadGenerator(nodes, {
        opsPerSec: 200,
        duration: 220,
        maxInFlight: ONE,
        nodeMaxInFlight: ONE,
      });
      const run = gen.start();
      try {
        await new Promise((resolve) => setTimeout(resolve, 160));
        run.cancel();
        const metrics = await run.waitComplete();
        assert.strictEqual(typeof metrics.targetOperations, 'number');
        assert.strictEqual(typeof metrics.dispatchedOperations, 'number');
        assert.strictEqual(typeof metrics.undispatchedOperations, 'number');
        assert.strictEqual(
          metrics.dispatchedOperations + metrics.undispatchedOperations,
          metrics.targetOperations,
        );
      } finally {
        run.cancel();
      }
    });

  test('dispatched operations only count work that reached a node attempt', async () => {
    let breakerCalls = ZERO;
    let slowNodeCalls = ZERO;
    const nodes = [
      {
        id: 'node-client-breaker',
        breakerOwner: BREAKER_OWNER_NODE_CLIENT,
        async query(_sql) {
          breakerCalls++;
          const error = new Error('circuit breaker is open');
          error.code = NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN;
          throw error;
        },
      },
      {
        id: 'slow-node',
        async query(_sql) {
          slowNodeCalls++;
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 400,
      duration: 220,
      maxInFlight: 20,
      nodeMaxInFlight: ONE,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      run.cancel();
      const metrics = await run.waitComplete();
      const attemptedNodeDispatches = Object.values(metrics.perNode || {})
        .reduce((sum, nodeMetrics) => sum + Number(nodeMetrics?.dispatched || ZERO), ZERO);
      assert.ok(
        attemptedNodeDispatches > ZERO,
        'expected at least one real node dispatch attempt',
      );
      assert.ok(
        metrics.dispatchedOperations <= attemptedNodeDispatches,
        'expected dispatched operation accounting to reflect only real node attempts',
      );
      assert.ok(
        breakerCalls > ZERO || slowNodeCalls > ZERO,
        'expected the scenario to exercise node dispatch paths',
      );
    } finally {
      run.cancel();
    }
  });

  test('undispatched reason classes are populated when dispatch falls behind',
    async () => {
      const nodes = [{
        id: 'slow-node',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {rows: []};
        },
      }];

      const gen = new LoadGenerator(nodes, {
        opsPerSec: 200,
        duration: 220,
        maxInFlight: ONE,
        nodeMaxInFlight: ONE,
      });
      const run = gen.start();
      try {
        await new Promise((resolve) => setTimeout(resolve, 160));
        const metrics = run.getMetrics();
        assert.ok(metrics.undispatchedByReason);
        assert.strictEqual(typeof metrics.undispatchedByReason.capacity, 'number');
        assert.ok(
          metrics.undispatchedByReason.capacity > ZERO,
          'expected capacity reason class to account for undispatched operations',
        );
      } finally {
        run.cancel();
        await run.waitComplete();
      }
    });

  test('bounded queue emits stable queueFull reject reason when early reject is enabled',
    async () => {
      const nodes = [{
        id: 'slow-node',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {rows: []};
        },
      }];

      const gen = new LoadGenerator(nodes, {
        opsPerSec: 300,
        duration: 220,
        maxInFlight: ONE,
        nodeMaxInFlight: ONE,
        maxPendingQueueDepth: ZERO,
        earlyRejectOnQueueFull: true,
      });
      const run = gen.start();
      try {
        await new Promise((resolve) => setTimeout(resolve, 160));
        run.cancel();
        const metrics = await run.waitComplete();
        assert.ok(metrics.rejectedByReason);
        assert.strictEqual(
          typeof metrics.rejectedByReason.queueFull,
          'number',
        );
        assert.ok(
          metrics.rejectedByReason.queueFull > ZERO,
          'expected queueFull rejects when bounded queue is saturated',
        );
      } finally {
        run.cancel();
      }
    });

  test('admission-aware scheduling sheds queued work instead of leaving a ' +
    'duration-timeout backlog under sustained admission pressure',
  async () => {
    const nodes = [
      {
        id: 'blocked-node',
        async query(_sql) {
          const error = new Error('query_admission_deferred');
          error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
          error.deferRetry = true;
          error.retryAfterMs = 50;
          throw error;
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 500,
      duration: 220,
      maxInFlight: 4,
      nodeMaxInFlight: 2,
      admissionBackoffMs: 10,
      admissionAwareScheduling: true,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(
        Number(metrics?.waitReasons?.nodeAdmissionBlocked || ZERO) > ZERO,
        'expected admission pressure to be observed',
      );
      assert.ok(
        Number(metrics?.rejectedByReason?.flowControl || ZERO) > ZERO,
        'expected admission-aware scheduling to shed excess queued work',
      );
      assert.ok(
        Number(metrics?.undispatchedByReason?.durationTimeout || ZERO) <
          Number(metrics?.rejectedByReason?.flowControl || ZERO),
        'flow-controlled shedding should dominate any residual duration-timeout backlog',
      );
    } finally {
      run.cancel();
    }
  });

  test('load path uses queryWithTimeout when node supports timeout-aware query',
    async () => {
      const capturedTimeouts = [];
      const nodes = [{
        id: 'n1',
        async queryWithTimeout(_sql, _params, options = {}) {
          capturedTimeouts.push(options.timeoutMs);
          return {rows: []};
        },
        async query(_sql) {
          throw new Error('query() should not be used when queryWithTimeout exists');
        },
      }];
      const gen = new LoadGenerator(nodes, {
        opsPerSec: 80,
        duration: 100,
        queryTimeoutMs: 321,
      });
      const run = gen.start();
      try {
        await run.waitComplete();
        assert.ok(
          capturedTimeouts.length > ZERO,
          'expected at least one timeout-aware load query',
        );
        assert.ok(
          capturedTimeouts.every((timeoutMs) => timeoutMs === 321),
          'expected all timeout-aware queries to use configured timeout',
        );
      } finally {
        run.cancel();
      }
    });

  test('per-node in-flight bulkhead limits stalled node fanout', async () => {
    let stalledCalls = ZERO;
    let healthyCalls = ZERO;
    const nodes = [
      {
        id: 'stalled-node',
        async query(_sql) {
          stalledCalls++;
          return new Promise(() => {});
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          healthyCalls++;
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 500,
      duration: 200,
      maxInFlight: 20,
      nodeMaxInFlight: 2,
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      run.cancel();
      await run.waitComplete();
      assert.ok(
        stalledCalls <= 2,
        `expected stalled node calls <= 2, got ${stalledCalls}`,
      );
      assert.ok(
        healthyCalls > stalledCalls,
        'expected healthy node to receive more traffic once stalled node bulkhead is full',
      );
    } finally {
      run.cancel();
    }
  });

  test('slot-stalled nodes stop contributing dispatch-capacity budget', async () => {
    const nodes = [
      createMockNode('stalled-a'),
      createMockNode('stalled-b'),
      createMockNode('stalled-c'),
      createMockNode('healthy-a'),
      createMockNode('healthy-b'),
    ];
    const run = new LoadRun(nodes, {
      opsPerSec: 100,
      durationMs: 1000,
      operations: [SLOT_STALLED_OPERATION],
      maxInFlight: SLOT_STALLED_MAX_IN_FLIGHT,
      nodeMaxInFlight: SLOT_STALLED_NODE_MAX_IN_FLIGHT,
      queryTimeoutMs: SLOT_STALLED_QUERY_TIMEOUT_MS,
    });
    const nowMs = Date.now();
    const stalledStartedAtMs = nowMs - SLOT_STALLED_STARTED_AT_OFFSET_MS;
    run._nodeInFlightTokensByKey = new Map([
      [
        'node-stalled-a',
        createNodeInFlightTokens(
          1,
          SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
          stalledStartedAtMs,
        ),
      ],
      [
        'node-stalled-b',
        createNodeInFlightTokens(
          11,
          SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
          stalledStartedAtMs,
        ),
      ],
      [
        'node-stalled-c',
        createNodeInFlightTokens(
          21,
          SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
          stalledStartedAtMs,
        ),
      ],
    ]);
    run._nodeInFlightByKey.set(
      'node-stalled-a',
      SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
    );
    run._nodeInFlightByKey.set(
      'node-stalled-b',
      SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
    );
    run._nodeInFlightByKey.set(
      'node-stalled-c',
      SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
    );

    const effectiveNodeMaxInFlight = run._resolveEffectiveNodeMaxInFlight(nowMs);

    assert.equal(
      effectiveNodeMaxInFlight,
      SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
      'healthy nodes should borrow slot budget once peer nodes are slot-stalled',
    );
    assert.deepEqual(
      run._buildAvailableNodeCandidates(nowMs).map((candidate) => candidate.node.id),
      SLOT_STALLED_EXPECTED_DISPATCH_NODE_IDS,
      'slot-stalled nodes should be excluded from dispatch candidates ' +
        'while healthy peers borrow their budget',
    );
    await Promise.resolve();
  });

  test('slot-stalled nodes do not re-enter through recovery fallback once healthy peers exhaust borrowed budget',
    async () => {
      const nodes = [
        createMockNode('stalled-a'),
        createMockNode('stalled-b'),
        createMockNode('stalled-c'),
        createMockNode('healthy-a'),
        createMockNode('healthy-b'),
      ];
      const run = new LoadRun(nodes, {
        opsPerSec: 100,
        durationMs: 1000,
        operations: [SLOT_STALLED_OPERATION],
        maxInFlight: SLOT_STALLED_MAX_IN_FLIGHT,
        nodeMaxInFlight: SLOT_STALLED_NODE_MAX_IN_FLIGHT,
        queryTimeoutMs: SLOT_STALLED_QUERY_TIMEOUT_MS,
      });
      const nowMs = Date.now();
      const stalledStartedAtMs = nowMs - SLOT_STALLED_STARTED_AT_OFFSET_MS;
      const freshStartedAtMs = nowMs - SLOT_STALLED_FRESH_STARTED_AT_OFFSET_MS;
      run._nodeInFlightTokensByKey = new Map([
        [
          'node-stalled-a',
          createNodeInFlightTokens(
            1,
            SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
            stalledStartedAtMs,
          ),
        ],
        [
          'node-stalled-b',
          createNodeInFlightTokens(
            11,
            SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
            stalledStartedAtMs,
          ),
        ],
        [
          'node-stalled-c',
          createNodeInFlightTokens(
            21,
            SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
            stalledStartedAtMs,
          ),
        ],
        [
          'node-healthy-a',
          createNodeInFlightTokens(
            7,
            SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
            freshStartedAtMs,
          ),
        ],
        [
          'node-healthy-b',
          createNodeInFlightTokens(
            17,
            SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
            freshStartedAtMs,
          ),
        ],
      ]);
      run._nodeInFlightByKey.set(
        'node-stalled-a',
        SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
      );
      run._nodeInFlightByKey.set(
        'node-stalled-b',
        SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
      );
      run._nodeInFlightByKey.set(
        'node-stalled-c',
        SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
      );
      run._nodeInFlightByKey.set(
        'node-healthy-a',
        SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
      );
      run._nodeInFlightByKey.set(
        'node-healthy-b',
        SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
      );

      assert.equal(
        run._resolveEffectiveNodeMaxInFlight(nowMs),
        SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
        'healthy nodes should still own the borrowed budget when stalled peers ' +
          'have dropped out of capacity contribution',
      );
      assert.deepEqual(
        run._buildAvailableNodeCandidates(nowMs)
          .map((candidate) => candidate.node.id),
        SLOT_STALLED_EXPECTED_EMPTY_CANDIDATE_IDS,
        'healthy nodes at the borrowed cap should leave no dispatch-ready nodes',
      );
      assert.deepEqual(
        run._buildRecoveryNodeCandidate(nowMs)
          .map((candidate) => candidate.node.id),
        SLOT_STALLED_EXPECTED_EMPTY_CANDIDATE_IDS,
        'slot-stalled nodes must not re-enter through the recovery fallback',
      );
    });

  test('dispatch-ready nodes reuse blocked-node slot budget under admission pressure',
    async () => {
      let blockedCalls = ZERO;
      const nodes = [
        {
          id: 'blocked-node',
          breakerOwner: BREAKER_OWNER_NODE_CLIENT,
          async query(_sql) {
            blockedCalls++;
            const error = new Error('query_admission_deferred');
            error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
            error.deferRetry = true;
            error.retryAfterMs = 500;
            throw error;
          },
        },
        {
          id: 'healthy-a',
          async query(_sql) {
            return new Promise(() => {});
          },
        },
        {
          id: 'healthy-b',
          async query(_sql) {
            return new Promise(() => {});
          },
        },
      ];

      const gen = new LoadGenerator(nodes, {
        opsPerSec: 600,
        duration: 1000,
        maxInFlight: 12,
        nodeMaxInFlight: 2,
        admissionBackoffMs: 10,
      });
      const run = gen.start();
      try {
        await new Promise((resolve) => setTimeout(resolve, 120));
        run.cancel();
        const metrics = await run.waitComplete();
        const healthyDispatched =
          Number(metrics?.perNode?.['healthy-a']?.dispatched || ZERO) +
          Number(metrics?.perNode?.['healthy-b']?.dispatched || ZERO);
        assert.ok(
          healthyDispatched >= 8,
          'expected dispatch-ready nodes to borrow blocked-node budget; ' +
            `healthyDispatched=${healthyDispatched}`,
        );
        assert.ok(
          Number(metrics?.perNode?.['blocked-node']?.admissionSignals || ZERO) > ZERO,
          'expected blocked node to emit admission signals',
        );
        assert.ok(
          blockedCalls <= 2,
          `expected retry-after backoff to suppress blocked node reprobes, got ${blockedCalls}`,
        );
      } finally {
        run.cancel();
      }
    });

  test('adaptive dispatch guardrail reduces effective dispatch pressure during sustained admission stress',
    async () => {
      const nodes = [
        {
          id: 'guardrail-blocked-node',
          breakerOwner: BREAKER_OWNER_NODE_CLIENT,
          async query(_sql) {
            const error = new Error('query_admission_deferred');
            error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
            error.deferRetry = true;
            error.retryAfterMs = 200;
            throw error;
          },
        },
        {
          id: 'guardrail-healthy-node',
          async query(_sql) {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return {rows: []};
          },
        },
      ];

      const configuredMaxInFlight = 16;
      const gen = new LoadGenerator(nodes, {
        opsPerSec: 700,
        duration: 260,
        maxInFlight: configuredMaxInFlight,
        nodeMaxInFlight: 8,
        admissionBackoffMs: 10,
        adaptiveDispatchGuardrail: {
          enabled: true,
          pressureSignalThreshold: 2,
          queueDepthThreshold: 4,
          reductionStepRatio: 0.25,
          minMaxInFlight: 4,
          recoveryQuietTicks: 4,
        },
      });
      const run = gen.start();
      try {
        await new Promise((resolve) => setTimeout(resolve, 160));
        run.cancel();
        const metrics = await run.waitComplete();
        assert.ok(
          Number(metrics?.waitReasons?.nodeAdmissionBlocked || ZERO) > ZERO,
          'expected sustained admission stress to be observed',
        );
        assert.ok(
          metrics.dispatchGuardrail,
          'expected dispatch guardrail diagnostics to be present',
        );
        assert.ok(
          Number(metrics.dispatchGuardrail.engagedTransitions || ZERO) > ZERO,
          'expected adaptive guardrail to engage under sustained admission stress',
        );
        assert.ok(
          Number(metrics.dispatchGuardrail.minEffectiveMaxInFlight || configuredMaxInFlight) <
            configuredMaxInFlight,
          'expected guardrail to reduce effective dispatch pressure below configured maxInFlight',
        );
        assert.ok(
          Number(
            metrics.dispatchGuardrail.maxEffectiveDispatchIntervalMs ||
              metrics.dispatchGuardrail.configuredDispatchIntervalMs ||
              ZERO,
          ) >
            Number(metrics.dispatchGuardrail.configuredDispatchIntervalMs || ZERO),
          'expected guardrail to stretch dispatch pacing under sustained admission stress',
        );
      } finally {
        run.cancel();
      }
    });

  test('adaptive dispatch guardrail preserves healthy-node slot budget when ' +
    'only one node is admission-blocked',
  async () => {
    const nodes = [
      {
        id: 'isolated-blocked-node',
        breakerOwner: BREAKER_OWNER_NODE_CLIENT,
        async query(_sql) {
          const error = new Error('query_admission_deferred');
          error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
          error.deferRetry = true;
          error.retryAfterMs = 200;
          throw error;
        },
      },
      {
        id: 'healthy-node-a',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {rows: []};
        },
      },
      {
        id: 'healthy-node-b',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {rows: []};
        },
      },
      {
        id: 'healthy-node-c',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {rows: []};
        },
      },
      {
        id: 'healthy-node-d',
        async query(_sql) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {rows: []};
        },
      },
    ];

    const configuredMaxInFlight = 20;
    const configuredNodeMaxInFlight = 4;
    const dispatchReadyNodeCount = 4;
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 900,
      duration: 260,
      maxInFlight: configuredMaxInFlight,
      nodeMaxInFlight: configuredNodeMaxInFlight,
      admissionBackoffMs: 10,
      adaptiveDispatchGuardrail: {
        enabled: true,
        pressureSignalThreshold: 2,
        queueDepthThreshold: 4,
        reductionStepRatio: 0.25,
        minMaxInFlight: 2,
        recoveryQuietTicks: 4,
      },
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      run.cancel();
      const metrics = await run.waitComplete();
      assert.ok(
        Number(metrics?.waitReasons?.nodeAdmissionBlocked || ZERO) > ZERO,
        'expected isolated admission stress to be observed',
      );
      assert.ok(
        metrics.dispatchGuardrail,
        'expected dispatch guardrail diagnostics to be present',
      );
      assert.ok(
        Number(metrics.dispatchGuardrail.engagedTransitions || ZERO) > ZERO,
        'expected adaptive guardrail to still observe the blocked node',
      );
      assert.ok(
        Number(
          metrics.dispatchGuardrail.minEffectiveMaxInFlight || ZERO,
        ) >= dispatchReadyNodeCount * configuredNodeMaxInFlight,
        'expected global guardrail to preserve the aggregate slot budget of ' +
            'dispatch-ready nodes instead of collapsing healthy-node throughput',
      );
    } finally {
      run.cancel();
    }
  });

  test('cancel stops the load run immediately', async () => {
    const nodes = [createMockNode('n1')];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 10,
      duration: 5000,
    });
    const run = gen.start();
    try {
      run.cancel();
      const metrics = await run.waitComplete();
      assert.ok(metrics, 'waitComplete should resolve after cancel');
      assert.strictEqual(typeof metrics.total, 'number');
    } finally {
      run.cancel();
    }
  });

  test('cancel resolves waitComplete when in-flight query is stuck', async () => {
    const nodes = [{
      id: 'n1',
      async query(_sql) {
        return new Promise(() => {});
      },
    }];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 100,
      duration: 60000,
      maxInFlight: 1,
    });
    const run = gen.start();
    let timeoutId = null;

    try {
      await new Promise((resolve) => setTimeout(resolve, CANCEL_DISPATCH_SETTLE_MS));
      run.cancel();

      await Promise.race([
        run.waitComplete(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('waitComplete did not resolve after cancel'));
          }, CANCEL_WAIT_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      run.cancel();
    }
  });

  test('configured maxInFlight is forwarded to load run', async () => {
    const nodes = [createMockNode('n1'), createMockNode('n2')];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 20,
      duration: 100,
      maxInFlight: 17,
    });
    const run = gen.start();
    try {
      assert.strictEqual(run._maxInFlight, 17);
      await run.waitComplete();
    } finally {
      run.cancel();
    }
  });

  test('getMetrics returns snapshot with expected shape', async () => {
    const nodes = [createMockNode('n1')];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 10,
      duration: 5000,
    });
    const run = gen.start();
    try {
      const metrics = run.getMetrics();
      assert.strictEqual(typeof metrics.total, 'number');
      assert.strictEqual(typeof metrics.success, 'number');
      assert.strictEqual(typeof metrics.failed, 'number');
      assert.strictEqual(typeof metrics.errors, 'number');
      assert.ok(metrics.latency, 'metrics should have latency');
      assert.strictEqual(typeof metrics.latency.p50, 'number');
      assert.strictEqual(typeof metrics.latency.p95, 'number');
      assert.strictEqual(typeof metrics.latency.p99, 'number');
      assert.strictEqual(typeof metrics.opsPerSec, 'number');
    } finally {
      run.cancel();
    }
  });

  test('tracks acknowledged writes only when explicitly enabled', async () => {
    const nodes = [createMockNode('n1')];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 50,
      duration: 100,
      operations: ['INSERT', 'SELECT'],
      trackAcknowledgedWrites: true,
    });
    const run = gen.start();
    try {
      await run.waitComplete();
      const acknowledgedWrites = run.getAcknowledgedWrites();
      assert.ok(acknowledgedWrites, 'acknowledged writes should be exposed');
      assert.strictEqual(acknowledgedWrites.tableName, 'logs');
      assert.strictEqual(acknowledgedWrites.idColumn, 'log_id');
      assert.strictEqual(acknowledgedWrites.ids.length, 3);
      acknowledgedWrites.ids.forEach((id) => {
        assert.match(id, /^load-/);
      });
    } finally {
      run.cancel();
    }
  });

  test('does not retain acknowledged writes unless tracking is enabled', async () => {
    const nodes = [createMockNode('n1')];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 50,
      duration: 100,
      operations: ['INSERT', 'SELECT'],
    });
    const run = gen.start();
    try {
      await run.waitComplete();
      assert.strictEqual(run.getAcknowledgedWrites(), null);
    } finally {
      run.cancel();
    }
  });
}
