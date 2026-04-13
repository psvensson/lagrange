// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {routeRead, ROUTING_DECISION} from
  '../../src/wasm-service/read-router.js';
import {READ_CONSISTENCY_MODE} from
  '../../src/wasm-service/wasm-service-constants.js';

/**
 * Minimal SafetyInterval stub that returns a fixed boolean
 * from canServeRead().
 */
function makeSafetyInterval(canServe) {
  return {canServeRead: () => canServe};
}

describe('ROUTING_DECISION constants', () => {
  it('SERVE_LOCALLY has correct shape', () => {
    assert.deepStrictEqual(ROUTING_DECISION.SERVE_LOCALLY, {
      serveLocally: true,
      forwardToLeader: false,
    });
  });

  it('FORWARD_TO_LEADER has correct shape', () => {
    assert.deepStrictEqual(ROUTING_DECISION.FORWARD_TO_LEADER, {
      serveLocally: false,
      forwardToLeader: true,
    });
  });

  it('decision objects are frozen', () => {
    assert.ok(Object.isFrozen(ROUTING_DECISION.SERVE_LOCALLY));
    assert.ok(Object.isFrozen(ROUTING_DECISION.FORWARD_TO_LEADER));
    assert.ok(Object.isFrozen(ROUTING_DECISION));
  });
});

describe('routeRead', () => {
  describe('leader always serves locally', () => {
    it('leader_only mode on leader → serve locally', () => {
      const result = routeRead(
        READ_CONSISTENCY_MODE.LEADER_ONLY,
        true,
        makeSafetyInterval(false),
      );
      assert.strictEqual(result, ROUTING_DECISION.SERVE_LOCALLY);
    });

    it('strong mode on leader → serve locally', () => {
      const result = routeRead(
        READ_CONSISTENCY_MODE.STRONG,
        true,
        makeSafetyInterval(false),
      );
      assert.strictEqual(result, ROUTING_DECISION.SERVE_LOCALLY);
    });

    it('eventual mode on leader → serve locally', () => {
      const result = routeRead(
        READ_CONSISTENCY_MODE.EVENTUAL,
        true,
        makeSafetyInterval(false),
      );
      assert.strictEqual(result, ROUTING_DECISION.SERVE_LOCALLY);
    });
  });

  describe('leader_only mode on follower', () => {
    it('forwards to leader regardless of safety interval',
      () => {
        const result = routeRead(
          READ_CONSISTENCY_MODE.LEADER_ONLY,
          false,
          makeSafetyInterval(true),
        );
        assert.strictEqual(
          result, ROUTING_DECISION.FORWARD_TO_LEADER,
        );
      });
  });

  describe('eventual mode on follower', () => {
    it('serves locally when safety interval allows', () => {
      const result = routeRead(
        READ_CONSISTENCY_MODE.EVENTUAL,
        false,
        makeSafetyInterval(true),
      );
      assert.strictEqual(result, ROUTING_DECISION.SERVE_LOCALLY);
    });

    it('serves locally even when safety interval disallows',
      () => {
        const result = routeRead(
          READ_CONSISTENCY_MODE.EVENTUAL,
          false,
          makeSafetyInterval(false),
        );
        assert.strictEqual(result, ROUTING_DECISION.SERVE_LOCALLY);
      });
  });

  describe('strong mode on follower', () => {
    it('serves locally when safety interval allows', () => {
      const result = routeRead(
        READ_CONSISTENCY_MODE.STRONG,
        false,
        makeSafetyInterval(true),
      );
      assert.strictEqual(result, ROUTING_DECISION.SERVE_LOCALLY);
    });

    it('forwards to leader when safety interval disallows',
      () => {
        const result = routeRead(
          READ_CONSISTENCY_MODE.STRONG,
          false,
          makeSafetyInterval(false),
        );
        assert.strictEqual(
          result, ROUTING_DECISION.FORWARD_TO_LEADER,
        );
      });
  });

  describe('returns same constant references', () => {
    it('all SERVE_LOCALLY results are the same object', () => {
      const r1 = routeRead(
        READ_CONSISTENCY_MODE.EVENTUAL,
        false,
        makeSafetyInterval(false),
      );
      const r2 = routeRead(
        READ_CONSISTENCY_MODE.STRONG,
        true,
        makeSafetyInterval(false),
      );
      assert.strictEqual(r1, r2);
    });

    it('all FORWARD_TO_LEADER results are the same object',
      () => {
        const r1 = routeRead(
          READ_CONSISTENCY_MODE.LEADER_ONLY,
          false,
          makeSafetyInterval(true),
        );
        const r2 = routeRead(
          READ_CONSISTENCY_MODE.STRONG,
          false,
          makeSafetyInterval(false),
        );
        assert.strictEqual(r1, r2);
      });
  });
});
