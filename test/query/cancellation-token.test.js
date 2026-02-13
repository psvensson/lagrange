import {describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';
import {
  CancellationToken,
} from '../../src/query/cancellation-token.js';
import {
  GUARDRAIL_ERROR_MSG as ERR,
} from '../../src/query/guardrail-constants.js';

describe('CancellationToken', () => {
  it('should start not cancelled', () => {
    const token = new CancellationToken();
    assert.equal(token.isCancelled(), false);
    assert.equal(token.getReason(), null);
  });

  it('should cancel with reason', () => {
    const token = new CancellationToken();
    token.cancel('test reason');
    assert.equal(token.isCancelled(), true);
    assert.equal(token.getReason(), 'test reason');
  });

  it('should use default reason when none given', () => {
    const token = new CancellationToken();
    token.cancel();
    assert.equal(token.getReason(), ERR.CANCELLED);
  });

  it('should fire onCancel callbacks', () => {
    const token = new CancellationToken();
    let fired = false;
    token.onCancel(() => { fired = true; });
    token.cancel();
    assert.equal(fired, true);
  });

  it('should fire onCancel immediately if already ' +
    'cancelled', () => {
    const token = new CancellationToken();
    token.cancel('early');
    let reason = null;
    token.onCancel((r) => { reason = r; });
    assert.equal(reason, 'early');
  });

  it('should not cancel twice', () => {
    const token = new CancellationToken();
    let count = 0;
    token.onCancel(() => { count++; });
    token.cancel('first');
    token.cancel('second');
    assert.equal(count, 1);
    assert.equal(token.getReason(), 'first');
  });

  it('should fire multiple onCancel callbacks', () => {
    const token = new CancellationToken();
    const reasons = [];
    token.onCancel((r) => { reasons.push(r); });
    token.onCancel((r) => { reasons.push(r); });
    token.cancel('multi');
    assert.equal(reasons.length, 2);
    assert.equal(reasons[0], 'multi');
    assert.equal(reasons[1], 'multi');
  });

  describe('throwIfCancelled', () => {
    it('should not throw when not cancelled', () => {
      const token = new CancellationToken();
      assert.doesNotThrow(() => token.throwIfCancelled());
    });

    it('should throw when cancelled', () => {
      const token = new CancellationToken();
      token.cancel('boom');
      assert.throws(
        () => token.throwIfCancelled(),
        {message: 'boom'},
      );
    });

    it('should throw default reason when no reason', () => {
      const token = new CancellationToken();
      token.cancel();
      assert.throws(
        () => token.throwIfCancelled(),
        {message: ERR.CANCELLED},
      );
    });
  });

  describe('createChild', () => {
    it('should propagate cancellation to child', () => {
      const parent = new CancellationToken();
      const child = parent.createChild();
      parent.cancel('parent done');
      assert.equal(child.isCancelled(), true);
      assert.equal(child.getReason(), 'parent done');
    });

    it('should not propagate child cancel to parent', () => {
      const parent = new CancellationToken();
      const child = parent.createChild();
      child.cancel('child done');
      assert.equal(parent.isCancelled(), false);
    });

    it('should cancel child immediately if parent already ' +
      'cancelled', () => {
      const parent = new CancellationToken();
      parent.cancel('already');
      const child = parent.createChild();
      assert.equal(child.isCancelled(), true);
      assert.equal(child.getReason(), 'already');
    });

    it('should propagate to multiple children', () => {
      const parent = new CancellationToken();
      const c1 = parent.createChild();
      const c2 = parent.createChild();
      parent.cancel('all');
      assert.equal(c1.isCancelled(), true);
      assert.equal(c2.isCancelled(), true);
    });

    it('should propagate through grandchild chain', () => {
      const root = new CancellationToken();
      const child = root.createChild();
      const grandchild = child.createChild();
      root.cancel('cascade');
      assert.equal(grandchild.isCancelled(), true);
      assert.equal(grandchild.getReason(), 'cascade');
    });
  });

  describe('withTimeout', () => {
    it('should auto-cancel after timeout fires', () => {
      mock.timers.enable({apis: ['setTimeout']});
      try {
        const token = new CancellationToken();
        const child = token.withTimeout(100);
        assert.equal(child.isCancelled(), false);
        mock.timers.tick(100);
        assert.equal(child.isCancelled(), true);
        assert.equal(
          child.getReason(), ERR.TIMEOUT_EXCEEDED,
        );
      } finally {
        mock.timers.reset();
      }
    });

    it('should clean up timer on manual cancel', () => {
      const token = new CancellationToken();
      const child = token.withTimeout(60000);
      child.cancel('manual');
      assert.equal(child.isCancelled(), true);
      assert.equal(child.getReason(), 'manual');
    });

    it('should clean up timer on parent cancel', () => {
      const parent = new CancellationToken();
      const child = parent.withTimeout(60000);
      parent.cancel('parent');
      assert.equal(child.isCancelled(), true);
      assert.equal(child.getReason(), 'parent');
    });

    it('should cancel immediately if parent already ' +
      'cancelled', () => {
      const parent = new CancellationToken();
      parent.cancel('pre');
      const child = parent.withTimeout(60000);
      assert.equal(child.isCancelled(), true);
      assert.equal(child.getReason(), 'pre');
    });
  });
});
