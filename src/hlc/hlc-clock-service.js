/**
 * HLC Clock Service - Hybrid Logical Clock service implementation.
 * Provides globally ordered timestamps for distributed operations.
 * Requirements: 23.7, 23.8
 */

import {HLCTimestamp} from './hlc-timestamp.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';

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
    this.physical = Date.now();
    this.logical = 0;

    // Get configuration
    const config = ConfigurationManager.getInstance();
    this.maxDrift = options.maxDrift ?? config.get('hlc.maxDriftMs') ?? 500;
    this.maxLogicalCounter = options.maxLogicalCounter ??
      config.get('hlc.maxLogicalCounter') ?? 65535;

    // Set up subsystem logger
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('hlc') : null;

    // Legacy callback for drift warnings (for backwards compatibility)
    this.onDriftWarning = options.onDriftWarning || null;
  }

  /**
   * Generate a new timestamp for a local event.
   * @return {HLCTimestamp} A new HLC timestamp.
   */
  now() {
    const physicalNow = Date.now();

    if (physicalNow > this.physical) {
      // Physical clock advanced, reset logical
      this.physical = physicalNow;
      this.logical = 0;
    } else {
      // Physical clock same or behind, increment logical
      this.logical++;

      // Check for logical overflow
      if (this.logical > this.maxLogicalCounter) {
        // Wait for physical clock to advance
        this.physical++;
        this.logical = 0;
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
    const physicalNow = Date.now();
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
        this.logger.warn('Excessive clock drift detected', driftInfo);
      }

      // Also call legacy callback if provided
      if (this.onDriftWarning) {
        this.onDriftWarning(driftInfo);
      }
    }

    // Update to max of local, remote, and physical time
    const newPhysical = Math.max(this.physical, remotePhy, physicalNow);

    if (newPhysical === this.physical && newPhysical === remotePhy) {
      // Same physical time, increment logical past remote
      this.logical = Math.max(this.logical, remoteTimestamp.logical) + 1;
    } else if (newPhysical === this.physical) {
      // Local physical time wins, increment logical
      this.logical++;
    } else if (newPhysical === remotePhy) {
      // Remote physical time wins, use remote logical + 1
      this.physical = newPhysical;
      this.logical = remoteTimestamp.logical + 1;
    } else {
      // Physical clock advanced beyond both, reset logical
      this.physical = newPhysical;
      this.logical = 0;
    }

    // Handle logical overflow after update
    if (this.logical > this.maxLogicalCounter) {
      this.physical++;
      this.logical = 0;
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
