import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  LineageTracker,
} from '../../src/query/lineage-tracker.js';
import {
  GUARDRAIL_FIELD as GF,
  LINEAGE_SEPARATOR,
} from '../../src/query/guardrail-constants.js';

describe('LineageTracker', () => {
  describe('generateLineageId', () => {
    it('should produce queryId:stage:type:seq format', () => {
      const tracker = new LineageTracker('q-1');
      const id = tracker.generateLineageId(0, 'lookup', 1);
      assert.equal(id, `q-1${LINEAGE_SEPARATOR}0` +
        `${LINEAGE_SEPARATOR}lookup${LINEAGE_SEPARATOR}1`);
    });

    it('should be deterministic for same inputs', () => {
      const tracker = new LineageTracker('q-2');
      const a = tracker.generateLineageId(1, 'emit', 3);
      const b = tracker.generateLineageId(1, 'emit', 3);
      assert.equal(a, b);
    });

    it('should differ for different inputs', () => {
      const tracker = new LineageTracker('q-3');
      const a = tracker.generateLineageId(0, 'emit', 0);
      const b = tracker.generateLineageId(0, 'emit', 1);
      assert.notEqual(a, b);
    });
  });

  describe('attachLineage', () => {
    it('should set lineageId field on artifact', () => {
      const tracker = new LineageTracker('q-4');
      const artifact = {};
      tracker.attachLineage(artifact, 0, 'lookup', 0);
      assert.ok(artifact[GF.LINEAGE_ID]);
    });

    it('should return the artifact', () => {
      const tracker = new LineageTracker('q-5');
      const artifact = {data: 'test'};
      const result = tracker.attachLineage(
        artifact, 0, 'broadcast', 0,
      );
      assert.equal(result, artifact);
    });
  });

  describe('extractLineage', () => {
    it('should return lineage ID from artifact', () => {
      const tracker = new LineageTracker('q-6');
      const artifact = {};
      tracker.attachLineage(artifact, 2, 'emit', 5);
      const id = tracker.extractLineage(artifact);
      assert.equal(
        id,
        tracker.generateLineageId(2, 'emit', 5),
      );
    });

    it('should return null when no lineage present', () => {
      const tracker = new LineageTracker('q-7');
      assert.equal(tracker.extractLineage({}), null);
    });
  });
});
