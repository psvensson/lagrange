/**
 * HLC Clock Service - Hybrid Logical Clock service implementation.
 * Provides globally ordered timestamps for distributed operations.
 * Requirements: 23.7, 23.8
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
import { HLCTimestamp } from './hlc-timestamp.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { HLC_CONFIG_KEY, HLC_DEFAULT, HLC_LOG_MSG, HLC_SUBSYSTEM } from './hlc-constants.js';

/**
 * HLCClockService provides hybrid logical clock functionality.
 * Generates monotonically increasing timestamps and handles clock drift.
 */
class HLCClockService {
  /**
   * Create a new HLCClockService.
   * @param {string} nodeId - The node ID for this clock.
   * @param {Object} options - Optional configuration overrides.
   */
  constructor(nodeId, options = {}) {
    if (stryMutAct_9fa48("79886")) {
      {}
    } else {
      stryCov_9fa48("79886");
      this.nodeId = nodeId;
      this.physical = Date.now();
      this.logical = 0;

      // Get configuration
      const config = ConfigurationManager.getInstance();
      this.maxDrift = stryMutAct_9fa48("79887") ? (options.maxDrift ?? config.get(HLC_CONFIG_KEY.MAX_DRIFT_MS)) && HLC_DEFAULT.MAX_DRIFT_MS : (stryCov_9fa48("79887"), (stryMutAct_9fa48("79888") ? options.maxDrift && config.get(HLC_CONFIG_KEY.MAX_DRIFT_MS) : (stryCov_9fa48("79888"), options.maxDrift ?? config.get(HLC_CONFIG_KEY.MAX_DRIFT_MS))) ?? HLC_DEFAULT.MAX_DRIFT_MS);
      this.maxLogicalCounter = stryMutAct_9fa48("79889") ? (options.maxLogicalCounter ?? config.get(HLC_CONFIG_KEY.MAX_LOGICAL_COUNTER)) && HLC_DEFAULT.MAX_LOGICAL_COUNTER : (stryCov_9fa48("79889"), (stryMutAct_9fa48("79890") ? options.maxLogicalCounter && config.get(HLC_CONFIG_KEY.MAX_LOGICAL_COUNTER) : (stryCov_9fa48("79890"), options.maxLogicalCounter ?? config.get(HLC_CONFIG_KEY.MAX_LOGICAL_COUNTER))) ?? HLC_DEFAULT.MAX_LOGICAL_COUNTER);

      // Set up subsystem logger
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(HLC_SUBSYSTEM) : null;

      // Legacy callback for drift warnings (for backwards compatibility)
      this.onDriftWarning = stryMutAct_9fa48("79893") ? options.onDriftWarning && null : stryMutAct_9fa48("79892") ? false : stryMutAct_9fa48("79891") ? true : (stryCov_9fa48("79891", "79892", "79893"), options.onDriftWarning || null);
    }
  }

  /**
   * Generate a new timestamp for a local event.
   * @return {HLCTimestamp} A new HLC timestamp.
   */
  now() {
    if (stryMutAct_9fa48("79894")) {
      {}
    } else {
      stryCov_9fa48("79894");
      const physicalNow = Date.now();
      if (stryMutAct_9fa48("79898") ? physicalNow <= this.physical : stryMutAct_9fa48("79897") ? physicalNow >= this.physical : stryMutAct_9fa48("79896") ? false : stryMutAct_9fa48("79895") ? true : (stryCov_9fa48("79895", "79896", "79897", "79898"), physicalNow > this.physical)) {
        if (stryMutAct_9fa48("79899")) {
          {}
        } else {
          stryCov_9fa48("79899");
          // Physical clock advanced, reset logical
          this.physical = physicalNow;
          this.logical = 0;
        }
      } else {
        if (stryMutAct_9fa48("79900")) {
          {}
        } else {
          stryCov_9fa48("79900");
          // Physical clock same or behind, increment logical
          stryMutAct_9fa48("79901") ? this.logical-- : (stryCov_9fa48("79901"), this.logical++);

          // Check for logical overflow
          if (stryMutAct_9fa48("79905") ? this.logical <= this.maxLogicalCounter : stryMutAct_9fa48("79904") ? this.logical >= this.maxLogicalCounter : stryMutAct_9fa48("79903") ? false : stryMutAct_9fa48("79902") ? true : (stryCov_9fa48("79902", "79903", "79904", "79905"), this.logical > this.maxLogicalCounter)) {
            if (stryMutAct_9fa48("79906")) {
              {}
            } else {
              stryCov_9fa48("79906");
              // Wait for physical clock to advance
              stryMutAct_9fa48("79907") ? this.physical-- : (stryCov_9fa48("79907"), this.physical++);
              this.logical = 0;
            }
          }
        }
      }
      return new HLCTimestamp(this.physical, this.logical, this.nodeId);
    }
  }

  /**
   * Update clock when receiving an event from another node.
   * @param {HLCTimestamp} remoteTimestamp - The remote timestamp.
   * @return {HLCTimestamp} The updated local timestamp.
   */
  update(remoteTimestamp) {
    if (stryMutAct_9fa48("79908")) {
      {}
    } else {
      stryCov_9fa48("79908");
      const physicalNow = Date.now();
      const remotePhy = remoteTimestamp.physical;

      // Check for excessive clock drift
      const drift = Math.abs(stryMutAct_9fa48("79909") ? remotePhy + physicalNow : (stryCov_9fa48("79909"), remotePhy - physicalNow));
      if (stryMutAct_9fa48("79913") ? drift <= this.maxDrift : stryMutAct_9fa48("79912") ? drift >= this.maxDrift : stryMutAct_9fa48("79911") ? false : stryMutAct_9fa48("79910") ? true : (stryCov_9fa48("79910", "79911", "79912", "79913"), drift > this.maxDrift)) {
        if (stryMutAct_9fa48("79914")) {
          {}
        } else {
          stryCov_9fa48("79914");
          const driftInfo = stryMutAct_9fa48("79915") ? {} : (stryCov_9fa48("79915"), {
            localTime: physicalNow,
            remoteTime: remotePhy,
            drift: drift,
            maxDrift: this.maxDrift,
            remoteNodeId: remoteTimestamp.nodeId
          });

          // Log via subsystem logger if available
          if (stryMutAct_9fa48("79917") ? false : stryMutAct_9fa48("79916") ? true : (stryCov_9fa48("79916", "79917"), this.logger)) {
            if (stryMutAct_9fa48("79918")) {
              {}
            } else {
              stryCov_9fa48("79918");
              this.logger.warn(HLC_LOG_MSG.EXCESSIVE_CLOCK_DRIFT, driftInfo);
            }
          }

          // Invoke drift warning callback if provided
          if (stryMutAct_9fa48("79920") ? false : stryMutAct_9fa48("79919") ? true : (stryCov_9fa48("79919", "79920"), this.onDriftWarning)) {
            if (stryMutAct_9fa48("79921")) {
              {}
            } else {
              stryCov_9fa48("79921");
              this.onDriftWarning(driftInfo);
            }
          }
        }
      }

      // Update to max of local, remote, and physical time
      const newPhysical = stryMutAct_9fa48("79922") ? Math.min(this.physical, remotePhy, physicalNow) : (stryCov_9fa48("79922"), Math.max(this.physical, remotePhy, physicalNow));
      if (stryMutAct_9fa48("79925") ? newPhysical === this.physical || newPhysical === remotePhy : stryMutAct_9fa48("79924") ? false : stryMutAct_9fa48("79923") ? true : (stryCov_9fa48("79923", "79924", "79925"), (stryMutAct_9fa48("79927") ? newPhysical !== this.physical : stryMutAct_9fa48("79926") ? true : (stryCov_9fa48("79926", "79927"), newPhysical === this.physical)) && (stryMutAct_9fa48("79929") ? newPhysical !== remotePhy : stryMutAct_9fa48("79928") ? true : (stryCov_9fa48("79928", "79929"), newPhysical === remotePhy)))) {
        if (stryMutAct_9fa48("79930")) {
          {}
        } else {
          stryCov_9fa48("79930");
          // Same physical time, increment logical past remote
          this.logical = stryMutAct_9fa48("79931") ? Math.max(this.logical, remoteTimestamp.logical) - 1 : (stryCov_9fa48("79931"), (stryMutAct_9fa48("79932") ? Math.min(this.logical, remoteTimestamp.logical) : (stryCov_9fa48("79932"), Math.max(this.logical, remoteTimestamp.logical))) + 1);
        }
      } else if (stryMutAct_9fa48("79935") ? newPhysical !== this.physical : stryMutAct_9fa48("79934") ? false : stryMutAct_9fa48("79933") ? true : (stryCov_9fa48("79933", "79934", "79935"), newPhysical === this.physical)) {
        if (stryMutAct_9fa48("79936")) {
          {}
        } else {
          stryCov_9fa48("79936");
          // Local physical time wins, increment logical
          stryMutAct_9fa48("79937") ? this.logical-- : (stryCov_9fa48("79937"), this.logical++);
        }
      } else if (stryMutAct_9fa48("79940") ? newPhysical !== remotePhy : stryMutAct_9fa48("79939") ? false : stryMutAct_9fa48("79938") ? true : (stryCov_9fa48("79938", "79939", "79940"), newPhysical === remotePhy)) {
        if (stryMutAct_9fa48("79941")) {
          {}
        } else {
          stryCov_9fa48("79941");
          // Remote physical time wins, use remote logical + 1
          this.physical = newPhysical;
          this.logical = stryMutAct_9fa48("79942") ? remoteTimestamp.logical - 1 : (stryCov_9fa48("79942"), remoteTimestamp.logical + 1);
        }
      } else {
        if (stryMutAct_9fa48("79943")) {
          {}
        } else {
          stryCov_9fa48("79943");
          // Physical clock advanced beyond both, reset logical
          this.physical = newPhysical;
          this.logical = 0;
        }
      }

      // Handle logical overflow after update
      if (stryMutAct_9fa48("79947") ? this.logical <= this.maxLogicalCounter : stryMutAct_9fa48("79946") ? this.logical >= this.maxLogicalCounter : stryMutAct_9fa48("79945") ? false : stryMutAct_9fa48("79944") ? true : (stryCov_9fa48("79944", "79945", "79946", "79947"), this.logical > this.maxLogicalCounter)) {
        if (stryMutAct_9fa48("79948")) {
          {}
        } else {
          stryCov_9fa48("79948");
          stryMutAct_9fa48("79949") ? this.physical-- : (stryCov_9fa48("79949"), this.physical++);
          this.logical = 0;
        }
      }
      return new HLCTimestamp(this.physical, this.logical, this.nodeId);
    }
  }

  /**
   * Get the current state of the clock without advancing it.
   * @return {HLCTimestamp} The current timestamp.
   */
  current() {
    if (stryMutAct_9fa48("79950")) {
      {}
    } else {
      stryCov_9fa48("79950");
      return new HLCTimestamp(this.physical, this.logical, this.nodeId);
    }
  }

  /**
   * Get the node ID for this clock.
   * @return {string} The node ID.
   */
  getNodeId() {
    if (stryMutAct_9fa48("79951")) {
      {}
    } else {
      stryCov_9fa48("79951");
      return this.nodeId;
    }
  }

  /**
   * Get the maximum allowed clock drift.
   * @return {number} Maximum drift in milliseconds.
   */
  getMaxDrift() {
    if (stryMutAct_9fa48("79952")) {
      {}
    } else {
      stryCov_9fa48("79952");
      return this.maxDrift;
    }
  }

  /**
   * Set the drift warning callback.
   * @param {Function} callback - Callback function for drift warnings.
   */
  setDriftWarningCallback(callback) {
    if (stryMutAct_9fa48("79953")) {
      {}
    } else {
      stryCov_9fa48("79953");
      this.onDriftWarning = callback;
    }
  }
}
export { HLCClockService };