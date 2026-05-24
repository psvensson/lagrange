/**
 * Role-to-action policy resolver for SQL-backed debug metadata.
 */

import {
  WILDCARD_POLICY,
} from '../admin/admin-auth-middleware.js';
import {
  DEBUG_METADATA_ACTION as ACTION,
  DEBUG_METADATA_ROLE as ROLE,
} from './debug-metadata-service-constants.js';

const ROLE_ACTIONS = Object.freeze({
  [ROLE.ATTACH]: Object.freeze([
    ACTION.ATTACH_SESSION,
    ACTION.LIST_SESSIONS,
  ]),
  [ROLE.READ]: Object.freeze([
    ACTION.ATTACH_SESSION,
    ACTION.LIST_SESSIONS,
    ACTION.READ_BREAKPOINTS,
    ACTION.READ_SNAPSHOT,
    ACTION.LIST_SNAPSHOTS,
  ]),
  [ROLE.WRITE]: Object.freeze([
    ACTION.CREATE_SESSION,
    ACTION.UPDATE_SESSION,
    ACTION.DETACH_SESSION,
    ACTION.WRITE_BREAKPOINTS,
    ACTION.WRITE_SNAPSHOT,
    ACTION.LIST_SESSIONS,
    ACTION.ATTACH_SESSION,
  ]),
});

/**
 * Default policy resolver based on debug roles.
 * @param {Object} validation
 * @return {{allowedActions: Set|string}}
 */
function defaultDebugPolicyResolver(validation) {
  const roles = Array.isArray(validation.roles) ? validation.roles : [];
  if (roles.includes(ROLE.ADMIN)) {
    return WILDCARD_POLICY;
  }

  const allowedActions = new Set();
  for (const role of roles) {
    const actions = ROLE_ACTIONS[role];
    if (!actions) {
      continue;
    }
    for (const action of actions) {
      allowedActions.add(action);
    }
  }

  return {allowedActions};
}

export {
  defaultDebugPolicyResolver,
};
