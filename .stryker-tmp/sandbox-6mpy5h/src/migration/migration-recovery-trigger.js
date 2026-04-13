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
import { PRESSURE_GOVERNOR_ACTION, PRESSURE_WORK_CLASS, PressureGovernor } from '../control-plane/pressure-governor.js';
import { PARTITION_SERVICE_EVENT } from '../partition/partition-service-constants.js';
const MIGRATION_RECOVERY_REASON = Object.freeze(stryMutAct_9fa48("91481") ? {} : (stryCov_9fa48("91481"), {
  NODE_RESTART: stryMutAct_9fa48("91482") ? "" : (stryCov_9fa48("91482"), 'node_restart'),
  LEADER_ELECTED: stryMutAct_9fa48("91483") ? "" : (stryCov_9fa48("91483"), 'leader_elected')
}));
const MIGRATION_RECOVERY_LOG_MSG = Object.freeze(stryMutAct_9fa48("91484") ? {} : (stryCov_9fa48("91484"), {
  SKIPPED: stryMutAct_9fa48("91485") ? "" : (stryCov_9fa48("91485"), 'Schema migration recovery skipped: migration coordinator unavailable'),
  START: stryMutAct_9fa48("91486") ? "" : (stryCov_9fa48("91486"), 'Starting schema migration recovery'),
  COMPLETE: stryMutAct_9fa48("91487") ? "" : (stryCov_9fa48("91487"), 'Schema migration recovery completed'),
  FAILED: stryMutAct_9fa48("91488") ? "" : (stryCov_9fa48("91488"), 'Schema migration recovery failed')
}));
const MIGRATION_RECOVERY_DEFAULT = Object.freeze(stryMutAct_9fa48("91489") ? {} : (stryCov_9fa48("91489"), {
  LEADER_ELECTION_COOLDOWN_MS: 1000
}));
async function recoverMigrationsForReason(sqlQueryEngine, logger, reason) {
  if (stryMutAct_9fa48("91490")) {
    {}
  } else {
    stryCov_9fa48("91490");
    const migrationCoordinator = stryMutAct_9fa48("91493") ? sqlQueryEngine?.migrationCoordinator && null : stryMutAct_9fa48("91492") ? false : stryMutAct_9fa48("91491") ? true : (stryCov_9fa48("91491", "91492", "91493"), (stryMutAct_9fa48("91494") ? sqlQueryEngine.migrationCoordinator : (stryCov_9fa48("91494"), sqlQueryEngine?.migrationCoordinator)) || null);
    if (stryMutAct_9fa48("91497") ? !migrationCoordinator && typeof migrationCoordinator.recoverMigrations !== 'function' : stryMutAct_9fa48("91496") ? false : stryMutAct_9fa48("91495") ? true : (stryCov_9fa48("91495", "91496", "91497"), (stryMutAct_9fa48("91498") ? migrationCoordinator : (stryCov_9fa48("91498"), !migrationCoordinator)) || (stryMutAct_9fa48("91500") ? typeof migrationCoordinator.recoverMigrations === 'function' : stryMutAct_9fa48("91499") ? false : (stryCov_9fa48("91499", "91500"), typeof migrationCoordinator.recoverMigrations !== (stryMutAct_9fa48("91501") ? "" : (stryCov_9fa48("91501"), 'function')))))) {
      if (stryMutAct_9fa48("91502")) {
        {}
      } else {
        stryCov_9fa48("91502");
        logger.debug(MIGRATION_RECOVERY_LOG_MSG.SKIPPED, stryMutAct_9fa48("91503") ? {} : (stryCov_9fa48("91503"), {
          reason
        }));
        return;
      }
    }
    logger.info(MIGRATION_RECOVERY_LOG_MSG.START, stryMutAct_9fa48("91504") ? {} : (stryCov_9fa48("91504"), {
      reason
    }));
    try {
      if (stryMutAct_9fa48("91505")) {
        {}
      } else {
        stryCov_9fa48("91505");
        const recoveryResult = await migrationCoordinator.recoverMigrations();
        logger.info(MIGRATION_RECOVERY_LOG_MSG.COMPLETE, stryMutAct_9fa48("91506") ? {} : (stryCov_9fa48("91506"), {
          reason,
          recoveredCount: stryMutAct_9fa48("91509") ? recoveryResult?.recovered && 0 : stryMutAct_9fa48("91508") ? false : stryMutAct_9fa48("91507") ? true : (stryCov_9fa48("91507", "91508", "91509"), (stryMutAct_9fa48("91510") ? recoveryResult.recovered : (stryCov_9fa48("91510"), recoveryResult?.recovered)) || 0)
        }));
      }
    } catch (error) {
      if (stryMutAct_9fa48("91511")) {
        {}
      } else {
        stryCov_9fa48("91511");
        logger.error(MIGRATION_RECOVERY_LOG_MSG.FAILED, stryMutAct_9fa48("91512") ? {} : (stryCov_9fa48("91512"), {
          reason,
          error: error.message
        }));
      }
    }
  }
}
function wireMigrationRecoveryOnLeaderElection(options = {}) {
  if (stryMutAct_9fa48("91513")) {
    {}
  } else {
    stryCov_9fa48("91513");
    const sqlQueryEngine = stryMutAct_9fa48("91516") ? options.sqlQueryEngine && null : stryMutAct_9fa48("91515") ? false : stryMutAct_9fa48("91514") ? true : (stryCov_9fa48("91514", "91515", "91516"), options.sqlQueryEngine || null);
    const partitionServices = stryMutAct_9fa48("91519") ? options.partitionServices && null : stryMutAct_9fa48("91518") ? false : stryMutAct_9fa48("91517") ? true : (stryCov_9fa48("91517", "91518", "91519"), options.partitionServices || null);
    const logger = stryMutAct_9fa48("91522") ? options.logger && console : stryMutAct_9fa48("91521") ? false : stryMutAct_9fa48("91520") ? true : (stryCov_9fa48("91520", "91521", "91522"), options.logger || console);
    const now = (stryMutAct_9fa48("91525") ? typeof options.now !== 'function' : stryMutAct_9fa48("91524") ? false : stryMutAct_9fa48("91523") ? true : (stryCov_9fa48("91523", "91524", "91525"), typeof options.now === (stryMutAct_9fa48("91526") ? "" : (stryCov_9fa48("91526"), 'function')))) ? options.now : stryMutAct_9fa48("91527") ? () => undefined : (stryCov_9fa48("91527"), () => Date.now());
    const leaderElectionCooldownMs = (stryMutAct_9fa48("91530") ? Number.isFinite(options.leaderElectionCooldownMs) || options.leaderElectionCooldownMs >= 0 : stryMutAct_9fa48("91529") ? false : stryMutAct_9fa48("91528") ? true : (stryCov_9fa48("91528", "91529", "91530"), Number.isFinite(options.leaderElectionCooldownMs) && (stryMutAct_9fa48("91533") ? options.leaderElectionCooldownMs < 0 : stryMutAct_9fa48("91532") ? options.leaderElectionCooldownMs > 0 : stryMutAct_9fa48("91531") ? true : (stryCov_9fa48("91531", "91532", "91533"), options.leaderElectionCooldownMs >= 0)))) ? Math.floor(options.leaderElectionCooldownMs) : MIGRATION_RECOVERY_DEFAULT.LEADER_ELECTION_COOLDOWN_MS;
    if (stryMutAct_9fa48("91536") ? (!sqlQueryEngine || !partitionServices) && typeof partitionServices.values !== 'function' : stryMutAct_9fa48("91535") ? false : stryMutAct_9fa48("91534") ? true : (stryCov_9fa48("91534", "91535", "91536"), (stryMutAct_9fa48("91538") ? !sqlQueryEngine && !partitionServices : stryMutAct_9fa48("91537") ? false : (stryCov_9fa48("91537", "91538"), (stryMutAct_9fa48("91539") ? sqlQueryEngine : (stryCov_9fa48("91539"), !sqlQueryEngine)) || (stryMutAct_9fa48("91540") ? partitionServices : (stryCov_9fa48("91540"), !partitionServices)))) || (stryMutAct_9fa48("91542") ? typeof partitionServices.values === 'function' : stryMutAct_9fa48("91541") ? false : (stryCov_9fa48("91541", "91542"), typeof partitionServices.values !== (stryMutAct_9fa48("91543") ? "" : (stryCov_9fa48("91543"), 'function')))))) {
      if (stryMutAct_9fa48("91544")) {
        {}
      } else {
        stryCov_9fa48("91544");
        return () => {};
      }
    }
    let pressureGovernor = stryMutAct_9fa48("91547") ? options.pressureGovernor && null : stryMutAct_9fa48("91546") ? false : stryMutAct_9fa48("91545") ? true : (stryCov_9fa48("91545", "91546", "91547"), options.pressureGovernor || null);
    const getPressureGovernor = () => {
      if (stryMutAct_9fa48("91548")) {
        {}
      } else {
        stryCov_9fa48("91548");
        if (stryMutAct_9fa48("91550") ? false : stryMutAct_9fa48("91549") ? true : (stryCov_9fa48("91549", "91550"), pressureGovernor)) {
          if (stryMutAct_9fa48("91551")) {
            {}
          } else {
            stryCov_9fa48("91551");
            stryMutAct_9fa48("91552") ? pressureGovernor.configure({
              messageRouter: sqlQueryEngine?.messageRouter || null
            }) : (stryCov_9fa48("91552"), pressureGovernor.configure?.(stryMutAct_9fa48("91553") ? {} : (stryCov_9fa48("91553"), {
              messageRouter: stryMutAct_9fa48("91556") ? sqlQueryEngine?.messageRouter && null : stryMutAct_9fa48("91555") ? false : stryMutAct_9fa48("91554") ? true : (stryCov_9fa48("91554", "91555", "91556"), (stryMutAct_9fa48("91557") ? sqlQueryEngine.messageRouter : (stryCov_9fa48("91557"), sqlQueryEngine?.messageRouter)) || null)
            })));
            return pressureGovernor;
          }
        }
        pressureGovernor = PressureGovernor.getShared(stryMutAct_9fa48("91558") ? {} : (stryCov_9fa48("91558"), {
          nodeId: stryMutAct_9fa48("91561") ? sqlQueryEngine?.nodeId && null : stryMutAct_9fa48("91560") ? false : stryMutAct_9fa48("91559") ? true : (stryCov_9fa48("91559", "91560", "91561"), (stryMutAct_9fa48("91562") ? sqlQueryEngine.nodeId : (stryCov_9fa48("91562"), sqlQueryEngine?.nodeId)) || null),
          messageRouter: stryMutAct_9fa48("91565") ? sqlQueryEngine?.messageRouter && null : stryMutAct_9fa48("91564") ? false : stryMutAct_9fa48("91563") ? true : (stryCov_9fa48("91563", "91564", "91565"), (stryMutAct_9fa48("91566") ? sqlQueryEngine.messageRouter : (stryCov_9fa48("91566"), sqlQueryEngine?.messageRouter)) || null)
        }));
        return pressureGovernor;
      }
    };
    let recoveryInFlight = null;
    let recoveryTimer = null;
    let scheduledDueAtMs = null;
    let pendingLeaderElectionRecovery = stryMutAct_9fa48("91567") ? true : (stryCov_9fa48("91567"), false);
    let lastRecoveryCompletedAtMs = null;
    const clearScheduledRecovery = () => {
      if (stryMutAct_9fa48("91568")) {
        {}
      } else {
        stryCov_9fa48("91568");
        if (stryMutAct_9fa48("91570") ? false : stryMutAct_9fa48("91569") ? true : (stryCov_9fa48("91569", "91570"), recoveryTimer)) {
          if (stryMutAct_9fa48("91571")) {
            {}
          } else {
            stryCov_9fa48("91571");
            clearTimeout(recoveryTimer);
            recoveryTimer = null;
          }
        }
        scheduledDueAtMs = null;
      }
    };
    const startRecovery = reason => {
      if (stryMutAct_9fa48("91572")) {
        {}
      } else {
        stryCov_9fa48("91572");
        if (stryMutAct_9fa48("91574") ? false : stryMutAct_9fa48("91573") ? true : (stryCov_9fa48("91573", "91574"), recoveryInFlight)) {
          if (stryMutAct_9fa48("91575")) {
            {}
          } else {
            stryCov_9fa48("91575");
            pendingLeaderElectionRecovery = stryMutAct_9fa48("91576") ? false : (stryCov_9fa48("91576"), true);
            return recoveryInFlight;
          }
        }
        recoveryInFlight = recoverMigrationsForReason(sqlQueryEngine, logger, reason).finally(() => {
          if (stryMutAct_9fa48("91577")) {
            {}
          } else {
            stryCov_9fa48("91577");
            lastRecoveryCompletedAtMs = now();
            recoveryInFlight = null;
            if (stryMutAct_9fa48("91579") ? false : stryMutAct_9fa48("91578") ? true : (stryCov_9fa48("91578", "91579"), pendingLeaderElectionRecovery)) {
              if (stryMutAct_9fa48("91580")) {
                {}
              } else {
                stryCov_9fa48("91580");
                void scheduleLeaderElectionRecovery();
              }
            }
          }
        });
        return recoveryInFlight;
      }
    };
    const scheduleLeaderElectionRecovery = () => {
      if (stryMutAct_9fa48("91581")) {
        {}
      } else {
        stryCov_9fa48("91581");
        pendingLeaderElectionRecovery = stryMutAct_9fa48("91582") ? false : (stryCov_9fa48("91582"), true);
        if (stryMutAct_9fa48("91584") ? false : stryMutAct_9fa48("91583") ? true : (stryCov_9fa48("91583", "91584"), recoveryInFlight)) {
          if (stryMutAct_9fa48("91585")) {
            {}
          } else {
            stryCov_9fa48("91585");
            return recoveryInFlight;
          }
        }
        const elapsedSinceLastRecoveryMs = Number.isFinite(lastRecoveryCompletedAtMs) ? stryMutAct_9fa48("91586") ? Math.min(0, now() - lastRecoveryCompletedAtMs) : (stryCov_9fa48("91586"), Math.max(0, stryMutAct_9fa48("91587") ? now() + lastRecoveryCompletedAtMs : (stryCov_9fa48("91587"), now() - lastRecoveryCompletedAtMs))) : null;
        const cooldownDelayMs = (stryMutAct_9fa48("91590") ? Number.isFinite(elapsedSinceLastRecoveryMs) || elapsedSinceLastRecoveryMs < leaderElectionCooldownMs : stryMutAct_9fa48("91589") ? false : stryMutAct_9fa48("91588") ? true : (stryCov_9fa48("91588", "91589", "91590"), Number.isFinite(elapsedSinceLastRecoveryMs) && (stryMutAct_9fa48("91593") ? elapsedSinceLastRecoveryMs >= leaderElectionCooldownMs : stryMutAct_9fa48("91592") ? elapsedSinceLastRecoveryMs <= leaderElectionCooldownMs : stryMutAct_9fa48("91591") ? true : (stryCov_9fa48("91591", "91592", "91593"), elapsedSinceLastRecoveryMs < leaderElectionCooldownMs)))) ? stryMutAct_9fa48("91594") ? leaderElectionCooldownMs + elapsedSinceLastRecoveryMs : (stryCov_9fa48("91594"), leaderElectionCooldownMs - elapsedSinceLastRecoveryMs) : 0;
        const pressureDecision = getPressureGovernor().evaluate(stryMutAct_9fa48("91595") ? {} : (stryCov_9fa48("91595"), {
          workClass: PRESSURE_WORK_CLASS.BACKGROUND,
          resourceKeys: stryMutAct_9fa48("91596") ? [] : (stryCov_9fa48("91596"), [stryMutAct_9fa48("91597") ? "" : (stryCov_9fa48("91597"), 'migration:recovery'), stryMutAct_9fa48("91598") ? "" : (stryCov_9fa48("91598"), 'control-plane:write')]),
          allowDegrade: stryMutAct_9fa48("91599") ? true : (stryCov_9fa48("91599"), false),
          allowDefer: stryMutAct_9fa48("91600") ? false : (stryCov_9fa48("91600"), true)
        }));
        const pressureDelayMs = (stryMutAct_9fa48("91603") ? pressureDecision.action !== PRESSURE_GOVERNOR_ACTION.DEFER : stryMutAct_9fa48("91602") ? false : stryMutAct_9fa48("91601") ? true : (stryCov_9fa48("91601", "91602", "91603"), pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER)) ? pressureDecision.retryAfterMs : 0;
        const delayMs = stryMutAct_9fa48("91604") ? Math.min(cooldownDelayMs, pressureDelayMs) : (stryCov_9fa48("91604"), Math.max(cooldownDelayMs, pressureDelayMs));
        const dueAtMs = stryMutAct_9fa48("91605") ? now() - delayMs : (stryCov_9fa48("91605"), now() + delayMs);
        if (stryMutAct_9fa48("91608") ? recoveryTimer && Number.isFinite(scheduledDueAtMs) || scheduledDueAtMs <= dueAtMs : stryMutAct_9fa48("91607") ? false : stryMutAct_9fa48("91606") ? true : (stryCov_9fa48("91606", "91607", "91608"), (stryMutAct_9fa48("91610") ? recoveryTimer || Number.isFinite(scheduledDueAtMs) : stryMutAct_9fa48("91609") ? true : (stryCov_9fa48("91609", "91610"), recoveryTimer && Number.isFinite(scheduledDueAtMs))) && (stryMutAct_9fa48("91613") ? scheduledDueAtMs > dueAtMs : stryMutAct_9fa48("91612") ? scheduledDueAtMs < dueAtMs : stryMutAct_9fa48("91611") ? true : (stryCov_9fa48("91611", "91612", "91613"), scheduledDueAtMs <= dueAtMs)))) {
          if (stryMutAct_9fa48("91614")) {
            {}
          } else {
            stryCov_9fa48("91614");
            return null;
          }
        }
        clearScheduledRecovery();
        recoveryTimer = setTimeout(() => {
          if (stryMutAct_9fa48("91615")) {
            {}
          } else {
            stryCov_9fa48("91615");
            recoveryTimer = null;
            scheduledDueAtMs = null;
            if (stryMutAct_9fa48("91618") ? false : stryMutAct_9fa48("91617") ? true : stryMutAct_9fa48("91616") ? pendingLeaderElectionRecovery : (stryCov_9fa48("91616", "91617", "91618"), !pendingLeaderElectionRecovery)) {
              if (stryMutAct_9fa48("91619")) {
                {}
              } else {
                stryCov_9fa48("91619");
                return;
              }
            }
            pendingLeaderElectionRecovery = stryMutAct_9fa48("91620") ? true : (stryCov_9fa48("91620"), false);
            void startRecovery(MIGRATION_RECOVERY_REASON.LEADER_ELECTED);
          }
        }, delayMs);
        stryMutAct_9fa48("91621") ? recoveryTimer.unref() : (stryCov_9fa48("91621"), recoveryTimer.unref?.());
        scheduledDueAtMs = dueAtMs;
        return null;
      }
    };
    const triggerRecovery = reason => {
      if (stryMutAct_9fa48("91622")) {
        {}
      } else {
        stryCov_9fa48("91622");
        if (stryMutAct_9fa48("91625") ? reason !== MIGRATION_RECOVERY_REASON.LEADER_ELECTED : stryMutAct_9fa48("91624") ? false : stryMutAct_9fa48("91623") ? true : (stryCov_9fa48("91623", "91624", "91625"), reason === MIGRATION_RECOVERY_REASON.LEADER_ELECTED)) {
          if (stryMutAct_9fa48("91626")) {
            {}
          } else {
            stryCov_9fa48("91626");
            return scheduleLeaderElectionRecovery();
          }
        }
        return startRecovery(reason);
      }
    };
    const handlers = stryMutAct_9fa48("91627") ? ["Stryker was here"] : (stryCov_9fa48("91627"), []);
    for (const partitionService of partitionServices.values()) {
      if (stryMutAct_9fa48("91628")) {
        {}
      } else {
        stryCov_9fa48("91628");
        if (stryMutAct_9fa48("91631") ? !partitionService && typeof partitionService.on !== 'function' : stryMutAct_9fa48("91630") ? false : stryMutAct_9fa48("91629") ? true : (stryCov_9fa48("91629", "91630", "91631"), (stryMutAct_9fa48("91632") ? partitionService : (stryCov_9fa48("91632"), !partitionService)) || (stryMutAct_9fa48("91634") ? typeof partitionService.on === 'function' : stryMutAct_9fa48("91633") ? false : (stryCov_9fa48("91633", "91634"), typeof partitionService.on !== (stryMutAct_9fa48("91635") ? "" : (stryCov_9fa48("91635"), 'function')))))) {
          if (stryMutAct_9fa48("91636")) {
            {}
          } else {
            stryCov_9fa48("91636");
            continue;
          }
        }
        const handler = () => {
          if (stryMutAct_9fa48("91637")) {
            {}
          } else {
            stryCov_9fa48("91637");
            void triggerRecovery(MIGRATION_RECOVERY_REASON.LEADER_ELECTED);
          }
        };
        partitionService.on(PARTITION_SERVICE_EVENT.LEADER_ELECTED, handler);
        handlers.push(stryMutAct_9fa48("91638") ? {} : (stryCov_9fa48("91638"), {
          partitionService,
          handler
        }));
      }
    }
    void triggerRecovery(MIGRATION_RECOVERY_REASON.NODE_RESTART);
    return () => {
      if (stryMutAct_9fa48("91639")) {
        {}
      } else {
        stryCov_9fa48("91639");
        clearScheduledRecovery();
        pendingLeaderElectionRecovery = stryMutAct_9fa48("91640") ? true : (stryCov_9fa48("91640"), false);
        for (const entry of handlers) {
          if (stryMutAct_9fa48("91641")) {
            {}
          } else {
            stryCov_9fa48("91641");
            if (stryMutAct_9fa48("91644") ? typeof entry.partitionService?.off !== 'function' : stryMutAct_9fa48("91643") ? false : stryMutAct_9fa48("91642") ? true : (stryCov_9fa48("91642", "91643", "91644"), typeof (stryMutAct_9fa48("91645") ? entry.partitionService.off : (stryCov_9fa48("91645"), entry.partitionService?.off)) === (stryMutAct_9fa48("91646") ? "" : (stryCov_9fa48("91646"), 'function')))) {
              if (stryMutAct_9fa48("91647")) {
                {}
              } else {
                stryCov_9fa48("91647");
                entry.partitionService.off(PARTITION_SERVICE_EVENT.LEADER_ELECTED, entry.handler);
              }
            } else if (stryMutAct_9fa48("91650") ? typeof entry.partitionService?.removeListener !== 'function' : stryMutAct_9fa48("91649") ? false : stryMutAct_9fa48("91648") ? true : (stryCov_9fa48("91648", "91649", "91650"), typeof (stryMutAct_9fa48("91651") ? entry.partitionService.removeListener : (stryCov_9fa48("91651"), entry.partitionService?.removeListener)) === (stryMutAct_9fa48("91652") ? "" : (stryCov_9fa48("91652"), 'function')))) {
              if (stryMutAct_9fa48("91653")) {
                {}
              } else {
                stryCov_9fa48("91653");
                entry.partitionService.removeListener(PARTITION_SERVICE_EVENT.LEADER_ELECTED, entry.handler);
              }
            }
          }
        }
      }
    };
  }
}
export { MIGRATION_RECOVERY_DEFAULT, MIGRATION_RECOVERY_LOG_MSG, MIGRATION_RECOVERY_REASON, recoverMigrationsForReason, wireMigrationRecoveryOnLeaderElection };