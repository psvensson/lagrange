import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  DebugMetadataStore,
} from '../../src/debug-runtime/debug-metadata-service.js';
import {
  DEBUG_METADATA_ERROR_CODE as CODE,
  DEBUG_METADATA_ROLE as ROLE,
} from '../../src/debug-runtime/debug-metadata-service-constants.js';
import {
  DEBUG_SESSION_STATUS,
} from '../../src/debug-runtime/debug-metadata-constants.js';

const SECURITY_ADMIN = Object.freeze({
  tenantId: 'tenant-a',
  principal: 'alice',
  roles: [ROLE.ADMIN],
});

const SECURITY_READ = Object.freeze({
  tenantId: 'tenant-a',
  principal: 'bob',
  roles: [ROLE.READ],
});

describe('DebugMetadataStore SQL/CDC ownership and authz', () => {
  it('persists session metadata through SqlRequest execution only', async () => {
    const engine = createMemorySqlEngine();
    const store = new DebugMetadataStore({sqlQueryEngine: engine, now: () => 100});

    const created = await store.createSession({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-1',
      serviceName: 'svc-debug',
      lineageId: 'lineage-1',
      stageId: 1,
      nodeId: 'node-a',
      endpoint: 'ws://node-a/debug',
    });

    const loaded = await store.getSession({
      securityContext: SECURITY_READ,
      sessionId: 'session-1',
    });

    assert.equal(created.sessionId, 'session-1');
    assert.equal(created.tenantId, 'tenant-a');
    assert.equal(loaded.endpoint, 'ws://node-a/debug');
    assert.equal(engine.requests.length >= 2, true);
    assert.equal(engine.requests[0].tenantId, 'tenant-a');
    assert.equal(engine.requests[0].executionMode, 'sql_statement');
  });

  it('enforces session attach authorization before SQL read', async () => {
    const engine = createMemorySqlEngine();
    const store = new DebugMetadataStore({sqlQueryEngine: engine});

    await store.createSession({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-2',
      serviceName: 'svc-debug',
    });

    const beforeAttachRequests = engine.requests.length;
    await assert.rejects(
      store.attachSession({
        securityContext: {
          tenantId: 'tenant-a',
          principal: 'eve',
          roles: [],
        },
        sessionId: 'session-2',
      }),
      (error) => {
        assert.equal(error.code, CODE.UNAUTHORIZED);
        return true;
      },
    );
    assert.equal(engine.requests.length, beforeAttachRequests);
  });

  it('enforces tenant isolation for session and breakpoint reads', async () => {
    const engine = createMemorySqlEngine();
    const store = new DebugMetadataStore({sqlQueryEngine: engine, now: () => 200});

    await store.createSession({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-3',
      serviceName: 'svc-debug',
    });
    await store.writeBreakpoints({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-3',
      moduleRef: 'svc:debug@1.0.0',
      sourceFileUrl: 'file:///src/service.ts',
      breakpoints: [{lineNumber: 10, resolved: true}],
    });

    const crossTenantSession = await store.getSession({
      securityContext: {
        tenantId: 'tenant-b',
        principal: 'mallory',
        roles: [ROLE.READ],
      },
      sessionId: 'session-3',
    });
    const crossTenantBreakpoints = await store.listBreakpoints({
      securityContext: {
        tenantId: 'tenant-b',
        principal: 'mallory',
        roles: [ROLE.READ],
      },
      sessionId: 'session-3',
    });

    assert.equal(crossTenantSession, null);
    assert.equal(crossTenantBreakpoints.length, 0);
  });

  it('updates and detaches sessions through SQL mutation path', async () => {
    const engine = createMemorySqlEngine();
    const store = new DebugMetadataStore({sqlQueryEngine: engine, now: () => 210});

    await store.createSession({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-3b',
      serviceName: 'svc-debug',
      endpoint: 'ws://node-a/debug',
      nodeId: 'node-a',
      stageId: 1,
    });

    const updated = await store.updateSession({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-3b',
      endpoint: 'ws://node-b/debug',
      nodeId: 'node-b',
      stageId: 2,
      lineageId: 'lineage-3b',
    });
    assert.equal(updated.endpoint, 'ws://node-b/debug');
    assert.equal(updated.nodeId, 'node-b');
    assert.equal(updated.stageId, 2);
    assert.equal(updated.lineageId, 'lineage-3b');

    const detached = await store.detachSession({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-3b',
    });
    assert.equal(detached.status, DEBUG_SESSION_STATUS.DETACHED);
    assert.equal(detached.endpoint, null);
    assert.equal(detached.nodeId, null);

    const loaded = await store.getSession({
      securityContext: SECURITY_READ,
      sessionId: 'session-3b',
    });
    assert.equal(loaded.status, DEBUG_SESSION_STATUS.DETACHED);
  });

  it('writes and reads snapshot metadata with envelope decoding', async () => {
    const engine = createMemorySqlEngine();
    const store = new DebugMetadataStore({sqlQueryEngine: engine, now: () => 300});

    await store.createSession({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-4',
      serviceName: 'svc-debug',
    });

    const persisted = await store.writeSnapshot({
      securityContext: SECURITY_ADMIN,
      sessionId: 'session-4',
      snapshotArtifact: {
        manifest: {
          snapshotId: 'snapshot-1',
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'a'.repeat(64),
          capturedAt: 300,
          formatVersion: 1,
          frameCount: 2,
          hostCallCount: 1,
          totalBytes: 3,
        },
        snapshot: {
          snapshotId: 'snapshot-1',
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'a'.repeat(64),
        },
        envelope: Buffer.from([1, 2, 3]),
      },
    });

    const loaded = await store.getSnapshot({
      securityContext: SECURITY_READ,
      sessionId: 'session-4',
      snapshotId: 'snapshot-1',
      includeEnvelope: true,
    });

    assert.equal(persisted.snapshotId, 'snapshot-1');
    assert.equal(loaded.snapshotId, 'snapshot-1');
    assert.deepEqual(Array.from(loaded.envelope), [1, 2, 3]);
    assert.equal(loaded.manifest.frameCount, 2);
  });

  it('fails fast when SQL engine is missing', async () => {
    const store = new DebugMetadataStore();

    await assert.rejects(
      store.createSession({
        securityContext: SECURITY_ADMIN,
        sessionId: 'session-5',
        serviceName: 'svc-debug',
      }),
      (error) => {
        assert.equal(error.code, CODE.ENGINE_REQUIRED);
        return true;
      },
    );
  });
});

function createMemorySqlEngine() {
  const sessions = new Map();
  const breakpoints = new Map();
  const snapshots = new Map();
  const requests = [];

  return {
    requests,
    async executeRequest(sqlRequest) {
      requests.push(sqlRequest);
      const sql = sqlRequest.statement.toLowerCase();
      const params = sqlRequest.parameters || [];

      if (sql.startsWith('insert or replace into debug_sessions')) {
        const row = {
          session_id: params[0],
          tenant_id: params[1],
          service_name: params[2],
          lineage_id: params[3],
          stage_id: params[4],
          node_id: params[5],
          endpoint: params[6],
          status: params[7],
          created_at: params[8],
          updated_at: params[9],
        };
        sessions.set(row.session_id, row);
        return {success: true, affectedRows: 1};
      }

      if (sql.startsWith('insert or replace into debug_breakpoints')) {
        const row = {
          breakpoint_id: params[0],
          session_id: params[1],
          tenant_id: params[2],
          module_ref: params[3],
          source_file_url: params[4],
          line_number: params[5],
          column_number: params[6],
          condition: params[7],
          resolved: params[8],
          created_at: params[9],
          updated_at: params[10],
        };
        breakpoints.set(row.breakpoint_id, row);
        return {success: true, affectedRows: 1};
      }

      if (sql.startsWith('insert or replace into debug_snapshots')) {
        const row = {
          snapshot_id: params[0],
          session_id: params[1],
          tenant_id: params[2],
          module_ref: params[3],
          module_digest: params[4],
          captured_at: params[5],
          format_version: params[6],
          snapshot_bytes_base64: params[7],
          manifest_json: params[8],
          total_bytes: params[9],
          frame_count: params[10],
          host_call_count: params[11],
          created_at: params[12],
          updated_at: params[13],
        };
        snapshots.set(row.snapshot_id, row);
        return {success: true, affectedRows: 1};
      }

      if (sql.includes('from debug_sessions')) {
        if (sql.includes('session_id = ?1') && sql.includes('tenant_id = ?2')) {
          const row = sessions.get(params[0]);
          const rows = row && row.tenant_id === params[1] ? [row] : [];
          return {success: true, rows};
        }

        let rows = Array.from(sessions.values()).filter(
          (row) => row.tenant_id === params[0],
        );
        if (sql.includes('service_name = ?2')) {
          rows = rows.filter((row) => row.service_name === params[1]);
        }
        if (sql.includes('lineage_id = ?2')) {
          rows = rows.filter((row) => row.lineage_id === params[1]);
        }
        if (sql.includes('lineage_id = ?3')) {
          rows = rows.filter((row) => row.lineage_id === params[2]);
        }
        return {success: true, rows};
      }

      if (sql.includes('from debug_breakpoints')) {
        const rows = Array.from(breakpoints.values()).filter(
          (row) => row.tenant_id === params[0] && row.session_id === params[1],
        );
        return {success: true, rows};
      }

      if (sql.includes('from debug_snapshots')) {
        if (sql.includes('snapshot_id = ?1') && sql.includes('tenant_id = ?2')) {
          const row = snapshots.get(params[0]);
          const rows = row && row.tenant_id === params[1] ? [row] : [];
          return {success: true, rows};
        }
        const rows = Array.from(snapshots.values()).filter(
          (row) => row.tenant_id === params[0] && row.session_id === params[1],
        );
        return {success: true, rows};
      }

      return {success: true, rows: []};
    },
  };
}
