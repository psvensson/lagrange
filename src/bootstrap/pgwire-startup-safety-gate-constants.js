/**
 * Constants for PgWireStartupSafetyGate.
 *
 * Defines log messages, error messages, and subsystem identifier
 * for the PG wire bootstrap/join safety gate.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */

const PGWIRE_SAFETY_GATE_SUBSYSTEM = 'pgwire-startup-safety-gate';

const PGWIRE_SAFETY_GATE_LOG_MSG = Object.freeze({
  GATE_BLOCKED:
    'PG wire startup blocked: control-plane prerequisites not met',
  GATE_PASSED:
    'PG wire startup gate passed: control-plane ready',
  SETUP_COMPLETED:
    'Runtime service handler setup completed for PG wire',
  SETUP_FAILED_ISOLATED:
    'PG wire runtime service handler setup failed (isolated)',
});

const PGWIRE_SAFETY_GATE_ERROR_MSG = Object.freeze({
  LIFECYCLE_MANAGER_MISSING:
    'serviceLifecycleManager not available',
  SYSTEM_CACHE_MISSING:
    'systemTableCache not available',
  CONTROL_PLANE_NOT_READY:
    'heartbeatService not initialized (control plane not ready)',
});

export {
  PGWIRE_SAFETY_GATE_ERROR_MSG,
  PGWIRE_SAFETY_GATE_LOG_MSG,
  PGWIRE_SAFETY_GATE_SUBSYSTEM,
};
