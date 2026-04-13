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
import { CDC_PIPELINE_METRIC, NUM } from '../constants/index.js';
const ONE_MINUTE_MS = stryMutAct_9fa48("97569") ? 60 / 1000 : (stryCov_9fa48("97569"), 60 * 1000);
function normalizePartitionSize(partition) {
  if (stryMutAct_9fa48("97570")) {
    {}
  } else {
    stryCov_9fa48("97570");
    const sizeBytes = Number(stryMutAct_9fa48("97571") ? (partition?.size_bytes ?? partition?.sizeBytes) && NUM.ZERO : (stryCov_9fa48("97571"), (stryMutAct_9fa48("97572") ? partition?.size_bytes && partition?.sizeBytes : (stryCov_9fa48("97572"), (stryMutAct_9fa48("97573") ? partition.size_bytes : (stryCov_9fa48("97573"), partition?.size_bytes)) ?? (stryMutAct_9fa48("97574") ? partition.sizeBytes : (stryCov_9fa48("97574"), partition?.sizeBytes)))) ?? NUM.ZERO));
    return Number.isFinite(sizeBytes) ? sizeBytes : NUM.ZERO;
  }
}
function findLocalLeaderPartitionService(partitionServices, partitionId) {
  if (stryMutAct_9fa48("97575")) {
    {}
  } else {
    stryCov_9fa48("97575");
    if (stryMutAct_9fa48("97578") ? (!partitionServices || !partitionId) && typeof partitionServices.values !== 'function' : stryMutAct_9fa48("97577") ? false : stryMutAct_9fa48("97576") ? true : (stryCov_9fa48("97576", "97577", "97578"), (stryMutAct_9fa48("97580") ? !partitionServices && !partitionId : stryMutAct_9fa48("97579") ? false : (stryCov_9fa48("97579", "97580"), (stryMutAct_9fa48("97581") ? partitionServices : (stryCov_9fa48("97581"), !partitionServices)) || (stryMutAct_9fa48("97582") ? partitionId : (stryCov_9fa48("97582"), !partitionId)))) || (stryMutAct_9fa48("97584") ? typeof partitionServices.values === 'function' : stryMutAct_9fa48("97583") ? false : (stryCov_9fa48("97583", "97584"), typeof partitionServices.values !== (stryMutAct_9fa48("97585") ? "" : (stryCov_9fa48("97585"), 'function')))))) {
      if (stryMutAct_9fa48("97586")) {
        {}
      } else {
        stryCov_9fa48("97586");
        return null;
      }
    }
    for (const service of partitionServices.values()) {
      if (stryMutAct_9fa48("97587")) {
        {}
      } else {
        stryCov_9fa48("97587");
        if (stryMutAct_9fa48("97590") ? (!service || service.partitionId !== partitionId || service.isLeader !== true) && typeof service.getSize !== 'function' : stryMutAct_9fa48("97589") ? false : stryMutAct_9fa48("97588") ? true : (stryCov_9fa48("97588", "97589", "97590"), (stryMutAct_9fa48("97592") ? (!service || service.partitionId !== partitionId) && service.isLeader !== true : stryMutAct_9fa48("97591") ? false : (stryCov_9fa48("97591", "97592"), (stryMutAct_9fa48("97594") ? !service && service.partitionId !== partitionId : stryMutAct_9fa48("97593") ? false : (stryCov_9fa48("97593", "97594"), (stryMutAct_9fa48("97595") ? service : (stryCov_9fa48("97595"), !service)) || (stryMutAct_9fa48("97597") ? service.partitionId === partitionId : stryMutAct_9fa48("97596") ? false : (stryCov_9fa48("97596", "97597"), service.partitionId !== partitionId)))) || (stryMutAct_9fa48("97599") ? service.isLeader === true : stryMutAct_9fa48("97598") ? false : (stryCov_9fa48("97598", "97599"), service.isLeader !== (stryMutAct_9fa48("97600") ? false : (stryCov_9fa48("97600"), true)))))) || (stryMutAct_9fa48("97602") ? typeof service.getSize === 'function' : stryMutAct_9fa48("97601") ? false : (stryCov_9fa48("97601", "97602"), typeof service.getSize !== (stryMutAct_9fa48("97603") ? "" : (stryCov_9fa48("97603"), 'function')))))) {
          if (stryMutAct_9fa48("97604")) {
            {}
          } else {
            stryCov_9fa48("97604");
            continue;
          }
        }
        return service;
      }
    }
    return null;
  }
}
function normalizeCounterValue(value) {
  if (stryMutAct_9fa48("97605")) {
    {}
  } else {
    stryCov_9fa48("97605");
    const parsed = Number(value);
    if (stryMutAct_9fa48("97608") ? !Number.isFinite(parsed) && parsed < NUM.ZERO : stryMutAct_9fa48("97607") ? false : stryMutAct_9fa48("97606") ? true : (stryCov_9fa48("97606", "97607", "97608"), (stryMutAct_9fa48("97609") ? Number.isFinite(parsed) : (stryCov_9fa48("97609"), !Number.isFinite(parsed))) || (stryMutAct_9fa48("97612") ? parsed >= NUM.ZERO : stryMutAct_9fa48("97611") ? parsed <= NUM.ZERO : stryMutAct_9fa48("97610") ? false : (stryCov_9fa48("97610", "97611", "97612"), parsed < NUM.ZERO)))) {
      if (stryMutAct_9fa48("97613")) {
        {}
      } else {
        stryCov_9fa48("97613");
        return null;
      }
    }
    return parsed;
  }
}
function resolveGeneratedWriteCount(partitionService) {
  if (stryMutAct_9fa48("97614")) {
    {}
  } else {
    stryCov_9fa48("97614");
    if (stryMutAct_9fa48("97617") ? !partitionService?.cdcPipelineMetrics && typeof partitionService.cdcPipelineMetrics.getSnapshot !== 'function' : stryMutAct_9fa48("97616") ? false : stryMutAct_9fa48("97615") ? true : (stryCov_9fa48("97615", "97616", "97617"), (stryMutAct_9fa48("97618") ? partitionService?.cdcPipelineMetrics : (stryCov_9fa48("97618"), !(stryMutAct_9fa48("97619") ? partitionService.cdcPipelineMetrics : (stryCov_9fa48("97619"), partitionService?.cdcPipelineMetrics)))) || (stryMutAct_9fa48("97621") ? typeof partitionService.cdcPipelineMetrics.getSnapshot === 'function' : stryMutAct_9fa48("97620") ? false : (stryCov_9fa48("97620", "97621"), typeof partitionService.cdcPipelineMetrics.getSnapshot !== (stryMutAct_9fa48("97622") ? "" : (stryCov_9fa48("97622"), 'function')))))) {
      if (stryMutAct_9fa48("97623")) {
        {}
      } else {
        stryCov_9fa48("97623");
        return null;
      }
    }
    const snapshot = partitionService.cdcPipelineMetrics.getSnapshot();
    return normalizeCounterValue(stryMutAct_9fa48("97624") ? snapshot[CDC_PIPELINE_METRIC.EVENTS_GENERATED] : (stryCov_9fa48("97624"), snapshot?.[CDC_PIPELINE_METRIC.EVENTS_GENERATED]));
  }
}
function calculateQueriesPerMinuteFromSample(partitionId, generatedWriteCount, nowMs, trafficSamples) {
  if (stryMutAct_9fa48("97625")) {
    {}
  } else {
    stryCov_9fa48("97625");
    const previousSample = trafficSamples.get(partitionId);
    trafficSamples.set(partitionId, stryMutAct_9fa48("97626") ? {} : (stryCov_9fa48("97626"), {
      sampledAtMs: nowMs,
      generatedWriteCount
    }));
    if (stryMutAct_9fa48("97629") ? (!previousSample || !Number.isFinite(previousSample.sampledAtMs)) && !Number.isFinite(previousSample.generatedWriteCount) : stryMutAct_9fa48("97628") ? false : stryMutAct_9fa48("97627") ? true : (stryCov_9fa48("97627", "97628", "97629"), (stryMutAct_9fa48("97631") ? !previousSample && !Number.isFinite(previousSample.sampledAtMs) : stryMutAct_9fa48("97630") ? false : (stryCov_9fa48("97630", "97631"), (stryMutAct_9fa48("97632") ? previousSample : (stryCov_9fa48("97632"), !previousSample)) || (stryMutAct_9fa48("97633") ? Number.isFinite(previousSample.sampledAtMs) : (stryCov_9fa48("97633"), !Number.isFinite(previousSample.sampledAtMs))))) || (stryMutAct_9fa48("97634") ? Number.isFinite(previousSample.generatedWriteCount) : (stryCov_9fa48("97634"), !Number.isFinite(previousSample.generatedWriteCount))))) {
      if (stryMutAct_9fa48("97635")) {
        {}
      } else {
        stryCov_9fa48("97635");
        return NUM.ZERO;
      }
    }
    const deltaMs = stryMutAct_9fa48("97636") ? nowMs + previousSample.sampledAtMs : (stryCov_9fa48("97636"), nowMs - previousSample.sampledAtMs);
    const deltaWrites = stryMutAct_9fa48("97637") ? generatedWriteCount + previousSample.generatedWriteCount : (stryCov_9fa48("97637"), generatedWriteCount - previousSample.generatedWriteCount);
    if (stryMutAct_9fa48("97640") ? deltaMs <= NUM.ZERO && deltaWrites <= NUM.ZERO : stryMutAct_9fa48("97639") ? false : stryMutAct_9fa48("97638") ? true : (stryCov_9fa48("97638", "97639", "97640"), (stryMutAct_9fa48("97643") ? deltaMs > NUM.ZERO : stryMutAct_9fa48("97642") ? deltaMs < NUM.ZERO : stryMutAct_9fa48("97641") ? false : (stryCov_9fa48("97641", "97642", "97643"), deltaMs <= NUM.ZERO)) || (stryMutAct_9fa48("97646") ? deltaWrites > NUM.ZERO : stryMutAct_9fa48("97645") ? deltaWrites < NUM.ZERO : stryMutAct_9fa48("97644") ? false : (stryCov_9fa48("97644", "97645", "97646"), deltaWrites <= NUM.ZERO)))) {
      if (stryMutAct_9fa48("97647")) {
        {}
      } else {
        stryCov_9fa48("97647");
        return NUM.ZERO;
      }
    }
    return stryMutAct_9fa48("97648") ? deltaWrites * ONE_MINUTE_MS * deltaMs : (stryCov_9fa48("97648"), (stryMutAct_9fa48("97649") ? deltaWrites / ONE_MINUTE_MS : (stryCov_9fa48("97649"), deltaWrites * ONE_MINUTE_MS)) / deltaMs);
  }
}
function createManagedSplitMetricsProvider(options = {}) {
  if (stryMutAct_9fa48("97650")) {
    {}
  } else {
    stryCov_9fa48("97650");
    const partitionServices = stryMutAct_9fa48("97653") ? options.partitionServices && null : stryMutAct_9fa48("97652") ? false : stryMutAct_9fa48("97651") ? true : (stryCov_9fa48("97651", "97652", "97653"), options.partitionServices || null);
    const nowFn = (stryMutAct_9fa48("97656") ? typeof options.now !== 'function' : stryMutAct_9fa48("97655") ? false : stryMutAct_9fa48("97654") ? true : (stryCov_9fa48("97654", "97655", "97656"), typeof options.now === (stryMutAct_9fa48("97657") ? "" : (stryCov_9fa48("97657"), 'function')))) ? options.now : stryMutAct_9fa48("97658") ? () => undefined : (stryCov_9fa48("97658"), () => Date.now());
    const trafficSamples = new Map();
    return (partitionId, partition) => {
      if (stryMutAct_9fa48("97659")) {
        {}
      } else {
        stryCov_9fa48("97659");
        const normalizedPartitionId = stryMutAct_9fa48("97662") ? (partitionId || partition?.partition_id || partition?.partitionId) && null : stryMutAct_9fa48("97661") ? false : stryMutAct_9fa48("97660") ? true : (stryCov_9fa48("97660", "97661", "97662"), (stryMutAct_9fa48("97664") ? (partitionId || partition?.partition_id) && partition?.partitionId : stryMutAct_9fa48("97663") ? false : (stryCov_9fa48("97663", "97664"), (stryMutAct_9fa48("97666") ? partitionId && partition?.partition_id : stryMutAct_9fa48("97665") ? false : (stryCov_9fa48("97665", "97666"), partitionId || (stryMutAct_9fa48("97667") ? partition.partition_id : (stryCov_9fa48("97667"), partition?.partition_id)))) || (stryMutAct_9fa48("97668") ? partition.partitionId : (stryCov_9fa48("97668"), partition?.partitionId)))) || null);
        const localLeaderService = findLocalLeaderPartitionService(partitionServices, normalizedPartitionId);
        if (stryMutAct_9fa48("97670") ? false : stryMutAct_9fa48("97669") ? true : (stryCov_9fa48("97669", "97670"), localLeaderService)) {
          if (stryMutAct_9fa48("97671")) {
            {}
          } else {
            stryCov_9fa48("97671");
            const liveSizeBytes = Number(localLeaderService.getSize());
            const generatedWriteCount = resolveGeneratedWriteCount(localLeaderService);
            const queriesPerMinute = (stryMutAct_9fa48("97674") ? generatedWriteCount !== null : stryMutAct_9fa48("97673") ? false : stryMutAct_9fa48("97672") ? true : (stryCov_9fa48("97672", "97673", "97674"), generatedWriteCount === null)) ? NUM.ZERO : calculateQueriesPerMinuteFromSample(normalizedPartitionId, generatedWriteCount, nowFn(), trafficSamples);
            if (stryMutAct_9fa48("97676") ? false : stryMutAct_9fa48("97675") ? true : (stryCov_9fa48("97675", "97676"), Number.isFinite(liveSizeBytes))) {
              if (stryMutAct_9fa48("97677")) {
                {}
              } else {
                stryCov_9fa48("97677");
                return stryMutAct_9fa48("97678") ? {} : (stryCov_9fa48("97678"), {
                  sizeBytes: liveSizeBytes,
                  queriesPerMinute
                });
              }
            }
          }
        }
        return stryMutAct_9fa48("97679") ? {} : (stryCov_9fa48("97679"), {
          sizeBytes: normalizePartitionSize(partition),
          queriesPerMinute: NUM.ZERO
        });
      }
    };
  }
}
export { calculateQueriesPerMinuteFromSample, createManagedSplitMetricsProvider, findLocalLeaderPartitionService, resolveGeneratedWriteCount };