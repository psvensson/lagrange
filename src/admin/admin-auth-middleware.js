/**
 * Authentication/authorization middleware for the service command layer.
 * Policy-based guard that validates security context before commands execute.
 *
 * Requirements: 9.1, 9.2
 * @module admin/admin-auth-middleware
 */

const AUTH_ERROR_CODE = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CONTEXT: 'INVALID_CONTEXT',
});

const AUTH_ERROR_MSG = Object.freeze({
  TENANT_ID_REQUIRED: 'Security context must include tenantId',
  PRINCIPAL_REQUIRED: 'Security context must include principal',
  ACTION_NOT_PERMITTED: 'Principal is not authorized for this action',
  CONTEXT_REQUIRED: 'Security context is required',
});

const WILDCARD_ACTIONS = '*';

const WILDCARD_POLICY = Object.freeze({
  allowedActions: WILDCARD_ACTIONS,
});

/**
 * Validate a security context object.
 * @param {Object} context - {tenantId, principal, roles}.
 * @return {Object} {valid, tenantId, principal, roles} or
 *   {valid: false, error, code}.
 */
function validateSecurityContext(context) {
  if (!context) {
    return {
      valid: false,
      error: AUTH_ERROR_MSG.CONTEXT_REQUIRED,
      code: AUTH_ERROR_CODE.INVALID_CONTEXT,
    };
  }
  if (!context.tenantId) {
    return {
      valid: false,
      error: AUTH_ERROR_MSG.TENANT_ID_REQUIRED,
      code: AUTH_ERROR_CODE.UNAUTHENTICATED,
    };
  }
  if (!context.principal) {
    return {
      valid: false,
      error: AUTH_ERROR_MSG.PRINCIPAL_REQUIRED,
      code: AUTH_ERROR_CODE.UNAUTHENTICATED,
    };
  }
  return {
    valid: true,
    tenantId: context.tenantId,
    principal: context.principal,
    roles: context.roles,
  };
}

/**
 * Authorize an action against a policy for a given security context.
 * @param {Object} context - {tenantId, principal, roles}.
 * @param {string} action - The action to authorize.
 * @param {Object} policy - {allowedActions: Set|'*'}.
 * @return {Object} {authorized: true} or
 *   {authorized: false, error, code}.
 */
function authorizeAction(context, action, policy) {
  const validation = validateSecurityContext(context);
  if (!validation.valid) {
    return {
      authorized: false,
      error: validation.error,
      code: AUTH_ERROR_CODE.UNAUTHENTICATED,
    };
  }
  if (policy.allowedActions === WILDCARD_ACTIONS) {
    return {authorized: true};
  }
  if (policy.allowedActions.has(action)) {
    return {authorized: true};
  }
  return {
    authorized: false,
    error: AUTH_ERROR_MSG.ACTION_NOT_PERMITTED,
    code: AUTH_ERROR_CODE.UNAUTHORIZED,
  };
}

export {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MSG,
  WILDCARD_POLICY,
  validateSecurityContext,
  authorizeAction,
};
