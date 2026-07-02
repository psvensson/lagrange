import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {SafetyInterval} from '../../src/wasm-service/safety-interval.js';
import {
  DEFAULT_SAFETY_INTERVAL_MS,
} from '../../src/wasm-service/wasm-service-constants.js';

describe('SafetyInterval', () => {
  describe('constructor', () => {
    it('should use provided intervalMs', () => {
      const si = new SafetyInterval(1000);
      assert.equal(si.intervalMs, 1000);
    });

    it('should default to DEFAULT_SAFETY_INTERVAL_MS', () => {
      const si = new SafetyInterval();
      assert.equal(si.intervalMs, DEFAULT_SAFETY_INTERVAL_MS);
    });

    it('should initialize indices and timestamp to zero', () => {
      const si = new SafetyInterval();
      assert.equal(si.lastLeaderIndex, 0);
      assert.equal(si.lastLeaderTimestamp, 0);
      assert.equal(si.localAppliedIndex, 0);
    });
  });

  describe('broadcastState', () => {
    it('should return state object with committedIndex and timestamp',
      () => {
        const si = new SafetyInterval();
        const result = si.broadcastState(42, 1700000000000);
        assert.deepStrictEqual(result, {
          committedIndex: 42,
          timestamp: 1700000000000,
        });
      });

    it('should update internal leader state', () => {
      const si = new SafetyInterval();
      si.broadcastState(10, 1700000000000);
      assert.equal(si.lastLeaderIndex, 10);
      assert.equal(si.lastLeaderTimestamp, 1700000000000);
    });
  });

  describe('updateLeaderState', () => {
    it('should update lastLeaderIndex and lastLeaderTimestamp', () => {
      const si = new SafetyInterval();
      si.updateLeaderState(25, 1700000005000);
      assert.equal(si.lastLeaderIndex, 25);
      assert.equal(si.lastLeaderTimestamp, 1700000005000);
    });
  });

  describe('updateLocalAppliedIndex', () => {
    it('should update localAppliedIndex', () => {
      const si = new SafetyInterval();
      si.updateLocalAppliedIndex(15);
      assert.equal(si.localAppliedIndex, 15);
    });
  });

  describe('canServeRead', () => {
    it('should return false when no leader state received', () => {
      const si = new SafetyInterval(500);
      // lastLeaderTimestamp is 0, so (Date.now() - 0) >> 500
      assert.equal(si.canServeRead(), false);
    });

    it('should return true when applied >= leader index and within' +
      ' interval', () => {
      const si = new SafetyInterval(500);
      const now = Date.now();
      si.updateLeaderState(10, now);
      si.updateLocalAppliedIndex(10);
      assert.equal(si.canServeRead(), true);
    });

    it('should return true when applied > leader index and within' +
      ' interval', () => {
      const si = new SafetyInterval(500);
      const now = Date.now();
      si.updateLeaderState(10, now);
      si.updateLocalAppliedIndex(15);
      assert.equal(si.canServeRead(), true);
    });

    it('should return false when applied < leader index', () => {
      const si = new SafetyInterval(500);
      const now = Date.now();
      si.updateLeaderState(10, now);
      si.updateLocalAppliedIndex(5);
      assert.equal(si.canServeRead(), false);
    });

    it('should return false when leader broadcast is stale', () => {
      const si = new SafetyInterval(500);
      const staleTimestamp = Date.now() - 1000;
      si.updateLeaderState(10, staleTimestamp);
      si.updateLocalAppliedIndex(10);
      assert.equal(si.canServeRead(), false);
    });

    it('should return false when both conditions fail', () => {
      const si = new SafetyInterval(500);
      const staleTimestamp = Date.now() - 1000;
      si.updateLeaderState(10, staleTimestamp);
      si.updateLocalAppliedIndex(5);
      assert.equal(si.canServeRead(), false);
    });

    it('should work with broadcastState as well', () => {
      const si = new SafetyInterval(500);
      const now = Date.now();
      si.broadcastState(10, now);
      si.updateLocalAppliedIndex(10);
      assert.equal(si.canServeRead(), true);
    });
  });
});
