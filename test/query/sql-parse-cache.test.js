import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {SqlParseCache} from '../../src/query/sql-parse-cache.js';
import {SQL_PARSE_CACHE} from '../../src/query/query-constants.js';

describe('SqlParseCache', () => {
  describe('constructor', () => {
    it('should use default max size from constants', () => {
      const cache = new SqlParseCache();
      assert.equal(cache.maxSize, SQL_PARSE_CACHE.DEFAULT_MAX_SIZE);
    });

    it('should accept custom max size', () => {
      const cache = new SqlParseCache(5);
      assert.equal(cache.maxSize, 5);
    });
  });

  describe('get/set round-trip', () => {
    it('should return null on cache miss', () => {
      const cache = new SqlParseCache();
      assert.equal(cache.get('SELECT 1', undefined), null);
    });

    it('should return cached AST on hit', () => {
      const cache = new SqlParseCache();
      const ast = {type: 'select', columns: ['*']};
      cache.set('SELECT *', undefined, ast);
      const result = cache.get('SELECT *', undefined);
      assert.deepStrictEqual(result, ast);
    });

    it('should return a deep clone, not the same reference', () => {
      const cache = new SqlParseCache();
      const ast = {type: 'select', columns: ['a', 'b']};
      cache.set('SELECT a, b', undefined, ast);
      const clone1 = cache.get('SELECT a, b', undefined);
      const clone2 = cache.get('SELECT a, b', undefined);
      assert.notEqual(clone1, clone2);
      assert.notEqual(clone1, ast);
    });

    it('should preserve _paramMapping in cloned PG dialect AST', () => {
      const cache = new SqlParseCache();
      const ast = {
        type: 'select',
        where: {column: 'id', value: '?'},
        _paramMapping: [2, 0, 1],
      };
      cache.set('SELECT * FROM t WHERE id = $1', 'postgresql', ast);
      const result = cache.get(
        'SELECT * FROM t WHERE id = $1', 'postgresql',
      );
      assert.deepStrictEqual(result._paramMapping, [2, 0, 1]);
    });

    it('should not be affected by mutations to returned clone', () => {
      const cache = new SqlParseCache();
      const ast = {type: 'insert', table: 'users'};
      cache.set('INSERT INTO users', undefined, ast);
      const clone = cache.get('INSERT INTO users', undefined);
      clone.type = 'MUTATED';
      const fresh = cache.get('INSERT INTO users', undefined);
      assert.equal(fresh.type, 'insert');
    });
  });

  describe('buildKey', () => {
    it('should use sql alone when no dialect', () => {
      const cache = new SqlParseCache();
      assert.equal(cache.buildKey('SELECT 1', undefined), 'SELECT 1');
      assert.equal(cache.buildKey('SELECT 1', null), 'SELECT 1');
      assert.equal(cache.buildKey('SELECT 1', ''), 'SELECT 1');
    });

    it('should prefix with dialect when provided', () => {
      const cache = new SqlParseCache();
      assert.equal(
        cache.buildKey('SELECT 1', 'postgresql'),
        'postgresql:SELECT 1',
      );
    });

    it('should separate entries by dialect', () => {
      const cache = new SqlParseCache();
      const sqliteAst = {type: 'select', dialect: 'sqlite'};
      const pgAst = {type: 'select', dialect: 'pg'};
      cache.set('SELECT 1', undefined, sqliteAst);
      cache.set('SELECT 1', 'postgresql', pgAst);
      assert.deepStrictEqual(
        cache.get('SELECT 1', undefined),
        sqliteAst,
      );
      assert.deepStrictEqual(
        cache.get('SELECT 1', 'postgresql'),
        pgAst,
      );
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry at capacity', () => {
      const cache = new SqlParseCache(2);
      cache.set('q1', undefined, {id: 1});
      cache.set('q2', undefined, {id: 2});
      // q1 is LRU, adding q3 should evict q1
      cache.set('q3', undefined, {id: 3});
      assert.equal(cache.get('q1', undefined), null);
      assert.deepStrictEqual(cache.get('q2', undefined), {id: 2});
      assert.deepStrictEqual(cache.get('q3', undefined), {id: 3});
    });

    it('should promote accessed entry so it is not evicted', () => {
      const cache = new SqlParseCache(2);
      cache.set('q1', undefined, {id: 1});
      cache.set('q2', undefined, {id: 2});
      // Access q1 to promote it; q2 is now LRU
      cache.get('q1', undefined);
      cache.set('q3', undefined, {id: 3});
      assert.deepStrictEqual(cache.get('q1', undefined), {id: 1});
      assert.equal(cache.get('q2', undefined), null);
    });

    it('should never exceed max size', () => {
      const cache = new SqlParseCache(3);
      for (let i = 0; i < 10; i++) {
        cache.set(`q${i}`, undefined, {id: i});
      }
      assert.equal(cache.cache.size, 3);
    });

    it('should update existing entry without growing size', () => {
      const cache = new SqlParseCache(2);
      cache.set('q1', undefined, {v: 'old'});
      cache.set('q2', undefined, {v: 2});
      cache.set('q1', undefined, {v: 'new'});
      assert.equal(cache.cache.size, 2);
      assert.deepStrictEqual(cache.get('q1', undefined), {v: 'new'});
    });
  });
});
