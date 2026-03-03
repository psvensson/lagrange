/**
 * Unit tests for PG type affinity map.
 *
 * Requirements: 6.3
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  PG_TYPE_AFFINITY_MAP,
  resolveAffinity,
} from '../../src/query/pg/pg-type-affinity.js';

describe('PG_TYPE_AFFINITY_MAP', () => {
  it('is frozen', () => {
    assert.ok(Object.isFrozen(PG_TYPE_AFFINITY_MAP));
  });
});

describe('resolveAffinity', () => {
  describe('TEXT affinity types', () => {
    it('maps VARCHAR to TEXT', () => {
      assert.equal(resolveAffinity('VARCHAR'), 'TEXT');
    });

    it('maps TEXT to TEXT', () => {
      assert.equal(resolveAffinity('TEXT'), 'TEXT');
    });

    it('maps CHAR to TEXT', () => {
      assert.equal(resolveAffinity('CHAR'), 'TEXT');
    });

    it('maps CHARACTER VARYING to TEXT', () => {
      assert.equal(resolveAffinity('CHARACTER VARYING'), 'TEXT');
    });
  });

  describe('INTEGER affinity types', () => {
    it('maps INTEGER to INTEGER', () => {
      assert.equal(resolveAffinity('INTEGER'), 'INTEGER');
    });

    it('maps INT to INTEGER', () => {
      assert.equal(resolveAffinity('INT'), 'INTEGER');
    });

    it('maps SMALLINT to INTEGER', () => {
      assert.equal(resolveAffinity('SMALLINT'), 'INTEGER');
    });

    it('maps BIGINT to INTEGER', () => {
      assert.equal(resolveAffinity('BIGINT'), 'INTEGER');
    });

    it('maps SERIAL to INTEGER', () => {
      assert.equal(resolveAffinity('SERIAL'), 'INTEGER');
    });

    it('maps BIGSERIAL to INTEGER', () => {
      assert.equal(resolveAffinity('BIGSERIAL'), 'INTEGER');
    });

    it('maps BOOLEAN to INTEGER', () => {
      assert.equal(resolveAffinity('BOOLEAN'), 'INTEGER');
    });
  });

  describe('REAL affinity types', () => {
    it('maps REAL to REAL', () => {
      assert.equal(resolveAffinity('REAL'), 'REAL');
    });

    it('maps DOUBLE PRECISION to REAL', () => {
      assert.equal(resolveAffinity('DOUBLE PRECISION'), 'REAL');
    });

    it('maps FLOAT to REAL', () => {
      assert.equal(resolveAffinity('FLOAT'), 'REAL');
    });

    it('maps NUMERIC to REAL', () => {
      assert.equal(resolveAffinity('NUMERIC'), 'REAL');
    });

    it('maps DECIMAL to REAL', () => {
      assert.equal(resolveAffinity('DECIMAL'), 'REAL');
    });
  });

  describe('BLOB affinity types', () => {
    it('maps BYTEA to BLOB', () => {
      assert.equal(resolveAffinity('BYTEA'), 'BLOB');
    });
  });

  describe('case insensitivity', () => {
    it('maps lowercase varchar to TEXT', () => {
      assert.equal(resolveAffinity('varchar'), 'TEXT');
    });

    it('maps mixed-case Varchar to TEXT', () => {
      assert.equal(resolveAffinity('Varchar'), 'TEXT');
    });

    it('maps uppercase VARCHAR to TEXT', () => {
      assert.equal(resolveAffinity('VARCHAR'), 'TEXT');
    });

    it('maps mixed-case Integer to INTEGER', () => {
      assert.equal(resolveAffinity('Integer'), 'INTEGER');
    });

    it('maps mixed-case Double Precision to REAL', () => {
      assert.equal(resolveAffinity('Double Precision'), 'REAL');
    });
  });

  describe('unknown types pass through uppercased', () => {
    it('passes through jsonb as JSONB', () => {
      assert.equal(resolveAffinity('jsonb'), 'JSONB');
    });

    it('passes through uuid as UUID', () => {
      assert.equal(resolveAffinity('uuid'), 'UUID');
    });

    it('passes through xml as XML', () => {
      assert.equal(resolveAffinity('xml'), 'XML');
    });

    it('passes through mixed-case unknown as uppercased', () => {
      assert.equal(resolveAffinity('MyCustomType'), 'MYCUSTOMTYPE');
    });
  });
});
