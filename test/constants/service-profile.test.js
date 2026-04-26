import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_PROFILE,
} from '../../src/constants/service.js';
import {
  SQL_ENGINE_PROFILE,
} from '../../src/wasm-service/wasm-service-constants.js';

describe('SERVICE_PROFILE', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(SERVICE_PROFILE));
  });

  it('should have DEFAULT profile', () => {
    assert.equal(SERVICE_PROFILE.DEFAULT, 'default');
  });

  it('should have SQL_ENGINE profile', () => {
    assert.equal(SERVICE_PROFILE.SQL_ENGINE, 'sql_engine');
  });

  it('should have exactly two profiles', () => {
    assert.equal(Object.keys(SERVICE_PROFILE).length, 2);
  });
});

describe('SQL_ENGINE_PROFILE', () => {
  it('should be frozen', () => {
    assert.ok(Object.isFrozen(SQL_ENGINE_PROFILE));
  });

  it('should have subsystem name', () => {
    assert.equal(
      SQL_ENGINE_PROFILE.SUBSYSTEM, 'sql-engine-profile',
    );
  });

  it('should have leader_only default read consistency', () => {
    assert.equal(
      SQL_ENGINE_PROFILE.DEFAULT_READ_CONSISTENCY, 'leader_only',
    );
  });

  it('should have strong default write consistency', () => {
    assert.equal(
      SQL_ENGINE_PROFILE.DEFAULT_WRITE_CONSISTENCY, 'strong',
    );
  });
});
