/**
 * Unit tests for runtime.run entrypoint.
 *
 * Requirements: 4.1, 4.2
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  runtime,
  run,
  generateQueryId,
} from '../../src/query/runtime-runner.js';
import {ExecutionContext} from '../../src/query/execution-context.js';
import {BudgetEnforcer} from '../../src/query/budget-enforcer.js';
import {CancellationToken} from '../../src/query/cancellation-token.js';
import {LineageTracker} from '../../src/query/lineage-tracker.js';
import {
  SNAPSHOT_MODE,
  DEFAULT_SNAPSHOT_MODE,
  DEFAULT_RUNTIME_SESSION,
  RUNTIME_ERROR_MSG as ERR,
} from '../../src/query/runtime-constants.js';
import {
  QUERY_BUDGET_NORMALIZATION_ERROR_MSG,
} from '../../src/wasm-service/query-budget-constants.js';
import {
  PRIMITIVE_ERROR_MSG,
} from '../../src/query/distributed/distributed-context-constants.js';

describe('runtime.run', () => {
  describe('argument validation', () => {
    it('should throw when userFn is undefined', async () => {
      await assert.rejects(
        () => run(undefined),
        (err) => {
          assert.equal(err.message, ERR.USER_FN_REQUIRED);
          return true;
        },
      );
    });

    it('should throw when userFn is null', async () => {
      await assert.rejects(
        () => run(null),
        (err) => {
          assert.equal(err.message, ERR.USER_FN_REQUIRED);
          return true;
        },
      );
    });

    it('should throw when userFn is not a function', async () => {
      await assert.rejects(
        () => run('not a function'),
        (err) => {
          assert.equal(
            err.message, ERR.USER_FN_MUST_BE_FUNCTION,
          );
          return true;
        },
      );
    });

    it('should throw for invalid snapshot mode', async () => {
      await assert.rejects(
        () => run(async () => {}, {
          snapshot: {mode: 'invalid'},
        }),
        (err) => {
          assert.equal(
            err.message, ERR.INVALID_SNAPSHOT_MODE,
          );
          return true;
        },
      );
    });

    it('should throw for non-number snapshot.ts', async () => {
      await assert.rejects(
        () => run(async () => {}, {
          snapshot: {mode: 'snapshot', ts: 'bad'},
        }),
        (err) => {
          assert.equal(
            err.message, ERR.INVALID_SNAPSHOT_TS,
          );
          return true;
        },
      );
    });

    it('should throw for non-string session', async () => {
      await assert.rejects(
        () => run(async () => {}, {session: 123}),
        (err) => {
          assert.equal(err.message, ERR.INVALID_SESSION);
          return true;
        },
      );
    });

    it('should throw for non-object budgets', async () => {
      await assert.rejects(
        () => run(async () => {}, {budgets: 'bad'}),
        (err) => {
          assert.equal(
            err.message,
            QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_OBJECT,
          );
          return true;
        },
      );
    });

    it('should throw for null budgets', async () => {
      await assert.rejects(
        () => run(async () => {}, {budgets: null}),
        (err) => {
          assert.equal(
            err.message,
            QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_OBJECT,
          );
          return true;
        },
      );
    });

    it('should refuse an unknown budget field instead of defaulting it',
      async () => {
        let ran = false;
        await assert.rejects(
          () => run(async () => {
            ran = true;
          }, {budgets: {cpuTimeLimitMs: 42}}),
          (err) => {
            assert.ok(err.message.startsWith(
              QUERY_BUDGET_NORMALIZATION_ERROR_MSG.UNKNOWN_BUDGET_FIELD,
            ));
            assert.match(err.message, /cpuTimeLimitMs/);
            return true;
          },
        );
        assert.equal(ran, false);
      });

    it('should refuse a non-integer budget limit', async () => {
      await assert.rejects(
        () => run(async () => {}, {budgets: {CPU_TIME_LIMIT_MS: '42'}}),
        (err) => {
          assert.ok(err.message.startsWith(
            QUERY_BUDGET_NORMALIZATION_ERROR_MSG.INVALID_BUDGET_LIMIT,
          ));
          return true;
        },
      );
    });
  });

  describe('context injection', () => {
    it('should pass ExecutionContext to userFn', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      });
      assert.ok(captured instanceof ExecutionContext);
    });

    it('should inject default session', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      });
      assert.equal(captured.session, DEFAULT_RUNTIME_SESSION);
    });

    it('should inject custom session', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      }, {session: 'my-session'});
      assert.equal(captured.session, 'my-session');
    });

    it('should inject default snapshot mode', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      });
      assert.equal(
        captured.snapshot.mode, DEFAULT_SNAPSHOT_MODE,
      );
      assert.equal(captured.snapshot.ts, undefined);
    });

    it('should inject custom snapshot', async () => {
      let captured;
      const ts = Date.now();
      await run(async (ctx) => {
        captured = ctx;
      }, {snapshot: {mode: 'snapshot', ts}});
      assert.equal(
        captured.snapshot.mode, SNAPSHOT_MODE.SNAPSHOT,
      );
      assert.equal(captured.snapshot.ts, ts);
    });

    it('should freeze snapshot on context', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      });
      assert.throws(() => {
        captured.snapshot.mode = 'changed';
      });
    });

    it('should inject BudgetEnforcer', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      });
      assert.ok(
        captured.getBudgetEnforcer() instanceof BudgetEnforcer,
      );
    });

    it('should pass budget overrides to enforcer', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      }, {budgets: {CPU_TIME_LIMIT_MS: 42}});
      const enforcer = captured.getBudgetEnforcer();
      // Record 41ms — should not throw
      enforcer.recordCpuTime(41);
      // Record 2 more — should exceed 42
      assert.throws(() => enforcer.recordCpuTime(2));
    });

    it('should apply the same budget to the context primitives', async () => {
      await assert.rejects(
        () => run(async (ctx) => {
          await ctx.broadcast('ref-1', {version: 1, data: 'x'.repeat(64)});
        }, {budgets: {BROADCAST_MAX_PAYLOAD_BYTES: 16}}),
        {message: PRIMITIVE_ERROR_MSG.BROADCAST_MAX_PAYLOAD_EXCEEDED},
      );
    });

    it('should inject CancellationToken', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      });
      assert.ok(
        captured.getCancellationToken() instanceof
          CancellationToken,
      );
    });

    it('should inject LineageTracker', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
      });
      assert.ok(
        captured.getLineageTracker() instanceof LineageTracker,
      );
    });
  });

  describe('execution behavior', () => {
    it('should return the result of userFn', async () => {
      const result = await run(async () => 42);
      assert.equal(result, 42);
    });

    it('should return undefined when userFn has no return',
      async () => {
        const result = await run(async () => {});
        assert.equal(result, undefined);
      });

    it('should propagate userFn errors', async () => {
      const err = new Error('boom');
      await assert.rejects(
        () => run(async () => {
          throw err;
        }),
        (caught) => {
          assert.equal(caught, err);
          return true;
        },
      );
    });

    it('should cancel token on userFn error', async () => {
      let captured;
      try {
        await run(async (ctx) => {
          captured = ctx;
          throw new Error('fail');
        });
      } catch (_e) {
        // expected
      }
      assert.ok(captured.isCancelled());
    });

    it('should not cancel token on success', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
        return 'ok';
      });
      assert.equal(captured.isCancelled(), false);
    });
  });

  describe('runtime namespace', () => {
    it('should expose run on frozen runtime object', () => {
      assert.equal(typeof runtime.run, 'function');
      assert.throws(() => {
        runtime.extra = true;
      });
    });
  });

  describe('generateQueryId', () => {
    it('should return unique IDs', () => {
      const id1 = generateQueryId();
      const id2 = generateQueryId();
      assert.notEqual(id1, id2);
    });

    it('should start with rt- prefix', () => {
      const id = generateQueryId();
      assert.ok(id.startsWith('rt-'));
    });
  });

  describe('ctx.out integration', () => {
    it('should return {result, output, telemetry} when ' +
      'ctx.out used', async () => {
      const res = await run(async (ctx) => {
        await ctx.out({id: 1});
        await ctx.out({id: 2});
        return 'done';
      });
      assert.deepEqual(res.result, 'done');
      assert.deepEqual(
        res.output, [{id: 1}, {id: 2}],
      );
      assert.equal(res.telemetry.rowCount, 2);
      assert.equal(res.telemetry.writeCount, 2);
      assert.ok(res.telemetry.byteCount > 0);
      assert.equal(
        res.telemetry.budgetExceededCount, 0,
      );
    });

    it('should return raw result when ctx.out not used',
      async () => {
        const res = await run(async () => 'plain');
        assert.equal(res, 'plain');
      });

    it('should close output stream on success', async () => {
      let captured;
      await run(async (ctx) => {
        captured = ctx;
        await ctx.out('v');
      });
      // Stream should be closed; further out calls reject
      await assert.rejects(
        () => captured.out('late'),
        /Output stream is closed/,
      );
    });

    it('should close output stream on error', async () => {
      let captured;
      try {
        await run(async (ctx) => {
          captured = ctx;
          throw new Error('boom');
        });
      } catch (_e) {
        // expected
      }
      // Token is cancelled, so out rejects with cancel reason
      await assert.rejects(
        () => captured.out('late'),
        (err) => err.message === 'boom',
      );
    });
  });
});
