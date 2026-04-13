// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  DebugSessionResolver,
} from '../../src/debug/debug-session-resolver.js';
import {TABLES} from '../../src/constants/index.js';

function createSessionRow(overrides = {}) {
  return {
    session_id: overrides.session_id || 'session-1',
    tenant_id: overrides.tenant_id || 'tenant-a',
    service_name: overrides.service_name || 'svc-a',
    lineage_id: overrides.lineage_id || null,
    stage_id: overrides.stage_id ?? null,
    status: overrides.status || 'active',
    created_at: overrides.created_at ?? 1000,
    updated_at: overrides.updated_at ?? 1000,
  };
}

describe('DebugSessionResolver', () => {
  it('resolves active service-scoped session', () => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(
      TABLES.DEBUG_SESSIONS,
      'INSERT',
      createSessionRow(),
    );
    const resolver = new DebugSessionResolver({
      systemTableCache: cache,
      now: () => 1100,
      maxSessionAgeMs: 10000,
    });

    const session = resolver.resolveServiceSession({
      serviceDefinitionId: 'svc-a',
    });
    assert.equal(session.sessionId, 'session-1');
    assert.equal(resolver.isTraceActive({
      serviceDefinitionId: 'svc-a',
    }), true);
  });

  it('resolves callback-scoped lineage session', () => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(
      TABLES.DEBUG_SESSIONS,
      'INSERT',
      createSessionRow({
        session_id: 'session-2',
        lineage_id: 'lineage-2',
        stage_id: 2,
      }),
    );
    const resolver = new DebugSessionResolver({
      systemTableCache: cache,
      now: () => 2000,
      maxSessionAgeMs: 10000,
    });

    const session = resolver.resolveCallbackSession({
      serviceDefinitionId: 'svc-a',
      lineageId: 'lineage-2',
      stageId: 2,
    });
    assert.equal(session.sessionId, 'session-2');
  });

  it('treats stale sessions as inactive', () => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(
      TABLES.DEBUG_SESSIONS,
      'INSERT',
      createSessionRow({
        session_id: 'session-stale',
        updated_at: 1000,
      }),
    );
    const resolver = new DebugSessionResolver({
      systemTableCache: cache,
      now: () => 8000,
      maxSessionAgeMs: 1000,
    });

    assert.equal(
      resolver.resolveServiceSession({serviceDefinitionId: 'svc-a'}),
      null,
    );
    assert.equal(
      resolver.isTraceActive({serviceDefinitionId: 'svc-a'}),
      false,
    );
  });

  it('reflects CDC-updated cache state for resolver reads', () => {
    const cache = new SystemTableCache();
    const resolver = new DebugSessionResolver({
      systemTableCache: cache,
      now: () => 5000,
      maxSessionAgeMs: 10000,
    });

    assert.equal(
      resolver.isTraceActive({serviceDefinitionId: 'svc-a'}),
      false,
    );

    cache.applySystemTableChange(
      TABLES.DEBUG_SESSIONS,
      'INSERT',
      createSessionRow({
        session_id: 'session-cdc',
      }),
    );

    assert.equal(
      resolver.isTraceActive({serviceDefinitionId: 'svc-a'}),
      true,
    );
  });

  it('treats detached sessions as inactive', () => {
    const resolver = new DebugSessionResolver({
      readSessions: () => [
        createSessionRow({
          session_id: 'session-detached',
          status: 'detached',
        }),
      ],
      now: () => 2000,
      maxSessionAgeMs: 10000,
    });

    assert.equal(
      resolver.isTraceActive({serviceDefinitionId: 'svc-a'}),
      false,
    );
  });
});
