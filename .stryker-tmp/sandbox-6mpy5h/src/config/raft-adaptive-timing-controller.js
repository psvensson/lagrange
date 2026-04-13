/**
 * Raft adaptive timing controller.
 *
 * Evaluates runtime process load and switches raft timing between active and
 * idle profiles using hysteresis to avoid flapping.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { ResourceDiagnosticsSampler } from '../diagnostics/resource-diagnostics-sampler.js';
import { LoggingService } from '../logging/logging-service.js';
import { CONFIG_KEY, CONFIG_SUBSYSTEM } from './config-constants.js';
import { RAFT_ADAPTIVE_TIMING_LOG_MSG, RAFT_ADAPTIVE_TIMING_PROFILE, RAFT_ADAPTIVE_TIMING_REASON, RAFT_ADAPTIVE_TIMING_VALUE } from './raft-adaptive-timing-controller-constants.js';
const ADAPTIVE_TIMING_PROFILE_FIELDS = Object.freeze(stryMutAct_9fa48("54053") ? {} : (stryCov_9fa48("54053"), {
  HEARTBEAT_INTERVAL_MS: stryMutAct_9fa48("54054") ? "" : (stryCov_9fa48("54054"), 'heartbeatIntervalMs'),
  ELECTION_TIMEOUT_MIN_MS: stryMutAct_9fa48("54055") ? "" : (stryCov_9fa48("54055"), 'electionTimeoutMinMs'),
  ELECTION_TIMEOUT_MAX_MS: stryMutAct_9fa48("54056") ? "" : (stryCov_9fa48("54056"), 'electionTimeoutMaxMs')
}));
const ADAPTIVE_TIMING_KEY_FIELDS = Object.freeze(stryMutAct_9fa48("54057") ? {} : (stryCov_9fa48("54057"), {
  ENABLED: stryMutAct_9fa48("54058") ? "" : (stryCov_9fa48("54058"), 'enabled'),
  SAMPLE_INTERVAL_MS: stryMutAct_9fa48("54059") ? "" : (stryCov_9fa48("54059"), 'sampleIntervalMs'),
  PROMOTE_SAMPLES: stryMutAct_9fa48("54060") ? "" : (stryCov_9fa48("54060"), 'promoteSamples'),
  DEMOTE_SAMPLES: stryMutAct_9fa48("54061") ? "" : (stryCov_9fa48("54061"), 'demoteSamples'),
  HIGH_CPU_PERCENT: stryMutAct_9fa48("54062") ? "" : (stryCov_9fa48("54062"), 'highCpuPercent'),
  LOW_CPU_PERCENT: stryMutAct_9fa48("54063") ? "" : (stryCov_9fa48("54063"), 'lowCpuPercent'),
  HIGH_WRITE_BYTES_PER_SEC: stryMutAct_9fa48("54064") ? "" : (stryCov_9fa48("54064"), 'highWriteBytesPerSec'),
  LOW_WRITE_BYTES_PER_SEC: stryMutAct_9fa48("54065") ? "" : (stryCov_9fa48("54065"), 'lowWriteBytesPerSec'),
  HIGH_RSS_GROWTH_BYTES_PER_MIN: stryMutAct_9fa48("54066") ? "" : (stryCov_9fa48("54066"), 'highRssGrowthBytesPerMin'),
  LOW_RSS_GROWTH_BYTES_PER_MIN: stryMutAct_9fa48("54067") ? "" : (stryCov_9fa48("54067"), 'lowRssGrowthBytesPerMin')
}));
const ADAPTIVE_TIMING_SETTINGS_DEFAULT = Object.freeze(stryMutAct_9fa48("54068") ? {} : (stryCov_9fa48("54068"), {
  [ADAPTIVE_TIMING_KEY_FIELDS.ENABLED]: stryMutAct_9fa48("54069") ? true : (stryCov_9fa48("54069"), false),
  [ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS]: 5000,
  [ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES]: 2,
  [ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES]: 6,
  [ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT]: 2,
  [ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT]: 0.8,
  [ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC]: 262144,
  [ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC]: 65536,
  [ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN]: 10485760,
  [ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN]: 2097152
}));
const ADAPTIVE_TIMING_SETTINGS_KEY_FIELD = Object.freeze(stryMutAct_9fa48("54070") ? {} : (stryCov_9fa48("54070"), {
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: ADAPTIVE_TIMING_KEY_FIELDS.ENABLED,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_SAMPLE_INTERVAL_MS]: ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES]: ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES]: ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT]: ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT]: ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_WRITE_BYTES_PER_SEC]: ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_WRITE_BYTES_PER_SEC]: ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_RSS_GROWTH_BYTES_PER_MIN]: ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN,
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_RSS_GROWTH_BYTES_PER_MIN]: ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN
}));
const ADAPTIVE_TIMING_PROFILE_KEY_FIELD = Object.freeze(stryMutAct_9fa48("54071") ? {} : (stryCov_9fa48("54071"), {
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS]: stryMutAct_9fa48("54072") ? {} : (stryCov_9fa48("54072"), {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS]: stryMutAct_9fa48("54073") ? {} : (stryCov_9fa48("54073"), {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS]: stryMutAct_9fa48("54074") ? {} : (stryCov_9fa48("54074"), {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS]: stryMutAct_9fa48("54075") ? {} : (stryCov_9fa48("54075"), {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.IDLE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS]: stryMutAct_9fa48("54076") ? {} : (stryCov_9fa48("54076"), {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.IDLE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS
  }),
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS]: stryMutAct_9fa48("54077") ? {} : (stryCov_9fa48("54077"), {
    profile: RAFT_ADAPTIVE_TIMING_PROFILE.IDLE,
    field: ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS
  })
}));
const ADAPTIVE_TIMING_PROFILE_DEFAULT = Object.freeze(stryMutAct_9fa48("54078") ? {} : (stryCov_9fa48("54078"), {
  [RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]: Object.freeze(stryMutAct_9fa48("54079") ? {} : (stryCov_9fa48("54079"), {
    [ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]: 50,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]: 1000,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]: 3000
  })),
  [RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]: Object.freeze(stryMutAct_9fa48("54080") ? {} : (stryCov_9fa48("54080"), {
    [ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]: 150,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]: 3000,
    [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]: 5000
  }))
}));
const LOAD_SIGNAL = Object.freeze(stryMutAct_9fa48("54081") ? {} : (stryCov_9fa48("54081"), {
  CPU_PERCENT: stryMutAct_9fa48("54082") ? "" : (stryCov_9fa48("54082"), 'cpuPercent'),
  WRITE_BYTES_PER_SEC: stryMutAct_9fa48("54083") ? "" : (stryCov_9fa48("54083"), 'writeBytesPerSec'),
  RSS_GROWTH_BYTES_PER_MIN: stryMutAct_9fa48("54084") ? "" : (stryCov_9fa48("54084"), 'rssGrowthBytesPerMin')
}));
function normalizeInteger(value, fallback, minimum) {
  if (stryMutAct_9fa48("54085")) {
    {}
  } else {
    stryCov_9fa48("54085");
    if (stryMutAct_9fa48("54088") ? false : stryMutAct_9fa48("54087") ? true : stryMutAct_9fa48("54086") ? Number.isFinite(value) : (stryCov_9fa48("54086", "54087", "54088"), !Number.isFinite(value))) {
      if (stryMutAct_9fa48("54089")) {
        {}
      } else {
        stryCov_9fa48("54089");
        return fallback;
      }
    }
    const parsed = Math.floor(value);
    return (stryMutAct_9fa48("54093") ? parsed < minimum : stryMutAct_9fa48("54092") ? parsed > minimum : stryMutAct_9fa48("54091") ? false : stryMutAct_9fa48("54090") ? true : (stryCov_9fa48("54090", "54091", "54092", "54093"), parsed >= minimum)) ? parsed : fallback;
  }
}
function normalizeNumber(value, fallback) {
  if (stryMutAct_9fa48("54094")) {
    {}
  } else {
    stryCov_9fa48("54094");
    return Number.isFinite(value) ? value : fallback;
  }
}
function normalizeProfile(profile, fallbackProfile) {
  if (stryMutAct_9fa48("54095")) {
    {}
  } else {
    stryCov_9fa48("54095");
    const heartbeatMs = normalizeNumber(profile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS], fallbackProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]);
    const electionMinMs = normalizeNumber(profile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS], fallbackProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]);
    let electionMaxMs = normalizeNumber(profile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS], fallbackProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]);
    if (stryMutAct_9fa48("54099") ? electionMaxMs >= electionMinMs : stryMutAct_9fa48("54098") ? electionMaxMs <= electionMinMs : stryMutAct_9fa48("54097") ? false : stryMutAct_9fa48("54096") ? true : (stryCov_9fa48("54096", "54097", "54098", "54099"), electionMaxMs < electionMinMs)) {
      if (stryMutAct_9fa48("54100")) {
        {}
      } else {
        stryCov_9fa48("54100");
        electionMaxMs = electionMinMs;
      }
    }
    return stryMutAct_9fa48("54101") ? {} : (stryCov_9fa48("54101"), {
      [ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]: heartbeatMs,
      [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]: electionMinMs,
      [ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]: electionMaxMs
    });
  }
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
    if (stryMutAct_9fa48("54102")) {
      {}
    } else {
      stryCov_9fa48("54102");
      if (stryMutAct_9fa48("54105") ? false : stryMutAct_9fa48("54104") ? true : stryMutAct_9fa48("54103") ? options.dynamicConfigService : (stryCov_9fa48("54103", "54104", "54105"), !options.dynamicConfigService)) {
        if (stryMutAct_9fa48("54106")) {
          {}
        } else {
          stryCov_9fa48("54106");
          throw new Error(stryMutAct_9fa48("54107") ? "" : (stryCov_9fa48("54107"), 'RaftAdaptiveTimingController requires dynamicConfigService'));
        }
      }
      this.dynamicConfigService = options.dynamicConfigService;
      this.nodeId = stryMutAct_9fa48("54110") ? options.nodeId && null : stryMutAct_9fa48("54109") ? false : stryMutAct_9fa48("54108") ? true : (stryCov_9fa48("54108", "54109", "54110"), options.nodeId || null);
      this.owner = stryMutAct_9fa48("54113") ? options.owner && null : stryMutAct_9fa48("54112") ? false : stryMutAct_9fa48("54111") ? true : (stryCov_9fa48("54111", "54112", "54113"), options.owner || null);
      this.intervalFactory = stryMutAct_9fa48("54116") ? options.intervalFactory && setInterval : stryMutAct_9fa48("54115") ? false : stryMutAct_9fa48("54114") ? true : (stryCov_9fa48("54114", "54115", "54116"), options.intervalFactory || setInterval);
      this.clearIntervalFn = stryMutAct_9fa48("54119") ? options.clearIntervalFn && clearInterval : stryMutAct_9fa48("54118") ? false : stryMutAct_9fa48("54117") ? true : (stryCov_9fa48("54117", "54118", "54119"), options.clearIntervalFn || clearInterval);
      this.evaluateOnStart = stryMutAct_9fa48("54122") ? options.evaluateOnStart === false : stryMutAct_9fa48("54121") ? false : stryMutAct_9fa48("54120") ? true : (stryCov_9fa48("54120", "54121", "54122"), options.evaluateOnStart !== (stryMutAct_9fa48("54123") ? true : (stryCov_9fa48("54123"), false)));
      this.samplerFactory = stryMutAct_9fa48("54126") ? options.samplerFactory && (samplerOptions => new ResourceDiagnosticsSampler(samplerOptions)) : stryMutAct_9fa48("54125") ? false : stryMutAct_9fa48("54124") ? true : (stryCov_9fa48("54124", "54125", "54126"), options.samplerFactory || (stryMutAct_9fa48("54127") ? () => undefined : (stryCov_9fa48("54127"), samplerOptions => new ResourceDiagnosticsSampler(samplerOptions))));
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(CONFIG_SUBSYSTEM.DYNAMIC_CONFIG) : console;
      this.settings = stryMutAct_9fa48("54128") ? {} : (stryCov_9fa48("54128"), {
        ...ADAPTIVE_TIMING_SETTINGS_DEFAULT
      });
      this.profiles = stryMutAct_9fa48("54129") ? {} : (stryCov_9fa48("54129"), {
        [RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]: stryMutAct_9fa48("54130") ? {} : (stryCov_9fa48("54130"), {
          ...ADAPTIVE_TIMING_PROFILE_DEFAULT[RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]
        }),
        [RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]: stryMutAct_9fa48("54131") ? {} : (stryCov_9fa48("54131"), {
          ...ADAPTIVE_TIMING_PROFILE_DEFAULT[RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]
        })
      });
      this.currentProfile = RAFT_ADAPTIVE_TIMING_VALUE.DEFAULT_PROFILE;
      this.highLoadStreak = NUM.ZERO;
      this.lowLoadStreak = NUM.ZERO;
      this.switchCount = NUM.ZERO;
      this.lastSignals = null;
      this.intervalHandle = null;
      this.watchUnsubscribers = stryMutAct_9fa48("54132") ? ["Stryker was here"] : (stryCov_9fa48("54132"), []);
      this.evaluationInFlight = stryMutAct_9fa48("54133") ? true : (stryCov_9fa48("54133"), false);
      this.suspendLoopControl = stryMutAct_9fa48("54134") ? true : (stryCov_9fa48("54134"), false);
      this.initialized = stryMutAct_9fa48("54135") ? true : (stryCov_9fa48("54135"), false);
      this.resourceDiagnosticsSampler = this.samplerFactory(stryMutAct_9fa48("54136") ? {} : (stryCov_9fa48("54136"), {
        nodeId: this.nodeId,
        owner: this.owner
      }));
    }
  }

  /**
   * Initialize adaptive timing controller and start evaluation loop if enabled.
   * @return {Promise<void>}
   */
  async initialize() {
    if (stryMutAct_9fa48("54137")) {
      {}
    } else {
      stryCov_9fa48("54137");
      if (stryMutAct_9fa48("54139") ? false : stryMutAct_9fa48("54138") ? true : (stryCov_9fa48("54138", "54139"), this.initialized)) {
        if (stryMutAct_9fa48("54140")) {
          {}
        } else {
          stryCov_9fa48("54140");
          return;
        }
      }
      await this.loadConfig();
      this.registerWatchers();
      this.currentProfile = await this.detectCurrentProfile();
      this.initialized = stryMutAct_9fa48("54141") ? false : (stryCov_9fa48("54141"), true);
      if (stryMutAct_9fa48("54143") ? false : stryMutAct_9fa48("54142") ? true : (stryCov_9fa48("54142", "54143"), this.settings[ADAPTIVE_TIMING_KEY_FIELDS.ENABLED])) {
        if (stryMutAct_9fa48("54144")) {
          {}
        } else {
          stryCov_9fa48("54144");
          this.startLoop();
        }
      }
    }
  }

  /**
   * Shutdown controller and cleanup watchers/timers.
   */
  shutdown() {
    if (stryMutAct_9fa48("54145")) {
      {}
    } else {
      stryCov_9fa48("54145");
      this.stopLoop();
      for (const unsubscribe of this.watchUnsubscribers) {
        if (stryMutAct_9fa48("54146")) {
          {}
        } else {
          stryCov_9fa48("54146");
          unsubscribe();
        }
      }
      this.watchUnsubscribers = stryMutAct_9fa48("54147") ? ["Stryker was here"] : (stryCov_9fa48("54147"), []);
      this.initialized = stryMutAct_9fa48("54148") ? true : (stryCov_9fa48("54148"), false);
    }
  }

  /**
   * Get runtime controller state for diagnostics/tests.
   * @return {Object}
   */
  getState() {
    if (stryMutAct_9fa48("54149")) {
      {}
    } else {
      stryCov_9fa48("54149");
      return stryMutAct_9fa48("54150") ? {} : (stryCov_9fa48("54150"), {
        initialized: this.initialized,
        profile: this.currentProfile,
        highLoadStreak: this.highLoadStreak,
        lowLoadStreak: this.lowLoadStreak,
        switchCount: this.switchCount,
        loopRunning: stryMutAct_9fa48("54151") ? !this.intervalHandle : (stryCov_9fa48("54151"), !(stryMutAct_9fa48("54152") ? this.intervalHandle : (stryCov_9fa48("54152"), !this.intervalHandle))),
        settings: stryMutAct_9fa48("54153") ? {} : (stryCov_9fa48("54153"), {
          ...this.settings
        }),
        profiles: stryMutAct_9fa48("54154") ? {} : (stryCov_9fa48("54154"), {
          [RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]: stryMutAct_9fa48("54155") ? {} : (stryCov_9fa48("54155"), {
            ...this.profiles[RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE]
          }),
          [RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]: stryMutAct_9fa48("54156") ? {} : (stryCov_9fa48("54156"), {
            ...this.profiles[RAFT_ADAPTIVE_TIMING_PROFILE.IDLE]
          })
        }),
        lastSignals: this.lastSignals ? stryMutAct_9fa48("54157") ? {} : (stryCov_9fa48("54157"), {
          ...this.lastSignals
        }) : null
      });
    }
  }

  /**
   * Evaluate one adaptive-timing cycle.
   * @return {Promise<void>}
   */
  async evaluateOnce() {
    if (stryMutAct_9fa48("54158")) {
      {}
    } else {
      stryCov_9fa48("54158");
      if (stryMutAct_9fa48("54161") ? !this.settings[ADAPTIVE_TIMING_KEY_FIELDS.ENABLED] && this.evaluationInFlight : stryMutAct_9fa48("54160") ? false : stryMutAct_9fa48("54159") ? true : (stryCov_9fa48("54159", "54160", "54161"), (stryMutAct_9fa48("54162") ? this.settings[ADAPTIVE_TIMING_KEY_FIELDS.ENABLED] : (stryCov_9fa48("54162"), !this.settings[ADAPTIVE_TIMING_KEY_FIELDS.ENABLED])) || this.evaluationInFlight)) {
        if (stryMutAct_9fa48("54163")) {
          {}
        } else {
          stryCov_9fa48("54163");
          return;
        }
      }
      this.evaluationInFlight = stryMutAct_9fa48("54164") ? false : (stryCov_9fa48("54164"), true);
      try {
        if (stryMutAct_9fa48("54165")) {
          {}
        } else {
          stryCov_9fa48("54165");
          const report = this.resourceDiagnosticsSampler.getReport();
          const signals = this.extractSignals(report);
          this.lastSignals = signals;
          const isHigh = this.isHighLoad(signals);
          const isLow = this.isLowLoad(signals);
          if (stryMutAct_9fa48("54167") ? false : stryMutAct_9fa48("54166") ? true : (stryCov_9fa48("54166", "54167"), isHigh)) {
            if (stryMutAct_9fa48("54168")) {
              {}
            } else {
              stryCov_9fa48("54168");
              stryMutAct_9fa48("54169") ? this.highLoadStreak -= NUM.ONE : (stryCov_9fa48("54169"), this.highLoadStreak += NUM.ONE);
              this.lowLoadStreak = NUM.ZERO;
            }
          } else if (stryMutAct_9fa48("54171") ? false : stryMutAct_9fa48("54170") ? true : (stryCov_9fa48("54170", "54171"), isLow)) {
            if (stryMutAct_9fa48("54172")) {
              {}
            } else {
              stryCov_9fa48("54172");
              stryMutAct_9fa48("54173") ? this.lowLoadStreak -= NUM.ONE : (stryCov_9fa48("54173"), this.lowLoadStreak += NUM.ONE);
              this.highLoadStreak = NUM.ZERO;
            }
          } else {
            if (stryMutAct_9fa48("54174")) {
              {}
            } else {
              stryCov_9fa48("54174");
              this.highLoadStreak = NUM.ZERO;
              this.lowLoadStreak = NUM.ZERO;
            }
          }
          if (stryMutAct_9fa48("54177") ? this.currentProfile === RAFT_ADAPTIVE_TIMING_PROFILE.IDLE || this.highLoadStreak >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES] : stryMutAct_9fa48("54176") ? false : stryMutAct_9fa48("54175") ? true : (stryCov_9fa48("54175", "54176", "54177"), (stryMutAct_9fa48("54179") ? this.currentProfile !== RAFT_ADAPTIVE_TIMING_PROFILE.IDLE : stryMutAct_9fa48("54178") ? true : (stryCov_9fa48("54178", "54179"), this.currentProfile === RAFT_ADAPTIVE_TIMING_PROFILE.IDLE)) && (stryMutAct_9fa48("54182") ? this.highLoadStreak < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES] : stryMutAct_9fa48("54181") ? this.highLoadStreak > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES] : stryMutAct_9fa48("54180") ? true : (stryCov_9fa48("54180", "54181", "54182"), this.highLoadStreak >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES])))) {
            if (stryMutAct_9fa48("54183")) {
              {}
            } else {
              stryCov_9fa48("54183");
              await this.switchProfile(RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE, RAFT_ADAPTIVE_TIMING_REASON.HIGH_LOAD);
            }
          } else if (stryMutAct_9fa48("54186") ? this.currentProfile === RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE || this.lowLoadStreak >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES] : stryMutAct_9fa48("54185") ? false : stryMutAct_9fa48("54184") ? true : (stryCov_9fa48("54184", "54185", "54186"), (stryMutAct_9fa48("54188") ? this.currentProfile !== RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE : stryMutAct_9fa48("54187") ? true : (stryCov_9fa48("54187", "54188"), this.currentProfile === RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE)) && (stryMutAct_9fa48("54191") ? this.lowLoadStreak < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES] : stryMutAct_9fa48("54190") ? this.lowLoadStreak > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES] : stryMutAct_9fa48("54189") ? true : (stryCov_9fa48("54189", "54190", "54191"), this.lowLoadStreak >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES])))) {
            if (stryMutAct_9fa48("54192")) {
              {}
            } else {
              stryCov_9fa48("54192");
              await this.switchProfile(RAFT_ADAPTIVE_TIMING_PROFILE.IDLE, RAFT_ADAPTIVE_TIMING_REASON.LOW_LOAD);
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("54193")) {
          {}
        } else {
          stryCov_9fa48("54193");
          this.logger.warn(RAFT_ADAPTIVE_TIMING_LOG_MSG.EVALUATION_FAILED, stryMutAct_9fa48("54194") ? {} : (stryCov_9fa48("54194"), {
            nodeId: this.nodeId,
            error: error.message
          }));
        }
      } finally {
        if (stryMutAct_9fa48("54195")) {
          {}
        } else {
          stryCov_9fa48("54195");
          this.evaluationInFlight = stryMutAct_9fa48("54196") ? true : (stryCov_9fa48("54196"), false);
        }
      }
    }
  }

  /**
   * Register dynamic config watchers for adaptive settings.
   * @private
   */
  registerWatchers() {
    if (stryMutAct_9fa48("54197")) {
      {}
    } else {
      stryCov_9fa48("54197");
      for (const [key, field] of Object.entries(ADAPTIVE_TIMING_SETTINGS_KEY_FIELD)) {
        if (stryMutAct_9fa48("54198")) {
          {}
        } else {
          stryCov_9fa48("54198");
          this.watchUnsubscribers.push(this.dynamicConfigService.watch(key, value => {
            if (stryMutAct_9fa48("54199")) {
              {}
            } else {
              stryCov_9fa48("54199");
              this.applySettingUpdate(field, value);
            }
          }));
        }
      }
      for (const [key, mapping] of Object.entries(ADAPTIVE_TIMING_PROFILE_KEY_FIELD)) {
        if (stryMutAct_9fa48("54200")) {
          {}
        } else {
          stryCov_9fa48("54200");
          this.watchUnsubscribers.push(this.dynamicConfigService.watch(key, value => {
            if (stryMutAct_9fa48("54201")) {
              {}
            } else {
              stryCov_9fa48("54201");
              this.applyProfileUpdate(mapping.profile, mapping.field, value);
            }
          }));
        }
      }
    }
  }

  /**
   * Start periodic evaluation loop.
   * @private
   */
  startLoop() {
    if (stryMutAct_9fa48("54202")) {
      {}
    } else {
      stryCov_9fa48("54202");
      this.stopLoop();
      this.intervalHandle = this.intervalFactory(() => {
        if (stryMutAct_9fa48("54203")) {
          {}
        } else {
          stryCov_9fa48("54203");
          void this.evaluateOnce();
        }
      }, this.settings[ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS]);
      this.logger.info(RAFT_ADAPTIVE_TIMING_LOG_MSG.STARTED, stryMutAct_9fa48("54204") ? {} : (stryCov_9fa48("54204"), {
        nodeId: this.nodeId,
        intervalMs: this.settings[ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS]
      }));
      if (stryMutAct_9fa48("54206") ? false : stryMutAct_9fa48("54205") ? true : (stryCov_9fa48("54205", "54206"), this.evaluateOnStart)) {
        if (stryMutAct_9fa48("54207")) {
          {}
        } else {
          stryCov_9fa48("54207");
          void this.evaluateOnce();
        }
      }
    }
  }

  /**
   * Stop periodic evaluation loop.
   * @private
   */
  stopLoop() {
    if (stryMutAct_9fa48("54208")) {
      {}
    } else {
      stryCov_9fa48("54208");
      if (stryMutAct_9fa48("54211") ? false : stryMutAct_9fa48("54210") ? true : stryMutAct_9fa48("54209") ? this.intervalHandle : (stryCov_9fa48("54209", "54210", "54211"), !this.intervalHandle)) {
        if (stryMutAct_9fa48("54212")) {
          {}
        } else {
          stryCov_9fa48("54212");
          return;
        }
      }
      this.clearIntervalFn(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info(RAFT_ADAPTIVE_TIMING_LOG_MSG.STOPPED, stryMutAct_9fa48("54213") ? {} : (stryCov_9fa48("54213"), {
        nodeId: this.nodeId
      }));
    }
  }

  /**
   * Load adaptive settings/profile values from dynamic config.
   * @return {Promise<void>}
   * @private
   */
  async loadConfig() {
    if (stryMutAct_9fa48("54214")) {
      {}
    } else {
      stryCov_9fa48("54214");
      this.suspendLoopControl = stryMutAct_9fa48("54215") ? false : (stryCov_9fa48("54215"), true);
      for (const [key, field] of Object.entries(ADAPTIVE_TIMING_SETTINGS_KEY_FIELD)) {
        if (stryMutAct_9fa48("54216")) {
          {}
        } else {
          stryCov_9fa48("54216");
          try {
            if (stryMutAct_9fa48("54217")) {
              {}
            } else {
              stryCov_9fa48("54217");
              const value = await this.dynamicConfigService.get(key);
              this.applySettingUpdate(field, value);
            }
          } catch (_error) {
            // Fall back to defaults on read failures.
          }
        }
      }
      for (const [key, mapping] of Object.entries(ADAPTIVE_TIMING_PROFILE_KEY_FIELD)) {
        if (stryMutAct_9fa48("54218")) {
          {}
        } else {
          stryCov_9fa48("54218");
          try {
            if (stryMutAct_9fa48("54219")) {
              {}
            } else {
              stryCov_9fa48("54219");
              const value = await this.dynamicConfigService.get(key);
              this.applyProfileUpdate(mapping.profile, mapping.field, value);
            }
          } catch (_error) {
            // Fall back to defaults on read failures.
          }
        }
      }
      this.suspendLoopControl = stryMutAct_9fa48("54220") ? true : (stryCov_9fa48("54220"), false);
    }
  }

  /**
   * Detect current profile from live raft timing keys.
   * @return {Promise<string>}
   * @private
   */
  async detectCurrentProfile() {
    if (stryMutAct_9fa48("54221")) {
      {}
    } else {
      stryCov_9fa48("54221");
      const heartbeatIntervalMs = await this.dynamicConfigService.get(CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS);
      const electionTimeoutMinMs = await this.dynamicConfigService.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS);
      const electionTimeoutMaxMs = await this.dynamicConfigService.get(CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS);
      const idleProfile = this.profiles[RAFT_ADAPTIVE_TIMING_PROFILE.IDLE];
      if (stryMutAct_9fa48("54224") ? heartbeatIntervalMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS] && electionTimeoutMinMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS] || electionTimeoutMaxMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS] : stryMutAct_9fa48("54223") ? false : stryMutAct_9fa48("54222") ? true : (stryCov_9fa48("54222", "54223", "54224"), (stryMutAct_9fa48("54226") ? heartbeatIntervalMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS] || electionTimeoutMinMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS] : stryMutAct_9fa48("54225") ? true : (stryCov_9fa48("54225", "54226"), (stryMutAct_9fa48("54228") ? heartbeatIntervalMs !== idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS] : stryMutAct_9fa48("54227") ? true : (stryCov_9fa48("54227", "54228"), heartbeatIntervalMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS])) && (stryMutAct_9fa48("54230") ? electionTimeoutMinMs !== idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS] : stryMutAct_9fa48("54229") ? true : (stryCov_9fa48("54229", "54230"), electionTimeoutMinMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS])))) && (stryMutAct_9fa48("54232") ? electionTimeoutMaxMs !== idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS] : stryMutAct_9fa48("54231") ? true : (stryCov_9fa48("54231", "54232"), electionTimeoutMaxMs === idleProfile[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS])))) {
        if (stryMutAct_9fa48("54233")) {
          {}
        } else {
          stryCov_9fa48("54233");
          return RAFT_ADAPTIVE_TIMING_PROFILE.IDLE;
        }
      }
      return RAFT_ADAPTIVE_TIMING_PROFILE.ACTIVE;
    }
  }

  /**
   * Extract load signals from diagnostics report.
   * @param {Object} report
   * @return {Object}
   * @private
   */
  extractSignals(report) {
    if (stryMutAct_9fa48("54234")) {
      {}
    } else {
      stryCov_9fa48("54234");
      return stryMutAct_9fa48("54235") ? {} : (stryCov_9fa48("54235"), {
        [LOAD_SIGNAL.CPU_PERCENT]: stryMutAct_9fa48("54238") ? report.latest?.process?.cpuPercent : stryMutAct_9fa48("54237") ? report?.latest.process?.cpuPercent : stryMutAct_9fa48("54236") ? report?.latest?.process.cpuPercent : (stryCov_9fa48("54236", "54237", "54238"), report?.latest?.process?.cpuPercent),
        [LOAD_SIGNAL.WRITE_BYTES_PER_SEC]: stryMutAct_9fa48("54241") ? report.latest?.io?.writeBytesPerSec : stryMutAct_9fa48("54240") ? report?.latest.io?.writeBytesPerSec : stryMutAct_9fa48("54239") ? report?.latest?.io.writeBytesPerSec : (stryCov_9fa48("54239", "54240", "54241"), report?.latest?.io?.writeBytesPerSec),
        [LOAD_SIGNAL.RSS_GROWTH_BYTES_PER_MIN]: stryMutAct_9fa48("54243") ? report.trend?.rssGrowthPerMinBytes : stryMutAct_9fa48("54242") ? report?.trend.rssGrowthPerMinBytes : (stryCov_9fa48("54242", "54243"), report?.trend?.rssGrowthPerMinBytes)
      });
    }
  }

  /**
   * Check if current signals indicate high load.
   * @param {Object} signals
   * @return {boolean}
   * @private
   */
  isHighLoad(signals) {
    if (stryMutAct_9fa48("54244")) {
      {}
    } else {
      stryCov_9fa48("54244");
      const cpuPercent = signals[LOAD_SIGNAL.CPU_PERCENT];
      const writeBytesPerSec = signals[LOAD_SIGNAL.WRITE_BYTES_PER_SEC];
      const rssGrowthPerMin = signals[LOAD_SIGNAL.RSS_GROWTH_BYTES_PER_MIN];
      const cpuHigh = stryMutAct_9fa48("54247") ? Number.isFinite(cpuPercent) || cpuPercent >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT] : stryMutAct_9fa48("54246") ? false : stryMutAct_9fa48("54245") ? true : (stryCov_9fa48("54245", "54246", "54247"), Number.isFinite(cpuPercent) && (stryMutAct_9fa48("54250") ? cpuPercent < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT] : stryMutAct_9fa48("54249") ? cpuPercent > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT] : stryMutAct_9fa48("54248") ? true : (stryCov_9fa48("54248", "54249", "54250"), cpuPercent >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT])));
      const writeHigh = stryMutAct_9fa48("54253") ? Number.isFinite(writeBytesPerSec) || writeBytesPerSec >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC] : stryMutAct_9fa48("54252") ? false : stryMutAct_9fa48("54251") ? true : (stryCov_9fa48("54251", "54252", "54253"), Number.isFinite(writeBytesPerSec) && (stryMutAct_9fa48("54256") ? writeBytesPerSec < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC] : stryMutAct_9fa48("54255") ? writeBytesPerSec > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC] : stryMutAct_9fa48("54254") ? true : (stryCov_9fa48("54254", "54255", "54256"), writeBytesPerSec >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC])));
      const rssGrowthHigh = stryMutAct_9fa48("54259") ? Number.isFinite(rssGrowthPerMin) || rssGrowthPerMin >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN] : stryMutAct_9fa48("54258") ? false : stryMutAct_9fa48("54257") ? true : (stryCov_9fa48("54257", "54258", "54259"), Number.isFinite(rssGrowthPerMin) && (stryMutAct_9fa48("54262") ? rssGrowthPerMin < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN] : stryMutAct_9fa48("54261") ? rssGrowthPerMin > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN] : stryMutAct_9fa48("54260") ? true : (stryCov_9fa48("54260", "54261", "54262"), rssGrowthPerMin >= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN])));
      return stryMutAct_9fa48("54265") ? (cpuHigh || writeHigh) && rssGrowthHigh : stryMutAct_9fa48("54264") ? false : stryMutAct_9fa48("54263") ? true : (stryCov_9fa48("54263", "54264", "54265"), (stryMutAct_9fa48("54267") ? cpuHigh && writeHigh : stryMutAct_9fa48("54266") ? false : (stryCov_9fa48("54266", "54267"), cpuHigh || writeHigh)) || rssGrowthHigh);
    }
  }

  /**
   * Check if current signals indicate sustained low load.
   * @param {Object} signals
   * @return {boolean}
   * @private
   */
  isLowLoad(signals) {
    if (stryMutAct_9fa48("54268")) {
      {}
    } else {
      stryCov_9fa48("54268");
      const checks = stryMutAct_9fa48("54269") ? ["Stryker was here"] : (stryCov_9fa48("54269"), []);
      const cpuPercent = signals[LOAD_SIGNAL.CPU_PERCENT];
      if (stryMutAct_9fa48("54271") ? false : stryMutAct_9fa48("54270") ? true : (stryCov_9fa48("54270", "54271"), Number.isFinite(cpuPercent))) {
        if (stryMutAct_9fa48("54272")) {
          {}
        } else {
          stryCov_9fa48("54272");
          checks.push(stryMutAct_9fa48("54276") ? cpuPercent > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT] : stryMutAct_9fa48("54275") ? cpuPercent < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT] : stryMutAct_9fa48("54274") ? false : stryMutAct_9fa48("54273") ? true : (stryCov_9fa48("54273", "54274", "54275", "54276"), cpuPercent <= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT]));
        }
      }
      const writeBytesPerSec = signals[LOAD_SIGNAL.WRITE_BYTES_PER_SEC];
      if (stryMutAct_9fa48("54278") ? false : stryMutAct_9fa48("54277") ? true : (stryCov_9fa48("54277", "54278"), Number.isFinite(writeBytesPerSec))) {
        if (stryMutAct_9fa48("54279")) {
          {}
        } else {
          stryCov_9fa48("54279");
          checks.push(stryMutAct_9fa48("54283") ? writeBytesPerSec > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC] : stryMutAct_9fa48("54282") ? writeBytesPerSec < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC] : stryMutAct_9fa48("54281") ? false : stryMutAct_9fa48("54280") ? true : (stryCov_9fa48("54280", "54281", "54282", "54283"), writeBytesPerSec <= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC]));
        }
      }
      const rssGrowthPerMin = signals[LOAD_SIGNAL.RSS_GROWTH_BYTES_PER_MIN];
      if (stryMutAct_9fa48("54285") ? false : stryMutAct_9fa48("54284") ? true : (stryCov_9fa48("54284", "54285"), Number.isFinite(rssGrowthPerMin))) {
        if (stryMutAct_9fa48("54286")) {
          {}
        } else {
          stryCov_9fa48("54286");
          checks.push(stryMutAct_9fa48("54290") ? rssGrowthPerMin > this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN] : stryMutAct_9fa48("54289") ? rssGrowthPerMin < this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN] : stryMutAct_9fa48("54288") ? false : stryMutAct_9fa48("54287") ? true : (stryCov_9fa48("54287", "54288", "54289", "54290"), rssGrowthPerMin <= this.settings[ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN]));
        }
      }
      if (stryMutAct_9fa48("54293") ? checks.length !== NUM.ZERO : stryMutAct_9fa48("54292") ? false : stryMutAct_9fa48("54291") ? true : (stryCov_9fa48("54291", "54292", "54293"), checks.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("54294")) {
          {}
        } else {
          stryCov_9fa48("54294");
          return stryMutAct_9fa48("54295") ? true : (stryCov_9fa48("54295"), false);
        }
      }
      return stryMutAct_9fa48("54296") ? checks.some(check => check) : (stryCov_9fa48("54296"), checks.every(stryMutAct_9fa48("54297") ? () => undefined : (stryCov_9fa48("54297"), check => check)));
    }
  }

  /**
   * Switch to a target profile and persist raft timing keys.
   * @param {string} profile
   * @param {string} reason
   * @return {Promise<void>}
   * @private
   */
  async switchProfile(profile, reason) {
    if (stryMutAct_9fa48("54298")) {
      {}
    } else {
      stryCov_9fa48("54298");
      const target = this.profiles[profile];
      if (stryMutAct_9fa48("54301") ? false : stryMutAct_9fa48("54300") ? true : stryMutAct_9fa48("54299") ? target : (stryCov_9fa48("54299", "54300", "54301"), !target)) {
        if (stryMutAct_9fa48("54302")) {
          {}
        } else {
          stryCov_9fa48("54302");
          return;
        }
      }
      try {
        if (stryMutAct_9fa48("54303")) {
          {}
        } else {
          stryCov_9fa48("54303");
          const writeCount = await this.persistRaftTiming(target);
          this.currentProfile = profile;
          this.highLoadStreak = NUM.ZERO;
          this.lowLoadStreak = NUM.ZERO;
          stryMutAct_9fa48("54304") ? this.switchCount -= NUM.ONE : (stryCov_9fa48("54304"), this.switchCount += NUM.ONE);
          this.logger.info(RAFT_ADAPTIVE_TIMING_LOG_MSG.PROFILE_SWITCHED, stryMutAct_9fa48("54305") ? {} : (stryCov_9fa48("54305"), {
            nodeId: this.nodeId,
            profile,
            reason,
            writeCount,
            heartbeatIntervalMs: target[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS],
            electionTimeoutMinMs: target[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS],
            electionTimeoutMaxMs: target[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("54306")) {
          {}
        } else {
          stryCov_9fa48("54306");
          this.logger.warn(RAFT_ADAPTIVE_TIMING_LOG_MSG.PROFILE_SWITCH_FAILED, stryMutAct_9fa48("54307") ? {} : (stryCov_9fa48("54307"), {
            nodeId: this.nodeId,
            profile,
            reason,
            error: error.message
          }));
        }
      }
    }
  }

  /**
   * Persist raft timing keys if values changed.
   * @param {Object} timing
   * @return {Promise<number>} Number of writes performed.
   * @private
   */
  async persistRaftTiming(timing) {
    if (stryMutAct_9fa48("54308")) {
      {}
    } else {
      stryCov_9fa48("54308");
      let writeCount = NUM.ZERO;
      const writes = stryMutAct_9fa48("54309") ? [] : (stryCov_9fa48("54309"), [stryMutAct_9fa48("54310") ? {} : (stryCov_9fa48("54310"), {
        key: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
        value: timing[ADAPTIVE_TIMING_PROFILE_FIELDS.HEARTBEAT_INTERVAL_MS]
      }), stryMutAct_9fa48("54311") ? {} : (stryCov_9fa48("54311"), {
        key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
        value: timing[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MIN_MS]
      }), stryMutAct_9fa48("54312") ? {} : (stryCov_9fa48("54312"), {
        key: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
        value: timing[ADAPTIVE_TIMING_PROFILE_FIELDS.ELECTION_TIMEOUT_MAX_MS]
      })]);
      for (const write of writes) {
        if (stryMutAct_9fa48("54313")) {
          {}
        } else {
          stryCov_9fa48("54313");
          const currentValue = await this.dynamicConfigService.get(write.key);
          if (stryMutAct_9fa48("54316") ? currentValue !== write.value : stryMutAct_9fa48("54315") ? false : stryMutAct_9fa48("54314") ? true : (stryCov_9fa48("54314", "54315", "54316"), currentValue === write.value)) {
            if (stryMutAct_9fa48("54317")) {
              {}
            } else {
              stryCov_9fa48("54317");
              continue;
            }
          }
          await this.dynamicConfigService.set(write.key, write.value, RAFT_ADAPTIVE_TIMING_VALUE.UPDATED_BY);
          stryMutAct_9fa48("54318") ? writeCount -= NUM.ONE : (stryCov_9fa48("54318"), writeCount += NUM.ONE);
        }
      }
      return writeCount;
    }
  }

  /**
   * Apply one adaptive setting update and enforce sane bounds.
   * @param {string} field
   * @param {*} value
   * @private
   */
  applySettingUpdate(field, value) {
    if (stryMutAct_9fa48("54319")) {
      {}
    } else {
      stryCov_9fa48("54319");
      if (stryMutAct_9fa48("54322") ? field !== ADAPTIVE_TIMING_KEY_FIELDS.ENABLED : stryMutAct_9fa48("54321") ? false : stryMutAct_9fa48("54320") ? true : (stryCov_9fa48("54320", "54321", "54322"), field === ADAPTIVE_TIMING_KEY_FIELDS.ENABLED)) {
        if (stryMutAct_9fa48("54323")) {
          {}
        } else {
          stryCov_9fa48("54323");
          if (stryMutAct_9fa48("54326") ? typeof value !== TYPEOF.BOOLEAN : stryMutAct_9fa48("54325") ? false : stryMutAct_9fa48("54324") ? true : (stryCov_9fa48("54324", "54325", "54326"), typeof value === TYPEOF.BOOLEAN)) {
            if (stryMutAct_9fa48("54327")) {
              {}
            } else {
              stryCov_9fa48("54327");
              this.settings[field] = value;
              if (stryMutAct_9fa48("54330") ? false : stryMutAct_9fa48("54329") ? true : stryMutAct_9fa48("54328") ? this.suspendLoopControl : (stryCov_9fa48("54328", "54329", "54330"), !this.suspendLoopControl)) {
                if (stryMutAct_9fa48("54331")) {
                  {}
                } else {
                  stryCov_9fa48("54331");
                  if (stryMutAct_9fa48("54333") ? false : stryMutAct_9fa48("54332") ? true : (stryCov_9fa48("54332", "54333"), value)) {
                    if (stryMutAct_9fa48("54334")) {
                      {}
                    } else {
                      stryCov_9fa48("54334");
                      this.startLoop();
                    }
                  } else {
                    if (stryMutAct_9fa48("54335")) {
                      {}
                    } else {
                      stryCov_9fa48("54335");
                      this.stopLoop();
                    }
                  }
                }
              }
            }
          }
          return;
        }
      }
      if (stryMutAct_9fa48("54338") ? field !== ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS : stryMutAct_9fa48("54337") ? false : stryMutAct_9fa48("54336") ? true : (stryCov_9fa48("54336", "54337", "54338"), field === ADAPTIVE_TIMING_KEY_FIELDS.SAMPLE_INTERVAL_MS)) {
        if (stryMutAct_9fa48("54339")) {
          {}
        } else {
          stryCov_9fa48("54339");
          this.settings[field] = normalizeInteger(value, ADAPTIVE_TIMING_SETTINGS_DEFAULT[field], NUM.ONE);
          if (stryMutAct_9fa48("54342") ? !this.suspendLoopControl || this.intervalHandle : stryMutAct_9fa48("54341") ? false : stryMutAct_9fa48("54340") ? true : (stryCov_9fa48("54340", "54341", "54342"), (stryMutAct_9fa48("54343") ? this.suspendLoopControl : (stryCov_9fa48("54343"), !this.suspendLoopControl)) && this.intervalHandle)) {
            if (stryMutAct_9fa48("54344")) {
              {}
            } else {
              stryCov_9fa48("54344");
              this.startLoop();
            }
          }
          return;
        }
      }
      if (stryMutAct_9fa48("54347") ? field === ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES && field === ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES : stryMutAct_9fa48("54346") ? false : stryMutAct_9fa48("54345") ? true : (stryCov_9fa48("54345", "54346", "54347"), (stryMutAct_9fa48("54349") ? field !== ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES : stryMutAct_9fa48("54348") ? false : (stryCov_9fa48("54348", "54349"), field === ADAPTIVE_TIMING_KEY_FIELDS.PROMOTE_SAMPLES)) || (stryMutAct_9fa48("54351") ? field !== ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES : stryMutAct_9fa48("54350") ? false : (stryCov_9fa48("54350", "54351"), field === ADAPTIVE_TIMING_KEY_FIELDS.DEMOTE_SAMPLES)))) {
        if (stryMutAct_9fa48("54352")) {
          {}
        } else {
          stryCov_9fa48("54352");
          this.settings[field] = normalizeInteger(value, ADAPTIVE_TIMING_SETTINGS_DEFAULT[field], NUM.ONE);
          return;
        }
      }
      this.settings[field] = normalizeNumber(value, ADAPTIVE_TIMING_SETTINGS_DEFAULT[field]);
      const lowHighPairs = stryMutAct_9fa48("54353") ? [] : (stryCov_9fa48("54353"), [stryMutAct_9fa48("54354") ? [] : (stryCov_9fa48("54354"), [ADAPTIVE_TIMING_KEY_FIELDS.LOW_CPU_PERCENT, ADAPTIVE_TIMING_KEY_FIELDS.HIGH_CPU_PERCENT]), stryMutAct_9fa48("54355") ? [] : (stryCov_9fa48("54355"), [ADAPTIVE_TIMING_KEY_FIELDS.LOW_WRITE_BYTES_PER_SEC, ADAPTIVE_TIMING_KEY_FIELDS.HIGH_WRITE_BYTES_PER_SEC]), stryMutAct_9fa48("54356") ? [] : (stryCov_9fa48("54356"), [ADAPTIVE_TIMING_KEY_FIELDS.LOW_RSS_GROWTH_BYTES_PER_MIN, ADAPTIVE_TIMING_KEY_FIELDS.HIGH_RSS_GROWTH_BYTES_PER_MIN])]);
      for (const [lowKey, highKey] of lowHighPairs) {
        if (stryMutAct_9fa48("54357")) {
          {}
        } else {
          stryCov_9fa48("54357");
          if (stryMutAct_9fa48("54361") ? this.settings[lowKey] <= this.settings[highKey] : stryMutAct_9fa48("54360") ? this.settings[lowKey] >= this.settings[highKey] : stryMutAct_9fa48("54359") ? false : stryMutAct_9fa48("54358") ? true : (stryCov_9fa48("54358", "54359", "54360", "54361"), this.settings[lowKey] > this.settings[highKey])) {
            if (stryMutAct_9fa48("54362")) {
              {}
            } else {
              stryCov_9fa48("54362");
              this.settings[lowKey] = this.settings[highKey];
            }
          }
        }
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
    if (stryMutAct_9fa48("54363")) {
      {}
    } else {
      stryCov_9fa48("54363");
      const target = this.profiles[profile];
      if (stryMutAct_9fa48("54366") ? false : stryMutAct_9fa48("54365") ? true : stryMutAct_9fa48("54364") ? target : (stryCov_9fa48("54364", "54365", "54366"), !target)) {
        if (stryMutAct_9fa48("54367")) {
          {}
        } else {
          stryCov_9fa48("54367");
          return;
        }
      }
      target[field] = value;
      this.profiles[profile] = normalizeProfile(target, ADAPTIVE_TIMING_PROFILE_DEFAULT[profile]);
    }
  }
}
export { RaftAdaptiveTimingController };