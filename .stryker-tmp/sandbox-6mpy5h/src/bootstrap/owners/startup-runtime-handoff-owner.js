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
import { waitForMetadataPublicationReadiness } from '../traffic-readiness-utils.js';
const CONTROL_PLANE_BACKGROUND_WRITER_RETRY_DELAY_MS = 1000;
class StartupRuntimeHandoffOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("24149")) {
      {}
    } else {
      stryCov_9fa48("24149");
      this.delegates = stryMutAct_9fa48("24152") ? options.delegates && {} : stryMutAct_9fa48("24151") ? false : stryMutAct_9fa48("24150") ? true : (stryCov_9fa48("24150", "24151", "24152"), options.delegates || {});
      this.controlPlaneBackgroundWriterActivationPromise = null;
      this.controlPlaneBackgroundWriterRetryTimer = null;
    }
  }
  getCompatibilityService() {
    if (stryMutAct_9fa48("24153")) {
      {}
    } else {
      stryCov_9fa48("24153");
      return stryMutAct_9fa48("24156") ? this.delegates.getCompatibilityService?.() && null : stryMutAct_9fa48("24155") ? false : stryMutAct_9fa48("24154") ? true : (stryCov_9fa48("24154", "24155", "24156"), (stryMutAct_9fa48("24157") ? this.delegates.getCompatibilityService() : (stryCov_9fa48("24157"), this.delegates.getCompatibilityService?.())) || null);
    }
  }
  getCompatibilityOverride(methodName) {
    if (stryMutAct_9fa48("24158")) {
      {}
    } else {
      stryCov_9fa48("24158");
      const service = this.getCompatibilityService();
      if (stryMutAct_9fa48("24161") ? !service && !Object.prototype.hasOwnProperty.call(service, methodName) : stryMutAct_9fa48("24160") ? false : stryMutAct_9fa48("24159") ? true : (stryCov_9fa48("24159", "24160", "24161"), (stryMutAct_9fa48("24162") ? service : (stryCov_9fa48("24162"), !service)) || (stryMutAct_9fa48("24163") ? Object.prototype.hasOwnProperty.call(service, methodName) : (stryCov_9fa48("24163"), !Object.prototype.hasOwnProperty.call(service, methodName))))) {
        if (stryMutAct_9fa48("24164")) {
          {}
        } else {
          stryCov_9fa48("24164");
          return null;
        }
      }
      const override = service[methodName];
      return (stryMutAct_9fa48("24167") ? typeof override !== 'function' : stryMutAct_9fa48("24166") ? false : stryMutAct_9fa48("24165") ? true : (stryCov_9fa48("24165", "24166", "24167"), typeof override === (stryMutAct_9fa48("24168") ? "" : (stryCov_9fa48("24168"), 'function')))) ? override.bind(service) : null;
    }
  }
  hasActiveControlPlaneBackgroundWriters() {
    if (stryMutAct_9fa48("24169")) {
      {}
    } else {
      stryCov_9fa48("24169");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("24170") ? "" : (stryCov_9fa48("24170"), 'hasActiveControlPlaneBackgroundWriters'));
      if (stryMutAct_9fa48("24172") ? false : stryMutAct_9fa48("24171") ? true : (stryCov_9fa48("24171", "24172"), override)) {
        if (stryMutAct_9fa48("24173")) {
          {}
        } else {
          stryCov_9fa48("24173");
          return override();
        }
      }
      const leaseService = stryMutAct_9fa48("24176") ? this.delegates.getLeaseService?.() && null : stryMutAct_9fa48("24175") ? false : stryMutAct_9fa48("24174") ? true : (stryCov_9fa48("24174", "24175", "24176"), (stryMutAct_9fa48("24177") ? this.delegates.getLeaseService() : (stryCov_9fa48("24177"), this.delegates.getLeaseService?.())) || null);
      const heartbeatService = stryMutAct_9fa48("24180") ? this.delegates.getHeartbeatService?.() && null : stryMutAct_9fa48("24179") ? false : stryMutAct_9fa48("24178") ? true : (stryCov_9fa48("24178", "24179", "24180"), (stryMutAct_9fa48("24181") ? this.delegates.getHeartbeatService() : (stryCov_9fa48("24181"), this.delegates.getHeartbeatService?.())) || null);
      const runningLeaseState = stryMutAct_9fa48("24182") ? this.delegates.getLeaseRunningState() : (stryCov_9fa48("24182"), this.delegates.getLeaseRunningState?.());
      const runningHeartbeatState = stryMutAct_9fa48("24183") ? this.delegates.getHeartbeatRunningState() : (stryCov_9fa48("24183"), this.delegates.getHeartbeatRunningState?.());
      const leaseRunning = stryMutAct_9fa48("24186") ? !leaseService && leaseService.state === runningLeaseState : stryMutAct_9fa48("24185") ? false : stryMutAct_9fa48("24184") ? true : (stryCov_9fa48("24184", "24185", "24186"), (stryMutAct_9fa48("24187") ? leaseService : (stryCov_9fa48("24187"), !leaseService)) || (stryMutAct_9fa48("24189") ? leaseService.state !== runningLeaseState : stryMutAct_9fa48("24188") ? false : (stryCov_9fa48("24188", "24189"), leaseService.state === runningLeaseState)));
      const heartbeatRunning = stryMutAct_9fa48("24192") ? !heartbeatService && heartbeatService.state === runningHeartbeatState : stryMutAct_9fa48("24191") ? false : stryMutAct_9fa48("24190") ? true : (stryCov_9fa48("24190", "24191", "24192"), (stryMutAct_9fa48("24193") ? heartbeatService : (stryCov_9fa48("24193"), !heartbeatService)) || (stryMutAct_9fa48("24195") ? heartbeatService.state !== runningHeartbeatState : stryMutAct_9fa48("24194") ? false : (stryCov_9fa48("24194", "24195"), heartbeatService.state === runningHeartbeatState)));
      return stryMutAct_9fa48("24198") ? leaseRunning || heartbeatRunning : stryMutAct_9fa48("24197") ? false : stryMutAct_9fa48("24196") ? true : (stryCov_9fa48("24196", "24197", "24198"), leaseRunning && heartbeatRunning);
    }
  }
  resolveControlPlaneBackgroundWriterRetryDelayMs(error = null) {
    if (stryMutAct_9fa48("24199")) {
      {}
    } else {
      stryCov_9fa48("24199");
      const hintedDelayMs = Number(stryMutAct_9fa48("24200") ? error.retryAfterMs : (stryCov_9fa48("24200"), error?.retryAfterMs));
      if (stryMutAct_9fa48("24203") ? Number.isFinite(hintedDelayMs) || hintedDelayMs > 0 : stryMutAct_9fa48("24202") ? false : stryMutAct_9fa48("24201") ? true : (stryCov_9fa48("24201", "24202", "24203"), Number.isFinite(hintedDelayMs) && (stryMutAct_9fa48("24206") ? hintedDelayMs <= 0 : stryMutAct_9fa48("24205") ? hintedDelayMs >= 0 : stryMutAct_9fa48("24204") ? true : (stryCov_9fa48("24204", "24205", "24206"), hintedDelayMs > 0)))) {
        if (stryMutAct_9fa48("24207")) {
          {}
        } else {
          stryCov_9fa48("24207");
          return stryMutAct_9fa48("24208") ? Math.min(1, Math.floor(hintedDelayMs)) : (stryCov_9fa48("24208"), Math.max(1, Math.floor(hintedDelayMs)));
        }
      }
      const configuredDelayMs = Number(stryMutAct_9fa48("24209") ? this.delegates.getControlPlaneBackgroundWriterRetryDelayMs() : (stryCov_9fa48("24209"), this.delegates.getControlPlaneBackgroundWriterRetryDelayMs?.()));
      if (stryMutAct_9fa48("24212") ? Number.isFinite(configuredDelayMs) || configuredDelayMs > 0 : stryMutAct_9fa48("24211") ? false : stryMutAct_9fa48("24210") ? true : (stryCov_9fa48("24210", "24211", "24212"), Number.isFinite(configuredDelayMs) && (stryMutAct_9fa48("24215") ? configuredDelayMs <= 0 : stryMutAct_9fa48("24214") ? configuredDelayMs >= 0 : stryMutAct_9fa48("24213") ? true : (stryCov_9fa48("24213", "24214", "24215"), configuredDelayMs > 0)))) {
        if (stryMutAct_9fa48("24216")) {
          {}
        } else {
          stryCov_9fa48("24216");
          return stryMutAct_9fa48("24217") ? Math.min(1, Math.floor(configuredDelayMs)) : (stryCov_9fa48("24217"), Math.max(1, Math.floor(configuredDelayMs)));
        }
      }
      return CONTROL_PLANE_BACKGROUND_WRITER_RETRY_DELAY_MS;
    }
  }
  clearControlPlaneBackgroundWriterRetryTimer() {
    if (stryMutAct_9fa48("24218")) {
      {}
    } else {
      stryCov_9fa48("24218");
      if (stryMutAct_9fa48("24221") ? false : stryMutAct_9fa48("24220") ? true : stryMutAct_9fa48("24219") ? this.controlPlaneBackgroundWriterRetryTimer : (stryCov_9fa48("24219", "24220", "24221"), !this.controlPlaneBackgroundWriterRetryTimer)) {
        if (stryMutAct_9fa48("24222")) {
          {}
        } else {
          stryCov_9fa48("24222");
          return;
        }
      }
      const clearTimeoutFn = stryMutAct_9fa48("24225") ? this.delegates.getClearTimeoutFn?.() && clearTimeout : stryMutAct_9fa48("24224") ? false : stryMutAct_9fa48("24223") ? true : (stryCov_9fa48("24223", "24224", "24225"), (stryMutAct_9fa48("24226") ? this.delegates.getClearTimeoutFn() : (stryCov_9fa48("24226"), this.delegates.getClearTimeoutFn?.())) || clearTimeout);
      clearTimeoutFn(this.controlPlaneBackgroundWriterRetryTimer);
      this.controlPlaneBackgroundWriterRetryTimer = null;
    }
  }
  scheduleControlPlaneBackgroundWriterActivationRetry(error = null) {
    if (stryMutAct_9fa48("24227")) {
      {}
    } else {
      stryCov_9fa48("24227");
      if (stryMutAct_9fa48("24230") ? this.delegates.isShuttingDown?.() !== true : stryMutAct_9fa48("24229") ? false : stryMutAct_9fa48("24228") ? true : (stryCov_9fa48("24228", "24229", "24230"), (stryMutAct_9fa48("24231") ? this.delegates.isShuttingDown() : (stryCov_9fa48("24231"), this.delegates.isShuttingDown?.())) === (stryMutAct_9fa48("24232") ? false : (stryCov_9fa48("24232"), true)))) {
        if (stryMutAct_9fa48("24233")) {
          {}
        } else {
          stryCov_9fa48("24233");
          return;
        }
      }
      if (stryMutAct_9fa48("24235") ? false : stryMutAct_9fa48("24234") ? true : (stryCov_9fa48("24234", "24235"), this.hasActiveControlPlaneBackgroundWriters())) {
        if (stryMutAct_9fa48("24236")) {
          {}
        } else {
          stryCov_9fa48("24236");
          return;
        }
      }
      if (stryMutAct_9fa48("24238") ? false : stryMutAct_9fa48("24237") ? true : (stryCov_9fa48("24237", "24238"), this.controlPlaneBackgroundWriterRetryTimer)) {
        if (stryMutAct_9fa48("24239")) {
          {}
        } else {
          stryCov_9fa48("24239");
          return;
        }
      }
      const delayMs = this.resolveControlPlaneBackgroundWriterRetryDelayMs(error);
      const setTimeoutFn = stryMutAct_9fa48("24242") ? this.delegates.getSetTimeoutFn?.() && setTimeout : stryMutAct_9fa48("24241") ? false : stryMutAct_9fa48("24240") ? true : (stryCov_9fa48("24240", "24241", "24242"), (stryMutAct_9fa48("24243") ? this.delegates.getSetTimeoutFn() : (stryCov_9fa48("24243"), this.delegates.getSetTimeoutFn?.())) || setTimeout);
      this.controlPlaneBackgroundWriterRetryTimer = setTimeoutFn(() => {
        if (stryMutAct_9fa48("24244")) {
          {}
        } else {
          stryCov_9fa48("24244");
          this.controlPlaneBackgroundWriterRetryTimer = null;
          if (stryMutAct_9fa48("24247") ? this.delegates.isShuttingDown?.() === true && this.hasActiveControlPlaneBackgroundWriters() : stryMutAct_9fa48("24246") ? false : stryMutAct_9fa48("24245") ? true : (stryCov_9fa48("24245", "24246", "24247"), (stryMutAct_9fa48("24249") ? this.delegates.isShuttingDown?.() !== true : stryMutAct_9fa48("24248") ? false : (stryCov_9fa48("24248", "24249"), (stryMutAct_9fa48("24250") ? this.delegates.isShuttingDown() : (stryCov_9fa48("24250"), this.delegates.isShuttingDown?.())) === (stryMutAct_9fa48("24251") ? false : (stryCov_9fa48("24251"), true)))) || this.hasActiveControlPlaneBackgroundWriters())) {
            if (stryMutAct_9fa48("24252")) {
              {}
            } else {
              stryCov_9fa48("24252");
              return;
            }
          }
          void this.activateControlPlaneBackgroundWriters();
        }
      }, delayMs);
      if (stryMutAct_9fa48("24255") ? typeof this.controlPlaneBackgroundWriterRetryTimer?.unref !== 'function' : stryMutAct_9fa48("24254") ? false : stryMutAct_9fa48("24253") ? true : (stryCov_9fa48("24253", "24254", "24255"), typeof (stryMutAct_9fa48("24256") ? this.controlPlaneBackgroundWriterRetryTimer.unref : (stryCov_9fa48("24256"), this.controlPlaneBackgroundWriterRetryTimer?.unref)) === (stryMutAct_9fa48("24257") ? "" : (stryCov_9fa48("24257"), 'function')))) {
        if (stryMutAct_9fa48("24258")) {
          {}
        } else {
          stryCov_9fa48("24258");
          this.controlPlaneBackgroundWriterRetryTimer.unref();
        }
      }
    }
  }
  async activateControlPlaneBackgroundWriters() {
    if (stryMutAct_9fa48("24259")) {
      {}
    } else {
      stryCov_9fa48("24259");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("24260") ? "" : (stryCov_9fa48("24260"), 'activateControlPlaneBackgroundWriters'));
      if (stryMutAct_9fa48("24262") ? false : stryMutAct_9fa48("24261") ? true : (stryCov_9fa48("24261", "24262"), override)) {
        if (stryMutAct_9fa48("24263")) {
          {}
        } else {
          stryCov_9fa48("24263");
          return override();
        }
      }
      if (stryMutAct_9fa48("24266") ? this.delegates.isShuttingDown?.() !== true : stryMutAct_9fa48("24265") ? false : stryMutAct_9fa48("24264") ? true : (stryCov_9fa48("24264", "24265", "24266"), (stryMutAct_9fa48("24267") ? this.delegates.isShuttingDown() : (stryCov_9fa48("24267"), this.delegates.isShuttingDown?.())) === (stryMutAct_9fa48("24268") ? false : (stryCov_9fa48("24268"), true)))) {
        if (stryMutAct_9fa48("24269")) {
          {}
        } else {
          stryCov_9fa48("24269");
          return;
        }
      }
      if (stryMutAct_9fa48("24271") ? false : stryMutAct_9fa48("24270") ? true : (stryCov_9fa48("24270", "24271"), this.hasActiveControlPlaneBackgroundWriters())) {
        if (stryMutAct_9fa48("24272")) {
          {}
        } else {
          stryCov_9fa48("24272");
          this.clearControlPlaneBackgroundWriterRetryTimer();
          return;
        }
      }
      if (stryMutAct_9fa48("24274") ? false : stryMutAct_9fa48("24273") ? true : (stryCov_9fa48("24273", "24274"), this.controlPlaneBackgroundWriterActivationPromise)) {
        if (stryMutAct_9fa48("24275")) {
          {}
        } else {
          stryCov_9fa48("24275");
          return this.controlPlaneBackgroundWriterActivationPromise;
        }
      }
      this.clearControlPlaneBackgroundWriterRetryTimer();
      this.controlPlaneBackgroundWriterActivationPromise = (async () => {
        if (stryMutAct_9fa48("24276")) {
          {}
        } else {
          stryCov_9fa48("24276");
          try {
            if (stryMutAct_9fa48("24277")) {
              {}
            } else {
              stryCov_9fa48("24277");
              const readinessOptions = stryMutAct_9fa48("24280") ? this.delegates.getMetadataPublicationReadinessOptions?.() && null : stryMutAct_9fa48("24279") ? false : stryMutAct_9fa48("24278") ? true : (stryCov_9fa48("24278", "24279", "24280"), (stryMutAct_9fa48("24281") ? this.delegates.getMetadataPublicationReadinessOptions() : (stryCov_9fa48("24281"), this.delegates.getMetadataPublicationReadinessOptions?.())) || null);
              if (stryMutAct_9fa48("24283") ? false : stryMutAct_9fa48("24282") ? true : (stryCov_9fa48("24282", "24283"), readinessOptions)) {
                if (stryMutAct_9fa48("24284")) {
                  {}
                } else {
                  stryCov_9fa48("24284");
                  try {
                    if (stryMutAct_9fa48("24285")) {
                      {}
                    } else {
                      stryCov_9fa48("24285");
                      await waitForMetadataPublicationReadiness(readinessOptions);
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("24286")) {
                      {}
                    } else {
                      stryCov_9fa48("24286");
                      stryMutAct_9fa48("24287") ? this.delegates.onMetadataPublicationReadinessDeferred(error) : (stryCov_9fa48("24287"), this.delegates.onMetadataPublicationReadinessDeferred?.(error));
                      this.scheduleControlPlaneBackgroundWriterActivationRetry(error);
                      return;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("24290") ? this.delegates.isShuttingDown?.() !== true : stryMutAct_9fa48("24289") ? false : stryMutAct_9fa48("24288") ? true : (stryCov_9fa48("24288", "24289", "24290"), (stryMutAct_9fa48("24291") ? this.delegates.isShuttingDown() : (stryCov_9fa48("24291"), this.delegates.isShuttingDown?.())) === (stryMutAct_9fa48("24292") ? false : (stryCov_9fa48("24292"), true)))) {
                if (stryMutAct_9fa48("24293")) {
                  {}
                } else {
                  stryCov_9fa48("24293");
                  return;
                }
              }
              if (stryMutAct_9fa48("24295") ? false : stryMutAct_9fa48("24294") ? true : (stryCov_9fa48("24294", "24295"), this.hasActiveControlPlaneBackgroundWriters())) {
                if (stryMutAct_9fa48("24296")) {
                  {}
                } else {
                  stryCov_9fa48("24296");
                  this.clearControlPlaneBackgroundWriterRetryTimer();
                  return;
                }
              }
              stryMutAct_9fa48("24297") ? this.delegates.beforeActivateControlPlaneBackgroundWriters() : (stryCov_9fa48("24297"), this.delegates.beforeActivateControlPlaneBackgroundWriters?.());
              const leaseService = stryMutAct_9fa48("24300") ? this.delegates.getLeaseService?.() && null : stryMutAct_9fa48("24299") ? false : stryMutAct_9fa48("24298") ? true : (stryCov_9fa48("24298", "24299", "24300"), (stryMutAct_9fa48("24301") ? this.delegates.getLeaseService() : (stryCov_9fa48("24301"), this.delegates.getLeaseService?.())) || null);
              if (stryMutAct_9fa48("24303") ? false : stryMutAct_9fa48("24302") ? true : (stryCov_9fa48("24302", "24303"), leaseService)) {
                if (stryMutAct_9fa48("24304")) {
                  {}
                } else {
                  stryCov_9fa48("24304");
                  leaseService.start();
                  const runningLeaseState = stryMutAct_9fa48("24305") ? this.delegates.getLeaseRunningState() : (stryCov_9fa48("24305"), this.delegates.getLeaseRunningState?.());
                  if (stryMutAct_9fa48("24308") ? runningLeaseState === undefined : stryMutAct_9fa48("24307") ? false : stryMutAct_9fa48("24306") ? true : (stryCov_9fa48("24306", "24307", "24308"), runningLeaseState !== undefined)) {
                    if (stryMutAct_9fa48("24309")) {
                      {}
                    } else {
                      stryCov_9fa48("24309");
                      leaseService.state = runningLeaseState;
                    }
                  }
                }
              }
              const heartbeatService = stryMutAct_9fa48("24312") ? this.delegates.getHeartbeatService?.() && null : stryMutAct_9fa48("24311") ? false : stryMutAct_9fa48("24310") ? true : (stryCov_9fa48("24310", "24311", "24312"), (stryMutAct_9fa48("24313") ? this.delegates.getHeartbeatService() : (stryCov_9fa48("24313"), this.delegates.getHeartbeatService?.())) || null);
              if (stryMutAct_9fa48("24315") ? false : stryMutAct_9fa48("24314") ? true : (stryCov_9fa48("24314", "24315"), heartbeatService)) {
                if (stryMutAct_9fa48("24316")) {
                  {}
                } else {
                  stryCov_9fa48("24316");
                  const heartbeatStartOptions = stryMutAct_9fa48("24317") ? this.delegates.buildHeartbeatStartOptions() : (stryCov_9fa48("24317"), this.delegates.buildHeartbeatStartOptions?.());
                  if (stryMutAct_9fa48("24320") ? heartbeatStartOptions !== undefined : stryMutAct_9fa48("24319") ? false : stryMutAct_9fa48("24318") ? true : (stryCov_9fa48("24318", "24319", "24320"), heartbeatStartOptions === undefined)) {
                    if (stryMutAct_9fa48("24321")) {
                      {}
                    } else {
                      stryCov_9fa48("24321");
                      heartbeatService.start();
                    }
                  } else {
                    if (stryMutAct_9fa48("24322")) {
                      {}
                    } else {
                      stryCov_9fa48("24322");
                      heartbeatService.start(heartbeatStartOptions);
                    }
                  }
                  const runningHeartbeatState = stryMutAct_9fa48("24323") ? this.delegates.getHeartbeatRunningState() : (stryCov_9fa48("24323"), this.delegates.getHeartbeatRunningState?.());
                  if (stryMutAct_9fa48("24326") ? runningHeartbeatState === undefined : stryMutAct_9fa48("24325") ? false : stryMutAct_9fa48("24324") ? true : (stryCov_9fa48("24324", "24325", "24326"), runningHeartbeatState !== undefined)) {
                    if (stryMutAct_9fa48("24327")) {
                      {}
                    } else {
                      stryCov_9fa48("24327");
                      heartbeatService.state = runningHeartbeatState;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("24330") ? this.delegates.activateDistributedTransactionRecoveryOnWriterActivation === false : stryMutAct_9fa48("24329") ? false : stryMutAct_9fa48("24328") ? true : (stryCov_9fa48("24328", "24329", "24330"), this.delegates.activateDistributedTransactionRecoveryOnWriterActivation !== (stryMutAct_9fa48("24331") ? true : (stryCov_9fa48("24331"), false)))) {
                if (stryMutAct_9fa48("24332")) {
                  {}
                } else {
                  stryCov_9fa48("24332");
                  this.activateDistributedTransactionRecovery();
                }
              }
              this.clearControlPlaneBackgroundWriterRetryTimer();
              stryMutAct_9fa48("24333") ? this.delegates.onControlPlaneBackgroundWritersActivated() : (stryCov_9fa48("24333"), this.delegates.onControlPlaneBackgroundWritersActivated?.());
            }
          } finally {
            if (stryMutAct_9fa48("24334")) {
              {}
            } else {
              stryCov_9fa48("24334");
              this.controlPlaneBackgroundWriterActivationPromise = null;
            }
          }
        }
      })();
      return this.controlPlaneBackgroundWriterActivationPromise;
    }
  }
  activateDistributedTransactionRecovery() {
    if (stryMutAct_9fa48("24335")) {
      {}
    } else {
      stryCov_9fa48("24335");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("24336") ? "" : (stryCov_9fa48("24336"), 'activateDistributedTransactionRecovery'));
      if (stryMutAct_9fa48("24338") ? false : stryMutAct_9fa48("24337") ? true : (stryCov_9fa48("24337", "24338"), override)) {
        if (stryMutAct_9fa48("24339")) {
          {}
        } else {
          stryCov_9fa48("24339");
          return override();
        }
      }
      return stryMutAct_9fa48("24340") ? this.delegates.activateDistributedTransactionRecovery() : (stryCov_9fa48("24340"), this.delegates.activateDistributedTransactionRecovery?.());
    }
  }
  flushDeferredCreateSelfHostedMetadata() {
    if (stryMutAct_9fa48("24341")) {
      {}
    } else {
      stryCov_9fa48("24341");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("24342") ? "" : (stryCov_9fa48("24342"), 'flushDeferredCreateSelfHostedMetadata'));
      if (stryMutAct_9fa48("24344") ? false : stryMutAct_9fa48("24343") ? true : (stryCov_9fa48("24343", "24344"), override)) {
        if (stryMutAct_9fa48("24345")) {
          {}
        } else {
          stryCov_9fa48("24345");
          return override();
        }
      }
      return stryMutAct_9fa48("24346") ? this.delegates.flushDeferredCreateSelfHostedMetadata() : (stryCov_9fa48("24346"), this.delegates.flushDeferredCreateSelfHostedMetadata?.());
    }
  }
  startLatencyTopologyLifecycle() {
    if (stryMutAct_9fa48("24347")) {
      {}
    } else {
      stryCov_9fa48("24347");
      const override = this.getCompatibilityOverride(stryMutAct_9fa48("24348") ? "" : (stryCov_9fa48("24348"), 'startLatencyTopologyLifecycle'));
      if (stryMutAct_9fa48("24350") ? false : stryMutAct_9fa48("24349") ? true : (stryCov_9fa48("24349", "24350"), override)) {
        if (stryMutAct_9fa48("24351")) {
          {}
        } else {
          stryCov_9fa48("24351");
          return override();
        }
      }
      return stryMutAct_9fa48("24352") ? this.delegates.startLatencyTopologyLifecycle() : (stryCov_9fa48("24352"), this.delegates.startLatencyTopologyLifecycle?.());
    }
  }
}
export { StartupRuntimeHandoffOwner };