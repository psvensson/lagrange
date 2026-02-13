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
  NESTED_MAX_CALLS,
  NESTED_MAX_KEYS,
  NESTED_MAX_BYTES,
  MAX_INFLIGHT,
} from '../../src/wasm-service/query-budget-constants.js';
import {buildStageContext} from '../../src/query/call-stage.js';

describe('BudgetEnforcer — nested call budgets', () => {
  describe('recordNestedCall', () => {
    it('should increment nested call count', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordNestedCall();
      enforcer.recordNestedCall();
      assert.equal(enforcer.getUsage().nestedCalls, 2);
    });

    it('should throw when nested call limit exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.NESTED_MAX_CALLS]: 2,
      });
      enforcer.recordNestedCall();
      enforcer.recordNestedCall();
      try {
        enforcer.recordNestedCall();
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(
          err.message, ERR.NESTED_CALLS_EXCEEDED,
        );
        assert.equal(
          err.category, BUDGET_CATEGORY.NESTED_CALLS,
        );
        assert.equal(err.limit, 2);
        assert.equal(err.usage, 3);
      }
    });

    it('should use default NESTED_MAX_CALLS constant', () => {
      const enforcer = new BudgetEnforcer();
      for (let i = 0; i < NESTED_MAX_CALLS; i++) {
        enforcer.recordNestedCall();
      }
      assert.equal(enforcer.isExceeded(), false);
      assert.equal(
        enforcer.getUsage().nestedCalls, NESTED_MAX_CALLS,
      );
    });
  });

  describe('recordNestedKeys', () => {
    it('should accumulate nested key count', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordNestedKeys(5);
      enforcer.recordNestedKeys(3);
      assert.equal(enforcer.getUsage().nestedKeys, 8);
    });

    it('should throw when nested key limit exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.NESTED_MAX_KEYS]: 10,
      });
      enforcer.recordNestedKeys(8);
      try {
        enforcer.recordNestedKeys(3);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(
          err.message, ERR.NESTED_KEYS_EXCEEDED,
        );
        assert.equal(
          err.category, BUDGET_CATEGORY.NESTED_KEYS,
        );
        assert.equal(err.limit, 10);
        assert.equal(err.usage, 11);
      }
    });

    it('should use default NESTED_MAX_KEYS constant', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordNestedKeys(NESTED_MAX_KEYS - 1);
      assert.equal(enforcer.isExceeded(), false);
    });
  });

  describe('recordNestedBytes', () => {
    it('should accumulate nested byte count', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordNestedBytes(1024);
      enforcer.recordNestedBytes(2048);
      assert.equal(enforcer.getUsage().nestedBytes, 3072);
    });

    it('should throw when nested byte limit exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.NESTED_MAX_BYTES]: 100,
      });
      try {
        enforcer.recordNestedBytes(101);
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(
          err.message, ERR.NESTED_BYTES_EXCEEDED,
        );
        assert.equal(
          err.category, BUDGET_CATEGORY.NESTED_BYTES,
        );
        assert.equal(err.limit, 100);
        assert.equal(err.usage, 101);
      }
    });

    it('should throw on accumulated exceed', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.NESTED_MAX_BYTES]: 200,
      });
      enforcer.recordNestedBytes(150);
      assert.throws(
        () => enforcer.recordNestedBytes(51),
        (err) => err instanceof BudgetLimitError,
      );
    });

    it('should use default NESTED_MAX_BYTES constant', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordNestedBytes(NESTED_MAX_BYTES - 1);
      assert.equal(enforcer.isExceeded(), false);
    });
  });

  describe('inflight tracking', () => {
    it('should increment and decrement inflight', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.incrementInflight();
      enforcer.incrementInflight();
      assert.equal(enforcer.getUsage().inflight, 2);
      enforcer.decrementInflight();
      assert.equal(enforcer.getUsage().inflight, 1);
      enforcer.decrementInflight();
      assert.equal(enforcer.getUsage().inflight, 0);
    });

    it('should not go below zero on decrement', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.decrementInflight();
      assert.equal(enforcer.getUsage().inflight, 0);
    });

    it('should throw when max inflight exceeded', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.MAX_INFLIGHT]: 2,
      });
      enforcer.incrementInflight();
      enforcer.incrementInflight();
      try {
        enforcer.incrementInflight();
        assert.fail('Expected BudgetLimitError');
      } catch (err) {
        assert.ok(err instanceof BudgetLimitError);
        assert.equal(err.message, ERR.INFLIGHT_EXCEEDED);
        assert.equal(
          err.category, BUDGET_CATEGORY.INFLIGHT,
        );
        assert.equal(err.limit, 2);
        assert.equal(err.usage, 3);
      }
    });

    it('should use default MAX_INFLIGHT constant', () => {
      const enforcer = new BudgetEnforcer();
      for (let i = 0; i < MAX_INFLIGHT; i++) {
        enforcer.incrementInflight();
      }
      assert.equal(enforcer.isExceeded(), false);
    });
  });

  describe('custom budget limits via constructor', () => {
    it('should accept custom nested call limit', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.NESTED_MAX_CALLS]: 5,
      });
      for (let i = 0; i < 5; i++) {
        enforcer.recordNestedCall();
      }
      assert.equal(enforcer.isExceeded(), false);
      assert.throws(
        () => enforcer.recordNestedCall(),
        (err) => err instanceof BudgetLimitError,
      );
    });

    it('should accept custom nested keys limit', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.NESTED_MAX_KEYS]: 50,
      });
      enforcer.recordNestedKeys(50);
      assert.equal(enforcer.isExceeded(), false);
      assert.throws(
        () => enforcer.recordNestedKeys(1),
        (err) => err instanceof BudgetLimitError,
      );
    });

    it('should accept custom nested bytes limit', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.NESTED_MAX_BYTES]: 512,
      });
      enforcer.recordNestedBytes(512);
      assert.equal(enforcer.isExceeded(), false);
      assert.throws(
        () => enforcer.recordNestedBytes(1),
        (err) => err instanceof BudgetLimitError,
      );
    });

    it('should accept custom inflight limit', () => {
      const enforcer = new BudgetEnforcer({
        [QB_FIELD.MAX_INFLIGHT]: 3,
      });
      enforcer.incrementInflight();
      enforcer.incrementInflight();
      enforcer.incrementInflight();
      assert.equal(enforcer.isExceeded(), false);
      assert.throws(
        () => enforcer.incrementInflight(),
        (err) => err instanceof BudgetLimitError,
      );
    });
  });

  describe('terminated enforcer rejects nested recording',
    () => {
      it('should reject all nested methods', () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.NESTED_MAX_CALLS]: 1,
        });
        enforcer.recordNestedCall();
        assert.throws(() => enforcer.recordNestedCall());
        assert.equal(enforcer.isTerminated(), true);

        const methods = [
          () => enforcer.recordNestedCall(),
          () => enforcer.recordNestedKeys(1),
          () => enforcer.recordNestedBytes(1),
          () => enforcer.incrementInflight(),
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

  describe('isExceeded detects nested budget violations',
    () => {
      it('should detect nested calls exceeded', () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.NESTED_MAX_CALLS]: 5,
        });
        enforcer._usage.nestedCalls = 6;
        assert.equal(enforcer.isExceeded(), true);
      });

      it('should detect nested keys exceeded', () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.NESTED_MAX_KEYS]: 10,
        });
        enforcer._usage.nestedKeys = 11;
        assert.equal(enforcer.isExceeded(), true);
      });

      it('should detect nested bytes exceeded', () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.NESTED_MAX_BYTES]: 100,
        });
        enforcer._usage.nestedBytes = 101;
        assert.equal(enforcer.isExceeded(), true);
      });

      it('should detect inflight exceeded', () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.MAX_INFLIGHT]: 2,
        });
        enforcer._usage.inflight = 3;
        assert.equal(enforcer.isExceeded(), true);
      });
    });

  describe('getUsage includes nested fields', () => {
    it('should include all nested fields in usage', () => {
      const enforcer = new BudgetEnforcer();
      enforcer.recordNestedCall();
      enforcer.recordNestedKeys(5);
      enforcer.recordNestedBytes(256);
      enforcer.incrementInflight();
      const usage = enforcer.getUsage();
      assert.equal(usage.nestedCalls, 1);
      assert.equal(usage.nestedKeys, 5);
      assert.equal(usage.nestedBytes, 256);
      assert.equal(usage.inflight, 1);
    });

    it('should return zero for nested fields initially', () => {
      const enforcer = new BudgetEnforcer();
      const usage = enforcer.getUsage();
      assert.equal(usage.nestedCalls, 0);
      assert.equal(usage.nestedKeys, 0);
      assert.equal(usage.nestedBytes, 0);
      assert.equal(usage.inflight, 0);
    });
  });

  describe('stage context nested call budget recording', () => {
    function makeMockExecCtx(budgetEnforcer) {
      let callCount = 0;
      return {
        emit: () => {},
        out: () => {},
        lookup: () => {},
        broadcast: () => {},
        useBroadcast: () => {},
        call: () => {
          callCount++;
          return Promise.resolve({rows: []});
        },
        isCancelled: () => false,
        throwIfCancelled: () => {},
        getBudgetEnforcer: () => budgetEnforcer,
        getPlanDiagnostics: () => null,
        getCallCount: () => callCount,
      };
    }

    it('should record nested call and inflight on call',
      async () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.NESTED_MAX_CALLS]: 10,
          [QB_FIELD.MAX_INFLIGHT]: 5,
        });
        const execCtx = makeMockExecCtx(enforcer);
        const stageCtx = buildStageContext(execCtx, null);

        await stageCtx.call(
          {kind: 'plan'}, [], null, null,
        );
        const usage = enforcer.getUsage();
        assert.equal(usage.nestedCalls, 1);
        assert.equal(usage.inflight, 0);
      });

    it('should decrement inflight even on call failure',
      async () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.NESTED_MAX_CALLS]: 10,
          [QB_FIELD.MAX_INFLIGHT]: 5,
        });
        const failCtx = {
          emit: () => {},
          out: () => {},
          lookup: () => {},
          broadcast: () => {},
          useBroadcast: () => {},
          call: () => Promise.reject(new Error('fail')),
          isCancelled: () => false,
          throwIfCancelled: () => {},
          getBudgetEnforcer: () => enforcer,
          getPlanDiagnostics: () => null,
        };
        const stageCtx = buildStageContext(failCtx, null);

        try {
          await stageCtx.call(
            {kind: 'plan'}, [], null, null,
          );
          assert.fail('Expected error');
        } catch (err) {
          assert.equal(err.message, 'fail');
        }
        const usage = enforcer.getUsage();
        assert.equal(usage.nestedCalls, 1);
        assert.equal(usage.inflight, 0);
      });

    it('should throw when nested call budget exceeded',
      async () => {
        const enforcer = new BudgetEnforcer({
          [QB_FIELD.NESTED_MAX_CALLS]: 1,
        });
        const execCtx = makeMockExecCtx(enforcer);
        const stageCtx = buildStageContext(execCtx, null);

        await stageCtx.call(
          {kind: 'plan'}, [], null, null,
        );
        try {
          await stageCtx.call(
            {kind: 'plan'}, [], null, null,
          );
          assert.fail('Expected BudgetLimitError');
        } catch (err) {
          assert.ok(err instanceof BudgetLimitError);
          assert.equal(
            err.message, ERR.NESTED_CALLS_EXCEEDED,
          );
        }
      });
  });

  describe('property: nested budgets', () => {
    it('nested calls within budget never throw', () => {
      fc.assert(
        fc.property(
          fc.nat({max: 100}),
          fc.nat({max: 100}),
          (limit, usage) => {
            if (limit === 0) return true;
            const safeUsage = usage % limit;
            const enforcer = new BudgetEnforcer({
              [QB_FIELD.NESTED_MAX_CALLS]: limit,
            });
            for (let i = 0; i < safeUsage; i++) {
              enforcer.recordNestedCall();
            }
            return !enforcer.isTerminated();
          },
        ),
        {numRuns: 10},
      );
    });

    it('nested keys within budget never throw', () => {
      fc.assert(
        fc.property(
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          (limit, usage) => {
            if (limit === 0) return true;
            const safeUsage = usage % limit;
            const enforcer = new BudgetEnforcer({
              [QB_FIELD.NESTED_MAX_KEYS]: limit,
            });
            enforcer.recordNestedKeys(safeUsage);
            return !enforcer.isTerminated();
          },
        ),
        {numRuns: 10},
      );
    });

    it('exceeding nested bytes always terminates', () => {
      fc.assert(
        fc.property(
          fc.nat({max: 999}),
          fc.nat({max: 999}),
          (limit, extra) => {
            const usage = limit + extra + 1;
            const enforcer = new BudgetEnforcer({
              [QB_FIELD.NESTED_MAX_BYTES]: limit,
            });
            try {
              enforcer.recordNestedBytes(usage);
              return false;
            } catch (err) {
              return (
                err instanceof BudgetLimitError &&
                err.category ===
                  BUDGET_CATEGORY.NESTED_BYTES &&
                enforcer.isTerminated()
              );
            }
          },
        ),
        {numRuns: 10},
      );
    });

    it('inflight within budget never throws', () => {
      fc.assert(
        fc.property(
          fc.integer({min: 1, max: 50}),
          fc.nat({max: 49}),
          (limit, usage) => {
            const safeUsage = usage % limit;
            const enforcer = new BudgetEnforcer({
              [QB_FIELD.MAX_INFLIGHT]: limit,
            });
            for (let i = 0; i < safeUsage; i++) {
              enforcer.incrementInflight();
            }
            return !enforcer.isTerminated();
          },
        ),
        {numRuns: 10},
      );
    });
  });
});
