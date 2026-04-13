/**
 * Authentication/authorization middleware for the service command layer.
 * Policy-based guard that validates security context before commands execute.
 *
 * Requirements: 9.1, 9.2
 * @module admin/admin-auth-middleware
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
const AUTH_ERROR_CODE = Object.freeze(stryMutAct_9fa48("316") ? {} : (stryCov_9fa48("316"), {
  UNAUTHENTICATED: stryMutAct_9fa48("317") ? "" : (stryCov_9fa48("317"), 'UNAUTHENTICATED'),
  UNAUTHORIZED: stryMutAct_9fa48("318") ? "" : (stryCov_9fa48("318"), 'UNAUTHORIZED'),
  INVALID_CONTEXT: stryMutAct_9fa48("319") ? "" : (stryCov_9fa48("319"), 'INVALID_CONTEXT')
}));
const AUTH_ERROR_MSG = Object.freeze(stryMutAct_9fa48("320") ? {} : (stryCov_9fa48("320"), {
  TENANT_ID_REQUIRED: stryMutAct_9fa48("321") ? "" : (stryCov_9fa48("321"), 'Security context must include tenantId'),
  PRINCIPAL_REQUIRED: stryMutAct_9fa48("322") ? "" : (stryCov_9fa48("322"), 'Security context must include principal'),
  ACTION_NOT_PERMITTED: stryMutAct_9fa48("323") ? "" : (stryCov_9fa48("323"), 'Principal is not authorized for this action'),
  CONTEXT_REQUIRED: stryMutAct_9fa48("324") ? "" : (stryCov_9fa48("324"), 'Security context is required')
}));
const WILDCARD_ACTIONS = stryMutAct_9fa48("325") ? "" : (stryCov_9fa48("325"), '*');
const WILDCARD_POLICY = Object.freeze(stryMutAct_9fa48("326") ? {} : (stryCov_9fa48("326"), {
  allowedActions: WILDCARD_ACTIONS
}));

/**
 * Validate a security context object.
 * @param {Object} context - {tenantId, principal, roles}.
 * @return {Object} {valid, tenantId, principal, roles} or
 *   {valid: false, error, code}.
 */
function validateSecurityContext(context) {
  if (stryMutAct_9fa48("327")) {
    {}
  } else {
    stryCov_9fa48("327");
    if (stryMutAct_9fa48("330") ? false : stryMutAct_9fa48("329") ? true : stryMutAct_9fa48("328") ? context : (stryCov_9fa48("328", "329", "330"), !context)) {
      if (stryMutAct_9fa48("331")) {
        {}
      } else {
        stryCov_9fa48("331");
        return stryMutAct_9fa48("332") ? {} : (stryCov_9fa48("332"), {
          valid: stryMutAct_9fa48("333") ? true : (stryCov_9fa48("333"), false),
          error: AUTH_ERROR_MSG.CONTEXT_REQUIRED,
          code: AUTH_ERROR_CODE.INVALID_CONTEXT
        });
      }
    }
    if (stryMutAct_9fa48("336") ? false : stryMutAct_9fa48("335") ? true : stryMutAct_9fa48("334") ? context.tenantId : (stryCov_9fa48("334", "335", "336"), !context.tenantId)) {
      if (stryMutAct_9fa48("337")) {
        {}
      } else {
        stryCov_9fa48("337");
        return stryMutAct_9fa48("338") ? {} : (stryCov_9fa48("338"), {
          valid: stryMutAct_9fa48("339") ? true : (stryCov_9fa48("339"), false),
          error: AUTH_ERROR_MSG.TENANT_ID_REQUIRED,
          code: AUTH_ERROR_CODE.UNAUTHENTICATED
        });
      }
    }
    if (stryMutAct_9fa48("342") ? false : stryMutAct_9fa48("341") ? true : stryMutAct_9fa48("340") ? context.principal : (stryCov_9fa48("340", "341", "342"), !context.principal)) {
      if (stryMutAct_9fa48("343")) {
        {}
      } else {
        stryCov_9fa48("343");
        return stryMutAct_9fa48("344") ? {} : (stryCov_9fa48("344"), {
          valid: stryMutAct_9fa48("345") ? true : (stryCov_9fa48("345"), false),
          error: AUTH_ERROR_MSG.PRINCIPAL_REQUIRED,
          code: AUTH_ERROR_CODE.UNAUTHENTICATED
        });
      }
    }
    return stryMutAct_9fa48("346") ? {} : (stryCov_9fa48("346"), {
      valid: stryMutAct_9fa48("347") ? false : (stryCov_9fa48("347"), true),
      tenantId: context.tenantId,
      principal: context.principal,
      roles: context.roles
    });
  }
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
  if (stryMutAct_9fa48("348")) {
    {}
  } else {
    stryCov_9fa48("348");
    const validation = validateSecurityContext(context);
    if (stryMutAct_9fa48("351") ? false : stryMutAct_9fa48("350") ? true : stryMutAct_9fa48("349") ? validation.valid : (stryCov_9fa48("349", "350", "351"), !validation.valid)) {
      if (stryMutAct_9fa48("352")) {
        {}
      } else {
        stryCov_9fa48("352");
        return stryMutAct_9fa48("353") ? {} : (stryCov_9fa48("353"), {
          authorized: stryMutAct_9fa48("354") ? true : (stryCov_9fa48("354"), false),
          error: validation.error,
          code: AUTH_ERROR_CODE.UNAUTHENTICATED
        });
      }
    }
    if (stryMutAct_9fa48("357") ? policy.allowedActions !== WILDCARD_ACTIONS : stryMutAct_9fa48("356") ? false : stryMutAct_9fa48("355") ? true : (stryCov_9fa48("355", "356", "357"), policy.allowedActions === WILDCARD_ACTIONS)) {
      if (stryMutAct_9fa48("358")) {
        {}
      } else {
        stryCov_9fa48("358");
        return stryMutAct_9fa48("359") ? {} : (stryCov_9fa48("359"), {
          authorized: stryMutAct_9fa48("360") ? false : (stryCov_9fa48("360"), true)
        });
      }
    }
    if (stryMutAct_9fa48("362") ? false : stryMutAct_9fa48("361") ? true : (stryCov_9fa48("361", "362"), policy.allowedActions.has(action))) {
      if (stryMutAct_9fa48("363")) {
        {}
      } else {
        stryCov_9fa48("363");
        return stryMutAct_9fa48("364") ? {} : (stryCov_9fa48("364"), {
          authorized: stryMutAct_9fa48("365") ? false : (stryCov_9fa48("365"), true)
        });
      }
    }
    return stryMutAct_9fa48("366") ? {} : (stryCov_9fa48("366"), {
      authorized: stryMutAct_9fa48("367") ? true : (stryCov_9fa48("367"), false),
      error: AUTH_ERROR_MSG.ACTION_NOT_PERMITTED,
      code: AUTH_ERROR_CODE.UNAUTHORIZED
    });
  }
}
export { AUTH_ERROR_CODE, AUTH_ERROR_MSG, WILDCARD_POLICY, validateSecurityContext, authorizeAction };