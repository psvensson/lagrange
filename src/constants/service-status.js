'use strict';

/**
 * Service replica status values for the `services` table `status` column.
 * Distinct from NODE_STATE (node lifecycle) and STATE (connection state).
 */
const SERVICE_STATUS = Object.freeze({
  ACTIVE: 'active',
  STOPPED: 'stopped',
});

export {SERVICE_STATUS};
