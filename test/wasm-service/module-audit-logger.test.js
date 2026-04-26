/**
 * Tests for module audit logger — structured audit logging
 * for module and capability resolution decisions.
 *
 * Requirements: 8.5
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createAuditRecord,
  auditManifestValidation,
  auditRunExportVerification,
  auditDependencyResolution,
  auditCapabilityDecision,
  auditModuleActivation,
} from '../../src/wasm-service/module-audit-logger.js';
import {
  MODULE_AUDIT_MSG as MSG,
  RESOLUTION_DECISION as DECISION,
} from '../../src/wasm-service/module-manifest-constants.js';

// --- createAuditRecord ---

test('createAuditRecord - produces frozen record', (t) => {
  const record = createAuditRecord(
    MSG.MODULE_ACTIVATED, DECISION.ALLOWED, {moduleId: 'mod-1'},
  );
  t.ok(Object.isFrozen(record));
  t.equal(record.message, MSG.MODULE_ACTIVATED);
  t.equal(record.decision, DECISION.ALLOWED);
  t.equal(record.moduleId, 'mod-1');
  t.equal(typeof record.timestamp, 'number');
  t.end();
});

// --- auditManifestValidation ---

test('auditManifestValidation - passed', (t) => {
  const record = auditManifestValidation(
    'mod-1', true, [], null,
  );
  t.equal(record.message, MSG.MANIFEST_VALIDATION_PASSED);
  t.equal(record.decision, DECISION.ALLOWED);
  t.equal(record.moduleId, 'mod-1');
  t.equal(record.valid, true);
  t.equal(record.errors.length, 0);
  t.end();
});

test('auditManifestValidation - failed', (t) => {
  const errors = ['missing field'];
  const record = auditManifestValidation(
    'mod-1', false, errors, null,
  );
  t.equal(record.message, MSG.MANIFEST_VALIDATION_FAILED);
  t.equal(record.decision, DECISION.REJECTED);
  t.equal(record.valid, false);
  t.equal(record.errors.length, 1);
  t.end();
});

test('auditManifestValidation - calls logger', (t) => {
  let captured = null;
  const logger = (rec) => {
    captured = rec;
  };
  auditManifestValidation('mod-1', true, [], logger);
  t.ok(captured);
  t.equal(captured.moduleId, 'mod-1');
  t.end();
});

// --- auditRunExportVerification ---

test('auditRunExportVerification - found', (t) => {
  const record = auditRunExportVerification(
    'mod-1', 'run_batch', true, null,
  );
  t.equal(record.message, MSG.RUN_EXPORT_VERIFIED);
  t.equal(record.decision, DECISION.RESOLVED);
  t.equal(record.runExport, 'run_batch');
  t.equal(record.found, true);
  t.end();
});

test('auditRunExportVerification - not found', (t) => {
  const record = auditRunExportVerification(
    'mod-1', 'missing_fn', false, null,
  );
  t.equal(record.decision, DECISION.REJECTED);
  t.equal(record.found, false);
  t.end();
});

test('auditRunExportVerification - calls logger', (t) => {
  let captured = null;
  const logger = (rec) => {
    captured = rec;
  };
  auditRunExportVerification('mod-1', 'run', true, logger);
  t.ok(captured);
  t.equal(captured.runExport, 'run');
  t.end();
});

// --- auditDependencyResolution ---

test('auditDependencyResolution - resolved', (t) => {
  const record = auditDependencyResolution(
    'mod-1', 'cap_sql', true, [], null,
  );
  t.equal(record.message, MSG.DEPENDENCY_RESOLVED);
  t.equal(record.decision, DECISION.RESOLVED);
  t.equal(record.depModuleId, 'cap_sql');
  t.equal(record.resolved, true);
  t.end();
});

test('auditDependencyResolution - rejected', (t) => {
  const record = auditDependencyResolution(
    'mod-1', 'cap_sql', false, ['not found'], null,
  );
  t.equal(record.message, MSG.DEPENDENCY_REJECTED);
  t.equal(record.decision, DECISION.REJECTED);
  t.equal(record.resolved, false);
  t.equal(record.errors.length, 1);
  t.end();
});

test('auditDependencyResolution - calls logger', (t) => {
  let captured = null;
  const logger = (rec) => {
    captured = rec;
  };
  auditDependencyResolution(
    'mod-1', 'cap_sql', true, [], logger,
  );
  t.ok(captured);
  t.equal(captured.depModuleId, 'cap_sql');
  t.end();
});

// --- auditCapabilityDecision ---

test('auditCapabilityDecision - allowed', (t) => {
  const record = auditCapabilityDecision(
    'mod-1', 'sql.read', true, null,
  );
  t.equal(record.message, MSG.CAPABILITY_ALLOWED);
  t.equal(record.decision, DECISION.ALLOWED);
  t.equal(record.capability, 'sql.read');
  t.equal(record.allowed, true);
  t.end();
});

test('auditCapabilityDecision - denied', (t) => {
  const record = auditCapabilityDecision(
    'mod-1', 'net.http', false, null,
  );
  t.equal(record.message, MSG.CAPABILITY_DENIED);
  t.equal(record.decision, DECISION.DENIED);
  t.equal(record.allowed, false);
  t.end();
});

test('auditCapabilityDecision - calls logger', (t) => {
  let captured = null;
  const logger = (rec) => {
    captured = rec;
  };
  auditCapabilityDecision('mod-1', 'sql.read', true, logger);
  t.ok(captured);
  t.equal(captured.capability, 'sql.read');
  t.end();
});

// --- auditModuleActivation ---

test('auditModuleActivation - activated', (t) => {
  const record = auditModuleActivation(
    'mod-1', true, [], null,
  );
  t.equal(record.message, MSG.MODULE_ACTIVATED);
  t.equal(record.decision, DECISION.ALLOWED);
  t.equal(record.activated, true);
  t.equal(record.errors.length, 0);
  t.end();
});

test('auditModuleActivation - rejected', (t) => {
  const record = auditModuleActivation(
    'mod-1', false, ['policy denied'], null,
  );
  t.equal(record.message, MSG.MODULE_ACTIVATION_REJECTED);
  t.equal(record.decision, DECISION.REJECTED);
  t.equal(record.activated, false);
  t.equal(record.errors.length, 1);
  t.end();
});

test('auditModuleActivation - calls logger', (t) => {
  let captured = null;
  const logger = (rec) => {
    captured = rec;
  };
  auditModuleActivation('mod-1', true, [], logger);
  t.ok(captured);
  t.equal(captured.moduleId, 'mod-1');
  t.end();
});

test('auditModuleActivation - no logger is safe', (t) => {
  const record = auditModuleActivation(
    'mod-1', true, [], undefined,
  );
  t.ok(record);
  t.equal(record.moduleId, 'mod-1');
  t.end();
});
