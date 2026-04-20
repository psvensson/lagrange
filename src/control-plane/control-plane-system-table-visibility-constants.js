const CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE = Object.freeze({
  VISIBLE: 'visible',
  PENDING_VISIBILITY: 'pending_visibility',
  AUTHORITATIVE_CONFIRMATION_PENDING: 'authoritative_confirmation_pending',
  DEFERRED_BY_PRESSURE: 'deferred_by_pressure',
});

const CONTROL_PLANE_SYSTEM_TABLE_PENDING_VISIBILITY_STATE_ORDER =
  Object.freeze([
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
      .AUTHORITATIVE_CONFIRMATION_PENDING,
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
  ]);

function normalizeControlPlaneSystemTableVisibilityState(
  value,
  fallback = null,
) {
  for (const visibilityState of Object.values(
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  )) {
    if (value === visibilityState) {
      return visibilityState;
    }
  }
  return fallback;
}

function isPendingControlPlaneSystemTableVisibilityState(value) {
  const visibilityState = normalizeControlPlaneSystemTableVisibilityState(
    value,
    null,
  );
  return visibilityState !== null &&
    visibilityState !== CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE;
}

function resolveControlPlaneSystemTableVisibilityState(
  visibilityStates,
  fallback =
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
) {
  const normalizedStates = Array.isArray(visibilityStates) ?
    visibilityStates.map((value) =>
      normalizeControlPlaneSystemTableVisibilityState(value, null)
    ) :
    [];
  for (const visibilityState of
    CONTROL_PLANE_SYSTEM_TABLE_PENDING_VISIBILITY_STATE_ORDER) {
    if (normalizedStates.includes(visibilityState)) {
      return visibilityState;
    }
  }
  if (normalizedStates.includes(
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
  )) {
    return CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE;
  }
  return fallback;
}

export {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  isPendingControlPlaneSystemTableVisibilityState,
  normalizeControlPlaneSystemTableVisibilityState,
  resolveControlPlaneSystemTableVisibilityState,
};
