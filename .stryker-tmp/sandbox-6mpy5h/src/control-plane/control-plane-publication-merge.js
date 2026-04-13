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
import { normalizeControlPlanePublicationRow, serializeControlPlanePublicationRow } from './system-row-normalizers.js';
const CONTROL_PLANE_PUBLICATION_STATUS = Object.freeze(stryMutAct_9fa48("58112") ? {} : (stryCov_9fa48("58112"), {
  OPEN: stryMutAct_9fa48("58113") ? "" : (stryCov_9fa48("58113"), 'OPEN'),
  ACK_PENDING: stryMutAct_9fa48("58114") ? "" : (stryCov_9fa48("58114"), 'ACK_PENDING'),
  PUBLISHED: stryMutAct_9fa48("58115") ? "" : (stryCov_9fa48("58115"), 'PUBLISHED'),
  ABANDONED: stryMutAct_9fa48("58116") ? "" : (stryCov_9fa48("58116"), 'ABANDONED'),
  SUPERSEDED: stryMutAct_9fa48("58117") ? "" : (stryCov_9fa48("58117"), 'SUPERSEDED')
}));
function normalizePublicationNodeIdList(values = stryMutAct_9fa48("58118") ? ["Stryker was here"] : (stryCov_9fa48("58118"), [])) {
  if (stryMutAct_9fa48("58119")) {
    {}
  } else {
    stryCov_9fa48("58119");
    return stryMutAct_9fa48("58120") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(value => value.length > NUM.ZERO))] : (stryCov_9fa48("58120"), (stryMutAct_9fa48("58121") ? [] : (stryCov_9fa48("58121"), [...new Set(stryMutAct_9fa48("58122") ? (Array.isArray(values) ? values : []).map(value => String(value || '').trim()) : (stryCov_9fa48("58122"), (Array.isArray(values) ? values : stryMutAct_9fa48("58123") ? ["Stryker was here"] : (stryCov_9fa48("58123"), [])).map(stryMutAct_9fa48("58124") ? () => undefined : (stryCov_9fa48("58124"), value => stryMutAct_9fa48("58125") ? String(value || '') : (stryCov_9fa48("58125"), String(stryMutAct_9fa48("58128") ? value && '' : stryMutAct_9fa48("58127") ? false : stryMutAct_9fa48("58126") ? true : (stryCov_9fa48("58126", "58127", "58128"), value || (stryMutAct_9fa48("58129") ? "Stryker was here!" : (stryCov_9fa48("58129"), '')))).trim()))).filter(stryMutAct_9fa48("58130") ? () => undefined : (stryCov_9fa48("58130"), value => stryMutAct_9fa48("58134") ? value.length <= NUM.ZERO : stryMutAct_9fa48("58133") ? value.length >= NUM.ZERO : stryMutAct_9fa48("58132") ? false : stryMutAct_9fa48("58131") ? true : (stryCov_9fa48("58131", "58132", "58133", "58134"), value.length > NUM.ZERO)))))])).sort());
  }
}
function normalizePublicationPositiveInteger(value, fallback = null) {
  if (stryMutAct_9fa48("58135")) {
    {}
  } else {
    stryCov_9fa48("58135");
    const normalized = Number(value);
    if (stryMutAct_9fa48("58138") ? Number.isFinite(normalized) || normalized >= NUM.ZERO : stryMutAct_9fa48("58137") ? false : stryMutAct_9fa48("58136") ? true : (stryCov_9fa48("58136", "58137", "58138"), Number.isFinite(normalized) && (stryMutAct_9fa48("58141") ? normalized < NUM.ZERO : stryMutAct_9fa48("58140") ? normalized > NUM.ZERO : stryMutAct_9fa48("58139") ? true : (stryCov_9fa48("58139", "58140", "58141"), normalized >= NUM.ZERO)))) {
      if (stryMutAct_9fa48("58142")) {
        {}
      } else {
        stryCov_9fa48("58142");
        return Math.trunc(normalized);
      }
    }
    return fallback;
  }
}
function getPublicationRowTimestamp(row) {
  if (stryMutAct_9fa48("58143")) {
    {}
  } else {
    stryCov_9fa48("58143");
    return normalizePublicationPositiveInteger(stryMutAct_9fa48("58144") ? row?.updated_at && row?.updatedAt : (stryCov_9fa48("58144"), (stryMutAct_9fa48("58145") ? row.updated_at : (stryCov_9fa48("58145"), row?.updated_at)) ?? (stryMutAct_9fa48("58146") ? row.updatedAt : (stryCov_9fa48("58146"), row?.updatedAt))), normalizePublicationPositiveInteger(stryMutAct_9fa48("58147") ? row?.created_at && row?.createdAt : (stryCov_9fa48("58147"), (stryMutAct_9fa48("58148") ? row.created_at : (stryCov_9fa48("58148"), row?.created_at)) ?? (stryMutAct_9fa48("58149") ? row.createdAt : (stryCov_9fa48("58149"), row?.createdAt))), null));
  }
}
function arePublicationNodeListsEqual(left = stryMutAct_9fa48("58150") ? ["Stryker was here"] : (stryCov_9fa48("58150"), []), right = stryMutAct_9fa48("58151") ? ["Stryker was here"] : (stryCov_9fa48("58151"), [])) {
  if (stryMutAct_9fa48("58152")) {
    {}
  } else {
    stryCov_9fa48("58152");
    const normalizedLeft = normalizePublicationNodeIdList(left);
    const normalizedRight = normalizePublicationNodeIdList(right);
    if (stryMutAct_9fa48("58155") ? normalizedLeft.length === normalizedRight.length : stryMutAct_9fa48("58154") ? false : stryMutAct_9fa48("58153") ? true : (stryCov_9fa48("58153", "58154", "58155"), normalizedLeft.length !== normalizedRight.length)) {
      if (stryMutAct_9fa48("58156")) {
        {}
      } else {
        stryCov_9fa48("58156");
        return stryMutAct_9fa48("58157") ? true : (stryCov_9fa48("58157"), false);
      }
    }
    return stryMutAct_9fa48("58158") ? normalizedLeft.some((value, index) => value === normalizedRight[index]) : (stryCov_9fa48("58158"), normalizedLeft.every(stryMutAct_9fa48("58159") ? () => undefined : (stryCov_9fa48("58159"), (value, index) => stryMutAct_9fa48("58162") ? value !== normalizedRight[index] : stryMutAct_9fa48("58161") ? false : stryMutAct_9fa48("58160") ? true : (stryCov_9fa48("58160", "58161", "58162"), value === normalizedRight[index]))));
  }
}
function doesPublicationNodeListCover(actual = stryMutAct_9fa48("58163") ? ["Stryker was here"] : (stryCov_9fa48("58163"), []), expected = stryMutAct_9fa48("58164") ? ["Stryker was here"] : (stryCov_9fa48("58164"), [])) {
  if (stryMutAct_9fa48("58165")) {
    {}
  } else {
    stryCov_9fa48("58165");
    const actualSet = new Set(normalizePublicationNodeIdList(actual));
    return stryMutAct_9fa48("58166") ? normalizePublicationNodeIdList(expected).some(value => actualSet.has(value)) : (stryCov_9fa48("58166"), normalizePublicationNodeIdList(expected).every(stryMutAct_9fa48("58167") ? () => undefined : (stryCov_9fa48("58167"), value => actualSet.has(value))));
  }
}
function selectLatestRow(primaryRow, secondaryRow) {
  if (stryMutAct_9fa48("58168")) {
    {}
  } else {
    stryCov_9fa48("58168");
    const primaryTimestamp = getPublicationRowTimestamp(primaryRow);
    const secondaryTimestamp = getPublicationRowTimestamp(secondaryRow);
    if (stryMutAct_9fa48("58171") ? !Number.isFinite(primaryTimestamp) || !Number.isFinite(secondaryTimestamp) : stryMutAct_9fa48("58170") ? false : stryMutAct_9fa48("58169") ? true : (stryCov_9fa48("58169", "58170", "58171"), (stryMutAct_9fa48("58172") ? Number.isFinite(primaryTimestamp) : (stryCov_9fa48("58172"), !Number.isFinite(primaryTimestamp))) && (stryMutAct_9fa48("58173") ? Number.isFinite(secondaryTimestamp) : (stryCov_9fa48("58173"), !Number.isFinite(secondaryTimestamp))))) {
      if (stryMutAct_9fa48("58174")) {
        {}
      } else {
        stryCov_9fa48("58174");
        return stryMutAct_9fa48("58177") ? (primaryRow || secondaryRow) && null : stryMutAct_9fa48("58176") ? false : stryMutAct_9fa48("58175") ? true : (stryCov_9fa48("58175", "58176", "58177"), (stryMutAct_9fa48("58179") ? primaryRow && secondaryRow : stryMutAct_9fa48("58178") ? false : (stryCov_9fa48("58178", "58179"), primaryRow || secondaryRow)) || null);
      }
    }
    if (stryMutAct_9fa48("58182") ? false : stryMutAct_9fa48("58181") ? true : stryMutAct_9fa48("58180") ? Number.isFinite(primaryTimestamp) : (stryCov_9fa48("58180", "58181", "58182"), !Number.isFinite(primaryTimestamp))) {
      if (stryMutAct_9fa48("58183")) {
        {}
      } else {
        stryCov_9fa48("58183");
        return stryMutAct_9fa48("58186") ? secondaryRow && null : stryMutAct_9fa48("58185") ? false : stryMutAct_9fa48("58184") ? true : (stryCov_9fa48("58184", "58185", "58186"), secondaryRow || null);
      }
    }
    if (stryMutAct_9fa48("58189") ? false : stryMutAct_9fa48("58188") ? true : stryMutAct_9fa48("58187") ? Number.isFinite(secondaryTimestamp) : (stryCov_9fa48("58187", "58188", "58189"), !Number.isFinite(secondaryTimestamp))) {
      if (stryMutAct_9fa48("58190")) {
        {}
      } else {
        stryCov_9fa48("58190");
        return stryMutAct_9fa48("58193") ? primaryRow && null : stryMutAct_9fa48("58192") ? false : stryMutAct_9fa48("58191") ? true : (stryCov_9fa48("58191", "58192", "58193"), primaryRow || null);
      }
    }
    return (stryMutAct_9fa48("58197") ? primaryTimestamp < secondaryTimestamp : stryMutAct_9fa48("58196") ? primaryTimestamp > secondaryTimestamp : stryMutAct_9fa48("58195") ? false : stryMutAct_9fa48("58194") ? true : (stryCov_9fa48("58194", "58195", "58196", "58197"), primaryTimestamp >= secondaryTimestamp)) ? primaryRow : secondaryRow;
  }
}
function readPreferredPublicationField(latestRow, fallbackRow, snakeField, camelField) {
  if (stryMutAct_9fa48("58198")) {
    {}
  } else {
    stryCov_9fa48("58198");
    const latestValue = stryMutAct_9fa48("58199") ? latestRow?.[snakeField] && latestRow?.[camelField] : (stryCov_9fa48("58199"), (stryMutAct_9fa48("58200") ? latestRow[snakeField] : (stryCov_9fa48("58200"), latestRow?.[snakeField])) ?? (stryMutAct_9fa48("58201") ? latestRow[camelField] : (stryCov_9fa48("58201"), latestRow?.[camelField])));
    if (stryMutAct_9fa48("58204") ? latestValue !== null || typeof latestValue !== TYPEOF.UNDEFINED : stryMutAct_9fa48("58203") ? false : stryMutAct_9fa48("58202") ? true : (stryCov_9fa48("58202", "58203", "58204"), (stryMutAct_9fa48("58206") ? latestValue === null : stryMutAct_9fa48("58205") ? true : (stryCov_9fa48("58205", "58206"), latestValue !== null)) && (stryMutAct_9fa48("58208") ? typeof latestValue === TYPEOF.UNDEFINED : stryMutAct_9fa48("58207") ? true : (stryCov_9fa48("58207", "58208"), typeof latestValue !== TYPEOF.UNDEFINED)))) {
      if (stryMutAct_9fa48("58209")) {
        {}
      } else {
        stryCov_9fa48("58209");
        return latestValue;
      }
    }
    return stryMutAct_9fa48("58210") ? (fallbackRow?.[snakeField] ?? fallbackRow?.[camelField]) && null : (stryCov_9fa48("58210"), (stryMutAct_9fa48("58211") ? fallbackRow?.[snakeField] && fallbackRow?.[camelField] : (stryCov_9fa48("58211"), (stryMutAct_9fa48("58212") ? fallbackRow[snakeField] : (stryCov_9fa48("58212"), fallbackRow?.[snakeField])) ?? (stryMutAct_9fa48("58213") ? fallbackRow[camelField] : (stryCov_9fa48("58213"), fallbackRow?.[camelField])))) ?? null);
  }
}
function deriveMergedPublicationStatus(primaryStatus, secondaryStatus, acknowledgedNodeIds, requiredAckNodeIds) {
  if (stryMutAct_9fa48("58214")) {
    {}
  } else {
    stryCov_9fa48("58214");
    if (stryMutAct_9fa48("58217") ? primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED && secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("58216") ? false : stryMutAct_9fa48("58215") ? true : (stryCov_9fa48("58215", "58216", "58217"), (stryMutAct_9fa48("58219") ? primaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("58218") ? false : (stryCov_9fa48("58218", "58219"), primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED)) || (stryMutAct_9fa48("58221") ? secondaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("58220") ? false : (stryCov_9fa48("58220", "58221"), secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED)))) {
      if (stryMutAct_9fa48("58222")) {
        {}
      } else {
        stryCov_9fa48("58222");
        return CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED;
      }
    }
    if (stryMutAct_9fa48("58225") ? primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED && secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("58224") ? false : stryMutAct_9fa48("58223") ? true : (stryCov_9fa48("58223", "58224", "58225"), (stryMutAct_9fa48("58227") ? primaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("58226") ? false : (stryCov_9fa48("58226", "58227"), primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED)) || (stryMutAct_9fa48("58229") ? secondaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("58228") ? false : (stryCov_9fa48("58228", "58229"), secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED)))) {
      if (stryMutAct_9fa48("58230")) {
        {}
      } else {
        stryCov_9fa48("58230");
        return CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED;
      }
    }
    if (stryMutAct_9fa48("58233") ? (primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED || secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED) && arePublicationNodeListsEqual(acknowledgedNodeIds, requiredAckNodeIds) : stryMutAct_9fa48("58232") ? false : stryMutAct_9fa48("58231") ? true : (stryCov_9fa48("58231", "58232", "58233"), (stryMutAct_9fa48("58235") ? primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED && secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("58234") ? false : (stryCov_9fa48("58234", "58235"), (stryMutAct_9fa48("58237") ? primaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("58236") ? false : (stryCov_9fa48("58236", "58237"), primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) || (stryMutAct_9fa48("58239") ? secondaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("58238") ? false : (stryCov_9fa48("58238", "58239"), secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)))) || arePublicationNodeListsEqual(acknowledgedNodeIds, requiredAckNodeIds))) {
      if (stryMutAct_9fa48("58240")) {
        {}
      } else {
        stryCov_9fa48("58240");
        return CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
      }
    }
    if (stryMutAct_9fa48("58243") ? (primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING || secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING) && acknowledgedNodeIds.length > NUM.ZERO : stryMutAct_9fa48("58242") ? false : stryMutAct_9fa48("58241") ? true : (stryCov_9fa48("58241", "58242", "58243"), (stryMutAct_9fa48("58245") ? primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING && secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING : stryMutAct_9fa48("58244") ? false : (stryCov_9fa48("58244", "58245"), (stryMutAct_9fa48("58247") ? primaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING : stryMutAct_9fa48("58246") ? false : (stryCov_9fa48("58246", "58247"), primaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING)) || (stryMutAct_9fa48("58249") ? secondaryStatus !== CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING : stryMutAct_9fa48("58248") ? false : (stryCov_9fa48("58248", "58249"), secondaryStatus === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING)))) || (stryMutAct_9fa48("58252") ? acknowledgedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("58251") ? acknowledgedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("58250") ? false : (stryCov_9fa48("58250", "58251", "58252"), acknowledgedNodeIds.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("58253")) {
        {}
      } else {
        stryCov_9fa48("58253");
        return CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING;
      }
    }
    return CONTROL_PLANE_PUBLICATION_STATUS.OPEN;
  }
}
function mergeControlPlanePublicationRows(primaryRow, secondaryRow) {
  if (stryMutAct_9fa48("58254")) {
    {}
  } else {
    stryCov_9fa48("58254");
    if (stryMutAct_9fa48("58257") ? !primaryRow || !secondaryRow : stryMutAct_9fa48("58256") ? false : stryMutAct_9fa48("58255") ? true : (stryCov_9fa48("58255", "58256", "58257"), (stryMutAct_9fa48("58258") ? primaryRow : (stryCov_9fa48("58258"), !primaryRow)) && (stryMutAct_9fa48("58259") ? secondaryRow : (stryCov_9fa48("58259"), !secondaryRow)))) {
      if (stryMutAct_9fa48("58260")) {
        {}
      } else {
        stryCov_9fa48("58260");
        return null;
      }
    }
    if (stryMutAct_9fa48("58263") ? false : stryMutAct_9fa48("58262") ? true : stryMutAct_9fa48("58261") ? primaryRow : (stryCov_9fa48("58261", "58262", "58263"), !primaryRow)) {
      if (stryMutAct_9fa48("58264")) {
        {}
      } else {
        stryCov_9fa48("58264");
        return serializeControlPlanePublicationRow(secondaryRow);
      }
    }
    if (stryMutAct_9fa48("58267") ? false : stryMutAct_9fa48("58266") ? true : stryMutAct_9fa48("58265") ? secondaryRow : (stryCov_9fa48("58265", "58266", "58267"), !secondaryRow)) {
      if (stryMutAct_9fa48("58268")) {
        {}
      } else {
        stryCov_9fa48("58268");
        return serializeControlPlanePublicationRow(primaryRow);
      }
    }
    const normalizedPrimary = normalizeControlPlanePublicationRow(primaryRow);
    const normalizedSecondary = normalizeControlPlanePublicationRow(secondaryRow);
    const latestRow = selectLatestRow(primaryRow, secondaryRow);
    const fallbackRow = (stryMutAct_9fa48("58271") ? latestRow !== primaryRow : stryMutAct_9fa48("58270") ? false : stryMutAct_9fa48("58269") ? true : (stryCov_9fa48("58269", "58270", "58271"), latestRow === primaryRow)) ? secondaryRow : primaryRow;
    const publishedActiveNodeIds = normalizePublicationNodeIdList(stryMutAct_9fa48("58272") ? [] : (stryCov_9fa48("58272"), [...normalizedPrimary.publishedActiveNodeIds, ...normalizedSecondary.publishedActiveNodeIds]));
    const requiredAckNodeIds = normalizePublicationNodeIdList(stryMutAct_9fa48("58273") ? [] : (stryCov_9fa48("58273"), [...normalizedPrimary.requiredAckNodeIds, ...normalizedSecondary.requiredAckNodeIds]));
    const acknowledgedNodeIds = normalizePublicationNodeIdList(stryMutAct_9fa48("58274") ? [] : (stryCov_9fa48("58274"), [...normalizedPrimary.acknowledgedNodeIds, ...normalizedSecondary.acknowledgedNodeIds]));
    const status = deriveMergedPublicationStatus(normalizedPrimary.status, normalizedSecondary.status, acknowledgedNodeIds, requiredAckNodeIds);
    const updatedAtCandidates = stryMutAct_9fa48("58275") ? [normalizePublicationPositiveInteger(primaryRow?.updated_at ?? primaryRow?.updatedAt, null), normalizePublicationPositiveInteger(secondaryRow?.updated_at ?? secondaryRow?.updatedAt, null)] : (stryCov_9fa48("58275"), (stryMutAct_9fa48("58276") ? [] : (stryCov_9fa48("58276"), [normalizePublicationPositiveInteger(stryMutAct_9fa48("58277") ? primaryRow?.updated_at && primaryRow?.updatedAt : (stryCov_9fa48("58277"), (stryMutAct_9fa48("58278") ? primaryRow.updated_at : (stryCov_9fa48("58278"), primaryRow?.updated_at)) ?? (stryMutAct_9fa48("58279") ? primaryRow.updatedAt : (stryCov_9fa48("58279"), primaryRow?.updatedAt))), null), normalizePublicationPositiveInteger(stryMutAct_9fa48("58280") ? secondaryRow?.updated_at && secondaryRow?.updatedAt : (stryCov_9fa48("58280"), (stryMutAct_9fa48("58281") ? secondaryRow.updated_at : (stryCov_9fa48("58281"), secondaryRow?.updated_at)) ?? (stryMutAct_9fa48("58282") ? secondaryRow.updatedAt : (stryCov_9fa48("58282"), secondaryRow?.updatedAt))), null)])).filter(stryMutAct_9fa48("58283") ? () => undefined : (stryCov_9fa48("58283"), value => Number.isFinite(value))));
    const updatedAt = (stryMutAct_9fa48("58287") ? updatedAtCandidates.length <= NUM.ZERO : stryMutAct_9fa48("58286") ? updatedAtCandidates.length >= NUM.ZERO : stryMutAct_9fa48("58285") ? false : stryMutAct_9fa48("58284") ? true : (stryCov_9fa48("58284", "58285", "58286", "58287"), updatedAtCandidates.length > NUM.ZERO)) ? stryMutAct_9fa48("58288") ? Math.min(...updatedAtCandidates) : (stryCov_9fa48("58288"), Math.max(...updatedAtCandidates)) : null;
    const createdAtCandidates = stryMutAct_9fa48("58289") ? [normalizePublicationPositiveInteger(primaryRow?.created_at ?? primaryRow?.createdAt, null), normalizePublicationPositiveInteger(secondaryRow?.created_at ?? secondaryRow?.createdAt, null)] : (stryCov_9fa48("58289"), (stryMutAct_9fa48("58290") ? [] : (stryCov_9fa48("58290"), [normalizePublicationPositiveInteger(stryMutAct_9fa48("58291") ? primaryRow?.created_at && primaryRow?.createdAt : (stryCov_9fa48("58291"), (stryMutAct_9fa48("58292") ? primaryRow.created_at : (stryCov_9fa48("58292"), primaryRow?.created_at)) ?? (stryMutAct_9fa48("58293") ? primaryRow.createdAt : (stryCov_9fa48("58293"), primaryRow?.createdAt))), null), normalizePublicationPositiveInteger(stryMutAct_9fa48("58294") ? secondaryRow?.created_at && secondaryRow?.createdAt : (stryCov_9fa48("58294"), (stryMutAct_9fa48("58295") ? secondaryRow.created_at : (stryCov_9fa48("58295"), secondaryRow?.created_at)) ?? (stryMutAct_9fa48("58296") ? secondaryRow.createdAt : (stryCov_9fa48("58296"), secondaryRow?.createdAt))), null)])).filter(stryMutAct_9fa48("58297") ? () => undefined : (stryCov_9fa48("58297"), value => Number.isFinite(value))));
    const createdAt = (stryMutAct_9fa48("58301") ? createdAtCandidates.length <= NUM.ZERO : stryMutAct_9fa48("58300") ? createdAtCandidates.length >= NUM.ZERO : stryMutAct_9fa48("58299") ? false : stryMutAct_9fa48("58298") ? true : (stryCov_9fa48("58298", "58299", "58300", "58301"), createdAtCandidates.length > NUM.ZERO)) ? stryMutAct_9fa48("58302") ? Math.max(...createdAtCandidates) : (stryCov_9fa48("58302"), Math.min(...createdAtCandidates)) : null;
    const publishedAtCandidates = stryMutAct_9fa48("58303") ? [normalizePublicationPositiveInteger(primaryRow?.published_at ?? primaryRow?.publishedAt, null), normalizePublicationPositiveInteger(secondaryRow?.published_at ?? secondaryRow?.publishedAt, null)] : (stryCov_9fa48("58303"), (stryMutAct_9fa48("58304") ? [] : (stryCov_9fa48("58304"), [normalizePublicationPositiveInteger(stryMutAct_9fa48("58305") ? primaryRow?.published_at && primaryRow?.publishedAt : (stryCov_9fa48("58305"), (stryMutAct_9fa48("58306") ? primaryRow.published_at : (stryCov_9fa48("58306"), primaryRow?.published_at)) ?? (stryMutAct_9fa48("58307") ? primaryRow.publishedAt : (stryCov_9fa48("58307"), primaryRow?.publishedAt))), null), normalizePublicationPositiveInteger(stryMutAct_9fa48("58308") ? secondaryRow?.published_at && secondaryRow?.publishedAt : (stryCov_9fa48("58308"), (stryMutAct_9fa48("58309") ? secondaryRow.published_at : (stryCov_9fa48("58309"), secondaryRow?.published_at)) ?? (stryMutAct_9fa48("58310") ? secondaryRow.publishedAt : (stryCov_9fa48("58310"), secondaryRow?.publishedAt))), null)])).filter(stryMutAct_9fa48("58311") ? () => undefined : (stryCov_9fa48("58311"), value => Number.isFinite(value))));
    const closedAtCandidates = stryMutAct_9fa48("58312") ? [normalizePublicationPositiveInteger(primaryRow?.closed_at ?? primaryRow?.closedAt, null), normalizePublicationPositiveInteger(secondaryRow?.closed_at ?? secondaryRow?.closedAt, null)] : (stryCov_9fa48("58312"), (stryMutAct_9fa48("58313") ? [] : (stryCov_9fa48("58313"), [normalizePublicationPositiveInteger(stryMutAct_9fa48("58314") ? primaryRow?.closed_at && primaryRow?.closedAt : (stryCov_9fa48("58314"), (stryMutAct_9fa48("58315") ? primaryRow.closed_at : (stryCov_9fa48("58315"), primaryRow?.closed_at)) ?? (stryMutAct_9fa48("58316") ? primaryRow.closedAt : (stryCov_9fa48("58316"), primaryRow?.closedAt))), null), normalizePublicationPositiveInteger(stryMutAct_9fa48("58317") ? secondaryRow?.closed_at && secondaryRow?.closedAt : (stryCov_9fa48("58317"), (stryMutAct_9fa48("58318") ? secondaryRow.closed_at : (stryCov_9fa48("58318"), secondaryRow?.closed_at)) ?? (stryMutAct_9fa48("58319") ? secondaryRow.closedAt : (stryCov_9fa48("58319"), secondaryRow?.closedAt))), null)])).filter(stryMutAct_9fa48("58320") ? () => undefined : (stryCov_9fa48("58320"), value => Number.isFinite(value))));
    const publishedAt = (stryMutAct_9fa48("58323") ? status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("58322") ? false : stryMutAct_9fa48("58321") ? true : (stryCov_9fa48("58321", "58322", "58323"), status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) ? (stryMutAct_9fa48("58327") ? publishedAtCandidates.length <= NUM.ZERO : stryMutAct_9fa48("58326") ? publishedAtCandidates.length >= NUM.ZERO : stryMutAct_9fa48("58325") ? false : stryMutAct_9fa48("58324") ? true : (stryCov_9fa48("58324", "58325", "58326", "58327"), publishedAtCandidates.length > NUM.ZERO)) ? stryMutAct_9fa48("58328") ? Math.min(...publishedAtCandidates) : (stryCov_9fa48("58328"), Math.max(...publishedAtCandidates)) : updatedAt : null;
    const closedAt = (stryMutAct_9fa48("58331") ? (status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED || status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED) && status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("58330") ? false : stryMutAct_9fa48("58329") ? true : (stryCov_9fa48("58329", "58330", "58331"), (stryMutAct_9fa48("58333") ? status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED && status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("58332") ? false : (stryCov_9fa48("58332", "58333"), (stryMutAct_9fa48("58335") ? status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("58334") ? false : (stryCov_9fa48("58334", "58335"), status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) || (stryMutAct_9fa48("58337") ? status !== CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("58336") ? false : (stryCov_9fa48("58336", "58337"), status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED)))) || (stryMutAct_9fa48("58339") ? status !== CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("58338") ? false : (stryCov_9fa48("58338", "58339"), status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED)))) ? (stryMutAct_9fa48("58343") ? closedAtCandidates.length <= NUM.ZERO : stryMutAct_9fa48("58342") ? closedAtCandidates.length >= NUM.ZERO : stryMutAct_9fa48("58341") ? false : stryMutAct_9fa48("58340") ? true : (stryCov_9fa48("58340", "58341", "58342", "58343"), closedAtCandidates.length > NUM.ZERO)) ? stryMutAct_9fa48("58344") ? Math.min(...closedAtCandidates) : (stryCov_9fa48("58344"), Math.max(...closedAtCandidates)) : stryMutAct_9fa48("58347") ? publishedAt && updatedAt : stryMutAct_9fa48("58346") ? false : stryMutAct_9fa48("58345") ? true : (stryCov_9fa48("58345", "58346", "58347"), publishedAt || updatedAt) : null;
    return serializeControlPlanePublicationRow(stryMutAct_9fa48("58348") ? {} : (stryCov_9fa48("58348"), {
      publication_id: stryMutAct_9fa48("58351") ? (primaryRow?.publication_id || primaryRow?.publicationId || secondaryRow?.publication_id || secondaryRow?.publicationId) && null : stryMutAct_9fa48("58350") ? false : stryMutAct_9fa48("58349") ? true : (stryCov_9fa48("58349", "58350", "58351"), (stryMutAct_9fa48("58353") ? (primaryRow?.publication_id || primaryRow?.publicationId || secondaryRow?.publication_id) && secondaryRow?.publicationId : stryMutAct_9fa48("58352") ? false : (stryCov_9fa48("58352", "58353"), (stryMutAct_9fa48("58355") ? (primaryRow?.publication_id || primaryRow?.publicationId) && secondaryRow?.publication_id : stryMutAct_9fa48("58354") ? false : (stryCov_9fa48("58354", "58355"), (stryMutAct_9fa48("58357") ? primaryRow?.publication_id && primaryRow?.publicationId : stryMutAct_9fa48("58356") ? false : (stryCov_9fa48("58356", "58357"), (stryMutAct_9fa48("58358") ? primaryRow.publication_id : (stryCov_9fa48("58358"), primaryRow?.publication_id)) || (stryMutAct_9fa48("58359") ? primaryRow.publicationId : (stryCov_9fa48("58359"), primaryRow?.publicationId)))) || (stryMutAct_9fa48("58360") ? secondaryRow.publication_id : (stryCov_9fa48("58360"), secondaryRow?.publication_id)))) || (stryMutAct_9fa48("58361") ? secondaryRow.publicationId : (stryCov_9fa48("58361"), secondaryRow?.publicationId)))) || null),
      publication_kind: stryMutAct_9fa48("58364") ? (primaryRow?.publication_kind || primaryRow?.publicationKind || secondaryRow?.publication_kind || secondaryRow?.publicationKind) && null : stryMutAct_9fa48("58363") ? false : stryMutAct_9fa48("58362") ? true : (stryCov_9fa48("58362", "58363", "58364"), (stryMutAct_9fa48("58366") ? (primaryRow?.publication_kind || primaryRow?.publicationKind || secondaryRow?.publication_kind) && secondaryRow?.publicationKind : stryMutAct_9fa48("58365") ? false : (stryCov_9fa48("58365", "58366"), (stryMutAct_9fa48("58368") ? (primaryRow?.publication_kind || primaryRow?.publicationKind) && secondaryRow?.publication_kind : stryMutAct_9fa48("58367") ? false : (stryCov_9fa48("58367", "58368"), (stryMutAct_9fa48("58370") ? primaryRow?.publication_kind && primaryRow?.publicationKind : stryMutAct_9fa48("58369") ? false : (stryCov_9fa48("58369", "58370"), (stryMutAct_9fa48("58371") ? primaryRow.publication_kind : (stryCov_9fa48("58371"), primaryRow?.publication_kind)) || (stryMutAct_9fa48("58372") ? primaryRow.publicationKind : (stryCov_9fa48("58372"), primaryRow?.publicationKind)))) || (stryMutAct_9fa48("58373") ? secondaryRow.publication_kind : (stryCov_9fa48("58373"), secondaryRow?.publication_kind)))) || (stryMutAct_9fa48("58374") ? secondaryRow.publicationKind : (stryCov_9fa48("58374"), secondaryRow?.publicationKind)))) || null),
      publication_epoch: stryMutAct_9fa48("58375") ? normalizePublicationPositiveInteger(primaryRow?.publication_epoch ?? primaryRow?.publicationEpoch, null) && normalizePublicationPositiveInteger(secondaryRow?.publication_epoch ?? secondaryRow?.publicationEpoch, 1) : (stryCov_9fa48("58375"), normalizePublicationPositiveInteger(stryMutAct_9fa48("58376") ? primaryRow?.publication_epoch && primaryRow?.publicationEpoch : (stryCov_9fa48("58376"), (stryMutAct_9fa48("58377") ? primaryRow.publication_epoch : (stryCov_9fa48("58377"), primaryRow?.publication_epoch)) ?? (stryMutAct_9fa48("58378") ? primaryRow.publicationEpoch : (stryCov_9fa48("58378"), primaryRow?.publicationEpoch))), null) ?? normalizePublicationPositiveInteger(stryMutAct_9fa48("58379") ? secondaryRow?.publication_epoch && secondaryRow?.publicationEpoch : (stryCov_9fa48("58379"), (stryMutAct_9fa48("58380") ? secondaryRow.publication_epoch : (stryCov_9fa48("58380"), secondaryRow?.publication_epoch)) ?? (stryMutAct_9fa48("58381") ? secondaryRow.publicationEpoch : (stryCov_9fa48("58381"), secondaryRow?.publicationEpoch))), 1)),
      publisher_node_id: readPreferredPublicationField(latestRow, fallbackRow, stryMutAct_9fa48("58382") ? "" : (stryCov_9fa48("58382"), 'publisher_node_id'), stryMutAct_9fa48("58383") ? "" : (stryCov_9fa48("58383"), 'publisherNodeId')),
      source_topology_epoch: readPreferredPublicationField(latestRow, fallbackRow, stryMutAct_9fa48("58384") ? "" : (stryCov_9fa48("58384"), 'source_topology_epoch'), stryMutAct_9fa48("58385") ? "" : (stryCov_9fa48("58385"), 'sourceTopologyEpoch')),
      source_snapshot_version: readPreferredPublicationField(latestRow, fallbackRow, stryMutAct_9fa48("58386") ? "" : (stryCov_9fa48("58386"), 'source_snapshot_version'), stryMutAct_9fa48("58387") ? "" : (stryCov_9fa48("58387"), 'sourceSnapshotVersion')),
      published_active_node_ids: publishedActiveNodeIds,
      required_ack_node_ids: requiredAckNodeIds,
      acknowledged_node_ids: acknowledgedNodeIds,
      priority_partition_summary: readPreferredPublicationField(latestRow, fallbackRow, stryMutAct_9fa48("58388") ? "" : (stryCov_9fa48("58388"), 'priority_partition_summary'), stryMutAct_9fa48("58389") ? "" : (stryCov_9fa48("58389"), 'priorityPartitionSummary')),
      membership_lifecycle_summary: readPreferredPublicationField(latestRow, fallbackRow, stryMutAct_9fa48("58390") ? "" : (stryCov_9fa48("58390"), 'membership_lifecycle_summary'), stryMutAct_9fa48("58391") ? "" : (stryCov_9fa48("58391"), 'membershipLifecycleSummary')),
      status,
      reason_code: stryMutAct_9fa48("58394") ? readPreferredPublicationField(latestRow, fallbackRow, 'reason_code', 'reasonCode') && '' : stryMutAct_9fa48("58393") ? false : stryMutAct_9fa48("58392") ? true : (stryCov_9fa48("58392", "58393", "58394"), readPreferredPublicationField(latestRow, fallbackRow, stryMutAct_9fa48("58395") ? "" : (stryCov_9fa48("58395"), 'reason_code'), stryMutAct_9fa48("58396") ? "" : (stryCov_9fa48("58396"), 'reasonCode')) || (stryMutAct_9fa48("58397") ? "Stryker was here!" : (stryCov_9fa48("58397"), ''))),
      created_at: createdAt,
      updated_at: updatedAt,
      published_at: publishedAt,
      closed_at: closedAt,
      transition_history: stryMutAct_9fa48("58400") ? readPreferredPublicationField(latestRow, fallbackRow, 'transition_history', 'transitionHistory') && [] : stryMutAct_9fa48("58399") ? false : stryMutAct_9fa48("58398") ? true : (stryCov_9fa48("58398", "58399", "58400"), readPreferredPublicationField(latestRow, fallbackRow, stryMutAct_9fa48("58401") ? "" : (stryCov_9fa48("58401"), 'transition_history'), stryMutAct_9fa48("58402") ? "" : (stryCov_9fa48("58402"), 'transitionHistory')) || (stryMutAct_9fa48("58403") ? ["Stryker was here"] : (stryCov_9fa48("58403"), [])))
    }));
  }
}
function publicationRowSatisfiesDesiredState(actualRow, desiredRow) {
  if (stryMutAct_9fa48("58404")) {
    {}
  } else {
    stryCov_9fa48("58404");
    if (stryMutAct_9fa48("58407") ? !actualRow && !desiredRow : stryMutAct_9fa48("58406") ? false : stryMutAct_9fa48("58405") ? true : (stryCov_9fa48("58405", "58406", "58407"), (stryMutAct_9fa48("58408") ? actualRow : (stryCov_9fa48("58408"), !actualRow)) || (stryMutAct_9fa48("58409") ? desiredRow : (stryCov_9fa48("58409"), !desiredRow)))) {
      if (stryMutAct_9fa48("58410")) {
        {}
      } else {
        stryCov_9fa48("58410");
        return stryMutAct_9fa48("58411") ? true : (stryCov_9fa48("58411"), false);
      }
    }
    const actual = normalizeControlPlanePublicationRow(actualRow);
    const desired = normalizeControlPlanePublicationRow(desiredRow);
    if (stryMutAct_9fa48("58414") ? actual.publicationId === desired.publicationId : stryMutAct_9fa48("58413") ? false : stryMutAct_9fa48("58412") ? true : (stryCov_9fa48("58412", "58413", "58414"), actual.publicationId !== desired.publicationId)) {
      if (stryMutAct_9fa48("58415")) {
        {}
      } else {
        stryCov_9fa48("58415");
        return stryMutAct_9fa48("58416") ? true : (stryCov_9fa48("58416"), false);
      }
    }
    if (stryMutAct_9fa48("58419") ? false : stryMutAct_9fa48("58418") ? true : stryMutAct_9fa48("58417") ? doesPublicationNodeListCover(actual.publishedActiveNodeIds, desired.publishedActiveNodeIds) : (stryCov_9fa48("58417", "58418", "58419"), !doesPublicationNodeListCover(actual.publishedActiveNodeIds, desired.publishedActiveNodeIds))) {
      if (stryMutAct_9fa48("58420")) {
        {}
      } else {
        stryCov_9fa48("58420");
        return stryMutAct_9fa48("58421") ? true : (stryCov_9fa48("58421"), false);
      }
    }
    if (stryMutAct_9fa48("58424") ? false : stryMutAct_9fa48("58423") ? true : stryMutAct_9fa48("58422") ? doesPublicationNodeListCover(actual.requiredAckNodeIds, desired.requiredAckNodeIds) : (stryCov_9fa48("58422", "58423", "58424"), !doesPublicationNodeListCover(actual.requiredAckNodeIds, desired.requiredAckNodeIds))) {
      if (stryMutAct_9fa48("58425")) {
        {}
      } else {
        stryCov_9fa48("58425");
        return stryMutAct_9fa48("58426") ? true : (stryCov_9fa48("58426"), false);
      }
    }
    if (stryMutAct_9fa48("58429") ? false : stryMutAct_9fa48("58428") ? true : stryMutAct_9fa48("58427") ? doesPublicationNodeListCover(actual.acknowledgedNodeIds, desired.acknowledgedNodeIds) : (stryCov_9fa48("58427", "58428", "58429"), !doesPublicationNodeListCover(actual.acknowledgedNodeIds, desired.acknowledgedNodeIds))) {
      if (stryMutAct_9fa48("58430")) {
        {}
      } else {
        stryCov_9fa48("58430");
        return stryMutAct_9fa48("58431") ? true : (stryCov_9fa48("58431"), false);
      }
    }
    if (stryMutAct_9fa48("58434") ? desired.priorityPartitionSummary || JSON.stringify(actual.priorityPartitionSummary || null) !== JSON.stringify(desired.priorityPartitionSummary) : stryMutAct_9fa48("58433") ? false : stryMutAct_9fa48("58432") ? true : (stryCov_9fa48("58432", "58433", "58434"), desired.priorityPartitionSummary && (stryMutAct_9fa48("58436") ? JSON.stringify(actual.priorityPartitionSummary || null) === JSON.stringify(desired.priorityPartitionSummary) : stryMutAct_9fa48("58435") ? true : (stryCov_9fa48("58435", "58436"), JSON.stringify(stryMutAct_9fa48("58439") ? actual.priorityPartitionSummary && null : stryMutAct_9fa48("58438") ? false : stryMutAct_9fa48("58437") ? true : (stryCov_9fa48("58437", "58438", "58439"), actual.priorityPartitionSummary || null)) !== JSON.stringify(desired.priorityPartitionSummary))))) {
      if (stryMutAct_9fa48("58440")) {
        {}
      } else {
        stryCov_9fa48("58440");
        return stryMutAct_9fa48("58441") ? true : (stryCov_9fa48("58441"), false);
      }
    }
    if (stryMutAct_9fa48("58444") ? desired.status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("58443") ? false : stryMutAct_9fa48("58442") ? true : (stryCov_9fa48("58442", "58443", "58444"), desired.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) {
      if (stryMutAct_9fa48("58445")) {
        {}
      } else {
        stryCov_9fa48("58445");
        return stryMutAct_9fa48("58448") ? actual.status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("58447") ? false : stryMutAct_9fa48("58446") ? true : (stryCov_9fa48("58446", "58447", "58448"), actual.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED);
      }
    }
    if (stryMutAct_9fa48("58451") ? desired.status !== CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("58450") ? false : stryMutAct_9fa48("58449") ? true : (stryCov_9fa48("58449", "58450", "58451"), desired.status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED)) {
      if (stryMutAct_9fa48("58452")) {
        {}
      } else {
        stryCov_9fa48("58452");
        return stryMutAct_9fa48("58455") ? actual.status !== CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED : stryMutAct_9fa48("58454") ? false : stryMutAct_9fa48("58453") ? true : (stryCov_9fa48("58453", "58454", "58455"), actual.status === CONTROL_PLANE_PUBLICATION_STATUS.SUPERSEDED);
      }
    }
    if (stryMutAct_9fa48("58458") ? desired.status !== CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("58457") ? false : stryMutAct_9fa48("58456") ? true : (stryCov_9fa48("58456", "58457", "58458"), desired.status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED)) {
      if (stryMutAct_9fa48("58459")) {
        {}
      } else {
        stryCov_9fa48("58459");
        return stryMutAct_9fa48("58462") ? actual.status !== CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED : stryMutAct_9fa48("58461") ? false : stryMutAct_9fa48("58460") ? true : (stryCov_9fa48("58460", "58461", "58462"), actual.status === CONTROL_PLANE_PUBLICATION_STATUS.ABANDONED);
      }
    }
    return stryMutAct_9fa48("58463") ? false : (stryCov_9fa48("58463"), true);
  }
}
export { CONTROL_PLANE_PUBLICATION_STATUS, mergeControlPlanePublicationRows, normalizePublicationNodeIdList, publicationRowSatisfiesDesiredState };