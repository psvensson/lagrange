const CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE = Object.freeze({
  VISIBLE: 'visible',
  PENDING_VISIBILITY: 'pending_visibility',
  AUTHORITATIVE_CONFIRMATION_PENDING: 'authoritative_confirmation_pending',
  DEFERRED_BY_PRESSURE: 'deferred_by_pressure',
});

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

export {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  isPendingControlPlaneSystemTableVisibilityState,
  normalizeControlPlaneSystemTableVisibilityState,
};
