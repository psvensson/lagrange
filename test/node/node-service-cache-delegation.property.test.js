/**
 * Property test for NodeService cache delegation.
 *
 * Feature: message-group-resilient-proxy
 * Property 7: NodeService delegates cache access to
 * SystemCacheProxy
 *
 * For any call to getSystemTableCache() on NodeService after
 * bootstrap, the returned object should be the SystemCacheProxy
 * instance set during bootstrap — not a separately created
 * SystemTableCache.
 *
 * **Validates: Requirements 8.1**
 *
 * @module test/node/node-service-cache-delegation.property
 */

import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';
import {NodeService} from '../../src/node/node-service.js';

describe('Property 7: NodeService delegates cache access ' +
    'to SystemCacheProxy', () => {
  beforeEach(() => {
    NodeService.resetInstance();
  });

  afterEach(() => {
    NodeService.resetInstance();
  });

  it('getSystemTableCache returns the proxy set via ' +
      'setSystemCacheProxy', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          query: fc.func(fc.anything()),
          execute: fc.func(fc.anything()),
        }),
        (proxyShape) => {
          NodeService.resetInstance();
          const nodeService = NodeService.getInstance();

          // Create a mock proxy object with generated shape
          const mockProxy = {
            id: proxyShape.id,
            query: proxyShape.query,
            execute: proxyShape.execute,
          };

          nodeService.setSystemCacheProxy(mockProxy);

          const result = nodeService.getSystemTableCache();
          assert.strictEqual(
            result,
            mockProxy,
            'getSystemTableCache must return the exact proxy ' +
            'instance set via setSystemCacheProxy',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('getReadOnlySystemTableCache returns the same proxy ' +
      'set via setSystemCacheProxy', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          query: fc.func(fc.anything()),
          execute: fc.func(fc.anything()),
        }),
        (proxyShape) => {
          NodeService.resetInstance();
          const nodeService = NodeService.getInstance();

          const mockProxy = {
            id: proxyShape.id,
            query: proxyShape.query,
            execute: proxyShape.execute,
          };

          nodeService.setSystemCacheProxy(mockProxy);

          const result = nodeService.getReadOnlySystemTableCache();
          assert.strictEqual(
            result,
            mockProxy,
            'getReadOnlySystemTableCache must return the ' +
            'exact proxy instance set via setSystemCacheProxy',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('both cache accessors return the same proxy ' +
      'reference', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          data: fc.string(),
        }),
        (proxyShape) => {
          NodeService.resetInstance();
          const nodeService = NodeService.getInstance();

          const mockProxy = {
            id: proxyShape.id,
            data: proxyShape.data,
          };

          nodeService.setSystemCacheProxy(mockProxy);

          const cache = nodeService.getSystemTableCache();
          const readOnly = nodeService.getReadOnlySystemTableCache();

          assert.strictEqual(
            cache,
            readOnly,
            'getSystemTableCache and getReadOnlySystemTableCache ' +
            'must return the same proxy reference',
          );
        },
      ),
      {numRuns: 10},
    );
  });

  it('replacing the proxy updates both accessors to the ' +
      'new instance', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (id1, id2) => {
          fc.pre(id1 !== id2);

          NodeService.resetInstance();
          const nodeService = NodeService.getInstance();

          const proxy1 = {id: id1};
          const proxy2 = {id: id2};

          nodeService.setSystemCacheProxy(proxy1);
          assert.strictEqual(
            nodeService.getSystemTableCache(),
            proxy1,
            'First proxy must be returned initially',
          );

          nodeService.setSystemCacheProxy(proxy2);
          assert.strictEqual(
            nodeService.getSystemTableCache(),
            proxy2,
            'Second proxy must replace the first',
          );
          assert.strictEqual(
            nodeService.getReadOnlySystemTableCache(),
            proxy2,
            'Read-only accessor must also return the ' +
            'second proxy',
          );
        },
      ),
      {numRuns: 10},
    );
  });
});
