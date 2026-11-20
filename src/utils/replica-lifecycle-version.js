// Select the persisted compare version for a SERVICES lifecycle generation.
const DURABLE_VERSION_COLUMN = Object.freeze({
  STATE_ENTERED_AT: 'state_entered_at',
  UPDATED_AT: 'updated_at',
});

function durableRowVersion(service) {
  if (Number.isFinite(service?.state_entered_at)) {
    return {
      column: DURABLE_VERSION_COLUMN.STATE_ENTERED_AT,
      value: service.state_entered_at,
    };
  }
  if (Number.isFinite(service?.updated_at)) {
    return {
      column: DURABLE_VERSION_COLUMN.UPDATED_AT,
      value: service.updated_at,
    };
  }
  return null;
}

export {DURABLE_VERSION_COLUMN, durableRowVersion};
