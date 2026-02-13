/**
 * Tests for admin-audit-queries.
 * Requirements: 4.5, 5.5
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {SQL, TABLES} from '../../src/constants/index.js';
import {
  REGISTRY_MAPPING_COL,
  REGISTRY_OVERRIDE_COL,
  DEPENDENCY_LOCK_COL,
} from '../../src/wasm-service/wasm-meta-models-constants.js';
import {
  buildMappingAuditQuery,
  buildOverrideAuditQuery,
  buildLockAuditQuery,
  buildResolutionTraceQuery,
} from '../../src/admin/admin-audit-queries.js';

const TEST_NAMESPACE = 'acme';
const TEST_NAME = 'my-pkg';
const TEST_VERSION = '1.0.0';

describe('admin-audit-queries', () => {
  describe('buildMappingAuditQuery', () => {
    it('returns filtered SQL when namespace provided', () => {
      const {sql, params} =
        buildMappingAuditQuery(TEST_NAMESPACE);
      assert.ok(sql.includes(
        TABLES.PACKAGE_REGISTRY_MAPPINGS,
      ));
      assert.ok(sql.includes(SQL.WHERE));
      assert.ok(sql.includes(
        REGISTRY_MAPPING_COL.NAMESPACE,
      ));
      assert.deepEqual(params, [TEST_NAMESPACE]);
    });

    it('returns unfiltered SQL without namespace', () => {
      const {sql, params} = buildMappingAuditQuery();
      assert.ok(sql.includes(
        TABLES.PACKAGE_REGISTRY_MAPPINGS,
      ));
      assert.ok(!sql.includes(SQL.WHERE));
      assert.deepEqual(params, []);
    });
  });

  describe('buildOverrideAuditQuery', () => {
    it('filters by namespace only', () => {
      const {sql, params} =
        buildOverrideAuditQuery(TEST_NAMESPACE);
      assert.ok(sql.includes(
        TABLES.PACKAGE_REGISTRY_OVERRIDES,
      ));
      assert.ok(sql.includes(SQL.WHERE));
      assert.ok(sql.includes(
        REGISTRY_OVERRIDE_COL.NAMESPACE,
      ));
      assert.ok(!sql.includes(SQL.AND));
      assert.deepEqual(params, [TEST_NAMESPACE]);
    });

    it('filters by namespace and name', () => {
      const {sql, params} =
        buildOverrideAuditQuery(TEST_NAMESPACE, TEST_NAME);
      assert.ok(sql.includes(SQL.WHERE));
      assert.ok(sql.includes(SQL.AND));
      assert.ok(sql.includes(
        REGISTRY_OVERRIDE_COL.NAMESPACE,
      ));
      assert.ok(sql.includes(
        REGISTRY_OVERRIDE_COL.NAME,
      ));
      assert.deepEqual(params, [TEST_NAMESPACE, TEST_NAME]);
    });

    it('returns unfiltered SQL with no filters', () => {
      const {sql, params} = buildOverrideAuditQuery();
      assert.ok(sql.includes(
        TABLES.PACKAGE_REGISTRY_OVERRIDES,
      ));
      assert.ok(!sql.includes(SQL.WHERE));
      assert.deepEqual(params, []);
    });
  });

  describe('buildLockAuditQuery', () => {
    it('filters by all three fields', () => {
      const {sql, params} = buildLockAuditQuery(
        TEST_NAMESPACE, TEST_NAME, TEST_VERSION,
      );
      assert.ok(sql.includes(
        TABLES.MODULE_DEPENDENCY_LOCKS,
      ));
      assert.ok(sql.includes(SQL.WHERE));
      assert.ok(sql.includes(
        DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE,
      ));
      assert.ok(sql.includes(
        DEPENDENCY_LOCK_COL.TARGET_MODULE_NAME,
      ));
      assert.ok(sql.includes(
        DEPENDENCY_LOCK_COL.TARGET_MODULE_VERSION,
      ));
      assert.deepEqual(
        params,
        [TEST_NAMESPACE, TEST_NAME, TEST_VERSION],
      );
    });

    it('filters by partial fields', () => {
      const {sql, params} =
        buildLockAuditQuery(TEST_NAMESPACE);
      assert.ok(sql.includes(SQL.WHERE));
      assert.ok(sql.includes(
        DEPENDENCY_LOCK_COL.TARGET_MODULE_NAMESPACE,
      ));
      assert.ok(!sql.includes(SQL.AND));
      assert.deepEqual(params, [TEST_NAMESPACE]);
    });

    it('returns unfiltered SQL with no filters', () => {
      const {sql, params} = buildLockAuditQuery();
      assert.ok(sql.includes(
        TABLES.MODULE_DEPENDENCY_LOCKS,
      ));
      assert.ok(!sql.includes(SQL.WHERE));
      assert.deepEqual(params, []);
    });
  });

  describe('buildResolutionTraceQuery', () => {
    it('returns both override and mapping queries', () => {
      const result =
        buildResolutionTraceQuery(TEST_NAMESPACE, TEST_NAME);
      assert.ok(result.overrideQuery);
      assert.ok(result.mappingQuery);
      assert.ok(result.overrideQuery.sql.includes(SQL.WHERE));
      assert.ok(result.mappingQuery.sql.includes(SQL.WHERE));
      assert.deepEqual(
        result.overrideQuery.params,
        [TEST_NAMESPACE, TEST_NAME],
      );
      assert.deepEqual(
        result.mappingQuery.params,
        [TEST_NAMESPACE],
      );
    });

    it('queries target correct tables', () => {
      const result =
        buildResolutionTraceQuery(TEST_NAMESPACE);
      assert.ok(result.overrideQuery.sql.includes(
        TABLES.PACKAGE_REGISTRY_OVERRIDES,
      ));
      assert.ok(result.mappingQuery.sql.includes(
        TABLES.PACKAGE_REGISTRY_MAPPINGS,
      ));
    });
  });
});
