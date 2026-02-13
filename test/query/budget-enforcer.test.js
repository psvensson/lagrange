import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  BudgetEnforcer,
} from '../../src/query/budget-enforcer.js';
import {
  BudgetLimitError,
  BUDGET_CATEGORY,
} from '../../src/query/budget-limit-error.js';
import {
  GUARDRAIL_ERROR_MSG as ERR,
} from '../../src/query/guardrail-constants.js';
import {
  QB_FIELD,
  QUERY_CPU_TIME_LIMIT_MS,
  QUERY_MEMORY_LIMIT_BYTES,
  LOOKUP_MAX_KEYS,
  LOOKUP_MAX_BYTES,
  EMIT_MAX_BYTES,
  BROADCAST_MAX_PAYLOAD_BYTES,
  OUT_MAX_BYTES,
} from '../../src/wasm-service/query-budget-constants.js';

describe('BudgetEnforcer', () => {
  describe('construction', () => {
    it('should create with default limits', () => {
      const enforcer = new BudgetEnforcer();
      const usage = enforcer.getUsage();
      assert.equal(usage.cpuTimeMs, 0);
      assert.equal(usage.memoryBytes, 0);
      assert.equal(usage.lookupKeys, 0);
      assert.equal(usage.lookupBytes, 0);
      assert.equal(usage.emitBytes, 0);
      assert.equal(usage.broadcastBytes, 0);
      assert.equal(typeof usage.wallStart, 'number');
    });

    it('should accept custom limits', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.CPU_TIME_LIMIT_MS]: 100,
      });
      enforcer.recordCpuTime(99);
      assert.equal(enforcer.isExceeded(), false);
      enforcer._usage.cpuTimeMs = 101;
      assert.equal(enforcer.isExceeded(), true);
    });

    it('should use default constants when no overrides', () => {
      const enforcer = new BudgetEnforcer();
      // Record just under each default limit — should not throw
      enforcer.recordCpuTime(QUERY_CPU_TIME_LIMIT_MS - 1);
      enforcer.recordMemory(QUERY_MEMORY_LIMIT_BYTES - 1);
      enforcer.recordLookupKeys(LOOKUP_MAX_KEYS - 1);
      enforcer.recordLookupBytes(LOOKUP_MAX_BYTES - 1);
      enforcer.recordEmitBytes(EMIT_MAX_BYTES - 1);
      enforcer.recordBroadcastBytes(
        BROADCAST_MAX_PAYLOAD_BYTES - 1,
      );
      assert.equal(enforcer.isExceeded(), false);
    });
  });

  describe('recordCpuTime', () => {
    it('should accumulate CPU time', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordCpuTime(10);
      enforcer.recordCpuTime(20);
      assert.equal(enforcer.getUsage().cpuTimeMs, 30);
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.CPU_TIME_LIMIT_MS]: 50,
      });
      try {
        enforcer.recordCpuTime(51);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(err.message, ERR.CPU_TIME_EXCEEDED);
        assert.equal(err.category, BUDGET_CATEGORY.CPU_TIME);
        assert.equal(err.limit, 50);
        assert.equal(err.usage, 51);
      }
    });

    it('should throw on accumulated exceed', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.CPU_TIME_LIMIT_MS]: 50,
      });
      enforcer.recordCpuTime(30);
      assert.throws(
        () => enforcer.recordCpuTime(21),
        (err) => err instanceof BudgetLimitError,
      );
    });
  });

  describe('recordMemory', () => {
    it('should accumulate memory bytes', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordMemory(1024);
      assert.equal(enforcer.getUsage().memoryBytes, 1024);
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.MEMORY_LIMIT_BYTES]: 100,
      });
      try {
        enforcer.recordMemory(101);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(err.message, ERR.MEMORY_EXCEEDED);
        assert.equal(err.category, BUDGET_CATEGORY.MEMORY);
        assert.equal(err.limit, 100);
        assert.equal(err.usage, 101);
      }
    });

    it('should throw on accumulated exceed', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.MEMORY_LIMIT_BYTES]: 200,
      });
      enforcer.recordMemory(150);
      assert.throws(
        () => enforcer.recordMemory(51),
        (err) => err instanceof BudgetLimitError,
      );
    });
  });

  describe('checkWallTime', () => {
    it('should not throw when within limit', () => {
      const enforcer = new BudgetEnforcer();
      assert.doesNotThrow(() => enforcer.checkWallTime());
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.WALL_TIME_LIMIT_MS]: 0,
      });
      enforcer._usage.wallStart = Date.now() - 1;
      try {
        enforcer.checkWallTime();
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(err.message, ERR.WALL_TIME_EXCEEDED);
        assert.equal(
          err.category, BUDGET_CATEGORY.WALL_TIME,
        );
        assert.equal(err.limit, 0);
        assert.ok(err.usage >= 0);
      }
    });
  });

  describe('recordLookupKeys', () => {
    it('should accumulate lookup keys', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordLookupKeys(3);
      enforcer.recordLookupKeys(4);
      assert.equal(enforcer.getUsage().lookupKeys, 7);
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.LOOKUP_MAX_KEYS]: 5,
      });
      try {
        enforcer.recordLookupKeys(6);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(
          err.message, ERR.LOOKUP_KEYS_EXCEEDED,
        );
        assert.equal(
          err.category, BUDGET_CATEGORY.LOOKUP_KEYS,
        );
        assert.equal(err.limit, 5);
        assert.equal(err.usage, 6);
      }
    });
  });

  describe('recordLookupBytes', () => {
    it('should accumulate lookup bytes', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordLookupBytes(512);
      enforcer.recordLookupBytes(256);
      assert.equal(enforcer.getUsage().lookupBytes, 768);
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.LOOKUP_MAX_BYTES]: 100,
      });
      try {
        enforcer.recordLookupBytes(101);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(
          err.message, ERR.LOOKUP_BYTES_EXCEEDED,
        );
        assert.equal(
          err.category, BUDGET_CATEGORY.LOOKUP_BYTES,
        );
        assert.equal(err.limit, 100);
        assert.equal(err.usage, 101);
      }
    });

    it('should throw on accumulated exceed', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.LOOKUP_MAX_BYTES]: 100,
      });
      enforcer.recordLookupBytes(60);
      assert.throws(
        () => enforcer.recordLookupBytes(41),
        (err) => err instanceof BudgetLimitError,
      );
    });
  });

  describe('recordEmitBytes', () => {
    it('should accumulate emit bytes', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordEmitBytes(1000);
      enforcer.recordEmitBytes(2000);
      assert.equal(enforcer.getUsage().emitBytes, 3000);
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.EMIT_MAX_BYTES]: 200,
      });
      try {
        enforcer.recordEmitBytes(201);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(err.message, ERR.EMIT_BYTES_EXCEEDED);
        assert.equal(
          err.category, BUDGET_CATEGORY.EMIT_BYTES,
        );
        assert.equal(err.limit, 200);
        assert.equal(err.usage, 201);
      }
    });

    it('should throw on accumulated exceed', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.EMIT_MAX_BYTES]: 500,
      });
      enforcer.recordEmitBytes(300);
      assert.throws(
        () => enforcer.recordEmitBytes(201),
        (err) => err instanceof BudgetLimitError,
      );
    });
  });

  describe('recordBroadcastBytes', () => {
    it('should accumulate broadcast bytes', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordBroadcastBytes(100);
      enforcer.recordBroadcastBytes(200);
      assert.equal(
        enforcer.getUsage().broadcastBytes, 300,
      );
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES]: 50,
      });
      try {
        enforcer.recordBroadcastBytes(51);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(
          err.message, ERR.BROADCAST_BYTES_EXCEEDED,
        );
        assert.equal(
          err.category, BUDGET_CATEGORY.BROADCAST_BYTES,
        );
        assert.equal(err.limit, 50);
        assert.equal(err.usage, 51);
      }
    });

    it('should throw on accumulated exceed', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES]: 100,
      });
      enforcer.recordBroadcastBytes(60);
      assert.throws(
        () => enforcer.recordBroadcastBytes(41),
        (err) => err instanceof BudgetLimitError,
      );
    });
  });

  describe('recordOutBytes', () => {
    it('should accumulate output bytes', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordOutBytes(100);
      enforcer.recordOutBytes(200);
      assert.equal(enforcer.getUsage().outBytes, 300);
    });

    it('should throw BudgetLimitError when exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.OUT_MAX_BYTES]: 50,
      });
      try {
        enforcer.recordOutBytes(51);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(err.message, ERR.OUT_BYTES_EXCEEDED);
        assert.equal(
          err.category, BUDGET_CATEGORY.OUT_BYTES,
        );
        assert.equal(err.limit, 50);
        assert.equal(err.usage, 51);
      }
    });

    it('should throw on accumulated exceed', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.OUT_MAX_BYTES]: 100,
      });
      enforcer.recordOutBytes(60);
      assert.throws(
        () => enforcer.recordOutBytes(41),
        (err) => err instanceof BudgetLimitError,
      );
    });

    it('should use default OUT_MAX_BYTES constant', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordOutBytes(OUT_MAX_BYTES - 1);
      assert.equal(enforcer.isExceeded(), false);
    });
  });

  describe('getUsage', () => {
    it('should return snapshot of all tracked values', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordCpuTime(10);
      enforcer.recordMemory(2048);
      enforcer.recordLookupKeys(3);
      enforcer.recordLookupBytes(512);
      enforcer.recordEmitBytes(1024);
      enforcer.recordBroadcastBytes(64);
      enforcer.recordOutBytes(256);
      const usage = enforcer.getUsage();
      assert.equal(usage.cpuTimeMs, 10);
      assert.equal(usage.memoryBytes, 2048);
      assert.equal(usage.lookupKeys, 3);
      assert.equal(usage.lookupBytes, 512);
      assert.equal(usage.emitBytes, 1024);
      assert.equal(usage.broadcastBytes, 64);
      assert.equal(usage.outBytes, 256);
      assert.equal(typeof usage.wallStart, 'number');
    });

    it('should return a copy, not a reference', () => {
      const enforcer = new BudgetEnforcer();
      const usage1 = enforcer.getUsage();
      usage1.cpuTimeMs = 9999;
      const usage2 = enforcer.getUsage();
      assert.equal(usage2.cpuTimeMs, 0);
    });
  });

  describe('isExceeded', () => {
    it('should return false when within all limits', () => {
      const enforcer = new BudgetEnforcer();
      assert.equal(enforcer.isExceeded(), false);
    });

    it('should detect CPU time exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.CPU_TIME_LIMIT_MS]: 10,
      });
      enforcer._usage.cpuTimeMs = 11;
      assert.equal(enforcer.isExceeded(), true);
    });

    it('should detect memory exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.MEMORY_LIMIT_BYTES]: 100,
      });
      enforcer._usage.memoryBytes = 101;
      assert.equal(enforcer.isExceeded(), true);
    });

    it('should detect lookup keys exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.LOOKUP_MAX_KEYS]: 5,
      });
      enforcer._usage.lookupKeys = 6;
      assert.equal(enforcer.isExceeded(), true);
    });

    it('should detect lookup bytes exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.LOOKUP_MAX_BYTES]: 100,
      });
      enforcer._usage.lookupBytes = 101;
      assert.equal(enforcer.isExceeded(), true);
    });

    it('should detect emit bytes exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.EMIT_MAX_BYTES]: 200,
      });
      enforcer._usage.emitBytes = 201;
      assert.equal(enforcer.isExceeded(), true);
    });

    it('should detect broadcast bytes exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.BROADCAST_MAX_PAYLOAD_BYTES]: 50,
      });
      enforcer._usage.broadcastBytes = 51;
      assert.equal(enforcer.isExceeded(), true);
    });

    it('should detect out bytes exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.OUT_MAX_BYTES]: 50,
      });
      enforcer._usage.outBytes = 51;
      assert.equal(enforcer.isExceeded(), true);
    });
  });

  describe('termination semantics', () => {
    it('should not be terminated initially', () => {
      const enforcer = new BudgetEnforcer();
      assert.equal(enforcer.isTerminated(), false);
    });

    it('should terminate after budget violation', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.CPU_TIME_LIMIT_MS]: 10,
      });
      assert.throws(
        () => enforcer.recordCpuTime(11),
        (err) => err instanceof BudgetLimitError,
      );
      assert.equal(enforcer.isTerminated(), true);
    });

    it('should reject recording after termination', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.CPU_TIME_LIMIT_MS]: 10,
      });
      assert.throws(() => enforcer.recordCpuTime(11));
      try {
        enforcer.recordMemory(1);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(
          err.message, ERR.OPERATION_TERMINATED,
        );
      }
    });

    it('should reject all methods after termination', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.MEMORY_LIMIT_BYTES]: 10,
      });
      assert.throws(() => enforcer.recordMemory(11));
      const methods = [
        () => enforcer.recordCpuTime(1),
        () => enforcer.recordMemory(1),
        () => enforcer.checkWallTime(),
        () => enforcer.recordLookupKeys(1),
        () => enforcer.recordLookupBytes(1),
        () => enforcer.recordEmitBytes(1),
        () => enforcer.recordBroadcastBytes(1),
        () => enforcer.recordOutBytes(1),
      ];
      for (const method of methods) {
        assert.throws(method, (err) => {
          assert.ok(err instanceof BudgetLimitError);
          assert.equal(
            err.message, ERR.OPERATION_TERMINATED,
          );
          return true;
        });
      }
    });
  });

  describe('BudgetLimitError structure', () => {
    it('should carry category, limit, and usage', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.EMIT_MAX_BYTES]: 10,
      });
      try {
        enforcer.recordEmitBytes(11);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.ok(err instanceof Error);
        assert.equal(err.name, 'BudgetLimitError');
        assert.equal(
          err.category, BUDGET_CATEGORY.EMIT_BYTES,
        );
        assert.equal(err.limit, 10);
        assert.equal(err.usage, 11);
        assert.ok(err.context);
        assert.equal(
          err.context.component, 'BudgetEnforcer',
        );
      }
    });
  });

  describe('property: recording within budget never throws',
    () => {
    /**
     * **Validates: Requirements 9.1**
     *
     * For any sequence of non-negative increments that sum
     * to at most the configured limit, no BudgetLimitError
     * is thrown.
     */
      it('CPU time within budget never throws', () => {
        fc.assert(
          fc.property(
            fc.nat({max: 100}),
            fc.nat({max: 100}),
            (limit, usage) => {
              if (limit === 0) return true;
              const safeUsage = usage % limit;
              const enforcer = new BudgetEnforcer({
                [QB_FIELD.CPU_TIME_LIMIT_MS]: limit,
              });
              enforcer.recordCpuTime(safeUsage);
              return !enforcer.isTerminated();
            },
          ),
          {numRuns: 10},
        );
      });

      it('memory within budget never throws', () => {
        fc.assert(
          fc.property(
            fc.nat({max: 10000}),
            fc.nat({max: 10000}),
            (limit, usage) => {
              if (limit === 0) return true;
              const safeUsage = usage % limit;
              const enforcer = new BudgetEnforcer({
                [QB_FIELD.MEMORY_LIMIT_BYTES]: limit,
              });
              enforcer.recordMemory(safeUsage);
              return !enforcer.isTerminated();
            },
          ),
          {numRuns: 10},
        );
      });

      it('lookup keys within budget never throws', () => {
        fc.assert(
          fc.property(
            fc.nat({max: 500}),
            fc.nat({max: 500}),
            (limit, usage) => {
              if (limit === 0) return true;
              const safeUsage = usage % limit;
              const enforcer = new BudgetEnforcer({
                [QB_FIELD.LOOKUP_MAX_KEYS]: limit,
              });
              enforcer.recordLookupKeys(safeUsage);
              return !enforcer.isTerminated();
            },
          ),
          {numRuns: 10},
        );
      });

      it('emit bytes within budget never throws', () => {
        fc.assert(
          fc.property(
            fc.nat({max: 10000}),
            fc.nat({max: 10000}),
            (limit, usage) => {
              if (limit === 0) return true;
              const safeUsage = usage % limit;
              const enforcer = new BudgetEnforcer({
                [QB_FIELD.EMIT_MAX_BYTES]: limit,
              });
              enforcer.recordEmitBytes(safeUsage);
              return !enforcer.isTerminated();
            },
          ),
          {numRuns: 10},
        );
      });
    });

  describe(
    'property: exceeding budget always terminates', () => {
    /**
     * **Validates: Requirements 9.4**
     *
     * For any positive limit and usage strictly greater than
     * the limit, recording always throws BudgetLimitError
     * and terminates the enforcer.
     */
      it('exceeding any budget terminates enforcer', () => {
        fc.assert(
          fc.property(
            fc.nat({max: 999}),
            fc.nat({max: 999}),
            (limit, extra) => {
              const usage = limit + extra + 1;
              const enforcer = new BudgetEnforcer({
                [QB_FIELD.CPU_TIME_LIMIT_MS]: limit,
              });
              try {
                enforcer.recordCpuTime(usage);
                return false;
              } catch (err) {
                return (
                  err instanceof BudgetLimitError &&
                err.category ===
                  BUDGET_CATEGORY.CPU_TIME &&
                enforcer.isTerminated()
                );
              }
            },
          ),
          {numRuns: 10},
        );
      });

      it('terminated enforcer rejects all recording', () => {
        fc.assert(
          fc.property(
            fc.nat({max: 100}),
            (limit) => {
              const enforcer = new BudgetEnforcer({
                [QB_FIELD.MEMORY_LIMIT_BYTES]: limit,
              });
              try {
                enforcer.recordMemory(limit + 1);
              } catch (_e) {
                // expected
              }
              try {
                enforcer.recordCpuTime(1);
                return false;
              } catch (err) {
                return (
                  err instanceof BudgetLimitError &&
                err.message === ERR.OPERATION_TERMINATED
                );
              }
            },
          ),
          {numRuns: 10},
        );
      });
    });
});
