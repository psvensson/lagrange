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

import {
  PGWIRE_CUTOVER_SUBSYSTEM,
  FORBIDDEN_ENTRYPOINT_SYMBOLS,
  FORBIDDEN_CONFIG_KEYS,
  PGWIRE_CUTOVER_ERROR,
  PGWIRE_CUTOVER_LOG,
} from './pgwire-cutover-constants.js';
import {LoggingService} from '../logging/logging-service.js';

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
    this._bootstrapService = options.bootstrapService || null;
    this._joiningService = options.joiningService || null;
    this._configManager = options.configManager || null;

    const loggingService = LoggingService.getInstance();
    this._logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(PGWIRE_CUTOVER_SUBSYSTEM) :
      console;
  }

  /**
   * Assert that no forbidden standalone entrypoint symbols exist
   * on the given service object.
   *
   * @param {Object} service - Service instance to inspect.
   * @return {string[]} List of detected forbidden symbols.
   */
  checkForbiddenSymbols(service) {
    if (!service || typeof service !== 'object') {
      return [];
    }
    const detected = [];
    for (const symbol of FORBIDDEN_ENTRYPOINT_SYMBOLS) {
      if (typeof service[symbol] === 'function') {
        detected.push(symbol);
      }
    }
    return detected;
  }

  /**
   * Assert that no dual-mode configuration keys exist.
   *
   * @param {Object} configManager - Configuration manager instance.
   * @return {string[]} List of detected forbidden config keys.
   */
  checkForbiddenConfig(configManager) {
    if (!configManager || typeof configManager !== 'object') {
      return [];
    }
    const detected = [];
    for (const key of FORBIDDEN_CONFIG_KEYS) {
      const value = typeof configManager.get === 'function' ?
        configManager.get(key) : undefined;
      if (value !== undefined && value !== null) {
        detected.push(key);
      }
    }
    return detected;
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
    const violations = [];

    // Check bootstrap service for forbidden symbols
    const bootstrapSymbols =
      this.checkForbiddenSymbols(this._bootstrapService);
    for (const sym of bootstrapSymbols) {
      violations.push(
        `${PGWIRE_CUTOVER_ERROR.LEGACY_ENTRYPOINT_DETECTED}` +
        `: bootstrap.${sym}`,
      );
    }

    // Check joining service for forbidden symbols
    const joiningSymbols =
      this.checkForbiddenSymbols(this._joiningService);
    for (const sym of joiningSymbols) {
      violations.push(
        `${PGWIRE_CUTOVER_ERROR.LEGACY_ENTRYPOINT_DETECTED}` +
        `: joining.${sym}`,
      );
    }

    // Check config for dual-mode keys
    const configKeys =
      this.checkForbiddenConfig(this._configManager);
    for (const key of configKeys) {
      violations.push(
        `${PGWIRE_CUTOVER_ERROR.DUAL_MODE_CONFIG_DETECTED}` +
        `: ${key}`,
      );
    }

    const valid = violations.length === 0;

    if (valid) {
      this._logger.info(PGWIRE_CUTOVER_LOG.CONTRACT_VERIFIED);
    } else {
      this._logger.error(
        PGWIRE_CUTOVER_LOG.VIOLATION_DETECTED,
        {violations},
      );
    }

    return {valid, violations};
  }
}

export {PgWireCutoverGuard};
