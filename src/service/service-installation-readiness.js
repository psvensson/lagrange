/**
 * Canonical achieved-readiness projection for service installations.
 *
 * Separates requested installation intent (`desired_state`), durable rollout
 * state (`rollout_state`), failure records (`latest_failure_id`), and achieved
 * service usability (`readiness_state` / `readiness_reason`).
 *
 * Achieved usability is grounded solely in canonical runtime actuals: every
 * current-generation publicly invocable Binding (`request`, or `call` with a
 * declared partition-local statement) for the installation's `(packageId,
 * manifestDigest)` must have an ACTIVE compiled `service_definitions` row and
 * at least one ready `ACTIVE` `RUNTIME_SERVICE` Cell actual in `services`,
 * verified through the shared `binding-route-actuals` predicate used by both
 * request and call route resolvers.
 */

import {
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {
  DEPLOYMENT_BINDING_SOURCE_KIND,
  projectBinding,
} from '../control-plane/owners/deployment-binding-contract.js';
import {
  SERVICE_INSTALL_DESIRED_STATE,
  SERVICE_INSTALL_ROLLOUT_STATE,
} from '../control-plane/owners/service-install-catalog-contract.js';
import {
  findActiveReadyBindingCandidate,
} from './binding-route-actuals.js';

const SERVICE_READINESS_STATE = Object.freeze({
  NOT_READY: 'not_ready',
  READY: 'ready',
});

const SERVICE_READINESS_REASON = Object.freeze({
  DESIRED_NOT_ACTIVE: 'desired_not_active',
  INSTALLATION_FAILED: 'installation_failed',
  NOT_INSTALLED: 'not_installed',
  NO_INVOCABLE_BINDINGS: 'no_invocable_bindings',
  READY: 'ready',
  ROLLOUT_NOT_READY: 'rollout_not_ready',
  ROUTE_UNAVAILABLE: 'route_unavailable',
  RUNTIME_ACTUALS_UNAVAILABLE: 'runtime_actuals_unavailable',
});

const PACKAGE_BINDING_READINESS = Object.freeze({
  BINDINGS_NOT_READY: 'bindings_not_ready',
  NO_INVOCABLE_BINDINGS: 'no_invocable_bindings',
  READY: 'ready',
  RUNTIME_ACTUALS_UNAVAILABLE: 'runtime_actuals_unavailable',
});

const BINDING_PROJECTION_STATUS = Object.freeze({
  CORRUPT: 'corrupt',
  VALID: 'valid',
});

const READINESS_WATCH_TABLES = Object.freeze(new Set([
  SYSTEM_TABLE_NAME.SERVICE_BINDINGS,
  SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS,
  SYSTEM_TABLE_NAME.SERVICE_INSTALLATIONS,
  SYSTEM_TABLE_NAME.SERVICES,
]));

const OBSERVER_ERROR = Object.freeze({
  CACHE_REQUIRED:
    'createBindingCellReadinessObserver requires a SystemTableCache',
  LISTENER_REQUIRED:
    'cellReadinessObserver.subscribe requires a listener function',
});

const PACKAGE_OUTCOME = Object.freeze({
  NO_INVOCABLE_BINDINGS: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.NO_INVOCABLE_BINDINGS,
    state: PACKAGE_BINDING_READINESS.NO_INVOCABLE_BINDINGS,
  }),
  READY: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.READY,
    state: PACKAGE_BINDING_READINESS.READY,
  }),
  ROUTE_UNAVAILABLE: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.ROUTE_UNAVAILABLE,
    state: PACKAGE_BINDING_READINESS.BINDINGS_NOT_READY,
  }),
  RUNTIME_ACTUALS_UNAVAILABLE: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.RUNTIME_ACTUALS_UNAVAILABLE,
    state: PACKAGE_BINDING_READINESS.RUNTIME_ACTUALS_UNAVAILABLE,
  }),
});

const INSTALLATION_OUTCOME = Object.freeze({
  DESIRED_NOT_ACTIVE: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.DESIRED_NOT_ACTIVE,
    readinessState: SERVICE_READINESS_STATE.NOT_READY,
  }),
  INSTALLATION_FAILED: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.INSTALLATION_FAILED,
    readinessState: SERVICE_READINESS_STATE.NOT_READY,
  }),
  NO_INVOCABLE_BINDINGS: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.NO_INVOCABLE_BINDINGS,
    readinessState: SERVICE_READINESS_STATE.NOT_READY,
  }),
  READY: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.READY,
    readinessState: SERVICE_READINESS_STATE.READY,
  }),
  ROLLOUT_NOT_READY: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.ROLLOUT_NOT_READY,
    readinessState: SERVICE_READINESS_STATE.NOT_READY,
  }),
  ROUTE_UNAVAILABLE: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.ROUTE_UNAVAILABLE,
    readinessState: SERVICE_READINESS_STATE.NOT_READY,
  }),
  RUNTIME_ACTUALS_UNAVAILABLE: Object.freeze({
    readinessReason: SERVICE_READINESS_REASON.RUNTIME_ACTUALS_UNAVAILABLE,
    readinessState: SERVICE_READINESS_STATE.NOT_READY,
  }),
});

const PACKAGE_STATE_TO_INSTALLATION_OUTCOME = Object.freeze({
  [PACKAGE_BINDING_READINESS.BINDINGS_NOT_READY]:
    INSTALLATION_OUTCOME.ROUTE_UNAVAILABLE,
  [PACKAGE_BINDING_READINESS.NO_INVOCABLE_BINDINGS]:
    INSTALLATION_OUTCOME.NO_INVOCABLE_BINDINGS,
  [PACKAGE_BINDING_READINESS.READY]:
    INSTALLATION_OUTCOME.READY,
  [PACKAGE_BINDING_READINESS.RUNTIME_ACTUALS_UNAVAILABLE]:
    INSTALLATION_OUTCOME.RUNTIME_ACTUALS_UNAVAILABLE,
});

function corruptBindingProjection(cause) {
  return Object.freeze({
    cause,
    status: BINDING_PROJECTION_STATUS.CORRUPT,
  });
}

function projectBindingOrCorrupt(row) {
  try {
    return Object.freeze({
      binding: projectBinding(row),
      status: BINDING_PROJECTION_STATUS.VALID,
    });
  } catch (cause) {
    return corruptBindingProjection(cause);
  }
}

function isPubliclyInvocableBinding(binding) {
  const source = binding?.declaration?.source;
  if (source?.kind === DEPLOYMENT_BINDING_SOURCE_KIND.REQUEST) {
    return true;
  }
  if (source?.kind === DEPLOYMENT_BINDING_SOURCE_KIND.CALL) {
    return typeof source.statement === 'string' && source.statement.length > 0;
  }
  return false;
}

function latestGenerationByBindingId(rows) {
  const generations = new Map();
  for (const row of rows) {
    const bindingId = row?.binding_id;
    const generation = row?.generation;
    if (typeof bindingId !== 'string' || bindingId.length === 0 ||
        !Number.isSafeInteger(generation) || generation < 1) {
      continue;
    }
    const previous = generations.get(bindingId);
    if (previous === undefined || generation > previous) {
      generations.set(bindingId, generation);
    }
  }
  return generations;
}

function rowTargetsPackage(row, servicePackage, tenantId, latestGenerations) {
  if (!row || !servicePackage) return false;
  if (row.package_id !== servicePackage.packageId ||
      row.manifest_digest !== servicePackage.manifestDigest) {
    return false;
  }
  if (tenantId !== null && row.tenant_id !== tenantId) {
    return false;
  }
  const latest = latestGenerations.get(row.binding_id);
  return latest !== undefined && row.generation === latest;
}

function evaluatePackageBindingReadiness(
  servicePackage,
  systemTableCache,
  tenantId = null,
) {
  if (!systemTableCache) {
    return PACKAGE_OUTCOME.RUNTIME_ACTUALS_UNAVAILABLE;
  }
  const rows = systemTableCache.getAll(SYSTEM_TABLE_NAME.SERVICE_BINDINGS) || [];
  const latestGenerations = latestGenerationByBindingId(rows);
  const invocableBindings = [];
  for (const row of rows) {
    if (!rowTargetsPackage(row, servicePackage, tenantId, latestGenerations)) {
      continue;
    }
    const projected = projectBindingOrCorrupt(row);
    if (projected.status === BINDING_PROJECTION_STATUS.CORRUPT) {
      return PACKAGE_OUTCOME.ROUTE_UNAVAILABLE;
    }
    if (isPubliclyInvocableBinding(projected.binding)) {
      invocableBindings.push(projected.binding);
    }
  }
  if (invocableBindings.length === 0) {
    return PACKAGE_OUTCOME.NO_INVOCABLE_BINDINGS;
  }
  for (const binding of invocableBindings) {
    const active = findActiveReadyBindingCandidate(
      [binding],
      systemTableCache,
      binding.declaration.source.kind,
    );
    if (!active.found) {
      return PACKAGE_OUTCOME.ROUTE_UNAVAILABLE;
    }
  }
  return PACKAGE_OUTCOME.READY;
}

function evaluateServiceInstallationReadiness({
  installation,
  servicePackage,
  systemTableCache,
  tenantId = null,
}) {
  if (installation?.desiredState !== SERVICE_INSTALL_DESIRED_STATE.ACTIVE) {
    return INSTALLATION_OUTCOME.DESIRED_NOT_ACTIVE;
  }
  if (installation.rolloutState === SERVICE_INSTALL_ROLLOUT_STATE.FAILED ||
      installation.latestFailureId !== null) {
    return INSTALLATION_OUTCOME.INSTALLATION_FAILED;
  }
  if (installation.rolloutState !== SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED) {
    return INSTALLATION_OUTCOME.ROLLOUT_NOT_READY;
  }
  const packageReadiness = evaluatePackageBindingReadiness(
    servicePackage,
    systemTableCache,
    tenantId,
  );
  return PACKAGE_STATE_TO_INSTALLATION_OUTCOME[packageReadiness.state];
}

function buildServiceInstallationStatusRow({
  installation,
  servicePackage,
  systemTableCache,
  tenantId = null,
}) {
  const readiness = evaluateServiceInstallationReadiness({
    installation,
    servicePackage,
    systemTableCache,
    tenantId,
  });
  return Object.freeze({
    desired_state: installation.desiredState,
    installation_id: installation.installationId,
    latest_failure_id: installation.latestFailureId,
    operation_id: installation.operationId,
    readiness_reason: readiness.readinessReason,
    readiness_state: readiness.readinessState,
    revision_id: installation.revisionId,
    rollout_state: installation.rolloutState,
    service_definition_id: installation.serviceDefinitionId,
    service_name: servicePackage.name,
    version: servicePackage.version,
  });
}

function isServiceStatusRowReady(statusRow) {
  if (!statusRow) return false;
  return statusRow.desired_state === SERVICE_INSTALL_DESIRED_STATE.ACTIVE &&
    statusRow.rollout_state === SERVICE_INSTALL_ROLLOUT_STATE.CONVERGED &&
    statusRow.latest_failure_id === null &&
    statusRow.readiness_state === SERVICE_READINESS_STATE.READY;
}

function resolveReportedReadiness(statusRow) {
  const hasState = typeof statusRow.readiness_state === 'string' &&
    statusRow.readiness_state.length > 0;
  const hasReason = typeof statusRow.readiness_reason === 'string' &&
    statusRow.readiness_reason.length > 0;
  if (!hasState || !hasReason) {
    return INSTALLATION_OUTCOME.RUNTIME_ACTUALS_UNAVAILABLE;
  }
  return {
    readinessReason: statusRow.readiness_reason,
    readinessState: statusRow.readiness_state,
  };
}

function buildServiceInspectionOutput(serviceName, statusRow, rows) {
  if (!statusRow) {
    return {
      readinessReason: SERVICE_READINESS_REASON.NOT_INSTALLED,
      readinessState: SERVICE_READINESS_STATE.NOT_READY,
      ready: false,
      row: null,
      rows,
      service: serviceName,
    };
  }
  const reported = resolveReportedReadiness(statusRow);
  const output = {
    readinessReason: reported.readinessReason,
    readinessState: reported.readinessState,
    ready: isServiceStatusRowReady(statusRow),
    row: statusRow,
    rows,
    service: serviceName,
  };
  if (typeof statusRow.desired_state === 'string') {
    output.desiredState = statusRow.desired_state;
  }
  if (typeof statusRow.rollout_state === 'string') {
    output.rolloutState = statusRow.rollout_state;
  }
  return output;
}

function createBindingCellReadinessObserver(systemTableCache) {
  if (!systemTableCache) {
    throw new TypeError(OBSERVER_ERROR.CACHE_REQUIRED);
  }
  return Object.freeze({
    evaluatePackage(servicePackage) {
      return evaluatePackageBindingReadiness(servicePackage, systemTableCache);
    },
    subscribe(onRelevantChange) {
      if (typeof onRelevantChange !== 'function') {
        throw new TypeError(OBSERVER_ERROR.LISTENER_REQUIRED);
      }
      const listener = (tableName) => {
        if (READINESS_WATCH_TABLES.has(tableName)) {
          onRelevantChange(tableName);
        }
      };
      systemTableCache.onCacheChange(listener);
      return () => {
        systemTableCache.offCacheChange(listener);
      };
    },
  });
}

export {
  PACKAGE_BINDING_READINESS,
  SERVICE_READINESS_REASON,
  SERVICE_READINESS_STATE,
  buildServiceInspectionOutput,
  buildServiceInstallationStatusRow,
  createBindingCellReadinessObserver,
  evaluateServiceInstallationReadiness,
};
