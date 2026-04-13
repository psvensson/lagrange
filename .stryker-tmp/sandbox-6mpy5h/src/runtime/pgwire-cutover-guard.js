/**
 * PgWireCutoverGuard — asserts the single-path contract for
 * PostgreSQL wire protocol ingress.
 *
 * After hard cutover, the ONLY path for PG wire listener startup
 * is through the replicated runtime module
 * (`pgwire-runtime-module.js`) managed by `ServiceRuntimeLifecycle`
 * and `RuntimeDriverRegistry`. No standalone listener, fallback
 * config, or dual-mode execution branch may exist.
 *
 * This guard provides runtime-callable assertions that verify:
 * 1. No forbidden entrypoint symbols exist in bootstrap/join.
 * 2. No dual-mode configuration keys are present.
 * 3. The only TCP listener creation for PG wire is inside the
 *    replicated runtime module.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4
 *
 * @module runtime/pgwire-cutover-guard
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
import { PGWIRE_CUTOVER_SUBSYSTEM, FORBIDDEN_ENTRYPOINT_SYMBOLS, FORBIDDEN_CONFIG_KEYS, PGWIRE_CUTOVER_ERROR, PGWIRE_CUTOVER_LOG } from './pgwire-cutover-constants.js';
import { LoggingService } from '../logging/logging-service.js';
class PgWireCutoverGuard {
  /**
   * @param {Object} [options]
   * @param {Object} [options.bootstrapService] - Bootstrap service
   *   instance to inspect for forbidden exports.
   * @param {Object} [options.joiningService] - Node joining service
   *   instance to inspect for forbidden exports.
   * @param {Object} [options.configManager] - Configuration manager
   *   to inspect for dual-mode keys.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("147349")) {
      {}
    } else {
      stryCov_9fa48("147349");
      this._bootstrapService = stryMutAct_9fa48("147352") ? options.bootstrapService && null : stryMutAct_9fa48("147351") ? false : stryMutAct_9fa48("147350") ? true : (stryCov_9fa48("147350", "147351", "147352"), options.bootstrapService || null);
      this._joiningService = stryMutAct_9fa48("147355") ? options.joiningService && null : stryMutAct_9fa48("147354") ? false : stryMutAct_9fa48("147353") ? true : (stryCov_9fa48("147353", "147354", "147355"), options.joiningService || null);
      this._configManager = stryMutAct_9fa48("147358") ? options.configManager && null : stryMutAct_9fa48("147357") ? false : stryMutAct_9fa48("147356") ? true : (stryCov_9fa48("147356", "147357", "147358"), options.configManager || null);
      const loggingService = LoggingService.getInstance();
      this._logger = loggingService.isInitialized() ? loggingService.forSubsystem(PGWIRE_CUTOVER_SUBSYSTEM) : console;
    }
  }

  /**
   * Assert that no forbidden standalone entrypoint symbols exist
   * on the given service object.
   *
   * @param {Object} service - Service instance to inspect.
   * @return {string[]} List of detected forbidden symbols.
   */
  checkForbiddenSymbols(service) {
    if (stryMutAct_9fa48("147359")) {
      {}
    } else {
      stryCov_9fa48("147359");
      if (stryMutAct_9fa48("147362") ? !service && typeof service !== 'object' : stryMutAct_9fa48("147361") ? false : stryMutAct_9fa48("147360") ? true : (stryCov_9fa48("147360", "147361", "147362"), (stryMutAct_9fa48("147363") ? service : (stryCov_9fa48("147363"), !service)) || (stryMutAct_9fa48("147365") ? typeof service === 'object' : stryMutAct_9fa48("147364") ? false : (stryCov_9fa48("147364", "147365"), typeof service !== (stryMutAct_9fa48("147366") ? "" : (stryCov_9fa48("147366"), 'object')))))) {
        if (stryMutAct_9fa48("147367")) {
          {}
        } else {
          stryCov_9fa48("147367");
          return stryMutAct_9fa48("147368") ? ["Stryker was here"] : (stryCov_9fa48("147368"), []);
        }
      }
      const detected = stryMutAct_9fa48("147369") ? ["Stryker was here"] : (stryCov_9fa48("147369"), []);
      for (const symbol of FORBIDDEN_ENTRYPOINT_SYMBOLS) {
        if (stryMutAct_9fa48("147370")) {
          {}
        } else {
          stryCov_9fa48("147370");
          if (stryMutAct_9fa48("147373") ? typeof service[symbol] !== 'function' : stryMutAct_9fa48("147372") ? false : stryMutAct_9fa48("147371") ? true : (stryCov_9fa48("147371", "147372", "147373"), typeof service[symbol] === (stryMutAct_9fa48("147374") ? "" : (stryCov_9fa48("147374"), 'function')))) {
            if (stryMutAct_9fa48("147375")) {
              {}
            } else {
              stryCov_9fa48("147375");
              detected.push(symbol);
            }
          }
        }
      }
      return detected;
    }
  }

  /**
   * Assert that no dual-mode configuration keys exist.
   *
   * @param {Object} configManager - Configuration manager instance.
   * @return {string[]} List of detected forbidden config keys.
   */
  checkForbiddenConfig(configManager) {
    if (stryMutAct_9fa48("147376")) {
      {}
    } else {
      stryCov_9fa48("147376");
      if (stryMutAct_9fa48("147379") ? !configManager && typeof configManager !== 'object' : stryMutAct_9fa48("147378") ? false : stryMutAct_9fa48("147377") ? true : (stryCov_9fa48("147377", "147378", "147379"), (stryMutAct_9fa48("147380") ? configManager : (stryCov_9fa48("147380"), !configManager)) || (stryMutAct_9fa48("147382") ? typeof configManager === 'object' : stryMutAct_9fa48("147381") ? false : (stryCov_9fa48("147381", "147382"), typeof configManager !== (stryMutAct_9fa48("147383") ? "" : (stryCov_9fa48("147383"), 'object')))))) {
        if (stryMutAct_9fa48("147384")) {
          {}
        } else {
          stryCov_9fa48("147384");
          return stryMutAct_9fa48("147385") ? ["Stryker was here"] : (stryCov_9fa48("147385"), []);
        }
      }
      const detected = stryMutAct_9fa48("147386") ? ["Stryker was here"] : (stryCov_9fa48("147386"), []);
      for (const key of FORBIDDEN_CONFIG_KEYS) {
        if (stryMutAct_9fa48("147387")) {
          {}
        } else {
          stryCov_9fa48("147387");
          const value = (stryMutAct_9fa48("147390") ? typeof configManager.get !== 'function' : stryMutAct_9fa48("147389") ? false : stryMutAct_9fa48("147388") ? true : (stryCov_9fa48("147388", "147389", "147390"), typeof configManager.get === (stryMutAct_9fa48("147391") ? "" : (stryCov_9fa48("147391"), 'function')))) ? configManager.get(key) : undefined;
          if (stryMutAct_9fa48("147394") ? value !== undefined || value !== null : stryMutAct_9fa48("147393") ? false : stryMutAct_9fa48("147392") ? true : (stryCov_9fa48("147392", "147393", "147394"), (stryMutAct_9fa48("147396") ? value === undefined : stryMutAct_9fa48("147395") ? true : (stryCov_9fa48("147395", "147396"), value !== undefined)) && (stryMutAct_9fa48("147398") ? value === null : stryMutAct_9fa48("147397") ? true : (stryCov_9fa48("147397", "147398"), value !== null)))) {
            if (stryMutAct_9fa48("147399")) {
              {}
            } else {
              stryCov_9fa48("147399");
              detected.push(key);
            }
          }
        }
      }
      return detected;
    }
  }

  /**
   * Run all cutover contract assertions and return a structured
   * result.
   *
   * @return {{
   *   valid: boolean,
   *   violations: string[]
   * }}
   */
  verify() {
    if (stryMutAct_9fa48("147400")) {
      {}
    } else {
      stryCov_9fa48("147400");
      const violations = stryMutAct_9fa48("147401") ? ["Stryker was here"] : (stryCov_9fa48("147401"), []);

      // Check bootstrap service for forbidden symbols
      const bootstrapSymbols = this.checkForbiddenSymbols(this._bootstrapService);
      for (const sym of bootstrapSymbols) {
        if (stryMutAct_9fa48("147402")) {
          {}
        } else {
          stryCov_9fa48("147402");
          violations.push((stryMutAct_9fa48("147403") ? `` : (stryCov_9fa48("147403"), `${PGWIRE_CUTOVER_ERROR.LEGACY_ENTRYPOINT_DETECTED}`)) + (stryMutAct_9fa48("147404") ? `` : (stryCov_9fa48("147404"), `: bootstrap.${sym}`)));
        }
      }

      // Check joining service for forbidden symbols
      const joiningSymbols = this.checkForbiddenSymbols(this._joiningService);
      for (const sym of joiningSymbols) {
        if (stryMutAct_9fa48("147405")) {
          {}
        } else {
          stryCov_9fa48("147405");
          violations.push((stryMutAct_9fa48("147406") ? `` : (stryCov_9fa48("147406"), `${PGWIRE_CUTOVER_ERROR.LEGACY_ENTRYPOINT_DETECTED}`)) + (stryMutAct_9fa48("147407") ? `` : (stryCov_9fa48("147407"), `: joining.${sym}`)));
        }
      }

      // Check config for dual-mode keys
      const configKeys = this.checkForbiddenConfig(this._configManager);
      for (const key of configKeys) {
        if (stryMutAct_9fa48("147408")) {
          {}
        } else {
          stryCov_9fa48("147408");
          violations.push((stryMutAct_9fa48("147409") ? `` : (stryCov_9fa48("147409"), `${PGWIRE_CUTOVER_ERROR.DUAL_MODE_CONFIG_DETECTED}`)) + (stryMutAct_9fa48("147410") ? `` : (stryCov_9fa48("147410"), `: ${key}`)));
        }
      }
      const valid = stryMutAct_9fa48("147413") ? violations.length !== 0 : stryMutAct_9fa48("147412") ? false : stryMutAct_9fa48("147411") ? true : (stryCov_9fa48("147411", "147412", "147413"), violations.length === 0);
      if (stryMutAct_9fa48("147415") ? false : stryMutAct_9fa48("147414") ? true : (stryCov_9fa48("147414", "147415"), valid)) {
        if (stryMutAct_9fa48("147416")) {
          {}
        } else {
          stryCov_9fa48("147416");
          this._logger.info(PGWIRE_CUTOVER_LOG.CONTRACT_VERIFIED);
        }
      } else {
        if (stryMutAct_9fa48("147417")) {
          {}
        } else {
          stryCov_9fa48("147417");
          this._logger.error(PGWIRE_CUTOVER_LOG.VIOLATION_DETECTED, stryMutAct_9fa48("147418") ? {} : (stryCov_9fa48("147418"), {
            violations
          }));
        }
      }
      return stryMutAct_9fa48("147419") ? {} : (stryCov_9fa48("147419"), {
        valid,
        violations
      });
    }
  }
}
export { PgWireCutoverGuard };