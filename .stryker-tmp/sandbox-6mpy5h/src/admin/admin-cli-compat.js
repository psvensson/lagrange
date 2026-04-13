/**
 * CLI compatibility contract for the node-local admin adapter.
 *
 * Documents and validates the message format contract between
 * the admin WebSocket API (adapter layer) and CLI clients.
 * Ensures the adapter preserves backward compatibility with
 * existing tooling while the mutation ownership moves to
 * replicated meta-services (sys-admin-meta / sys-wasm-meta).
 *
 * This module is part of the adapter-only layer. It validates
 * message envelopes only — it never executes queries, writes
 * metadata, or mutates system state.
 *
 * Requirements: 2.4, 13.2
 * @module admin/admin-cli-compat
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
import { ADMIN_MESSAGE_TYPE } from './admin-constants.js';

/**
 * Error messages for CLI compatibility validation.
 * @type {Object}
 */
const CLI_COMPAT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("642") ? {} : (stryCov_9fa48("642"), {
  UNKNOWN_MESSAGE_TYPE: stryMutAct_9fa48("643") ? "" : (stryCov_9fa48("643"), 'Unknown message type'),
  MISSING_TYPE_FIELD: stryMutAct_9fa48("644") ? "" : (stryCov_9fa48("644"), 'Message must have a type field'),
  MISSING_REQUIRED_FIELD: stryMutAct_9fa48("645") ? () => undefined : (stryCov_9fa48("645"), field => stryMutAct_9fa48("646") ? `` : (stryCov_9fa48("646"), `Missing required field: ${field}`))
}));

/**
 * Frozen contract documenting expected CLI message formats.
 * Each entry specifies the type string, required fields, and
 * optional fields for a given message direction.
 * @type {Object}
 */
const CLI_MESSAGE_CONTRACT = Object.freeze(stryMutAct_9fa48("647") ? {} : (stryCov_9fa48("647"), {
  QUERY: Object.freeze(stryMutAct_9fa48("648") ? {} : (stryCov_9fa48("648"), {
    type: ADMIN_MESSAGE_TYPE.QUERY,
    requiredFields: Object.freeze(stryMutAct_9fa48("649") ? [] : (stryCov_9fa48("649"), [stryMutAct_9fa48("650") ? "" : (stryCov_9fa48("650"), 'type'), stryMutAct_9fa48("651") ? "" : (stryCov_9fa48("651"), 'queryId'), stryMutAct_9fa48("652") ? "" : (stryCov_9fa48("652"), 'sql')])),
    optionalFields: Object.freeze(stryMutAct_9fa48("653") ? [] : (stryCov_9fa48("653"), [stryMutAct_9fa48("654") ? "" : (stryCov_9fa48("654"), 'params')]))
  })),
  REFRESH: Object.freeze(stryMutAct_9fa48("655") ? {} : (stryCov_9fa48("655"), {
    type: ADMIN_MESSAGE_TYPE.REFRESH,
    requiredFields: Object.freeze(stryMutAct_9fa48("656") ? [] : (stryCov_9fa48("656"), [stryMutAct_9fa48("657") ? "" : (stryCov_9fa48("657"), 'type')])),
    optionalFields: Object.freeze(stryMutAct_9fa48("658") ? ["Stryker was here"] : (stryCov_9fa48("658"), []))
  })),
  QUERY_RESULT: Object.freeze(stryMutAct_9fa48("659") ? {} : (stryCov_9fa48("659"), {
    type: ADMIN_MESSAGE_TYPE.QUERY_RESULT,
    requiredFields: Object.freeze(stryMutAct_9fa48("660") ? [] : (stryCov_9fa48("660"), [stryMutAct_9fa48("661") ? "" : (stryCov_9fa48("661"), 'type'), stryMutAct_9fa48("662") ? "" : (stryCov_9fa48("662"), 'queryId'), stryMutAct_9fa48("663") ? "" : (stryCov_9fa48("663"), 'timestamp')])),
    optionalFields: Object.freeze(stryMutAct_9fa48("664") ? [] : (stryCov_9fa48("664"), [stryMutAct_9fa48("665") ? "" : (stryCov_9fa48("665"), 'results'), stryMutAct_9fa48("666") ? "" : (stryCov_9fa48("666"), 'count'), stryMutAct_9fa48("667") ? "" : (stryCov_9fa48("667"), 'error'), stryMutAct_9fa48("668") ? "" : (stryCov_9fa48("668"), 'errorCode')]))
  })),
  CACHE_DUMP: Object.freeze(stryMutAct_9fa48("669") ? {} : (stryCov_9fa48("669"), {
    type: ADMIN_MESSAGE_TYPE.CACHE_DUMP,
    requiredFields: Object.freeze(stryMutAct_9fa48("670") ? [] : (stryCov_9fa48("670"), [stryMutAct_9fa48("671") ? "" : (stryCov_9fa48("671"), 'type'), stryMutAct_9fa48("672") ? "" : (stryCov_9fa48("672"), 'timestamp'), stryMutAct_9fa48("673") ? "" : (stryCov_9fa48("673"), 'nodeId'), stryMutAct_9fa48("674") ? "" : (stryCov_9fa48("674"), 'data')])),
    optionalFields: Object.freeze(stryMutAct_9fa48("675") ? ["Stryker was here"] : (stryCov_9fa48("675"), []))
  })),
  CDC_EVENT: Object.freeze(stryMutAct_9fa48("676") ? {} : (stryCov_9fa48("676"), {
    type: ADMIN_MESSAGE_TYPE.CDC_EVENT,
    requiredFields: Object.freeze(stryMutAct_9fa48("677") ? [] : (stryCov_9fa48("677"), [stryMutAct_9fa48("678") ? "" : (stryCov_9fa48("678"), 'type'), stryMutAct_9fa48("679") ? "" : (stryCov_9fa48("679"), 'timestamp'), stryMutAct_9fa48("680") ? "" : (stryCov_9fa48("680"), 'table'), stryMutAct_9fa48("681") ? "" : (stryCov_9fa48("681"), 'operation'), stryMutAct_9fa48("682") ? "" : (stryCov_9fa48("682"), 'record')])),
    optionalFields: Object.freeze(stryMutAct_9fa48("683") ? ["Stryker was here"] : (stryCov_9fa48("683"), []))
  })),
  ERROR: Object.freeze(stryMutAct_9fa48("684") ? {} : (stryCov_9fa48("684"), {
    type: ADMIN_MESSAGE_TYPE.ERROR,
    requiredFields: Object.freeze(stryMutAct_9fa48("685") ? [] : (stryCov_9fa48("685"), [stryMutAct_9fa48("686") ? "" : (stryCov_9fa48("686"), 'type'), stryMutAct_9fa48("687") ? "" : (stryCov_9fa48("687"), 'timestamp'), stryMutAct_9fa48("688") ? "" : (stryCov_9fa48("688"), 'error'), stryMutAct_9fa48("689") ? "" : (stryCov_9fa48("689"), 'errorCode')])),
    optionalFields: Object.freeze(stryMutAct_9fa48("690") ? ["Stryker was here"] : (stryCov_9fa48("690"), []))
  }))
}));

/**
 * Lookup from message type string to contract entry.
 * @type {Map<string, Object>}
 */
const INCOMING_CONTRACT_BY_TYPE = new Map(stryMutAct_9fa48("691") ? [] : (stryCov_9fa48("691"), [stryMutAct_9fa48("692") ? [] : (stryCov_9fa48("692"), [ADMIN_MESSAGE_TYPE.QUERY, CLI_MESSAGE_CONTRACT.QUERY]), stryMutAct_9fa48("693") ? [] : (stryCov_9fa48("693"), [ADMIN_MESSAGE_TYPE.REFRESH, CLI_MESSAGE_CONTRACT.REFRESH])]));

/**
 * Lookup from message type string to contract entry.
 * @type {Map<string, Object>}
 */
const OUTGOING_CONTRACT_BY_TYPE = new Map(stryMutAct_9fa48("694") ? [] : (stryCov_9fa48("694"), [stryMutAct_9fa48("695") ? [] : (stryCov_9fa48("695"), [ADMIN_MESSAGE_TYPE.QUERY_RESULT, CLI_MESSAGE_CONTRACT.QUERY_RESULT]), stryMutAct_9fa48("696") ? [] : (stryCov_9fa48("696"), [ADMIN_MESSAGE_TYPE.CACHE_DUMP, CLI_MESSAGE_CONTRACT.CACHE_DUMP]), stryMutAct_9fa48("697") ? [] : (stryCov_9fa48("697"), [ADMIN_MESSAGE_TYPE.CDC_EVENT, CLI_MESSAGE_CONTRACT.CDC_EVENT]), stryMutAct_9fa48("698") ? [] : (stryCov_9fa48("698"), [ADMIN_MESSAGE_TYPE.ERROR, CLI_MESSAGE_CONTRACT.ERROR])]));

/**
 * Validate required fields against a contract entry.
 *
 * @param {Object} message - The message to validate.
 * @param {Object} contract - The contract entry.
 * @return {{valid: boolean, messageType?: string, errors?: string[]}}
 */
function validateFields(message, contract) {
  if (stryMutAct_9fa48("699")) {
    {}
  } else {
    stryCov_9fa48("699");
    const errors = stryMutAct_9fa48("700") ? ["Stryker was here"] : (stryCov_9fa48("700"), []);
    for (const field of contract.requiredFields) {
      if (stryMutAct_9fa48("701")) {
        {}
      } else {
        stryCov_9fa48("701");
        if (stryMutAct_9fa48("704") ? message[field] === undefined && message[field] === null : stryMutAct_9fa48("703") ? false : stryMutAct_9fa48("702") ? true : (stryCov_9fa48("702", "703", "704"), (stryMutAct_9fa48("706") ? message[field] !== undefined : stryMutAct_9fa48("705") ? false : (stryCov_9fa48("705", "706"), message[field] === undefined)) || (stryMutAct_9fa48("708") ? message[field] !== null : stryMutAct_9fa48("707") ? false : (stryCov_9fa48("707", "708"), message[field] === null)))) {
          if (stryMutAct_9fa48("709")) {
            {}
          } else {
            stryCov_9fa48("709");
            errors.push(CLI_COMPAT_ERROR_MSG.MISSING_REQUIRED_FIELD(field));
          }
        }
      }
    }
    if (stryMutAct_9fa48("713") ? errors.length <= 0 : stryMutAct_9fa48("712") ? errors.length >= 0 : stryMutAct_9fa48("711") ? false : stryMutAct_9fa48("710") ? true : (stryCov_9fa48("710", "711", "712", "713"), errors.length > 0)) {
      if (stryMutAct_9fa48("714")) {
        {}
      } else {
        stryCov_9fa48("714");
        return stryMutAct_9fa48("715") ? {} : (stryCov_9fa48("715"), {
          valid: stryMutAct_9fa48("716") ? true : (stryCov_9fa48("716"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("717") ? {} : (stryCov_9fa48("717"), {
      valid: stryMutAct_9fa48("718") ? false : (stryCov_9fa48("718"), true),
      messageType: contract.type
    });
  }
}

/**
 * Validate an incoming CLI message (query or refresh).
 *
 * @param {Object} message - The incoming message.
 * @return {{valid: boolean, messageType?: string, errors?: string[]}}
 */
function validateIncomingMessage(message) {
  if (stryMutAct_9fa48("719")) {
    {}
  } else {
    stryCov_9fa48("719");
    if (stryMutAct_9fa48("722") ? (!message || message.type === undefined) && message.type === null : stryMutAct_9fa48("721") ? false : stryMutAct_9fa48("720") ? true : (stryCov_9fa48("720", "721", "722"), (stryMutAct_9fa48("724") ? !message && message.type === undefined : stryMutAct_9fa48("723") ? false : (stryCov_9fa48("723", "724"), (stryMutAct_9fa48("725") ? message : (stryCov_9fa48("725"), !message)) || (stryMutAct_9fa48("727") ? message.type !== undefined : stryMutAct_9fa48("726") ? false : (stryCov_9fa48("726", "727"), message.type === undefined)))) || (stryMutAct_9fa48("729") ? message.type !== null : stryMutAct_9fa48("728") ? false : (stryCov_9fa48("728", "729"), message.type === null)))) {
      if (stryMutAct_9fa48("730")) {
        {}
      } else {
        stryCov_9fa48("730");
        return stryMutAct_9fa48("731") ? {} : (stryCov_9fa48("731"), {
          valid: stryMutAct_9fa48("732") ? true : (stryCov_9fa48("732"), false),
          errors: stryMutAct_9fa48("733") ? [] : (stryCov_9fa48("733"), [CLI_COMPAT_ERROR_MSG.MISSING_TYPE_FIELD])
        });
      }
    }
    const contract = INCOMING_CONTRACT_BY_TYPE.get(message.type);
    if (stryMutAct_9fa48("736") ? false : stryMutAct_9fa48("735") ? true : stryMutAct_9fa48("734") ? contract : (stryCov_9fa48("734", "735", "736"), !contract)) {
      if (stryMutAct_9fa48("737")) {
        {}
      } else {
        stryCov_9fa48("737");
        return stryMutAct_9fa48("738") ? {} : (stryCov_9fa48("738"), {
          valid: stryMutAct_9fa48("739") ? true : (stryCov_9fa48("739"), false),
          errors: stryMutAct_9fa48("740") ? [] : (stryCov_9fa48("740"), [CLI_COMPAT_ERROR_MSG.UNKNOWN_MESSAGE_TYPE])
        });
      }
    }
    return validateFields(message, contract);
  }
}

/**
 * Validate an outgoing message to the CLI.
 *
 * @param {Object} message - The outgoing message.
 * @return {{valid: boolean, messageType?: string, errors?: string[]}}
 */
function validateOutgoingMessage(message) {
  if (stryMutAct_9fa48("741")) {
    {}
  } else {
    stryCov_9fa48("741");
    if (stryMutAct_9fa48("744") ? (!message || message.type === undefined) && message.type === null : stryMutAct_9fa48("743") ? false : stryMutAct_9fa48("742") ? true : (stryCov_9fa48("742", "743", "744"), (stryMutAct_9fa48("746") ? !message && message.type === undefined : stryMutAct_9fa48("745") ? false : (stryCov_9fa48("745", "746"), (stryMutAct_9fa48("747") ? message : (stryCov_9fa48("747"), !message)) || (stryMutAct_9fa48("749") ? message.type !== undefined : stryMutAct_9fa48("748") ? false : (stryCov_9fa48("748", "749"), message.type === undefined)))) || (stryMutAct_9fa48("751") ? message.type !== null : stryMutAct_9fa48("750") ? false : (stryCov_9fa48("750", "751"), message.type === null)))) {
      if (stryMutAct_9fa48("752")) {
        {}
      } else {
        stryCov_9fa48("752");
        return stryMutAct_9fa48("753") ? {} : (stryCov_9fa48("753"), {
          valid: stryMutAct_9fa48("754") ? true : (stryCov_9fa48("754"), false),
          errors: stryMutAct_9fa48("755") ? [] : (stryCov_9fa48("755"), [CLI_COMPAT_ERROR_MSG.MISSING_TYPE_FIELD])
        });
      }
    }
    const contract = OUTGOING_CONTRACT_BY_TYPE.get(message.type);
    if (stryMutAct_9fa48("758") ? false : stryMutAct_9fa48("757") ? true : stryMutAct_9fa48("756") ? contract : (stryCov_9fa48("756", "757", "758"), !contract)) {
      if (stryMutAct_9fa48("759")) {
        {}
      } else {
        stryCov_9fa48("759");
        return stryMutAct_9fa48("760") ? {} : (stryCov_9fa48("760"), {
          valid: stryMutAct_9fa48("761") ? true : (stryCov_9fa48("761"), false),
          errors: stryMutAct_9fa48("762") ? [] : (stryCov_9fa48("762"), [CLI_COMPAT_ERROR_MSG.UNKNOWN_MESSAGE_TYPE])
        });
      }
    }
    return validateFields(message, contract);
  }
}
export { CLI_COMPAT_ERROR_MSG, CLI_MESSAGE_CONTRACT, validateIncomingMessage, validateOutgoingMessage };