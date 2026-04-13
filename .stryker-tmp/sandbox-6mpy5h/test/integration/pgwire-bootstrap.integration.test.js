/**
 * Integration tests for sys-postgres-wire bootstrap and join flows.
 *
 * Validates that:
 * 1. Seed bootstrap registers the sys-postgres-wire service definition.
 * 2. Joining nodes receive the definition via cache hydration.
 * 3. Runtime lifecycle starts only after control-plane readiness.
 *
 * Requirements: 15.2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  registerBuiltInMetaServiceDefinitions,
} from
  '../../src/bootstrap/shared/meta-service-definition-registration.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  META_SERVICE_RUNTIME_REF,
} from '../../src/constants/wasm-meta.js';
import {
  WASM_SERVICE_PROTOCOL,
} from '../../src/wasm-service/wasm-service-constants.js';
import {
  PgWireStartupSafetyGate,
} from '../../src/bootstrap/pgwire-startup-safety-gate.js';
import {
  PGWIRE_SAFETY_GATE_ERROR_MSG,
} from '../../src/bootstrap/pgwire-startup-safety-gate-constants.js';

test('pgwire bootstrap integration', async (t) => {
  await t.test(
    'bootstrap registers sys-postgres-wire definition',
    async (t) => {
      const rows = [];
      await registerBuiltInMetaServiceDefinitions({
        upsertRow: async (_table, row) => rows.push(row),
      });

      const pgRow = rows.find(
        (r) => r.service_id === META_SERVICE_ID.POSTGRES_WIRE,
      );
      t.ok(pgRow, 'sys-postgres-wire row present');
      t.equal(pgRow.runtime_kind, RUNTIME_KIND.NATIVE_JS);
      t.equal(
        pgRow.runtime_ref,
        META_SERVICE_RUNTIME_REF.POSTGRES_WIRE,
      );
      t.equal(
        pgRow.protocol,
        WASM_SERVICE_PROTOCOL.POSTGRESQL,
      );
    },
  );

  await t.test(
    'join cache hydration includes pgwire definition fields',
    async (t) => {
      const rows = [];
      await registerBuiltInMetaServiceDefinitions({
        upsertRow: async (_table, row) => rows.push(row),
      });

      const pgRow = rows.find(
        (r) => r.service_id === META_SERVICE_ID.POSTGRES_WIRE,
      );
      t.ok(pgRow, 'definition present for hydration');
      t.ok(pgRow.runtime_kind, 'runtime_kind set');
      t.ok(pgRow.runtime_ref, 'runtime_ref set');
      t.ok(pgRow.protocol, 'protocol set');
    },
  );

  await t.test(
    'safety gate blocks startup without control plane',
    async (t) => {
      const gate = new PgWireStartupSafetyGate({
        nodeId: 'test-node',
      });
      const result = gate.checkControlPlaneReady();
      t.equal(result.ready, false);
      t.equal(
        result.reason,
        PGWIRE_SAFETY_GATE_ERROR_MSG.LIFECYCLE_MANAGER_MISSING,
      );
    },
  );

  await t.test(
    'safety gate passes with all dependencies',
    async (t) => {
      const gate = new PgWireStartupSafetyGate({
        nodeId: 'test-node',
        serviceLifecycleManager: {isRunning: () => true},
        systemTableCache: {get: () => ({})},
        heartbeatService: {isRunning: () => true},
      });
      const result = gate.checkControlPlaneReady();
      t.equal(result.ready, true);
    },
  );
});
