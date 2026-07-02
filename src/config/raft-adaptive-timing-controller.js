/**
 * Raft adaptive timing controller.
 *
 * Evaluates runtime process load and switches raft timing between active and
 * idle profiles using hysteresis to avoid flapping.
 */

import {ResourceDiagnosticsSampler} from
  '../diagnostics/resource-diagnostics-sampler.js';
import {LoggingService} from '../logging/logging-service.js';
import {CONFIG_KEY, CONFIG_SUBSYSTEM} from './config-constants.js';
import {
  RAFT_ADAPTIVE_TIMING_LOG_MSG,
  RAFT_ADAPTIVE_TIMING_PROFILE,
  RAFT_ADAPTIVE_TIMING_REASON,
  RAFT_ADAPTIVE_TIMING_VALUE,
} from './raft-adaptive-timing-controller-constants.js';

const LOCAL_STR_RAFTADAPTIVETIMINGCONTROLLER_REQUIRES_DY = 'RaftAdaptiveTimingController requires dynamicConfigService';

const ADAPTIVE_TIMING_PROFILE_FIELDS = Object.freeze({
  HEARTBEAT_INTERVAL_MS: 'heartbeatIntervalMs',
  ELECTION_TIMEOUT_MIN_MS: 'electionTimeoutMinMs',
  ELECTION_TIMEOUT_MAX_MS: 'electionTimeoutMaxMs',
});

const ADAPTIVE_TIMING_KEY_FIELDS = Object.freeze({
  ENABLED: 'enabled',
  SAMPLE_INTERVAL_MS: 'sampleIntervalMs',
  PROMOTE_SAMPLES: 'promoteSamples',
  DEMOTE_SAMPLES: 'demoteSamples',
  HIGH_CPU_PERCENT: 'highCpuPercent',
  LOW_CPU_PERCENT: 'lowCpuPercent',
  HIGH_WRITE_BYTES_PER_SEC: 'highWriteBytesPerSec',
  LOW_WRITE_BYTES_PER_SEC: 'lowWriteBytesPerSec',
  HIGH_RSS_GROWTH_BYTES_PER_MIN: 'highRssGrowthBytesPerMin',
  LOW_RSS_GROWTH_BYTES_PER_MIN: 'lowRssGrowthBytesPerMin',
});

const ADAPTIVE_TIMING_SETTINGS_DEFAULT = Object.freeze({
  [ADAPTIVE_TIMING_KEY_FIELDS.ENABLED]: false,
  [ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS]: 5000,
  [ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES]: 2,
  [ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES]: 6,
  [ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT]: 2,
  [ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT]: 0.8,
  [ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC]: 262144,
  [ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC]: 65536,
  [ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN]: 10485760,
  [ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN]: 2097152,
});

const ADAPTIVE_TIMING_SETTINGS_KEY_FIELD = Object.freeze({
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]:
    ADAPTIVE_TIMING_KEY_FIELDS.ENABLED,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_SAMPLE_INTERVAL_MS]:
    ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES]:
    ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES]:
    ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT]:
    ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT]:
    ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_WRITE_BYTES_PER_SEC]:
    ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_WRITE_BYTES_PER_SEC]:
    ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_RSS_GROWTH_BYTES_PER_MIN]:
    ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_RSS_GROWTH_BYTES_PER_MIN]:
    ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN,
});

const ADAPTIVE_TIMING_PROFILE_KEY_FIELD = Object.freeze({
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS]: {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS,
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS]: {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS,
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS]: {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS,
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS]: {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.IDLE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS,
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS]: {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.IDLE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS,
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS]: {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.IDLE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS,
  },
});

const ADAPTIVE_TIMING_PROFILE_DEFAULT = Object.freeze({
  [RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]: Object.freeze({
    [ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]: 50,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]: 1000,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]: 3000,
  }),
  [RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]: Object.freeze({
    [ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]: 150,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]: 3000,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]: 5000,
  }),
});

const LOAD_SIGNAL = Object.freeze({
  CPU_PERCENT: 'cpuPercent',
  WRITE_BYTES_PER_SEC: 'writeBytesPerSec',
  RSS_GROWTH_BYTES_PER_MIN: 'rssGrowthBytesPerMin',
});

function normalizeInteger(value, fallback, minimum) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const parsed = Math.floor(value);
  return parsed >= minimum ? parsed : fallback;
}

function normalizeNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeProfile(profile, fallbackProfile) {
  const heartbeatMs = normalizeNumber(
    profile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS],
    fallbackProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS],
  );
  const electionMinMs = normalizeNumber(
    profile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS],
    fallbackProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS],
  );
  let electionMaxMs = normalizeNumber(
    profile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS],
    fallbackProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS],
  );
  if (electionMaxMs < electionMinMs) {
    electionMaxMs = electionMinMs;
  }
  return {
    [ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]: heartbeatMs,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]: electionMinMs,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]: electionMaxMs,
  };
}

class RaftAdaptiveTimingController {
  /**
   * @param {Object} options
   * @param {Object} options.dynamicConfigService
   * @param {string} [options.nodeId]
   * @param {Object|null} [options.owner]
   * @param {Function} [options.intervalFactory]
   * @param {Function} [options.clearIntervalFn]
   * @param {Function} [options.samplerFactory]
   * @param {boolean} [options.evaluateOnStart]
   */
  constructor(options = {}) {
    if (!options.dynamicConfigService) {
      throw new Error(LOCAL_STR_RAFTADAPTIVETIMINGCONTROLLER_REQUIRES_DY);
    }

    this.dynamicConfigService = options.dynamicConfigService;
    this.nodeId = options.nodeId || null;
    this.owner = options.owner || null;
    this.intervalFactory = options.intervalFactory || setInterval;
    this.clearIntervalFn = options.clearIntervalFn || clearInterval;
    this.evaluateOnStart = options.evaluateOnStart !== false;
    this.samplerFactory = options.samplerFactory ||
      ((samplerOptions) => new ResourceDiagnosticsSampler(samplerOptions));

    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(CONFIG_SUBSYSTEM.DYNAMIC_CONFIG) :
      console;

    this.settings = {
      ...ADAPTIVE_TIMING_SETTINGS_DEFAULT,
    };
    this.profiles = {
      [RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]: {
        ...ADAPTIVE_TIMING_PROFILE_DEFAULT[RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE],
      },
      [RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]: {
        ...ADAPTIVE_TIMING_PROFILE_DEFAULT[RAFT_ADAPTIVE_TIMING_PROFILE.IDLE],
      },
    };

    this.currentProfile = RAFT_ADAPTIVE_TIMING_VALUE.DEFAULT_PROFILE;
    this.highLoadStreak = 0;
    this.lowLoadStreak = 0;
    this.switchCount = 0;
    this.lastSignals = null;
    this.intervalHandle = null;
    this.watchUnsubscribers = [];
    this.evaluationInFlight = false;
    this.suspendLoopControl = false;
    this.initialized = false;

    this.resourceDiagnosticsSampler = this.samplerFactory({
      nodeId: this.nodeId,
      owner: this.owner,
    });
  }

  /**
   * Initialize adaptive timing controller and start evaluation loop if enabled.
   * @return {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.loadConfig();
    this.registerWatchers();
    this.currentProfile = await this.detectCurrentProfile();
    this.initialized = true;

    if (this.settings[ADAPTIVE_TIMING_KEY_FIELDS.ENABLED]) {
      this.startLoop();
    }
  }

  /**
   * Shutdown controller and cleanup watchers/timers.
   */
  shutdown() {
    this.stopLoop();
    for (const unsubscribe of this.watchUnsubscribers) {
      unsubscribe();
    }
    this.watchUnsubscribers = [];
    this.initialized = false;
  }

  /**
   * Get runtime controller state for diagnostics/tests.
   * @return {Object}
   */
  getState() {
    return {
      initialized: this.initialized,
      profile: this.currentProfile,
      highLoadStreak: this.highLoadStreak,
      lowLoadStreak: this.lowLoadStreak,
      switchCount: this.switchCount,
      loopRunning: !!this.intervalHandle,
      settings: {...this.settings},
      profiles: {
        [RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]: {
          ...this.profiles[RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE],
        },
        [RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]: {
          ...this.profiles[RAFT_ADAPTIVE_TIMING_PROFILE.IDLE],
        },
      },
      lastSignals: this.lastSignals ? {...this.lastSignals} : null,
    };
  }

  /**
   * Evaluate one adaptive-timing cycle.
   * @return {Promise<void>}
   */
  async evaluateOnce() {
    if (!this.settings[ADAPTIVE_TIMING_KEY_FIELDS.ENABLED] ||
      this.evaluationInFlight) {
      return;
    }

    this.evaluationInFlight = true;
    try {
      const report = this.resourceDiagnosticsSampler.getReport();
      const signals = this.extractSignals(report);
      this.lastSignals = signals;

      const isHigh = this.isHighLoad(signals);
      const isLow = this.isLowLoad(signals);

      if (isHigh) {
        this.highLoadStreak += 1;
        this.lowLoadStreak = 0;
      } else if (isLow) {
        this.lowLoadStreak += 1;
        this.highLoadStreak = 0;
      } else {
        this.highLoadStreak = 0;
        this.lowLoadStreak = 0;
      }

      if (this.currentProfile === RAFT_ADAPTIVE_TIMING_PROFILE.IDLE &&
        this.highLoadStreak >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES]) {
        await this.switchProfile(
          RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
          RAFT_ADAPTIVE_TIMING_REASON.HIGH_LOAD,
        );
      } else if (
        this.currentProfile === RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE &&
        this.lowLoadStreak >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES]
      ) {
        await this.switchProfile(
          RAFT_ADAPTIVE_TIMING_PROFILE.IDLE,
          RAFT_ADAPTIVE_TIMING_REASON.LOW_LOAD,
        );
      }
    } catch (error) {
      this.logger.warn(RAFT_ADAPTIVE_TIMING_LOG_MSG.EVALUATION_FAILED, {
        nodeId: this.nodeId,
        error: error.message,
      });
    } finally {
      this.evaluationInFlight = false;
    }
  }

  /**
   * Register dynamic config watchers for adaptive settings.
   * @private
   */
  registerWatchers() {
    for (const [key, field] of Object.entries(ADAPTIVE_TIMING_SETTINGS_KEY_FIELD)) {
      this.watchUnsubscribers.push(this.dynamicConfigService.watch(
        key,
        (value) => {
          this.applySettingUpdate(field, value);
        },
      ));
    }

    for (const [key, mapping] of Object.entries(ADAPTIVE_TIMING_PROFILE_KEY_FIELD)) {
      this.watchUnsubscribers.push(this.dynamicConfigService.watch(
        key,
        (value) => {
          this.applyProfileUpdate(mapping.profile, mapping.field, value);
        },
      ));
    }
  }

  /**
   * Start periodic evaluation loop.
   * @private
   */
  startLoop() {
    this.stopLoop();
    this.intervalHandle = this.intervalFactory(() => {
      void this.evaluateOnce();
    }, this.settings[ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS]);
    this.logger.info(RAFT_ADAPTIVE_TIMING_LOG_MSG.STARTED, {
      nodeId: this.nodeId,
      intervalMs: this.settings[ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS],
    });
    if (this.evaluateOnStart) {
      void this.evaluateOnce();
    }
  }

  /**
   * Stop periodic evaluation loop.
   * @private
   */
  stopLoop() {
    if (!this.intervalHandle) {
      return;
    }
    this.clearIntervalFn(this.intervalHandle);
    this.intervalHandle = null;
    this.logger.info(RAFT_ADAPTIVE_TIMING_LOG_MSG.STOPPED, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Load adaptive settings/profile values from dynamic config.
   * @return {Promise<void>}
   * @private
   */
  async loadConfig() {
    this.suspendLoopControl = true;
    for (const [key, field] of Object.entries(ADAPTIVE_TIMING_SETTINGS_KEY_FIELD)) {
      try {
        const value = await this.dynamicConfigService.get(key);
        this.applySettingUpdate(field, value);
      } catch (_error) {
        // Fall back to defaults on read failures.
      }
    }

    for (const [key, mapping] of Object.entries(ADAPTIVE_TIMING_PROFILE_KEY_FIELD)) {
      try {
        const value = await this.dynamicConfigService.get(key);
        this.applyProfileUpdate(mapping.profile, mapping.field, value);
      } catch (_error) {
        // Fall back to defaults on read failures.
      }
    }
    this.suspendLoopControl = false;
  }

  /**
   * Detect current profile from live raft timing keys.
   * @return {Promise<string>}
   * @private
   */
  async detectCurrentProfile() {
    const heartbeatIntervalMs = await this.dynamicConfigService.get(
      CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
    );
    const electionTimeoutMinMs = await this.dynamicConfigService.get(
      CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
    );
    const electionTimeoutMaxMs = await this.dynamicConfigService.get(
      CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
    );
    const idleProfile = this.profiles[RAFT_ADAPTIVE_TIMING_PROFILE.IDLE];

    if (heartbeatIntervalMs ===
      idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS] &&
      electionTimeoutMinMs ===
      idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS] &&
      electionTimeoutMaxMs ===
      idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]) {
      return RAFT_ADAPTIVE_TIMING_PROFILE.IDLE;
    }

    return RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE;
  }

  /**
   * Extract load signals from diagnostics report.
   * @param {Object} report
   * @return {Object}
   * @private
   */
  extractSignals(report) {
    return {
      [LOAD_SIGNAL.CPU_PERCENT]:
        report?.latest?.process?.cpuPercent,
      [LOAD_SIGNAL.WRITE_BYTES_PER_SEC]:
        report?.latest?.io?.writeBytesPerSec,
      [LOAD_SIGNAL.RSS_GROWTH_BYTES_PER_MIN]:
        report?.trend?.rssGrowthPerMinBytes,
    };
  }

  /**
   * Check if current signals indicate high load.
   * @param {Object} signals
   * @return {boolean}
   * @private
   */
  isHighLoad(signals) {
    const cpuPercent = signals[LOAD_SIGNAL.CPU_PERCENT];
    const writeBytesPerSec = signals[LOAD_SIGNAL.WRITE_BYTES_PER_SEC];
    const rssGrowthPerMin = signals[LOAD_SIGNAL.RSS_GROWTH_BYTES_PER_MIN];

    const cpuHigh = Number.isFinite(cpuPercent) &&
      cpuPercent >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT];
    const writeHigh = Number.isFinite(writeBytesPerSec) &&
      writeBytesPerSec >=
        this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC];
    const rssGrowthHigh = Number.isFinite(rssGrowthPerMin) &&
      rssGrowthPerMin >=
        this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN];
    return cpuHigh || writeHigh || rssGrowthHigh;
  }

  /**
   * Check if current signals indicate sustained low load.
   * @param {Object} signals
   * @return {boolean}
   * @private
   */
  isLowLoad(signals) {
    const checks = [];

    const cpuPercent = signals[LOAD_SIGNAL.CPU_PERCENT];
    if (Number.isFinite(cpuPercent)) {
      checks.push(
        cpuPercent <= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT],
      );
    }

    const writeBytesPerSec = signals[LOAD_SIGNAL.WRITE_BYTES_PER_SEC];
    if (Number.isFinite(writeBytesPerSec)) {
      checks.push(
        writeBytesPerSec <=
          this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC],
      );
    }

    const rssGrowthPerMin = signals[LOAD_SIGNAL.RSS_GROWTH_BYTES_PER_MIN];
    if (Number.isFinite(rssGrowthPerMin)) {
      checks.push(
        rssGrowthPerMin <=
          this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN],
      );
    }

    if (checks.length === 0) {
      return false;
    }
    return checks.every((check) => check);
  }

  /**
   * Switch to a target profile and persist raft timing keys.
   * @param {string} profile
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async switchProfile(profile, reason) {
    const target = this.profiles[profile];
    if (!target) {
      return;
    }

    try {
      const writeCount = await this.persistRaftTiming(target);
      this.currentProfile = profile;
      this.highLoadStreak = 0;
      this.lowLoadStreak = 0;
      this.switchCount += 1;
      this.logger.info(RAFT_ADAPTIVE_TIMING_LOG_MSG.PROFILE_SWITCHED, {
        nodeId: this.nodeId,
        profile,
        reason,
        writeCount,
        heartbeatIntervalMs:
          target[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS],
        electionTimeoutMinMs:
          target[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS],
        electionTimeoutMaxMs:
          target[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS],
      });
    } catch (error) {
      this.logger.warn(RAFT_ADAPTIVE_TIMING_LOG_MSG.PROFILE_SWITCH_FAILED, {
        nodeId: this.nodeId,
        profile,
        reason,
        error: error.message,
      });
    }
  }

  /**
   * Persist raft timing keys if values changed.
   * @param {Object} timing
   * @return {Promise<number>} Number of writes performed.
   * @private
   */
  async persistRaftTiming(timing) {
    let writeCount = 0;
    const writes = [
      {
        key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
        value: timing[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS],
      },
      {
        key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
        value: timing[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS],
      },
      {
        key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
        value: timing[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS],
      },
    ];

    for (const write of writes) {
      const currentValue = await this.dynamicConfigService.get(write.key);
      if (currentValue === write.value) {
        continue;
      }
      await this.dynamicConfigService.set(
        write.key,
        write.value,
        RAFT_ADAPTIVE_TIMING_VALUE.UPDATED_BY,
      );
      writeCount += 1;
    }

    return writeCount;
  }

  /**
   * Apply one adaptive setting update and enforce sane bounds.
   * @param {string} field
   * @param {*} value
   * @private
   */
  applySettingUpdate(field, value) {
    if (field === ADAPTIVE_TIMING_KEY_FIELDS.ENABLED) {
      if (typeof value === 'boolean') {
        this.settings[field] = value;
        if (!this.suspendLoopControl) {
          if (value) {
            this.startLoop();
          } else {
            this.stopLoop();
          }
        }
      }
      return;
    }

    if (field === ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS) {
      this.settings[field] = normalizeInteger(
        value,
        ADAPTIVE_TIMING_SETTINGS_DEFAULT[field],
        1,
      );
      if (!this.suspendLoopControl && this.intervalHandle) {
        this.startLoop();
      }
      return;
    }

    if (field === ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES ||
      field === ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES) {
      this.settings[field] = normalizeInteger(
        value,
        ADAPTIVE_TIMING_SETTINGS_DEFAULT[field],
        1,
      );
      return;
    }

    this.settings[field] = normalizeNumber(
      value,
      ADAPTIVE_TIMING_SETTINGS_DEFAULT[field],
    );

    const lowHighPairs = [
      [
        ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT,
        ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT,
      ],
      [
        ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC,
        ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC,
      ],
      [
        ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN,
        ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN,
      ],
    ];
    for (const [lowKey, highKey] of lowHighPairs) {
      if (this.settings[lowKey] > this.settings[highKey]) {
        this.settings[lowKey] = this.settings[highKey];
      }
    }
  }

  /**
   * Apply one profile timing update and enforce min/max ordering.
   * @param {string} profile
   * @param {string} field
   * @param {*} value
   * @private
   */
  applyProfileUpdate(profile, field, value) {
    const target = this.profiles[profile];
    if (!target) {
      return;
    }
    target[field] = value;
    this.profiles[profile] = normalizeProfile(
      target,
      ADAPTIVE_TIMING_PROFILE_DEFAULT[profile],
    );
  }
}

export {RaftAdaptiveTimingController};
