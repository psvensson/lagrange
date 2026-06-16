/**
 * HLC Clock Service - Hybrid Logical Clock service implementation.
 * Provides globally ordered timestamps for distributed operations.
 * Requirements: 23.7, 23.8
 */

import {HLCTimestamp} from './hlc-timestamp.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {resolveTimeSource} from '../time/time-source.js';
import {LoggingService} from '../logging/logging-service.js';
import {HLC_CONFIG_KEY, HLC_DEFAULT, HLC_LOG_MSG, HLC_SUBSYSTEM} from './hlc-constants.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_NUM_ONE = 1;

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
    this.nodeId = nodeId;
    // DT4 seam: the HLC physical clock reads through a TimeSource (default
    // RealTimeSource = Date.now, byte-identical) so the convergence harness can
    // drive HLC timestamps deterministically alongside the other subsystems.
    this.timeSource = resolveTimeSource(options);
    this.physical = this.timeSource.now();
    this.logical = LOCAL_NUM_ZERO;

    // Get configuration
    const config = ConfigurationManager.getInstance();
    this.maxDrift = options.maxDrift ??
      config.get(HLC_CONFIG_KEY.MAX_DRIFT_MS) ??
      HLC_DEFAULT.MAX_DRIFT_MS;
    this.maxLogicalCounter = options.maxLogicalCounter ??
      config.get(HLC_CONFIG_KEY.MAX_LOGICAL_COUNTER) ??
      HLC_DEFAULT.MAX_LOGICAL_COUNTER;

    // Set up subsystem logger
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(HLC_SUBSYSTEM) : null;

    // Legacy callback for drift warnings (for backwards compatibility)
    this.onDriftWarning = options.onDriftWarning || null;
  }

  /**
   * Generate a new timestamp for a local event.
   * @return {HLCTimestamp} A new HLC timestamp.
   */
  now() {
    const physicalNow = this.timeSource.now();

    if (physicalNow > this.physical) {
      // Physical clock advanced, reset logical
      this.physical = physicalNow;
      this.logical = LOCAL_NUM_ZERO;
    } else {
      // Physical clock same or behind, increment logical
      this.logical++;

      // Check for logical overflow
      if (this.logical > this.maxLogicalCounter) {
        // Wait for physical clock to advance
        this.physical++;
        this.logical = LOCAL_NUM_ZERO;
      }
    }

    return new HLCTimestamp(this.physical, this.logical, this.nodeId);
  }

  /**
   * Update clock when receiving an event from another node.
   * @param {HLCTimestamp} remoteTimestamp - The remote timestamp.
   * @return {HLCTimestamp} The updated local timestamp.
   */
  update(remoteTimestamp) {
    const physicalNow = this.timeSource.now();
    const remotePhy = remoteTimestamp.physical;

    // Check for excessive clock drift
    const drift = Math.abs(remotePhy - physicalNow);
    if (drift > this.maxDrift) {
      const driftInfo = {
        localTime: physicalNow,
        remoteTime: remotePhy,
        drift: drift,
        maxDrift: this.maxDrift,
        remoteNodeId: remoteTimestamp.nodeId,
      };

      // Log via subsystem logger if available
      if (this.logger) {
        this.logger.warn(HLC_LOG_MSG.EXCESSIVE_CLOCK_DRIFT, driftInfo);
      }

      // Invoke drift warning callback if provided
      if (this.onDriftWarning) {
        this.onDriftWarning(driftInfo);
      }
    }

    // Update to max of local, remote, and physical time
    const newPhysical = Math.max(this.physical, remotePhy, physicalNow);

    if (newPhysical === this.physical && newPhysical === remotePhy) {
      // Same physical time, increment logical past remote
      this.logical = Math.max(this.logical, remoteTimestamp.logical) + LOCAL_NUM_ONE;
    } else if (newPhysical === this.physical) {
      // Local physical time wins, increment logical
      this.logical++;
    } else if (newPhysical === remotePhy) {
      // Remote physical time wins, use remote logical + 1
      this.physical = newPhysical;
      this.logical = remoteTimestamp.logical + LOCAL_NUM_ONE;
    } else {
      // Physical clock advanced beyond both, reset logical
      this.physical = newPhysical;
      this.logical = LOCAL_NUM_ZERO;
    }

    // Handle logical overflow after update
    if (this.logical > this.maxLogicalCounter) {
      this.physical++;
      this.logical = LOCAL_NUM_ZERO;
    }

    return new HLCTimestamp(this.physical, this.logical, this.nodeId);
  }

  /**
   * Get the current state of the clock without advancing it.
   * @return {HLCTimestamp} The current timestamp.
   */
  current() {
    return new HLCTimestamp(this.physical, this.logical, this.nodeId);
  }

  /**
   * Get the node ID for this clock.
   * @return {string} The node ID.
   */
  getNodeId() {
    return this.nodeId;
  }

  /**
   * Get the maximum allowed clock drift.
   * @return {number} Maximum drift in milliseconds.
   */
  getMaxDrift() {
    return this.maxDrift;
  }

  /**
   * Set the drift warning callback.
   * @param {Function} callback - Callback function for drift warnings.
   */
  setDriftWarningCallback(callback) {
    this.onDriftWarning = callback;
  }
}

export {HLCClockService};
