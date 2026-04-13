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
import { COLUMN, ENDPOINT_STATUS, NUM, SERVICE_STATUS, STATE, TRANSPORT_TYPE, TYPEOF } from '../constants/index.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from './control-plane-readiness-constants.js';
import { normalizeNodeEndpointRow, normalizeNodeRow, normalizeControlPlanePublicationRow, normalizeServiceRow } from './system-row-normalizers.js';
import { CONTROL_PLANE_PUBLICATION_STATUS } from './control-plane-publication-merge.js';
const MEMBERSHIP_PUBLICATION_KIND = stryMutAct_9fa48("55350") ? "" : (stryCov_9fa48("55350"), 'cluster_membership');
const ACTIVE_NODE_HEARTBEAT_GRACE_MS = 60000;
const MEMBERSHIP_FREEZE_DEFAULT = Object.freeze(stryMutAct_9fa48("55351") ? {} : (stryCov_9fa48("55351"), {
  MIN_PUBLISHED_NODE_COUNT: 3,
  MIN_SUSPECTED_NODE_COUNT: 2,
  MIN_SUSPECTED_RATIO: 0.5
}));
const PROJECTION_READINESS_DECISION_MODE = Object.freeze(stryMutAct_9fa48("55352") ? {} : (stryCov_9fa48("55352"), {
  CLUSTER_MEMBER_HEALTHY_ONLY: stryMutAct_9fa48("55353") ? "" : (stryCov_9fa48("55353"), 'cluster_member_healthy_only'),
  CLUSTER_MEMBER_OR_RECOVERY_ELIGIBLE: stryMutAct_9fa48("55354") ? "" : (stryCov_9fa48("55354"), 'cluster_member_or_recovery_eligible')
}));
const ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE = Object.freeze(stryMutAct_9fa48("55355") ? {} : (stryCov_9fa48("55355"), {
  PUBLISHED_MEMBERSHIP: stryMutAct_9fa48("55356") ? "" : (stryCov_9fa48("55356"), 'published_membership'),
  LOCALLY_ELIGIBLE_PROJECTION: stryMutAct_9fa48("55357") ? "" : (stryCov_9fa48("55357"), 'locally_eligible_projection'),
  PROJECTED_SERVING: stryMutAct_9fa48("55358") ? "" : (stryCov_9fa48("55358"), 'projected_serving_projection'),
  RECOVERY_ELIGIBLE_PROJECTION: stryMutAct_9fa48("55359") ? "" : (stryCov_9fa48("55359"), 'recovery_eligible_projection'),
  NONE: stryMutAct_9fa48("55360") ? "" : (stryCov_9fa48("55360"), 'none')
}));
function normalizeNodeIdList(values = stryMutAct_9fa48("55361") ? ["Stryker was here"] : (stryCov_9fa48("55361"), [])) {
  if (stryMutAct_9fa48("55362")) {
    {}
  } else {
    stryCov_9fa48("55362");
    return stryMutAct_9fa48("55363") ? [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(value => value.length > NUM.ZERO))] : (stryCov_9fa48("55363"), (stryMutAct_9fa48("55364") ? [] : (stryCov_9fa48("55364"), [...new Set(stryMutAct_9fa48("55365") ? (Array.isArray(values) ? values : []).map(value => String(value || '').trim()) : (stryCov_9fa48("55365"), (Array.isArray(values) ? values : stryMutAct_9fa48("55366") ? ["Stryker was here"] : (stryCov_9fa48("55366"), [])).map(stryMutAct_9fa48("55367") ? () => undefined : (stryCov_9fa48("55367"), value => stryMutAct_9fa48("55368") ? String(value || '') : (stryCov_9fa48("55368"), String(stryMutAct_9fa48("55371") ? value && '' : stryMutAct_9fa48("55370") ? false : stryMutAct_9fa48("55369") ? true : (stryCov_9fa48("55369", "55370", "55371"), value || (stryMutAct_9fa48("55372") ? "Stryker was here!" : (stryCov_9fa48("55372"), '')))).trim()))).filter(stryMutAct_9fa48("55373") ? () => undefined : (stryCov_9fa48("55373"), value => stryMutAct_9fa48("55377") ? value.length <= NUM.ZERO : stryMutAct_9fa48("55376") ? value.length >= NUM.ZERO : stryMutAct_9fa48("55375") ? false : stryMutAct_9fa48("55374") ? true : (stryCov_9fa48("55374", "55375", "55376", "55377"), value.length > NUM.ZERO)))))])).sort());
  }
}
function readPublicationOrderingValue(row, keys = stryMutAct_9fa48("55378") ? ["Stryker was here"] : (stryCov_9fa48("55378"), [])) {
  if (stryMutAct_9fa48("55379")) {
    {}
  } else {
    stryCov_9fa48("55379");
    for (const key of keys) {
      if (stryMutAct_9fa48("55380")) {
        {}
      } else {
        stryCov_9fa48("55380");
        const value = Number(stryMutAct_9fa48("55381") ? row[key] : (stryCov_9fa48("55381"), row?.[key]));
        if (stryMutAct_9fa48("55383") ? false : stryMutAct_9fa48("55382") ? true : (stryCov_9fa48("55382", "55383"), Number.isFinite(value))) {
          if (stryMutAct_9fa48("55384")) {
            {}
          } else {
            stryCov_9fa48("55384");
            return value;
          }
        }
      }
    }
    return NUM.ZERO;
  }
}
function isMembershipPublicationRow(row) {
  if (stryMutAct_9fa48("55385")) {
    {}
  } else {
    stryCov_9fa48("55385");
    const publicationKind = stryMutAct_9fa48("55386") ? String(row?.publicationKind || '').toUpperCase() : (stryCov_9fa48("55386"), String(stryMutAct_9fa48("55389") ? row?.publicationKind && '' : stryMutAct_9fa48("55388") ? false : stryMutAct_9fa48("55387") ? true : (stryCov_9fa48("55387", "55388", "55389"), (stryMutAct_9fa48("55390") ? row.publicationKind : (stryCov_9fa48("55390"), row?.publicationKind)) || (stryMutAct_9fa48("55391") ? "Stryker was here!" : (stryCov_9fa48("55391"), '')))).toLowerCase());
    return stryMutAct_9fa48("55394") ? publicationKind.length === NUM.ZERO && publicationKind === MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("55393") ? false : stryMutAct_9fa48("55392") ? true : (stryCov_9fa48("55392", "55393", "55394"), (stryMutAct_9fa48("55396") ? publicationKind.length !== NUM.ZERO : stryMutAct_9fa48("55395") ? false : (stryCov_9fa48("55395", "55396"), publicationKind.length === NUM.ZERO)) || (stryMutAct_9fa48("55398") ? publicationKind !== MEMBERSHIP_PUBLICATION_KIND : stryMutAct_9fa48("55397") ? false : (stryCov_9fa48("55397", "55398"), publicationKind === MEMBERSHIP_PUBLICATION_KIND)));
  }
}
function resolveLatestPublicationRow(options = {}) {
  if (stryMutAct_9fa48("55399")) {
    {}
  } else {
    stryCov_9fa48("55399");
    const publicationRows = stryMutAct_9fa48("55401") ? (Array.isArray(options.publicationRows) ? options.publicationRows : []).map(row => normalizeControlPlanePublicationRow(row)).filter(row => isMembershipPublicationRow(row)) : stryMutAct_9fa48("55400") ? (Array.isArray(options.publicationRows) ? options.publicationRows : []).filter(row => row && typeof row === TYPEOF.OBJECT).map(row => normalizeControlPlanePublicationRow(row)) : (stryCov_9fa48("55400", "55401"), (Array.isArray(options.publicationRows) ? options.publicationRows : stryMutAct_9fa48("55402") ? ["Stryker was here"] : (stryCov_9fa48("55402"), [])).filter(stryMutAct_9fa48("55403") ? () => undefined : (stryCov_9fa48("55403"), row => stryMutAct_9fa48("55406") ? row || typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("55405") ? false : stryMutAct_9fa48("55404") ? true : (stryCov_9fa48("55404", "55405", "55406"), row && (stryMutAct_9fa48("55408") ? typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("55407") ? true : (stryCov_9fa48("55407", "55408"), typeof row === TYPEOF.OBJECT))))).map(stryMutAct_9fa48("55409") ? () => undefined : (stryCov_9fa48("55409"), row => normalizeControlPlanePublicationRow(row))).filter(stryMutAct_9fa48("55410") ? () => undefined : (stryCov_9fa48("55410"), row => isMembershipPublicationRow(row))));
    const explicitPublicationRow = (stryMutAct_9fa48("55413") ? options.latestPublicationRow || typeof options.latestPublicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("55412") ? false : stryMutAct_9fa48("55411") ? true : (stryCov_9fa48("55411", "55412", "55413"), options.latestPublicationRow && (stryMutAct_9fa48("55415") ? typeof options.latestPublicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("55414") ? true : (stryCov_9fa48("55414", "55415"), typeof options.latestPublicationRow === TYPEOF.OBJECT)))) ? normalizeControlPlanePublicationRow(options.latestPublicationRow) : null;
    if (stryMutAct_9fa48("55418") ? explicitPublicationRow && isMembershipPublicationRow(explicitPublicationRow) || explicitPublicationRow.publicationId || explicitPublicationRow.publicationEpoch > NUM.ZERO || explicitPublicationRow.status : stryMutAct_9fa48("55417") ? false : stryMutAct_9fa48("55416") ? true : (stryCov_9fa48("55416", "55417", "55418"), (stryMutAct_9fa48("55420") ? explicitPublicationRow || isMembershipPublicationRow(explicitPublicationRow) : stryMutAct_9fa48("55419") ? true : (stryCov_9fa48("55419", "55420"), explicitPublicationRow && isMembershipPublicationRow(explicitPublicationRow))) && (stryMutAct_9fa48("55422") ? (explicitPublicationRow.publicationId || explicitPublicationRow.publicationEpoch > NUM.ZERO) && explicitPublicationRow.status : stryMutAct_9fa48("55421") ? true : (stryCov_9fa48("55421", "55422"), (stryMutAct_9fa48("55424") ? explicitPublicationRow.publicationId && explicitPublicationRow.publicationEpoch > NUM.ZERO : stryMutAct_9fa48("55423") ? false : (stryCov_9fa48("55423", "55424"), explicitPublicationRow.publicationId || (stryMutAct_9fa48("55427") ? explicitPublicationRow.publicationEpoch <= NUM.ZERO : stryMutAct_9fa48("55426") ? explicitPublicationRow.publicationEpoch >= NUM.ZERO : stryMutAct_9fa48("55425") ? false : (stryCov_9fa48("55425", "55426", "55427"), explicitPublicationRow.publicationEpoch > NUM.ZERO)))) || explicitPublicationRow.status)))) {
      if (stryMutAct_9fa48("55428")) {
        {}
      } else {
        stryCov_9fa48("55428");
        publicationRows.push(explicitPublicationRow);
      }
    }
    if (stryMutAct_9fa48("55431") ? publicationRows.length !== NUM.ZERO : stryMutAct_9fa48("55430") ? false : stryMutAct_9fa48("55429") ? true : (stryCov_9fa48("55429", "55430", "55431"), publicationRows.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("55432")) {
        {}
      } else {
        stryCov_9fa48("55432");
        return null;
      }
    }
    stryMutAct_9fa48("55433") ? publicationRows : (stryCov_9fa48("55433"), publicationRows.sort((left, right) => {
      if (stryMutAct_9fa48("55434")) {
        {}
      } else {
        stryCov_9fa48("55434");
        const publicationEpochDelta = stryMutAct_9fa48("55435") ? readPublicationOrderingValue(right, ['publicationEpoch', 'publication_epoch']) + readPublicationOrderingValue(left, ['publicationEpoch', 'publication_epoch']) : (stryCov_9fa48("55435"), readPublicationOrderingValue(right, stryMutAct_9fa48("55436") ? [] : (stryCov_9fa48("55436"), [stryMutAct_9fa48("55437") ? "" : (stryCov_9fa48("55437"), 'publicationEpoch'), stryMutAct_9fa48("55438") ? "" : (stryCov_9fa48("55438"), 'publication_epoch')])) - readPublicationOrderingValue(left, stryMutAct_9fa48("55439") ? [] : (stryCov_9fa48("55439"), [stryMutAct_9fa48("55440") ? "" : (stryCov_9fa48("55440"), 'publicationEpoch'), stryMutAct_9fa48("55441") ? "" : (stryCov_9fa48("55441"), 'publication_epoch')])));
        if (stryMutAct_9fa48("55444") ? publicationEpochDelta === NUM.ZERO : stryMutAct_9fa48("55443") ? false : stryMutAct_9fa48("55442") ? true : (stryCov_9fa48("55442", "55443", "55444"), publicationEpochDelta !== NUM.ZERO)) {
          if (stryMutAct_9fa48("55445")) {
            {}
          } else {
            stryCov_9fa48("55445");
            return publicationEpochDelta;
          }
        }
        const publishedAtDelta = stryMutAct_9fa48("55446") ? readPublicationOrderingValue(right, ['publishedAt', 'published_at']) + readPublicationOrderingValue(left, ['publishedAt', 'published_at']) : (stryCov_9fa48("55446"), readPublicationOrderingValue(right, stryMutAct_9fa48("55447") ? [] : (stryCov_9fa48("55447"), [stryMutAct_9fa48("55448") ? "" : (stryCov_9fa48("55448"), 'publishedAt'), stryMutAct_9fa48("55449") ? "" : (stryCov_9fa48("55449"), 'published_at')])) - readPublicationOrderingValue(left, stryMutAct_9fa48("55450") ? [] : (stryCov_9fa48("55450"), [stryMutAct_9fa48("55451") ? "" : (stryCov_9fa48("55451"), 'publishedAt'), stryMutAct_9fa48("55452") ? "" : (stryCov_9fa48("55452"), 'published_at')])));
        if (stryMutAct_9fa48("55455") ? publishedAtDelta === NUM.ZERO : stryMutAct_9fa48("55454") ? false : stryMutAct_9fa48("55453") ? true : (stryCov_9fa48("55453", "55454", "55455"), publishedAtDelta !== NUM.ZERO)) {
          if (stryMutAct_9fa48("55456")) {
            {}
          } else {
            stryCov_9fa48("55456");
            return publishedAtDelta;
          }
        }
        return stryMutAct_9fa48("55457") ? readPublicationOrderingValue(right, ['updatedAt', 'updated_at']) + readPublicationOrderingValue(left, ['updatedAt', 'updated_at']) : (stryCov_9fa48("55457"), readPublicationOrderingValue(right, stryMutAct_9fa48("55458") ? [] : (stryCov_9fa48("55458"), [stryMutAct_9fa48("55459") ? "" : (stryCov_9fa48("55459"), 'updatedAt'), stryMutAct_9fa48("55460") ? "" : (stryCov_9fa48("55460"), 'updated_at')])) - readPublicationOrderingValue(left, stryMutAct_9fa48("55461") ? [] : (stryCov_9fa48("55461"), [stryMutAct_9fa48("55462") ? "" : (stryCov_9fa48("55462"), 'updatedAt'), stryMutAct_9fa48("55463") ? "" : (stryCov_9fa48("55463"), 'updated_at')])));
      }
    }));
    return stryMutAct_9fa48("55466") ? publicationRows[0] && null : stryMutAct_9fa48("55465") ? false : stryMutAct_9fa48("55464") ? true : (stryCov_9fa48("55464", "55465", "55466"), publicationRows[0] || null);
  }
}
function resolveLatestPublishedPublicationRow(options = {}) {
  if (stryMutAct_9fa48("55467")) {
    {}
  } else {
    stryCov_9fa48("55467");
    const publicationRows = stryMutAct_9fa48("55469") ? (Array.isArray(options.publicationRows) ? options.publicationRows : []).map(row => normalizeControlPlanePublicationRow(row)).filter(row => isMembershipPublicationRow(row)) : stryMutAct_9fa48("55468") ? (Array.isArray(options.publicationRows) ? options.publicationRows : []).filter(row => row && typeof row === TYPEOF.OBJECT).map(row => normalizeControlPlanePublicationRow(row)) : (stryCov_9fa48("55468", "55469"), (Array.isArray(options.publicationRows) ? options.publicationRows : stryMutAct_9fa48("55470") ? ["Stryker was here"] : (stryCov_9fa48("55470"), [])).filter(stryMutAct_9fa48("55471") ? () => undefined : (stryCov_9fa48("55471"), row => stryMutAct_9fa48("55474") ? row || typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("55473") ? false : stryMutAct_9fa48("55472") ? true : (stryCov_9fa48("55472", "55473", "55474"), row && (stryMutAct_9fa48("55476") ? typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("55475") ? true : (stryCov_9fa48("55475", "55476"), typeof row === TYPEOF.OBJECT))))).map(stryMutAct_9fa48("55477") ? () => undefined : (stryCov_9fa48("55477"), row => normalizeControlPlanePublicationRow(row))).filter(stryMutAct_9fa48("55478") ? () => undefined : (stryCov_9fa48("55478"), row => isMembershipPublicationRow(row))));
    const explicitPublishedPublicationRow = (stryMutAct_9fa48("55481") ? options.latestPublishedPublicationRow || typeof options.latestPublishedPublicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("55480") ? false : stryMutAct_9fa48("55479") ? true : (stryCov_9fa48("55479", "55480", "55481"), options.latestPublishedPublicationRow && (stryMutAct_9fa48("55483") ? typeof options.latestPublishedPublicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("55482") ? true : (stryCov_9fa48("55482", "55483"), typeof options.latestPublishedPublicationRow === TYPEOF.OBJECT)))) ? normalizeControlPlanePublicationRow(options.latestPublishedPublicationRow) : null;
    const explicitPublicationRow = (stryMutAct_9fa48("55486") ? options.latestPublicationRow || typeof options.latestPublicationRow === TYPEOF.OBJECT : stryMutAct_9fa48("55485") ? false : stryMutAct_9fa48("55484") ? true : (stryCov_9fa48("55484", "55485", "55486"), options.latestPublicationRow && (stryMutAct_9fa48("55488") ? typeof options.latestPublicationRow !== TYPEOF.OBJECT : stryMutAct_9fa48("55487") ? true : (stryCov_9fa48("55487", "55488"), typeof options.latestPublicationRow === TYPEOF.OBJECT)))) ? normalizeControlPlanePublicationRow(options.latestPublicationRow) : null;
    if (stryMutAct_9fa48("55491") ? explicitPublishedPublicationRow && isMembershipPublicationRow(explicitPublishedPublicationRow) && (explicitPublishedPublicationRow.publicationId || explicitPublishedPublicationRow.publicationEpoch > NUM.ZERO || explicitPublishedPublicationRow.status) || explicitPublishedPublicationRow.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("55490") ? false : stryMutAct_9fa48("55489") ? true : (stryCov_9fa48("55489", "55490", "55491"), (stryMutAct_9fa48("55493") ? explicitPublishedPublicationRow && isMembershipPublicationRow(explicitPublishedPublicationRow) || explicitPublishedPublicationRow.publicationId || explicitPublishedPublicationRow.publicationEpoch > NUM.ZERO || explicitPublishedPublicationRow.status : stryMutAct_9fa48("55492") ? true : (stryCov_9fa48("55492", "55493"), (stryMutAct_9fa48("55495") ? explicitPublishedPublicationRow || isMembershipPublicationRow(explicitPublishedPublicationRow) : stryMutAct_9fa48("55494") ? true : (stryCov_9fa48("55494", "55495"), explicitPublishedPublicationRow && isMembershipPublicationRow(explicitPublishedPublicationRow))) && (stryMutAct_9fa48("55497") ? (explicitPublishedPublicationRow.publicationId || explicitPublishedPublicationRow.publicationEpoch > NUM.ZERO) && explicitPublishedPublicationRow.status : stryMutAct_9fa48("55496") ? true : (stryCov_9fa48("55496", "55497"), (stryMutAct_9fa48("55499") ? explicitPublishedPublicationRow.publicationId && explicitPublishedPublicationRow.publicationEpoch > NUM.ZERO : stryMutAct_9fa48("55498") ? false : (stryCov_9fa48("55498", "55499"), explicitPublishedPublicationRow.publicationId || (stryMutAct_9fa48("55502") ? explicitPublishedPublicationRow.publicationEpoch <= NUM.ZERO : stryMutAct_9fa48("55501") ? explicitPublishedPublicationRow.publicationEpoch >= NUM.ZERO : stryMutAct_9fa48("55500") ? false : (stryCov_9fa48("55500", "55501", "55502"), explicitPublishedPublicationRow.publicationEpoch > NUM.ZERO)))) || explicitPublishedPublicationRow.status)))) && (stryMutAct_9fa48("55504") ? explicitPublishedPublicationRow.status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("55503") ? true : (stryCov_9fa48("55503", "55504"), explicitPublishedPublicationRow.status === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)))) {
      if (stryMutAct_9fa48("55505")) {
        {}
      } else {
        stryCov_9fa48("55505");
        publicationRows.push(explicitPublishedPublicationRow);
      }
    }
    if (stryMutAct_9fa48("55508") ? explicitPublicationRow && isMembershipPublicationRow(explicitPublicationRow) || explicitPublicationRow.publicationId || explicitPublicationRow.publicationEpoch > NUM.ZERO || explicitPublicationRow.status : stryMutAct_9fa48("55507") ? false : stryMutAct_9fa48("55506") ? true : (stryCov_9fa48("55506", "55507", "55508"), (stryMutAct_9fa48("55510") ? explicitPublicationRow || isMembershipPublicationRow(explicitPublicationRow) : stryMutAct_9fa48("55509") ? true : (stryCov_9fa48("55509", "55510"), explicitPublicationRow && isMembershipPublicationRow(explicitPublicationRow))) && (stryMutAct_9fa48("55512") ? (explicitPublicationRow.publicationId || explicitPublicationRow.publicationEpoch > NUM.ZERO) && explicitPublicationRow.status : stryMutAct_9fa48("55511") ? true : (stryCov_9fa48("55511", "55512"), (stryMutAct_9fa48("55514") ? explicitPublicationRow.publicationId && explicitPublicationRow.publicationEpoch > NUM.ZERO : stryMutAct_9fa48("55513") ? false : (stryCov_9fa48("55513", "55514"), explicitPublicationRow.publicationId || (stryMutAct_9fa48("55517") ? explicitPublicationRow.publicationEpoch <= NUM.ZERO : stryMutAct_9fa48("55516") ? explicitPublicationRow.publicationEpoch >= NUM.ZERO : stryMutAct_9fa48("55515") ? false : (stryCov_9fa48("55515", "55516", "55517"), explicitPublicationRow.publicationEpoch > NUM.ZERO)))) || explicitPublicationRow.status)))) {
      if (stryMutAct_9fa48("55518")) {
        {}
      } else {
        stryCov_9fa48("55518");
        publicationRows.push(explicitPublicationRow);
      }
    }
    return resolveLatestPublicationRow(stryMutAct_9fa48("55519") ? {} : (stryCov_9fa48("55519"), {
      publicationRows: stryMutAct_9fa48("55520") ? publicationRows : (stryCov_9fa48("55520"), publicationRows.filter(stryMutAct_9fa48("55521") ? () => undefined : (stryCov_9fa48("55521"), row => stryMutAct_9fa48("55524") ? row?.status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("55523") ? false : stryMutAct_9fa48("55522") ? true : (stryCov_9fa48("55522", "55523", "55524"), (stryMutAct_9fa48("55525") ? row.status : (stryCov_9fa48("55525"), row?.status)) === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED))))
    }));
  }
}
function resolvePublishedActiveNodeIds(options = {}) {
  if (stryMutAct_9fa48("55526")) {
    {}
  } else {
    stryCov_9fa48("55526");
    const latestPublicationRow = resolveLatestPublicationRow(options);
    const publishedPublicationRow = (stryMutAct_9fa48("55529") ? latestPublicationRow?.status !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED : stryMutAct_9fa48("55528") ? false : stryMutAct_9fa48("55527") ? true : (stryCov_9fa48("55527", "55528", "55529"), (stryMutAct_9fa48("55530") ? latestPublicationRow.status : (stryCov_9fa48("55530"), latestPublicationRow?.status)) === CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED)) ? latestPublicationRow : resolveLatestPublishedPublicationRow(options);
    const durablePublishedMembershipCandidate = stryMutAct_9fa48("55533") ? publishedPublicationRow && buildMembershipPublicationActiveSnapshot(latestPublicationRow) : stryMutAct_9fa48("55532") ? false : stryMutAct_9fa48("55531") ? true : (stryCov_9fa48("55531", "55532", "55533"), publishedPublicationRow || buildMembershipPublicationActiveSnapshot(latestPublicationRow));
    if (stryMutAct_9fa48("55536") ? false : stryMutAct_9fa48("55535") ? true : stryMutAct_9fa48("55534") ? durablePublishedMembershipCandidate : (stryCov_9fa48("55534", "55535", "55536"), !durablePublishedMembershipCandidate)) {
      if (stryMutAct_9fa48("55537")) {
        {}
      } else {
        stryCov_9fa48("55537");
        return (stryMutAct_9fa48("55540") ? options.requirePublishedMembership !== true : stryMutAct_9fa48("55539") ? false : stryMutAct_9fa48("55538") ? true : (stryCov_9fa48("55538", "55539", "55540"), options.requirePublishedMembership === (stryMutAct_9fa48("55541") ? false : (stryCov_9fa48("55541"), true)))) ? Object.freeze(stryMutAct_9fa48("55542") ? ["Stryker was here"] : (stryCov_9fa48("55542"), [])) : null;
      }
    }
    const publishedActiveNodeIds = Array.isArray(durablePublishedMembershipCandidate.publishedActiveNodeIds) ? durablePublishedMembershipCandidate.publishedActiveNodeIds : stryMutAct_9fa48("55543") ? ["Stryker was here"] : (stryCov_9fa48("55543"), []);
    if (stryMutAct_9fa48("55546") ? publishedActiveNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("55545") ? false : stryMutAct_9fa48("55544") ? true : (stryCov_9fa48("55544", "55545", "55546"), publishedActiveNodeIds.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("55547")) {
        {}
      } else {
        stryCov_9fa48("55547");
        return (stryMutAct_9fa48("55550") ? durablePublishedMembershipCandidate.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("55549") ? false : stryMutAct_9fa48("55548") ? true : (stryCov_9fa48("55548", "55549", "55550"), durablePublishedMembershipCandidate.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("55551") ? false : (stryCov_9fa48("55551"), true)))) ? Object.freeze(stryMutAct_9fa48("55552") ? ["Stryker was here"] : (stryCov_9fa48("55552"), [])) : (stryMutAct_9fa48("55555") ? options.requirePublishedMembership !== true : stryMutAct_9fa48("55554") ? false : stryMutAct_9fa48("55553") ? true : (stryCov_9fa48("55553", "55554", "55555"), options.requirePublishedMembership === (stryMutAct_9fa48("55556") ? false : (stryCov_9fa48("55556"), true)))) ? Object.freeze(stryMutAct_9fa48("55557") ? ["Stryker was here"] : (stryCov_9fa48("55557"), [])) : null;
      }
    }
    return Object.freeze(stryMutAct_9fa48("55558") ? [...new Set(publishedActiveNodeIds.filter(nodeId => typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO))] : (stryCov_9fa48("55558"), (stryMutAct_9fa48("55559") ? [] : (stryCov_9fa48("55559"), [...new Set(stryMutAct_9fa48("55560") ? publishedActiveNodeIds : (stryCov_9fa48("55560"), publishedActiveNodeIds.filter(stryMutAct_9fa48("55561") ? () => undefined : (stryCov_9fa48("55561"), nodeId => stryMutAct_9fa48("55564") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("55563") ? false : stryMutAct_9fa48("55562") ? true : (stryCov_9fa48("55562", "55563", "55564"), (stryMutAct_9fa48("55566") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("55565") ? true : (stryCov_9fa48("55565", "55566"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("55569") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("55568") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("55567") ? true : (stryCov_9fa48("55567", "55568", "55569"), nodeId.length > NUM.ZERO)))))))])).sort()));
  }
}
function resolveReadyLeaseExpiresAtMs(row) {
  if (stryMutAct_9fa48("55570")) {
    {}
  } else {
    stryCov_9fa48("55570");
    const readyLeaseExpiresAt = Number(stryMutAct_9fa48("55571") ? (row?.[COLUMN.READY_LEASE_EXPIRES_AT] ?? row?.ready_lease_expires_at) && row?.readyLeaseExpiresAt : (stryCov_9fa48("55571"), (stryMutAct_9fa48("55572") ? row?.[COLUMN.READY_LEASE_EXPIRES_AT] && row?.ready_lease_expires_at : (stryCov_9fa48("55572"), (stryMutAct_9fa48("55573") ? row[COLUMN.READY_LEASE_EXPIRES_AT] : (stryCov_9fa48("55573"), row?.[COLUMN.READY_LEASE_EXPIRES_AT])) ?? (stryMutAct_9fa48("55574") ? row.ready_lease_expires_at : (stryCov_9fa48("55574"), row?.ready_lease_expires_at)))) ?? (stryMutAct_9fa48("55575") ? row.readyLeaseExpiresAt : (stryCov_9fa48("55575"), row?.readyLeaseExpiresAt))));
    return Number.isFinite(readyLeaseExpiresAt) ? readyLeaseExpiresAt : null;
  }
}
function resolveLastHeartbeatMs(row) {
  if (stryMutAct_9fa48("55576")) {
    {}
  } else {
    stryCov_9fa48("55576");
    const lastHeartbeat = Number(stryMutAct_9fa48("55577") ? row?.last_heartbeat && row?.lastHeartbeat : (stryCov_9fa48("55577"), (stryMutAct_9fa48("55578") ? row.last_heartbeat : (stryCov_9fa48("55578"), row?.last_heartbeat)) ?? (stryMutAct_9fa48("55579") ? row.lastHeartbeat : (stryCov_9fa48("55579"), row?.lastHeartbeat))));
    return Number.isFinite(lastHeartbeat) ? lastHeartbeat : null;
  }
}
function hasFreshReadyLeaseOrHeartbeat(nodeRow, options = {}) {
  if (stryMutAct_9fa48("55580")) {
    {}
  } else {
    stryCov_9fa48("55580");
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const readyLeaseExpiresAtMs = resolveReadyLeaseExpiresAtMs(nodeRow);
    if (stryMutAct_9fa48("55583") ? Number.isFinite(readyLeaseExpiresAtMs) || readyLeaseExpiresAtMs > nowMs : stryMutAct_9fa48("55582") ? false : stryMutAct_9fa48("55581") ? true : (stryCov_9fa48("55581", "55582", "55583"), Number.isFinite(readyLeaseExpiresAtMs) && (stryMutAct_9fa48("55586") ? readyLeaseExpiresAtMs <= nowMs : stryMutAct_9fa48("55585") ? readyLeaseExpiresAtMs >= nowMs : stryMutAct_9fa48("55584") ? true : (stryCov_9fa48("55584", "55585", "55586"), readyLeaseExpiresAtMs > nowMs)))) {
      if (stryMutAct_9fa48("55587")) {
        {}
      } else {
        stryCov_9fa48("55587");
        return stryMutAct_9fa48("55588") ? false : (stryCov_9fa48("55588"), true);
      }
    }
    const lastHeartbeatMs = resolveLastHeartbeatMs(nodeRow);
    return stryMutAct_9fa48("55591") ? Number.isFinite(lastHeartbeatMs) || lastHeartbeatMs > nowMs - ACTIVE_NODE_HEARTBEAT_GRACE_MS : stryMutAct_9fa48("55590") ? false : stryMutAct_9fa48("55589") ? true : (stryCov_9fa48("55589", "55590", "55591"), Number.isFinite(lastHeartbeatMs) && (stryMutAct_9fa48("55594") ? lastHeartbeatMs <= nowMs - ACTIVE_NODE_HEARTBEAT_GRACE_MS : stryMutAct_9fa48("55593") ? lastHeartbeatMs >= nowMs - ACTIVE_NODE_HEARTBEAT_GRACE_MS : stryMutAct_9fa48("55592") ? true : (stryCov_9fa48("55592", "55593", "55594"), lastHeartbeatMs > (stryMutAct_9fa48("55595") ? nowMs + ACTIVE_NODE_HEARTBEAT_GRACE_MS : (stryCov_9fa48("55595"), nowMs - ACTIVE_NODE_HEARTBEAT_GRACE_MS)))));
  }
}
function buildReadinessByNodeId(options = {}) {
  if (stryMutAct_9fa48("55596")) {
    {}
  } else {
    stryCov_9fa48("55596");
    if (stryMutAct_9fa48("55599") ? options.readinessByNodeId || typeof options.readinessByNodeId === TYPEOF.OBJECT : stryMutAct_9fa48("55598") ? false : stryMutAct_9fa48("55597") ? true : (stryCov_9fa48("55597", "55598", "55599"), options.readinessByNodeId && (stryMutAct_9fa48("55601") ? typeof options.readinessByNodeId !== TYPEOF.OBJECT : stryMutAct_9fa48("55600") ? true : (stryCov_9fa48("55600", "55601"), typeof options.readinessByNodeId === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("55602")) {
        {}
      } else {
        stryCov_9fa48("55602");
        return options.readinessByNodeId;
      }
    }
    const readinessEntries = Array.isArray(options.readinessEntries) ? options.readinessEntries : stryMutAct_9fa48("55603") ? ["Stryker was here"] : (stryCov_9fa48("55603"), []);
    const readinessByNodeId = {};
    for (const entry of readinessEntries) {
      if (stryMutAct_9fa48("55604")) {
        {}
      } else {
        stryCov_9fa48("55604");
        const normalizedNode = normalizeNodeRow(entry);
        if (stryMutAct_9fa48("55607") ? false : stryMutAct_9fa48("55606") ? true : stryMutAct_9fa48("55605") ? normalizedNode.nodeId : (stryCov_9fa48("55605", "55606", "55607"), !normalizedNode.nodeId)) {
          if (stryMutAct_9fa48("55608")) {
            {}
          } else {
            stryCov_9fa48("55608");
            continue;
          }
        }
        readinessByNodeId[normalizedNode.nodeId] = entry;
      }
    }
    return readinessByNodeId;
  }
}
function isCanonicalWebSocketEndpointRow(endpointRow) {
  if (stryMutAct_9fa48("55609")) {
    {}
  } else {
    stryCov_9fa48("55609");
    const normalizedEndpoint = normalizeNodeEndpointRow(endpointRow);
    return stryMutAct_9fa48("55612") ? normalizedEndpoint.transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() && normalizedEndpoint.status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() && typeof normalizedEndpoint.address === TYPEOF.STRING || normalizedEndpoint.address.length > NUM.ZERO : stryMutAct_9fa48("55611") ? false : stryMutAct_9fa48("55610") ? true : (stryCov_9fa48("55610", "55611", "55612"), (stryMutAct_9fa48("55614") ? normalizedEndpoint.transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() && normalizedEndpoint.status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() || typeof normalizedEndpoint.address === TYPEOF.STRING : stryMutAct_9fa48("55613") ? true : (stryCov_9fa48("55613", "55614"), (stryMutAct_9fa48("55616") ? normalizedEndpoint.transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() || normalizedEndpoint.status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("55615") ? true : (stryCov_9fa48("55615", "55616"), (stryMutAct_9fa48("55618") ? normalizedEndpoint.transportType !== String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() : stryMutAct_9fa48("55617") ? true : (stryCov_9fa48("55617", "55618"), normalizedEndpoint.transportType === (stryMutAct_9fa48("55619") ? String(TRANSPORT_TYPE.WEBSOCKET).toUpperCase() : (stryCov_9fa48("55619"), String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase())))) && (stryMutAct_9fa48("55621") ? normalizedEndpoint.status !== String(ENDPOINT_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("55620") ? true : (stryCov_9fa48("55620", "55621"), normalizedEndpoint.status === (stryMutAct_9fa48("55622") ? String(ENDPOINT_STATUS.ACTIVE).toUpperCase() : (stryCov_9fa48("55622"), String(ENDPOINT_STATUS.ACTIVE).toLowerCase())))))) && (stryMutAct_9fa48("55624") ? typeof normalizedEndpoint.address !== TYPEOF.STRING : stryMutAct_9fa48("55623") ? true : (stryCov_9fa48("55623", "55624"), typeof normalizedEndpoint.address === TYPEOF.STRING)))) && (stryMutAct_9fa48("55627") ? normalizedEndpoint.address.length <= NUM.ZERO : stryMutAct_9fa48("55626") ? normalizedEndpoint.address.length >= NUM.ZERO : stryMutAct_9fa48("55625") ? true : (stryCov_9fa48("55625", "55626", "55627"), normalizedEndpoint.address.length > NUM.ZERO)));
  }
}
function hasCanonicalWebSocketEndpoints(nodeEndpointRows = stryMutAct_9fa48("55628") ? ["Stryker was here"] : (stryCov_9fa48("55628"), [])) {
  if (stryMutAct_9fa48("55629")) {
    {}
  } else {
    stryCov_9fa48("55629");
    return stryMutAct_9fa48("55630") ? (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : []).every(row => isCanonicalWebSocketEndpointRow(row)) : (stryCov_9fa48("55630"), (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : stryMutAct_9fa48("55631") ? ["Stryker was here"] : (stryCov_9fa48("55631"), [])).some(stryMutAct_9fa48("55632") ? () => undefined : (stryCov_9fa48("55632"), row => isCanonicalWebSocketEndpointRow(row))));
  }
}
function hasCanonicalWebSocketEndpoint(nodeId, nodeEndpointRows = stryMutAct_9fa48("55633") ? ["Stryker was here"] : (stryCov_9fa48("55633"), [])) {
  if (stryMutAct_9fa48("55634")) {
    {}
  } else {
    stryCov_9fa48("55634");
    return stryMutAct_9fa48("55635") ? (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : []).every(row => {
      const normalizedEndpoint = normalizeNodeEndpointRow(row);
      return normalizedEndpoint.nodeId === nodeId && isCanonicalWebSocketEndpointRow(row);
    }) : (stryCov_9fa48("55635"), (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : stryMutAct_9fa48("55636") ? ["Stryker was here"] : (stryCov_9fa48("55636"), [])).some(row => {
      if (stryMutAct_9fa48("55637")) {
        {}
      } else {
        stryCov_9fa48("55637");
        const normalizedEndpoint = normalizeNodeEndpointRow(row);
        return stryMutAct_9fa48("55640") ? normalizedEndpoint.nodeId === nodeId || isCanonicalWebSocketEndpointRow(row) : stryMutAct_9fa48("55639") ? false : stryMutAct_9fa48("55638") ? true : (stryCov_9fa48("55638", "55639", "55640"), (stryMutAct_9fa48("55642") ? normalizedEndpoint.nodeId !== nodeId : stryMutAct_9fa48("55641") ? true : (stryCov_9fa48("55641", "55642"), normalizedEndpoint.nodeId === nodeId)) && isCanonicalWebSocketEndpointRow(row));
      }
    }));
  }
}
function hasCanonicalActiveService(nodeId, serviceRows = stryMutAct_9fa48("55643") ? ["Stryker was here"] : (stryCov_9fa48("55643"), [])) {
  if (stryMutAct_9fa48("55644")) {
    {}
  } else {
    stryCov_9fa48("55644");
    return stryMutAct_9fa48("55645") ? (Array.isArray(serviceRows) ? serviceRows : []).every(row => {
      const normalizedService = normalizeServiceRow(row);
      return normalizedService.nodeId === nodeId && normalizedService.status === String(SERVICE_STATUS.ACTIVE).toLowerCase() && typeof normalizedService.serviceId === TYPEOF.STRING && normalizedService.serviceId.length > NUM.ZERO;
    }) : (stryCov_9fa48("55645"), (Array.isArray(serviceRows) ? serviceRows : stryMutAct_9fa48("55646") ? ["Stryker was here"] : (stryCov_9fa48("55646"), [])).some(row => {
      if (stryMutAct_9fa48("55647")) {
        {}
      } else {
        stryCov_9fa48("55647");
        const normalizedService = normalizeServiceRow(row);
        return stryMutAct_9fa48("55650") ? normalizedService.nodeId === nodeId && normalizedService.status === String(SERVICE_STATUS.ACTIVE).toLowerCase() && typeof normalizedService.serviceId === TYPEOF.STRING || normalizedService.serviceId.length > NUM.ZERO : stryMutAct_9fa48("55649") ? false : stryMutAct_9fa48("55648") ? true : (stryCov_9fa48("55648", "55649", "55650"), (stryMutAct_9fa48("55652") ? normalizedService.nodeId === nodeId && normalizedService.status === String(SERVICE_STATUS.ACTIVE).toLowerCase() || typeof normalizedService.serviceId === TYPEOF.STRING : stryMutAct_9fa48("55651") ? true : (stryCov_9fa48("55651", "55652"), (stryMutAct_9fa48("55654") ? normalizedService.nodeId === nodeId || normalizedService.status === String(SERVICE_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("55653") ? true : (stryCov_9fa48("55653", "55654"), (stryMutAct_9fa48("55656") ? normalizedService.nodeId !== nodeId : stryMutAct_9fa48("55655") ? true : (stryCov_9fa48("55655", "55656"), normalizedService.nodeId === nodeId)) && (stryMutAct_9fa48("55658") ? normalizedService.status !== String(SERVICE_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("55657") ? true : (stryCov_9fa48("55657", "55658"), normalizedService.status === (stryMutAct_9fa48("55659") ? String(SERVICE_STATUS.ACTIVE).toUpperCase() : (stryCov_9fa48("55659"), String(SERVICE_STATUS.ACTIVE).toLowerCase())))))) && (stryMutAct_9fa48("55661") ? typeof normalizedService.serviceId !== TYPEOF.STRING : stryMutAct_9fa48("55660") ? true : (stryCov_9fa48("55660", "55661"), typeof normalizedService.serviceId === TYPEOF.STRING)))) && (stryMutAct_9fa48("55664") ? normalizedService.serviceId.length <= NUM.ZERO : stryMutAct_9fa48("55663") ? normalizedService.serviceId.length >= NUM.ZERO : stryMutAct_9fa48("55662") ? true : (stryCov_9fa48("55662", "55663", "55664"), normalizedService.serviceId.length > NUM.ZERO)));
      }
    }));
  }
}
function hasRuntimeTransportEvidence(nodeId, options = {}) {
  if (stryMutAct_9fa48("55665")) {
    {}
  } else {
    stryCov_9fa48("55665");
    const normalizedNodeId = stryMutAct_9fa48("55666") ? String(nodeId || '') : (stryCov_9fa48("55666"), String(stryMutAct_9fa48("55669") ? nodeId && '' : stryMutAct_9fa48("55668") ? false : stryMutAct_9fa48("55667") ? true : (stryCov_9fa48("55667", "55668", "55669"), nodeId || (stryMutAct_9fa48("55670") ? "Stryker was here!" : (stryCov_9fa48("55670"), '')))).trim());
    if (stryMutAct_9fa48("55673") ? normalizedNodeId.length !== NUM.ZERO : stryMutAct_9fa48("55672") ? false : stryMutAct_9fa48("55671") ? true : (stryCov_9fa48("55671", "55672", "55673"), normalizedNodeId.length === NUM.ZERO)) {
      if (stryMutAct_9fa48("55674")) {
        {}
      } else {
        stryCov_9fa48("55674");
        return stryMutAct_9fa48("55675") ? true : (stryCov_9fa48("55675"), false);
      }
    }
    const connectedNodeIds = new Set(normalizeNodeIdList(options.connectedNodeIds));
    if (stryMutAct_9fa48("55677") ? false : stryMutAct_9fa48("55676") ? true : (stryCov_9fa48("55676", "55677"), connectedNodeIds.has(normalizedNodeId))) {
      if (stryMutAct_9fa48("55678")) {
        {}
      } else {
        stryCov_9fa48("55678");
        return stryMutAct_9fa48("55679") ? false : (stryCov_9fa48("55679"), true);
      }
    }
    const readinessByNodeId = buildReadinessByNodeId(options);
    const readinessEntry = stryMutAct_9fa48("55682") ? readinessByNodeId?.[normalizedNodeId] && null : stryMutAct_9fa48("55681") ? false : stryMutAct_9fa48("55680") ? true : (stryCov_9fa48("55680", "55681", "55682"), (stryMutAct_9fa48("55683") ? readinessByNodeId[normalizedNodeId] : (stryCov_9fa48("55683"), readinessByNodeId?.[normalizedNodeId])) || null);
    const nodeEvidence = (stryMutAct_9fa48("55686") ? readinessEntry?.nodeEvidence || typeof readinessEntry.nodeEvidence === TYPEOF.OBJECT : stryMutAct_9fa48("55685") ? false : stryMutAct_9fa48("55684") ? true : (stryCov_9fa48("55684", "55685", "55686"), (stryMutAct_9fa48("55687") ? readinessEntry.nodeEvidence : (stryCov_9fa48("55687"), readinessEntry?.nodeEvidence)) && (stryMutAct_9fa48("55689") ? typeof readinessEntry.nodeEvidence !== TYPEOF.OBJECT : stryMutAct_9fa48("55688") ? true : (stryCov_9fa48("55688", "55689"), typeof readinessEntry.nodeEvidence === TYPEOF.OBJECT)))) ? readinessEntry.nodeEvidence : null;
    if (stryMutAct_9fa48("55692") ? nodeEvidence?.transportConnected !== true : stryMutAct_9fa48("55691") ? false : stryMutAct_9fa48("55690") ? true : (stryCov_9fa48("55690", "55691", "55692"), (stryMutAct_9fa48("55693") ? nodeEvidence.transportConnected : (stryCov_9fa48("55693"), nodeEvidence?.transportConnected)) === (stryMutAct_9fa48("55694") ? false : (stryCov_9fa48("55694"), true)))) {
      if (stryMutAct_9fa48("55695")) {
        {}
      } else {
        stryCov_9fa48("55695");
        return stryMutAct_9fa48("55696") ? false : (stryCov_9fa48("55696"), true);
      }
    }
    return stryMutAct_9fa48("55699") ? options.localNodeResponsive === true && String(options.localNodeId || '').trim() === normalizedNodeId || nodeEvidence?.localQueryTransportReady !== false : stryMutAct_9fa48("55698") ? false : stryMutAct_9fa48("55697") ? true : (stryCov_9fa48("55697", "55698", "55699"), (stryMutAct_9fa48("55701") ? options.localNodeResponsive === true || String(options.localNodeId || '').trim() === normalizedNodeId : stryMutAct_9fa48("55700") ? true : (stryCov_9fa48("55700", "55701"), (stryMutAct_9fa48("55703") ? options.localNodeResponsive !== true : stryMutAct_9fa48("55702") ? true : (stryCov_9fa48("55702", "55703"), options.localNodeResponsive === (stryMutAct_9fa48("55704") ? false : (stryCov_9fa48("55704"), true)))) && (stryMutAct_9fa48("55706") ? String(options.localNodeId || '').trim() !== normalizedNodeId : stryMutAct_9fa48("55705") ? true : (stryCov_9fa48("55705", "55706"), (stryMutAct_9fa48("55707") ? String(options.localNodeId || '') : (stryCov_9fa48("55707"), String(stryMutAct_9fa48("55710") ? options.localNodeId && '' : stryMutAct_9fa48("55709") ? false : stryMutAct_9fa48("55708") ? true : (stryCov_9fa48("55708", "55709", "55710"), options.localNodeId || (stryMutAct_9fa48("55711") ? "Stryker was here!" : (stryCov_9fa48("55711"), '')))).trim())) === normalizedNodeId)))) && (stryMutAct_9fa48("55713") ? nodeEvidence?.localQueryTransportReady === false : stryMutAct_9fa48("55712") ? true : (stryCov_9fa48("55712", "55713"), (stryMutAct_9fa48("55714") ? nodeEvidence.localQueryTransportReady : (stryCov_9fa48("55714"), nodeEvidence?.localQueryTransportReady)) !== (stryMutAct_9fa48("55715") ? true : (stryCov_9fa48("55715"), false)))));
  }
}
function evaluateProjectionReadinessDimensions(readinessDimensions = null, options = {}) {
  if (stryMutAct_9fa48("55716")) {
    {}
  } else {
    stryCov_9fa48("55716");
    if (stryMutAct_9fa48("55719") ? (!readinessDimensions || typeof readinessDimensions !== TYPEOF.OBJECT) && Object.keys(readinessDimensions).length === NUM.ZERO : stryMutAct_9fa48("55718") ? false : stryMutAct_9fa48("55717") ? true : (stryCov_9fa48("55717", "55718", "55719"), (stryMutAct_9fa48("55721") ? !readinessDimensions && typeof readinessDimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("55720") ? false : (stryCov_9fa48("55720", "55721"), (stryMutAct_9fa48("55722") ? readinessDimensions : (stryCov_9fa48("55722"), !readinessDimensions)) || (stryMutAct_9fa48("55724") ? typeof readinessDimensions === TYPEOF.OBJECT : stryMutAct_9fa48("55723") ? false : (stryCov_9fa48("55723", "55724"), typeof readinessDimensions !== TYPEOF.OBJECT)))) || (stryMutAct_9fa48("55726") ? Object.keys(readinessDimensions).length !== NUM.ZERO : stryMutAct_9fa48("55725") ? false : (stryCov_9fa48("55725", "55726"), Object.keys(readinessDimensions).length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("55727")) {
        {}
      } else {
        stryCov_9fa48("55727");
        return stryMutAct_9fa48("55728") ? {} : (stryCov_9fa48("55728"), {
          hasReadinessEvidence: stryMutAct_9fa48("55729") ? true : (stryCov_9fa48("55729"), false),
          projectionEligible: null,
          projectedByRecoveryEligibility: stryMutAct_9fa48("55730") ? true : (stryCov_9fa48("55730"), false),
          clusterMemberHealthyMissing: stryMutAct_9fa48("55731") ? true : (stryCov_9fa48("55731"), false)
        });
      }
    }
    if (stryMutAct_9fa48("55734") ? readinessDimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] !== true : stryMutAct_9fa48("55733") ? false : stryMutAct_9fa48("55732") ? true : (stryCov_9fa48("55732", "55733", "55734"), readinessDimensions[CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY] === (stryMutAct_9fa48("55735") ? false : (stryCov_9fa48("55735"), true)))) {
      if (stryMutAct_9fa48("55736")) {
        {}
      } else {
        stryCov_9fa48("55736");
        return stryMutAct_9fa48("55737") ? {} : (stryCov_9fa48("55737"), {
          hasReadinessEvidence: stryMutAct_9fa48("55738") ? false : (stryCov_9fa48("55738"), true),
          projectionEligible: stryMutAct_9fa48("55739") ? false : (stryCov_9fa48("55739"), true),
          projectedByRecoveryEligibility: stryMutAct_9fa48("55740") ? true : (stryCov_9fa48("55740"), false),
          clusterMemberHealthyMissing: stryMutAct_9fa48("55741") ? true : (stryCov_9fa48("55741"), false)
        });
      }
    }
    const controlPlaneRecoveryEligible = stryMutAct_9fa48("55744") ? readinessDimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] !== true : stryMutAct_9fa48("55743") ? false : stryMutAct_9fa48("55742") ? true : (stryCov_9fa48("55742", "55743", "55744"), readinessDimensions[CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE] === (stryMutAct_9fa48("55745") ? false : (stryCov_9fa48("55745"), true)));
    const projectedByRecoveryEligibility = stryMutAct_9fa48("55748") ? options.allowControlPlaneRecoveryEligibleProjection === true || controlPlaneRecoveryEligible : stryMutAct_9fa48("55747") ? false : stryMutAct_9fa48("55746") ? true : (stryCov_9fa48("55746", "55747", "55748"), (stryMutAct_9fa48("55750") ? options.allowControlPlaneRecoveryEligibleProjection !== true : stryMutAct_9fa48("55749") ? true : (stryCov_9fa48("55749", "55750"), options.allowControlPlaneRecoveryEligibleProjection === (stryMutAct_9fa48("55751") ? false : (stryCov_9fa48("55751"), true)))) && controlPlaneRecoveryEligible);
    return stryMutAct_9fa48("55752") ? {} : (stryCov_9fa48("55752"), {
      hasReadinessEvidence: stryMutAct_9fa48("55753") ? false : (stryCov_9fa48("55753"), true),
      projectionEligible: projectedByRecoveryEligibility,
      projectedByRecoveryEligibility,
      clusterMemberHealthyMissing: stryMutAct_9fa48("55754") ? false : (stryCov_9fa48("55754"), true)
    });
  }
}
function resolveProjectionReadinessDecisionMode(options = {}) {
  if (stryMutAct_9fa48("55755")) {
    {}
  } else {
    stryCov_9fa48("55755");
    return (stryMutAct_9fa48("55758") ? options.allowControlPlaneRecoveryEligibleProjection !== true : stryMutAct_9fa48("55757") ? false : stryMutAct_9fa48("55756") ? true : (stryCov_9fa48("55756", "55757", "55758"), options.allowControlPlaneRecoveryEligibleProjection === (stryMutAct_9fa48("55759") ? false : (stryCov_9fa48("55759"), true)))) ? PROJECTION_READINESS_DECISION_MODE.CLUSTER_MEMBER_OR_RECOVERY_ELIGIBLE : PROJECTION_READINESS_DECISION_MODE.CLUSTER_MEMBER_HEALTHY_ONLY;
  }
}
function resolveProjectionReadinessDecisionDimensions(options = {}) {
  if (stryMutAct_9fa48("55760")) {
    {}
  } else {
    stryCov_9fa48("55760");
    if (stryMutAct_9fa48("55763") ? options.allowControlPlaneRecoveryEligibleProjection !== true : stryMutAct_9fa48("55762") ? false : stryMutAct_9fa48("55761") ? true : (stryCov_9fa48("55761", "55762", "55763"), options.allowControlPlaneRecoveryEligibleProjection === (stryMutAct_9fa48("55764") ? false : (stryCov_9fa48("55764"), true)))) {
      if (stryMutAct_9fa48("55765")) {
        {}
      } else {
        stryCov_9fa48("55765");
        return Object.freeze(stryMutAct_9fa48("55766") ? [] : (stryCov_9fa48("55766"), [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY, CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]));
      }
    }
    return Object.freeze(stryMutAct_9fa48("55767") ? [] : (stryCov_9fa48("55767"), [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]));
  }
}
function shouldAllowLivenessFallbackProjection(nodeRow, readinessProjection, options = {}) {
  if (stryMutAct_9fa48("55768")) {
    {}
  } else {
    stryCov_9fa48("55768");
    if (stryMutAct_9fa48("55771") ? options.allowControlPlaneRecoveryEligibleProjection !== true && options.allowLivenessFallbackProjection !== true : stryMutAct_9fa48("55770") ? false : stryMutAct_9fa48("55769") ? true : (stryCov_9fa48("55769", "55770", "55771"), (stryMutAct_9fa48("55773") ? options.allowControlPlaneRecoveryEligibleProjection === true : stryMutAct_9fa48("55772") ? false : (stryCov_9fa48("55772", "55773"), options.allowControlPlaneRecoveryEligibleProjection !== (stryMutAct_9fa48("55774") ? false : (stryCov_9fa48("55774"), true)))) || (stryMutAct_9fa48("55776") ? options.allowLivenessFallbackProjection === true : stryMutAct_9fa48("55775") ? false : (stryCov_9fa48("55775", "55776"), options.allowLivenessFallbackProjection !== (stryMutAct_9fa48("55777") ? false : (stryCov_9fa48("55777"), true)))))) {
      if (stryMutAct_9fa48("55778")) {
        {}
      } else {
        stryCov_9fa48("55778");
        return stryMutAct_9fa48("55779") ? true : (stryCov_9fa48("55779"), false);
      }
    }
    if (stryMutAct_9fa48("55782") ? (!readinessProjection || readinessProjection.hasReadinessEvidence !== true) && readinessProjection.projectionEligible === true : stryMutAct_9fa48("55781") ? false : stryMutAct_9fa48("55780") ? true : (stryCov_9fa48("55780", "55781", "55782"), (stryMutAct_9fa48("55784") ? !readinessProjection && readinessProjection.hasReadinessEvidence !== true : stryMutAct_9fa48("55783") ? false : (stryCov_9fa48("55783", "55784"), (stryMutAct_9fa48("55785") ? readinessProjection : (stryCov_9fa48("55785"), !readinessProjection)) || (stryMutAct_9fa48("55787") ? readinessProjection.hasReadinessEvidence === true : stryMutAct_9fa48("55786") ? false : (stryCov_9fa48("55786", "55787"), readinessProjection.hasReadinessEvidence !== (stryMutAct_9fa48("55788") ? false : (stryCov_9fa48("55788"), true)))))) || (stryMutAct_9fa48("55790") ? readinessProjection.projectionEligible !== true : stryMutAct_9fa48("55789") ? false : (stryCov_9fa48("55789", "55790"), readinessProjection.projectionEligible === (stryMutAct_9fa48("55791") ? false : (stryCov_9fa48("55791"), true)))))) {
      if (stryMutAct_9fa48("55792")) {
        {}
      } else {
        stryCov_9fa48("55792");
        return stryMutAct_9fa48("55793") ? true : (stryCov_9fa48("55793"), false);
      }
    }
    const normalizedNode = normalizeNodeRow(nodeRow);
    if (stryMutAct_9fa48("55796") ? false : stryMutAct_9fa48("55795") ? true : stryMutAct_9fa48("55794") ? normalizedNode.nodeId : (stryCov_9fa48("55794", "55795", "55796"), !normalizedNode.nodeId)) {
      if (stryMutAct_9fa48("55797")) {
        {}
      } else {
        stryCov_9fa48("55797");
        return stryMutAct_9fa48("55798") ? true : (stryCov_9fa48("55798"), false);
      }
    }
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const hasReadyConnection = stryMutAct_9fa48("55801") ? normalizedNode.connectionState !== String(STATE.READY).toLowerCase() : stryMutAct_9fa48("55800") ? false : stryMutAct_9fa48("55799") ? true : (stryCov_9fa48("55799", "55800", "55801"), normalizedNode.connectionState === (stryMutAct_9fa48("55802") ? String(STATE.READY).toUpperCase() : (stryCov_9fa48("55802"), String(STATE.READY).toLowerCase())));
    const hasFreshLiveness = stryMutAct_9fa48("55805") ? hasReadyConnection || hasFreshReadyLeaseOrHeartbeat(nodeRow, {
      nowMs
    }) : stryMutAct_9fa48("55804") ? false : stryMutAct_9fa48("55803") ? true : (stryCov_9fa48("55803", "55804", "55805"), hasReadyConnection && hasFreshReadyLeaseOrHeartbeat(nodeRow, stryMutAct_9fa48("55806") ? {} : (stryCov_9fa48("55806"), {
      nowMs
    })));
    return hasFreshLiveness;
  }
}
function isCanonicallyActiveNode(nodeRow, options = {}) {
  if (stryMutAct_9fa48("55807")) {
    {}
  } else {
    stryCov_9fa48("55807");
    const normalizedNode = normalizeNodeRow(nodeRow);
    if (stryMutAct_9fa48("55810") ? false : stryMutAct_9fa48("55809") ? true : stryMutAct_9fa48("55808") ? normalizedNode.nodeId : (stryCov_9fa48("55808", "55809", "55810"), !normalizedNode.nodeId)) {
      if (stryMutAct_9fa48("55811")) {
        {}
      } else {
        stryCov_9fa48("55811");
        return stryMutAct_9fa48("55812") ? true : (stryCov_9fa48("55812"), false);
      }
    }
    const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const hasReadyConnection = stryMutAct_9fa48("55815") ? normalizedNode.connectionState !== String(STATE.READY).toLowerCase() : stryMutAct_9fa48("55814") ? false : stryMutAct_9fa48("55813") ? true : (stryCov_9fa48("55813", "55814", "55815"), normalizedNode.connectionState === (stryMutAct_9fa48("55816") ? String(STATE.READY).toUpperCase() : (stryCov_9fa48("55816"), String(STATE.READY).toLowerCase())));
    const hasFreshLiveness = stryMutAct_9fa48("55819") ? hasReadyConnection || hasFreshReadyLeaseOrHeartbeat(nodeRow, {
      nowMs
    }) : stryMutAct_9fa48("55818") ? false : stryMutAct_9fa48("55817") ? true : (stryCov_9fa48("55817", "55818", "55819"), hasReadyConnection && hasFreshReadyLeaseOrHeartbeat(nodeRow, stryMutAct_9fa48("55820") ? {} : (stryCov_9fa48("55820"), {
      nowMs
    })));
    if (stryMutAct_9fa48("55823") ? normalizedNode.status !== String(SERVICE_STATUS.ACTIVE).toLowerCase() || !hasFreshLiveness : stryMutAct_9fa48("55822") ? false : stryMutAct_9fa48("55821") ? true : (stryCov_9fa48("55821", "55822", "55823"), (stryMutAct_9fa48("55825") ? normalizedNode.status === String(SERVICE_STATUS.ACTIVE).toLowerCase() : stryMutAct_9fa48("55824") ? true : (stryCov_9fa48("55824", "55825"), normalizedNode.status !== (stryMutAct_9fa48("55826") ? String(SERVICE_STATUS.ACTIVE).toUpperCase() : (stryCov_9fa48("55826"), String(SERVICE_STATUS.ACTIVE).toLowerCase())))) && (stryMutAct_9fa48("55827") ? hasFreshLiveness : (stryCov_9fa48("55827"), !hasFreshLiveness)))) {
      if (stryMutAct_9fa48("55828")) {
        {}
      } else {
        stryCov_9fa48("55828");
        return stryMutAct_9fa48("55829") ? true : (stryCov_9fa48("55829"), false);
      }
    }
    const readinessByNodeId = buildReadinessByNodeId(options);
    const readinessEntry = stryMutAct_9fa48("55832") ? readinessByNodeId?.[normalizedNode.nodeId] && null : stryMutAct_9fa48("55831") ? false : stryMutAct_9fa48("55830") ? true : (stryCov_9fa48("55830", "55831", "55832"), (stryMutAct_9fa48("55833") ? readinessByNodeId[normalizedNode.nodeId] : (stryCov_9fa48("55833"), readinessByNodeId?.[normalizedNode.nodeId])) || null);
    const readinessDimensions = (stryMutAct_9fa48("55836") ? readinessEntry?.dimensions || typeof readinessEntry.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("55835") ? false : stryMutAct_9fa48("55834") ? true : (stryCov_9fa48("55834", "55835", "55836"), (stryMutAct_9fa48("55837") ? readinessEntry.dimensions : (stryCov_9fa48("55837"), readinessEntry?.dimensions)) && (stryMutAct_9fa48("55839") ? typeof readinessEntry.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("55838") ? true : (stryCov_9fa48("55838", "55839"), typeof readinessEntry.dimensions === TYPEOF.OBJECT)))) ? readinessEntry.dimensions : null;
    const readinessProjection = evaluateProjectionReadinessDimensions(readinessDimensions, options);
    const allowLivenessFallbackProjection = shouldAllowLivenessFallbackProjection(nodeRow, readinessProjection, options);
    if (stryMutAct_9fa48("55841") ? false : stryMutAct_9fa48("55840") ? true : (stryCov_9fa48("55840", "55841"), readinessProjection.hasReadinessEvidence)) {
      if (stryMutAct_9fa48("55842")) {
        {}
      } else {
        stryCov_9fa48("55842");
        if (stryMutAct_9fa48("55845") ? readinessProjection.projectionEligible !== true || !allowLivenessFallbackProjection : stryMutAct_9fa48("55844") ? false : stryMutAct_9fa48("55843") ? true : (stryCov_9fa48("55843", "55844", "55845"), (stryMutAct_9fa48("55847") ? readinessProjection.projectionEligible === true : stryMutAct_9fa48("55846") ? true : (stryCov_9fa48("55846", "55847"), readinessProjection.projectionEligible !== (stryMutAct_9fa48("55848") ? false : (stryCov_9fa48("55848"), true)))) && (stryMutAct_9fa48("55849") ? allowLivenessFallbackProjection : (stryCov_9fa48("55849"), !allowLivenessFallbackProjection)))) {
          if (stryMutAct_9fa48("55850")) {
            {}
          } else {
            stryCov_9fa48("55850");
            return stryMutAct_9fa48("55851") ? true : (stryCov_9fa48("55851"), false);
          }
        }
      }
    } else {
      if (stryMutAct_9fa48("55852")) {
        {}
      } else {
        stryCov_9fa48("55852");
        if (stryMutAct_9fa48("55855") ? !hasReadyConnection && !hasFreshLiveness : stryMutAct_9fa48("55854") ? false : stryMutAct_9fa48("55853") ? true : (stryCov_9fa48("55853", "55854", "55855"), (stryMutAct_9fa48("55856") ? hasReadyConnection : (stryCov_9fa48("55856"), !hasReadyConnection)) || (stryMutAct_9fa48("55857") ? hasFreshLiveness : (stryCov_9fa48("55857"), !hasFreshLiveness)))) {
          if (stryMutAct_9fa48("55858")) {
            {}
          } else {
            stryCov_9fa48("55858");
            return stryMutAct_9fa48("55859") ? true : (stryCov_9fa48("55859"), false);
          }
        }
      }
    }
    const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ? options.nodeEndpointRows : stryMutAct_9fa48("55860") ? ["Stryker was here"] : (stryCov_9fa48("55860"), []);
    const projectedByRecoveryEligibility = stryMutAct_9fa48("55863") ? readinessProjection.projectedByRecoveryEligibility === true || options.allowControlPlaneRecoveryEligibleProjection === true : stryMutAct_9fa48("55862") ? false : stryMutAct_9fa48("55861") ? true : (stryCov_9fa48("55861", "55862", "55863"), (stryMutAct_9fa48("55865") ? readinessProjection.projectedByRecoveryEligibility !== true : stryMutAct_9fa48("55864") ? true : (stryCov_9fa48("55864", "55865"), readinessProjection.projectedByRecoveryEligibility === (stryMutAct_9fa48("55866") ? false : (stryCov_9fa48("55866"), true)))) && (stryMutAct_9fa48("55868") ? options.allowControlPlaneRecoveryEligibleProjection !== true : stryMutAct_9fa48("55867") ? true : (stryCov_9fa48("55867", "55868"), options.allowControlPlaneRecoveryEligibleProjection === (stryMutAct_9fa48("55869") ? false : (stryCov_9fa48("55869"), true)))));
    if (stryMutAct_9fa48("55872") ? false : stryMutAct_9fa48("55871") ? true : stryMutAct_9fa48("55870") ? projectedByRecoveryEligibility : (stryCov_9fa48("55870", "55871", "55872"), !projectedByRecoveryEligibility)) {
      if (stryMutAct_9fa48("55873")) {
        {}
      } else {
        stryCov_9fa48("55873");
        if (stryMutAct_9fa48("55876") ? hasCanonicalWebSocketEndpoints(nodeEndpointRows) && !hasCanonicalWebSocketEndpoint(normalizedNode.nodeId, nodeEndpointRows) && !hasCanonicalActiveService(normalizedNode.nodeId, options.serviceRows) || !hasRuntimeTransportEvidence(normalizedNode.nodeId, {
          ...options,
          readinessByNodeId
        }) : stryMutAct_9fa48("55875") ? false : stryMutAct_9fa48("55874") ? true : (stryCov_9fa48("55874", "55875", "55876"), (stryMutAct_9fa48("55878") ? hasCanonicalWebSocketEndpoints(nodeEndpointRows) && !hasCanonicalWebSocketEndpoint(normalizedNode.nodeId, nodeEndpointRows) || !hasCanonicalActiveService(normalizedNode.nodeId, options.serviceRows) : stryMutAct_9fa48("55877") ? true : (stryCov_9fa48("55877", "55878"), (stryMutAct_9fa48("55880") ? hasCanonicalWebSocketEndpoints(nodeEndpointRows) || !hasCanonicalWebSocketEndpoint(normalizedNode.nodeId, nodeEndpointRows) : stryMutAct_9fa48("55879") ? true : (stryCov_9fa48("55879", "55880"), hasCanonicalWebSocketEndpoints(nodeEndpointRows) && (stryMutAct_9fa48("55881") ? hasCanonicalWebSocketEndpoint(normalizedNode.nodeId, nodeEndpointRows) : (stryCov_9fa48("55881"), !hasCanonicalWebSocketEndpoint(normalizedNode.nodeId, nodeEndpointRows))))) && (stryMutAct_9fa48("55882") ? hasCanonicalActiveService(normalizedNode.nodeId, options.serviceRows) : (stryCov_9fa48("55882"), !hasCanonicalActiveService(normalizedNode.nodeId, options.serviceRows))))) && (stryMutAct_9fa48("55883") ? hasRuntimeTransportEvidence(normalizedNode.nodeId, {
          ...options,
          readinessByNodeId
        }) : (stryCov_9fa48("55883"), !hasRuntimeTransportEvidence(normalizedNode.nodeId, stryMutAct_9fa48("55884") ? {} : (stryCov_9fa48("55884"), {
          ...options,
          readinessByNodeId
        })))))) {
          if (stryMutAct_9fa48("55885")) {
            {}
          } else {
            stryCov_9fa48("55885");
            return stryMutAct_9fa48("55886") ? true : (stryCov_9fa48("55886"), false);
          }
        }
      }
    }
    return stryMutAct_9fa48("55887") ? false : (stryCov_9fa48("55887"), true);
  }
}
function resolveProjectedActiveNodeSelection(options = {}) {
  if (stryMutAct_9fa48("55888")) {
    {}
  } else {
    stryCov_9fa48("55888");
    const nodeRows = Array.isArray(options.nodeRows) ? options.nodeRows : stryMutAct_9fa48("55889") ? ["Stryker was here"] : (stryCov_9fa48("55889"), []);
    const readinessByNodeId = buildReadinessByNodeId(options);
    const nodeRowsById = new Map();
    const recoveryEligibleIncludedNodeIds = new Set();
    const livenessFallbackIncludedNodeIds = new Set();
    const readinessExcludedNodeIds = new Set();
    const clusterMemberUnhealthyExcludedNodeIds = new Set();
    for (const nodeRow of nodeRows) {
      if (stryMutAct_9fa48("55890")) {
        {}
      } else {
        stryCov_9fa48("55890");
        const normalizedNode = normalizeNodeRow(nodeRow);
        if (stryMutAct_9fa48("55893") ? false : stryMutAct_9fa48("55892") ? true : stryMutAct_9fa48("55891") ? normalizedNode.nodeId : (stryCov_9fa48("55891", "55892", "55893"), !normalizedNode.nodeId)) {
          if (stryMutAct_9fa48("55894")) {
            {}
          } else {
            stryCov_9fa48("55894");
            continue;
          }
        }
        nodeRowsById.set(normalizedNode.nodeId, nodeRow);
      }
    }
    const candidateNodeIds = new Set(stryMutAct_9fa48("55895") ? [] : (stryCov_9fa48("55895"), [...nodeRowsById.keys(), ...Object.keys(stryMutAct_9fa48("55898") ? readinessByNodeId && {} : stryMutAct_9fa48("55897") ? false : stryMutAct_9fa48("55896") ? true : (stryCov_9fa48("55896", "55897", "55898"), readinessByNodeId || {})), ...normalizeNodeIdList(options.connectedNodeIds), ...normalizeNodeIdList(stryMutAct_9fa48("55899") ? [] : (stryCov_9fa48("55899"), [options.localNodeId]))]));
    const activeNodeIds = stryMutAct_9fa48("55900") ? ["Stryker was here"] : (stryCov_9fa48("55900"), []);
    const requireWebSocketEndpoint = hasCanonicalWebSocketEndpoints(options.nodeEndpointRows);
    for (const nodeId of candidateNodeIds) {
      if (stryMutAct_9fa48("55901")) {
        {}
      } else {
        stryCov_9fa48("55901");
        const nodeRow = stryMutAct_9fa48("55904") ? nodeRowsById.get(nodeId) && null : stryMutAct_9fa48("55903") ? false : stryMutAct_9fa48("55902") ? true : (stryCov_9fa48("55902", "55903", "55904"), nodeRowsById.get(nodeId) || null);
        const readinessEntry = stryMutAct_9fa48("55907") ? readinessByNodeId?.[nodeId] && null : stryMutAct_9fa48("55906") ? false : stryMutAct_9fa48("55905") ? true : (stryCov_9fa48("55905", "55906", "55907"), (stryMutAct_9fa48("55908") ? readinessByNodeId[nodeId] : (stryCov_9fa48("55908"), readinessByNodeId?.[nodeId])) || null);
        const readinessDimensions = (stryMutAct_9fa48("55911") ? readinessEntry?.dimensions || typeof readinessEntry.dimensions === TYPEOF.OBJECT : stryMutAct_9fa48("55910") ? false : stryMutAct_9fa48("55909") ? true : (stryCov_9fa48("55909", "55910", "55911"), (stryMutAct_9fa48("55912") ? readinessEntry.dimensions : (stryCov_9fa48("55912"), readinessEntry?.dimensions)) && (stryMutAct_9fa48("55914") ? typeof readinessEntry.dimensions !== TYPEOF.OBJECT : stryMutAct_9fa48("55913") ? true : (stryCov_9fa48("55913", "55914"), typeof readinessEntry.dimensions === TYPEOF.OBJECT)))) ? readinessEntry.dimensions : null;
        const readinessProjection = evaluateProjectionReadinessDimensions(readinessDimensions, options);
        const allowLivenessFallbackProjection = shouldAllowLivenessFallbackProjection(nodeRow, readinessProjection, options);
        const runtimeTransportEvidence = hasRuntimeTransportEvidence(nodeId, stryMutAct_9fa48("55915") ? {} : (stryCov_9fa48("55915"), {
          ...options,
          readinessByNodeId
        }));
        if (stryMutAct_9fa48("55917") ? false : stryMutAct_9fa48("55916") ? true : (stryCov_9fa48("55916", "55917"), nodeRow)) {
          if (stryMutAct_9fa48("55918")) {
            {}
          } else {
            stryCov_9fa48("55918");
            if (stryMutAct_9fa48("55921") ? readinessProjection.hasReadinessEvidence && readinessProjection.projectionEligible !== true || !allowLivenessFallbackProjection : stryMutAct_9fa48("55920") ? false : stryMutAct_9fa48("55919") ? true : (stryCov_9fa48("55919", "55920", "55921"), (stryMutAct_9fa48("55923") ? readinessProjection.hasReadinessEvidence || readinessProjection.projectionEligible !== true : stryMutAct_9fa48("55922") ? true : (stryCov_9fa48("55922", "55923"), readinessProjection.hasReadinessEvidence && (stryMutAct_9fa48("55925") ? readinessProjection.projectionEligible === true : stryMutAct_9fa48("55924") ? true : (stryCov_9fa48("55924", "55925"), readinessProjection.projectionEligible !== (stryMutAct_9fa48("55926") ? false : (stryCov_9fa48("55926"), true)))))) && (stryMutAct_9fa48("55927") ? allowLivenessFallbackProjection : (stryCov_9fa48("55927"), !allowLivenessFallbackProjection)))) {
              if (stryMutAct_9fa48("55928")) {
                {}
              } else {
                stryCov_9fa48("55928");
                readinessExcludedNodeIds.add(nodeId);
                if (stryMutAct_9fa48("55930") ? false : stryMutAct_9fa48("55929") ? true : (stryCov_9fa48("55929", "55930"), readinessProjection.clusterMemberHealthyMissing)) {
                  if (stryMutAct_9fa48("55931")) {
                    {}
                  } else {
                    stryCov_9fa48("55931");
                    clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
                  }
                }
                continue;
              }
            }
            const nodeEligible = isCanonicallyActiveNode(nodeRow, stryMutAct_9fa48("55932") ? {} : (stryCov_9fa48("55932"), {
              ...options,
              readinessByNodeId
            }));
            if (stryMutAct_9fa48("55934") ? false : stryMutAct_9fa48("55933") ? true : (stryCov_9fa48("55933", "55934"), nodeEligible)) {
              if (stryMutAct_9fa48("55935")) {
                {}
              } else {
                stryCov_9fa48("55935");
                activeNodeIds.push(nodeId);
                if (stryMutAct_9fa48("55937") ? false : stryMutAct_9fa48("55936") ? true : (stryCov_9fa48("55936", "55937"), readinessProjection.projectedByRecoveryEligibility)) {
                  if (stryMutAct_9fa48("55938")) {
                    {}
                  } else {
                    stryCov_9fa48("55938");
                    recoveryEligibleIncludedNodeIds.add(nodeId);
                  }
                }
                if (stryMutAct_9fa48("55940") ? false : stryMutAct_9fa48("55939") ? true : (stryCov_9fa48("55939", "55940"), allowLivenessFallbackProjection)) {
                  if (stryMutAct_9fa48("55941")) {
                    {}
                  } else {
                    stryCov_9fa48("55941");
                    livenessFallbackIncludedNodeIds.add(nodeId);
                  }
                }
              }
            }
            continue;
          }
        }
        if (stryMutAct_9fa48("55944") ? !readinessProjection.hasReadinessEvidence && readinessProjection.projectionEligible !== true : stryMutAct_9fa48("55943") ? false : stryMutAct_9fa48("55942") ? true : (stryCov_9fa48("55942", "55943", "55944"), (stryMutAct_9fa48("55945") ? readinessProjection.hasReadinessEvidence : (stryCov_9fa48("55945"), !readinessProjection.hasReadinessEvidence)) || (stryMutAct_9fa48("55947") ? readinessProjection.projectionEligible === true : stryMutAct_9fa48("55946") ? false : (stryCov_9fa48("55946", "55947"), readinessProjection.projectionEligible !== (stryMutAct_9fa48("55948") ? false : (stryCov_9fa48("55948"), true)))))) {
          if (stryMutAct_9fa48("55949")) {
            {}
          } else {
            stryCov_9fa48("55949");
            const allowResponsiveLocalNodeProjection = stryMutAct_9fa48("55952") ? options.localNodeResponsive === true || String(options.localNodeId || '').trim() === nodeId : stryMutAct_9fa48("55951") ? false : stryMutAct_9fa48("55950") ? true : (stryCov_9fa48("55950", "55951", "55952"), (stryMutAct_9fa48("55954") ? options.localNodeResponsive !== true : stryMutAct_9fa48("55953") ? true : (stryCov_9fa48("55953", "55954"), options.localNodeResponsive === (stryMutAct_9fa48("55955") ? false : (stryCov_9fa48("55955"), true)))) && (stryMutAct_9fa48("55957") ? String(options.localNodeId || '').trim() !== nodeId : stryMutAct_9fa48("55956") ? true : (stryCov_9fa48("55956", "55957"), (stryMutAct_9fa48("55958") ? String(options.localNodeId || '') : (stryCov_9fa48("55958"), String(stryMutAct_9fa48("55961") ? options.localNodeId && '' : stryMutAct_9fa48("55960") ? false : stryMutAct_9fa48("55959") ? true : (stryCov_9fa48("55959", "55960", "55961"), options.localNodeId || (stryMutAct_9fa48("55962") ? "Stryker was here!" : (stryCov_9fa48("55962"), '')))).trim())) === nodeId)));
            if (stryMutAct_9fa48("55965") ? allowResponsiveLocalNodeProjection === true : stryMutAct_9fa48("55964") ? false : stryMutAct_9fa48("55963") ? true : (stryCov_9fa48("55963", "55964", "55965"), allowResponsiveLocalNodeProjection !== (stryMutAct_9fa48("55966") ? false : (stryCov_9fa48("55966"), true)))) {
              if (stryMutAct_9fa48("55967")) {
                {}
              } else {
                stryCov_9fa48("55967");
                if (stryMutAct_9fa48("55969") ? false : stryMutAct_9fa48("55968") ? true : (stryCov_9fa48("55968", "55969"), readinessProjection.hasReadinessEvidence)) {
                  if (stryMutAct_9fa48("55970")) {
                    {}
                  } else {
                    stryCov_9fa48("55970");
                    readinessExcludedNodeIds.add(nodeId);
                    if (stryMutAct_9fa48("55972") ? false : stryMutAct_9fa48("55971") ? true : (stryCov_9fa48("55971", "55972"), readinessProjection.clusterMemberHealthyMissing)) {
                      if (stryMutAct_9fa48("55973")) {
                        {}
                      } else {
                        stryCov_9fa48("55973");
                        clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
                      }
                    }
                  }
                }
                continue;
              }
            }
          }
        }
        if (stryMutAct_9fa48("55976") ? readinessProjection.hasReadinessEvidence && readinessProjection.projectionEligible !== true || !allowLivenessFallbackProjection : stryMutAct_9fa48("55975") ? false : stryMutAct_9fa48("55974") ? true : (stryCov_9fa48("55974", "55975", "55976"), (stryMutAct_9fa48("55978") ? readinessProjection.hasReadinessEvidence || readinessProjection.projectionEligible !== true : stryMutAct_9fa48("55977") ? true : (stryCov_9fa48("55977", "55978"), readinessProjection.hasReadinessEvidence && (stryMutAct_9fa48("55980") ? readinessProjection.projectionEligible === true : stryMutAct_9fa48("55979") ? true : (stryCov_9fa48("55979", "55980"), readinessProjection.projectionEligible !== (stryMutAct_9fa48("55981") ? false : (stryCov_9fa48("55981"), true)))))) && (stryMutAct_9fa48("55982") ? allowLivenessFallbackProjection : (stryCov_9fa48("55982"), !allowLivenessFallbackProjection)))) {
          if (stryMutAct_9fa48("55983")) {
            {}
          } else {
            stryCov_9fa48("55983");
            if (stryMutAct_9fa48("55985") ? false : stryMutAct_9fa48("55984") ? true : (stryCov_9fa48("55984", "55985"), readinessProjection.hasReadinessEvidence)) {
              if (stryMutAct_9fa48("55986")) {
                {}
              } else {
                stryCov_9fa48("55986");
                readinessExcludedNodeIds.add(nodeId);
                if (stryMutAct_9fa48("55988") ? false : stryMutAct_9fa48("55987") ? true : (stryCov_9fa48("55987", "55988"), readinessProjection.clusterMemberHealthyMissing)) {
                  if (stryMutAct_9fa48("55989")) {
                    {}
                  } else {
                    stryCov_9fa48("55989");
                    clusterMemberUnhealthyExcludedNodeIds.add(nodeId);
                  }
                }
              }
            }
            continue;
          }
        }
        if (stryMutAct_9fa48("55992") ? requireWebSocketEndpoint && !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) || !runtimeTransportEvidence : stryMutAct_9fa48("55991") ? false : stryMutAct_9fa48("55990") ? true : (stryCov_9fa48("55990", "55991", "55992"), (stryMutAct_9fa48("55994") ? requireWebSocketEndpoint || !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) : stryMutAct_9fa48("55993") ? true : (stryCov_9fa48("55993", "55994"), requireWebSocketEndpoint && (stryMutAct_9fa48("55995") ? hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) : (stryCov_9fa48("55995"), !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows))))) && (stryMutAct_9fa48("55996") ? runtimeTransportEvidence : (stryCov_9fa48("55996"), !runtimeTransportEvidence)))) {
          if (stryMutAct_9fa48("55997")) {
            {}
          } else {
            stryCov_9fa48("55997");
            continue;
          }
        }
        if (stryMutAct_9fa48("56000") ? !hasCanonicalActiveService(nodeId, options.serviceRows) && !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) || !runtimeTransportEvidence : stryMutAct_9fa48("55999") ? false : stryMutAct_9fa48("55998") ? true : (stryCov_9fa48("55998", "55999", "56000"), (stryMutAct_9fa48("56002") ? !hasCanonicalActiveService(nodeId, options.serviceRows) || !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) : stryMutAct_9fa48("56001") ? true : (stryCov_9fa48("56001", "56002"), (stryMutAct_9fa48("56003") ? hasCanonicalActiveService(nodeId, options.serviceRows) : (stryCov_9fa48("56003"), !hasCanonicalActiveService(nodeId, options.serviceRows))) && (stryMutAct_9fa48("56004") ? hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows) : (stryCov_9fa48("56004"), !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows))))) && (stryMutAct_9fa48("56005") ? runtimeTransportEvidence : (stryCov_9fa48("56005"), !runtimeTransportEvidence)))) {
          if (stryMutAct_9fa48("56006")) {
            {}
          } else {
            stryCov_9fa48("56006");
            continue;
          }
        }
        activeNodeIds.push(nodeId);
        if (stryMutAct_9fa48("56008") ? false : stryMutAct_9fa48("56007") ? true : (stryCov_9fa48("56007", "56008"), readinessProjection.projectedByRecoveryEligibility)) {
          if (stryMutAct_9fa48("56009")) {
            {}
          } else {
            stryCov_9fa48("56009");
            recoveryEligibleIncludedNodeIds.add(nodeId);
          }
        }
        if (stryMutAct_9fa48("56011") ? false : stryMutAct_9fa48("56010") ? true : (stryCov_9fa48("56010", "56011"), allowLivenessFallbackProjection)) {
          if (stryMutAct_9fa48("56012")) {
            {}
          } else {
            stryCov_9fa48("56012");
            livenessFallbackIncludedNodeIds.add(nodeId);
          }
        }
      }
    }
    const projectedActiveNodeIds = stryMutAct_9fa48("56013") ? [...new Set(activeNodeIds.filter(nodeId => typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO))] : (stryCov_9fa48("56013"), (stryMutAct_9fa48("56014") ? [] : (stryCov_9fa48("56014"), [...new Set(stryMutAct_9fa48("56015") ? activeNodeIds : (stryCov_9fa48("56015"), activeNodeIds.filter(stryMutAct_9fa48("56016") ? () => undefined : (stryCov_9fa48("56016"), nodeId => stryMutAct_9fa48("56019") ? typeof nodeId === TYPEOF.STRING || nodeId.length > NUM.ZERO : stryMutAct_9fa48("56018") ? false : stryMutAct_9fa48("56017") ? true : (stryCov_9fa48("56017", "56018", "56019"), (stryMutAct_9fa48("56021") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("56020") ? true : (stryCov_9fa48("56020", "56021"), typeof nodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("56024") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("56023") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("56022") ? true : (stryCov_9fa48("56022", "56023", "56024"), nodeId.length > NUM.ZERO)))))))])).sort());
    return Object.freeze(stryMutAct_9fa48("56025") ? {} : (stryCov_9fa48("56025"), {
      projectedActiveNodeIds: Object.freeze(stryMutAct_9fa48("56026") ? [] : (stryCov_9fa48("56026"), [...projectedActiveNodeIds])),
      projectionReadinessDecisionMode: resolveProjectionReadinessDecisionMode(options),
      projectionReadinessDecisionDimensions: resolveProjectionReadinessDecisionDimensions(options),
      recoveryEligibleProjectionEnabled: stryMutAct_9fa48("56029") ? options.allowControlPlaneRecoveryEligibleProjection !== true : stryMutAct_9fa48("56028") ? false : stryMutAct_9fa48("56027") ? true : (stryCov_9fa48("56027", "56028", "56029"), options.allowControlPlaneRecoveryEligibleProjection === (stryMutAct_9fa48("56030") ? false : (stryCov_9fa48("56030"), true))),
      recoveryEligibleIncludedNodeIds: Object.freeze(stryMutAct_9fa48("56031") ? [...recoveryEligibleIncludedNodeIds] : (stryCov_9fa48("56031"), (stryMutAct_9fa48("56032") ? [] : (stryCov_9fa48("56032"), [...recoveryEligibleIncludedNodeIds])).sort())),
      livenessFallbackIncludedNodeIds: Object.freeze(stryMutAct_9fa48("56033") ? [...livenessFallbackIncludedNodeIds] : (stryCov_9fa48("56033"), (stryMutAct_9fa48("56034") ? [] : (stryCov_9fa48("56034"), [...livenessFallbackIncludedNodeIds])).sort())),
      readinessExcludedNodeIds: Object.freeze(stryMutAct_9fa48("56035") ? [...readinessExcludedNodeIds] : (stryCov_9fa48("56035"), (stryMutAct_9fa48("56036") ? [] : (stryCov_9fa48("56036"), [...readinessExcludedNodeIds])).sort())),
      clusterMemberUnhealthyExcludedNodeIds: Object.freeze(stryMutAct_9fa48("56037") ? [...clusterMemberUnhealthyExcludedNodeIds] : (stryCov_9fa48("56037"), (stryMutAct_9fa48("56038") ? [] : (stryCov_9fa48("56038"), [...clusterMemberUnhealthyExcludedNodeIds])).sort()))
    }));
  }
}
function resolveProjectedActiveNodeIds(options = {}) {
  if (stryMutAct_9fa48("56039")) {
    {}
  } else {
    stryCov_9fa48("56039");
    return resolveProjectedActiveNodeSelection(options).projectedActiveNodeIds;
  }
}
function resolveActiveNodeViews(options = {}) {
  if (stryMutAct_9fa48("56040")) {
    {}
  } else {
    stryCov_9fa48("56040");
    const publishedActiveNodeIds = resolvePublishedActiveNodeIds(stryMutAct_9fa48("56041") ? {} : (stryCov_9fa48("56041"), {
      ...options,
      requirePublishedMembership: stryMutAct_9fa48("56042") ? true : (stryCov_9fa48("56042"), false)
    }));
    const projectedActiveNodeSelection = resolveProjectedActiveNodeSelection(options);
    const projectedActiveNodeIds = projectedActiveNodeSelection.projectedActiveNodeIds;
    const hasPublishedMembership = Array.isArray(publishedActiveNodeIds);
    const authoritativeActiveNodeIds = hasPublishedMembership ? normalizeNodeIdList(publishedActiveNodeIds) : stryMutAct_9fa48("56043") ? ["Stryker was here"] : (stryCov_9fa48("56043"), []);
    const projectedServingNodeIds = normalizeNodeIdList(projectedActiveNodeIds);
    const locallyEligibleNodeIds = stryMutAct_9fa48("56044") ? [] : (stryCov_9fa48("56044"), [...projectedServingNodeIds]);
    const missingProjectedNodeIds = hasPublishedMembership ? stryMutAct_9fa48("56045") ? authoritativeActiveNodeIds : (stryCov_9fa48("56045"), authoritativeActiveNodeIds.filter(stryMutAct_9fa48("56046") ? () => undefined : (stryCov_9fa48("56046"), nodeId => stryMutAct_9fa48("56047") ? projectedServingNodeIds.includes(nodeId) : (stryCov_9fa48("56047"), !projectedServingNodeIds.includes(nodeId))))) : stryMutAct_9fa48("56048") ? ["Stryker was here"] : (stryCov_9fa48("56048"), []);
    const unconfirmedProjectedNodeIds = hasPublishedMembership ? stryMutAct_9fa48("56049") ? projectedServingNodeIds : (stryCov_9fa48("56049"), projectedServingNodeIds.filter(stryMutAct_9fa48("56050") ? () => undefined : (stryCov_9fa48("56050"), nodeId => stryMutAct_9fa48("56051") ? authoritativeActiveNodeIds.includes(nodeId) : (stryCov_9fa48("56051"), !authoritativeActiveNodeIds.includes(nodeId))))) : stryMutAct_9fa48("56052") ? ["Stryker was here"] : (stryCov_9fa48("56052"), []);
    const minimumPublishedNodeCount = Number.isFinite(options.membershipFreezeMinPublishedNodeCount) ? stryMutAct_9fa48("56053") ? Math.min(1, Math.floor(options.membershipFreezeMinPublishedNodeCount)) : (stryCov_9fa48("56053"), Math.max(1, Math.floor(options.membershipFreezeMinPublishedNodeCount))) : MEMBERSHIP_FREEZE_DEFAULT.MIN_PUBLISHED_NODE_COUNT;
    const minimumSuspectedNodeCount = Number.isFinite(options.membershipFreezeMinSuspectedNodeCount) ? stryMutAct_9fa48("56054") ? Math.min(1, Math.floor(options.membershipFreezeMinSuspectedNodeCount)) : (stryCov_9fa48("56054"), Math.max(1, Math.floor(options.membershipFreezeMinSuspectedNodeCount))) : MEMBERSHIP_FREEZE_DEFAULT.MIN_SUSPECTED_NODE_COUNT;
    const minimumSuspectedRatio = Number.isFinite(options.membershipFreezeMinSuspectedRatio) ? stryMutAct_9fa48("56055") ? Math.min(0, options.membershipFreezeMinSuspectedRatio) : (stryCov_9fa48("56055"), Math.max(0, options.membershipFreezeMinSuspectedRatio)) : MEMBERSHIP_FREEZE_DEFAULT.MIN_SUSPECTED_RATIO;
    const membershipFreezeActive = stryMutAct_9fa48("56058") ? hasPublishedMembership && authoritativeActiveNodeIds.length >= minimumPublishedNodeCount && missingProjectedNodeIds.length >= minimumSuspectedNodeCount || missingProjectedNodeIds.length / authoritativeActiveNodeIds.length >= minimumSuspectedRatio : stryMutAct_9fa48("56057") ? false : stryMutAct_9fa48("56056") ? true : (stryCov_9fa48("56056", "56057", "56058"), (stryMutAct_9fa48("56060") ? hasPublishedMembership && authoritativeActiveNodeIds.length >= minimumPublishedNodeCount || missingProjectedNodeIds.length >= minimumSuspectedNodeCount : stryMutAct_9fa48("56059") ? true : (stryCov_9fa48("56059", "56060"), (stryMutAct_9fa48("56062") ? hasPublishedMembership || authoritativeActiveNodeIds.length >= minimumPublishedNodeCount : stryMutAct_9fa48("56061") ? true : (stryCov_9fa48("56061", "56062"), hasPublishedMembership && (stryMutAct_9fa48("56065") ? authoritativeActiveNodeIds.length < minimumPublishedNodeCount : stryMutAct_9fa48("56064") ? authoritativeActiveNodeIds.length > minimumPublishedNodeCount : stryMutAct_9fa48("56063") ? true : (stryCov_9fa48("56063", "56064", "56065"), authoritativeActiveNodeIds.length >= minimumPublishedNodeCount)))) && (stryMutAct_9fa48("56068") ? missingProjectedNodeIds.length < minimumSuspectedNodeCount : stryMutAct_9fa48("56067") ? missingProjectedNodeIds.length > minimumSuspectedNodeCount : stryMutAct_9fa48("56066") ? true : (stryCov_9fa48("56066", "56067", "56068"), missingProjectedNodeIds.length >= minimumSuspectedNodeCount)))) && (stryMutAct_9fa48("56071") ? missingProjectedNodeIds.length / authoritativeActiveNodeIds.length < minimumSuspectedRatio : stryMutAct_9fa48("56070") ? missingProjectedNodeIds.length / authoritativeActiveNodeIds.length > minimumSuspectedRatio : stryMutAct_9fa48("56069") ? true : (stryCov_9fa48("56069", "56070", "56071"), (stryMutAct_9fa48("56072") ? missingProjectedNodeIds.length * authoritativeActiveNodeIds.length : (stryCov_9fa48("56072"), missingProjectedNodeIds.length / authoritativeActiveNodeIds.length)) >= minimumSuspectedRatio)));
    const suspectedOrTransitioningNodeIds = hasPublishedMembership ? normalizeNodeIdList(stryMutAct_9fa48("56073") ? [] : (stryCov_9fa48("56073"), [...missingProjectedNodeIds, ...unconfirmedProjectedNodeIds])) : stryMutAct_9fa48("56074") ? ["Stryker was here"] : (stryCov_9fa48("56074"), []);
    const membershipFreeze = Object.freeze(stryMutAct_9fa48("56075") ? {} : (stryCov_9fa48("56075"), {
      active: membershipFreezeActive,
      reasonCode: membershipFreezeActive ? stryMutAct_9fa48("56076") ? "" : (stryCov_9fa48("56076"), 'broad_suspicion') : null,
      retainedPublishedNodeIds: Object.freeze(stryMutAct_9fa48("56077") ? [] : (stryCov_9fa48("56077"), [...authoritativeActiveNodeIds])),
      missingProjectedNodeIds: Object.freeze(stryMutAct_9fa48("56078") ? [] : (stryCov_9fa48("56078"), [...missingProjectedNodeIds])),
      unconfirmedProjectedNodeIds: Object.freeze(stryMutAct_9fa48("56079") ? [] : (stryCov_9fa48("56079"), [...unconfirmedProjectedNodeIds]))
    }));
    const effectiveActiveNodeIds = hasPublishedMembership ? stryMutAct_9fa48("56080") ? [] : (stryCov_9fa48("56080"), [...authoritativeActiveNodeIds]) : stryMutAct_9fa48("56081") ? [] : (stryCov_9fa48("56081"), [...projectedServingNodeIds]);
    return Object.freeze(stryMutAct_9fa48("56082") ? {} : (stryCov_9fa48("56082"), {
      authoritativeSource: hasPublishedMembership ? stryMutAct_9fa48("56083") ? "" : (stryCov_9fa48("56083"), 'published_membership') : stryMutAct_9fa48("56084") ? "" : (stryCov_9fa48("56084"), 'unpublished'),
      authoritativeActiveNodeIds: Object.freeze(stryMutAct_9fa48("56085") ? [] : (stryCov_9fa48("56085"), [...authoritativeActiveNodeIds])),
      projectedServingNodeIds: Object.freeze(stryMutAct_9fa48("56086") ? [] : (stryCov_9fa48("56086"), [...projectedServingNodeIds])),
      locallyEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56087") ? [] : (stryCov_9fa48("56087"), [...locallyEligibleNodeIds])),
      suspectedOrTransitioningNodeIds: Object.freeze(stryMutAct_9fa48("56088") ? [] : (stryCov_9fa48("56088"), [...suspectedOrTransitioningNodeIds])),
      membershipFreeze,
      effectiveSource: hasPublishedMembership ? stryMutAct_9fa48("56089") ? "" : (stryCov_9fa48("56089"), 'published_membership') : stryMutAct_9fa48("56090") ? "" : (stryCov_9fa48("56090"), 'projected'),
      effectiveActiveNodeIds: Object.freeze(effectiveActiveNodeIds),
      projectedActiveNodeIds: Object.freeze(stryMutAct_9fa48("56091") ? [] : (stryCov_9fa48("56091"), [...projectedActiveNodeIds])),
      publishedActiveNodeIds: hasPublishedMembership ? Object.freeze(stryMutAct_9fa48("56092") ? [] : (stryCov_9fa48("56092"), [...publishedActiveNodeIds])) : null,
      projectionDiagnostics: Object.freeze(stryMutAct_9fa48("56093") ? {} : (stryCov_9fa48("56093"), {
        readinessDecisionMode: projectedActiveNodeSelection.projectionReadinessDecisionMode,
        readinessDecisionDimensions: Object.freeze(stryMutAct_9fa48("56094") ? [] : (stryCov_9fa48("56094"), [...projectedActiveNodeSelection.projectionReadinessDecisionDimensions])),
        recoveryEligibleProjectionEnabled: stryMutAct_9fa48("56097") ? projectedActiveNodeSelection.recoveryEligibleProjectionEnabled !== true : stryMutAct_9fa48("56096") ? false : stryMutAct_9fa48("56095") ? true : (stryCov_9fa48("56095", "56096", "56097"), projectedActiveNodeSelection.recoveryEligibleProjectionEnabled === (stryMutAct_9fa48("56098") ? false : (stryCov_9fa48("56098"), true))),
        recoveryEligibleIncludedNodeIds: Object.freeze(stryMutAct_9fa48("56099") ? [] : (stryCov_9fa48("56099"), [...projectedActiveNodeSelection.recoveryEligibleIncludedNodeIds])),
        livenessFallbackIncludedNodeIds: Object.freeze(stryMutAct_9fa48("56100") ? [] : (stryCov_9fa48("56100"), [...projectedActiveNodeSelection.livenessFallbackIncludedNodeIds])),
        readinessExcludedNodeIds: Object.freeze(stryMutAct_9fa48("56101") ? [] : (stryCov_9fa48("56101"), [...projectedActiveNodeSelection.readinessExcludedNodeIds])),
        clusterMemberUnhealthyExcludedNodeIds: Object.freeze(stryMutAct_9fa48("56102") ? [] : (stryCov_9fa48("56102"), [...projectedActiveNodeSelection.clusterMemberUnhealthyExcludedNodeIds]))
      })),
      publishedMembershipAvailable: hasPublishedMembership
    }));
  }
}
function resolveCanonicalActiveNodeIds(options = {}) {
  if (stryMutAct_9fa48("56103")) {
    {}
  } else {
    stryCov_9fa48("56103");
    const activeNodeViews = resolveActiveNodeViews(options);
    if (stryMutAct_9fa48("56106") ? options.requirePublishedMembership === true || activeNodeViews.publishedActiveNodeIds === null : stryMutAct_9fa48("56105") ? false : stryMutAct_9fa48("56104") ? true : (stryCov_9fa48("56104", "56105", "56106"), (stryMutAct_9fa48("56108") ? options.requirePublishedMembership !== true : stryMutAct_9fa48("56107") ? true : (stryCov_9fa48("56107", "56108"), options.requirePublishedMembership === (stryMutAct_9fa48("56109") ? false : (stryCov_9fa48("56109"), true)))) && (stryMutAct_9fa48("56111") ? activeNodeViews.publishedActiveNodeIds !== null : stryMutAct_9fa48("56110") ? true : (stryCov_9fa48("56110", "56111"), activeNodeViews.publishedActiveNodeIds === null)))) {
      if (stryMutAct_9fa48("56112")) {
        {}
      } else {
        stryCov_9fa48("56112");
        return stryMutAct_9fa48("56113") ? ["Stryker was here"] : (stryCov_9fa48("56113"), []);
      }
    }
    return stryMutAct_9fa48("56114") ? [] : (stryCov_9fa48("56114"), [...activeNodeViews.effectiveActiveNodeIds]);
  }
}
function resolvePriorityRecoveryActiveNodeCohort(publicationConvergence = null) {
  if (stryMutAct_9fa48("56115")) {
    {}
  } else {
    stryCov_9fa48("56115");
    const normalizedPublicationConvergence = (stryMutAct_9fa48("56118") ? publicationConvergence || typeof publicationConvergence === TYPEOF.OBJECT : stryMutAct_9fa48("56117") ? false : stryMutAct_9fa48("56116") ? true : (stryCov_9fa48("56116", "56117", "56118"), publicationConvergence && (stryMutAct_9fa48("56120") ? typeof publicationConvergence !== TYPEOF.OBJECT : stryMutAct_9fa48("56119") ? true : (stryCov_9fa48("56119", "56120"), typeof publicationConvergence === TYPEOF.OBJECT)))) ? publicationConvergence : {};
    const membershipLifecycleSummary = (stryMutAct_9fa48("56123") ? normalizedPublicationConvergence.membershipLifecycleSummary || typeof normalizedPublicationConvergence.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("56122") ? false : stryMutAct_9fa48("56121") ? true : (stryCov_9fa48("56121", "56122", "56123"), normalizedPublicationConvergence.membershipLifecycleSummary && (stryMutAct_9fa48("56125") ? typeof normalizedPublicationConvergence.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("56124") ? true : (stryCov_9fa48("56124", "56125"), typeof normalizedPublicationConvergence.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? normalizedPublicationConvergence.membershipLifecycleSummary : null;
    const projectionDiagnostics = (stryMutAct_9fa48("56128") ? normalizedPublicationConvergence.projectionDiagnostics || typeof normalizedPublicationConvergence.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("56127") ? false : stryMutAct_9fa48("56126") ? true : (stryCov_9fa48("56126", "56127", "56128"), normalizedPublicationConvergence.projectionDiagnostics && (stryMutAct_9fa48("56130") ? typeof normalizedPublicationConvergence.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("56129") ? true : (stryCov_9fa48("56129", "56130"), typeof normalizedPublicationConvergence.projectionDiagnostics === TYPEOF.OBJECT)))) ? normalizedPublicationConvergence.projectionDiagnostics : (stryMutAct_9fa48("56133") ? membershipLifecycleSummary?.projectionDiagnostics || typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("56132") ? false : stryMutAct_9fa48("56131") ? true : (stryCov_9fa48("56131", "56132", "56133"), (stryMutAct_9fa48("56134") ? membershipLifecycleSummary.projectionDiagnostics : (stryCov_9fa48("56134"), membershipLifecycleSummary?.projectionDiagnostics)) && (stryMutAct_9fa48("56136") ? typeof membershipLifecycleSummary.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("56135") ? true : (stryCov_9fa48("56135", "56136"), typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT)))) ? membershipLifecycleSummary.projectionDiagnostics : null;
    const publishedActiveNodeIds = normalizeNodeIdList(Array.isArray(stryMutAct_9fa48("56137") ? normalizedPublicationConvergence.publishedActiveNodeIds : (stryCov_9fa48("56137"), normalizedPublicationConvergence?.publishedActiveNodeIds)) ? normalizedPublicationConvergence.publishedActiveNodeIds : stryMutAct_9fa48("56138") ? membershipLifecycleSummary.publishedActiveNodeIds : (stryCov_9fa48("56138"), membershipLifecycleSummary?.publishedActiveNodeIds));
    const projectedServingNodeIds = normalizeNodeIdList(stryMutAct_9fa48("56139") ? [] : (stryCov_9fa48("56139"), [...(Array.isArray(stryMutAct_9fa48("56140") ? normalizedPublicationConvergence.projectedServingNodeIds : (stryCov_9fa48("56140"), normalizedPublicationConvergence?.projectedServingNodeIds)) ? normalizedPublicationConvergence.projectedServingNodeIds : stryMutAct_9fa48("56141") ? ["Stryker was here"] : (stryCov_9fa48("56141"), [])), ...(Array.isArray(stryMutAct_9fa48("56142") ? membershipLifecycleSummary.projectedServingNodeIds : (stryCov_9fa48("56142"), membershipLifecycleSummary?.projectedServingNodeIds)) ? membershipLifecycleSummary.projectedServingNodeIds : stryMutAct_9fa48("56143") ? ["Stryker was here"] : (stryCov_9fa48("56143"), []))]));
    const locallyEligibleNodeIds = normalizeNodeIdList(stryMutAct_9fa48("56144") ? [] : (stryCov_9fa48("56144"), [...(Array.isArray(stryMutAct_9fa48("56145") ? normalizedPublicationConvergence.locallyEligibleNodeIds : (stryCov_9fa48("56145"), normalizedPublicationConvergence?.locallyEligibleNodeIds)) ? normalizedPublicationConvergence.locallyEligibleNodeIds : stryMutAct_9fa48("56146") ? ["Stryker was here"] : (stryCov_9fa48("56146"), [])), ...(Array.isArray(stryMutAct_9fa48("56147") ? membershipLifecycleSummary.locallyEligibleNodeIds : (stryCov_9fa48("56147"), membershipLifecycleSummary?.locallyEligibleNodeIds)) ? membershipLifecycleSummary.locallyEligibleNodeIds : stryMutAct_9fa48("56148") ? ["Stryker was here"] : (stryCov_9fa48("56148"), []))]));
    const recoveryEligibleIncludedNodeIds = normalizeNodeIdList(stryMutAct_9fa48("56149") ? projectionDiagnostics.recoveryEligibleIncludedNodeIds : (stryCov_9fa48("56149"), projectionDiagnostics?.recoveryEligibleIncludedNodeIds));
    const livenessFallbackIncludedNodeIds = normalizeNodeIdList(stryMutAct_9fa48("56150") ? projectionDiagnostics.livenessFallbackIncludedNodeIds : (stryCov_9fa48("56150"), projectionDiagnostics?.livenessFallbackIncludedNodeIds));
    const explicitRecoveryActiveNodeIds = normalizeNodeIdList(stryMutAct_9fa48("56151") ? [] : (stryCov_9fa48("56151"), [...(Array.isArray(stryMutAct_9fa48("56152") ? normalizedPublicationConvergence.recoveryActiveNodeIds : (stryCov_9fa48("56152"), normalizedPublicationConvergence?.recoveryActiveNodeIds)) ? normalizedPublicationConvergence.recoveryActiveNodeIds : stryMutAct_9fa48("56153") ? ["Stryker was here"] : (stryCov_9fa48("56153"), [])), ...(Array.isArray(stryMutAct_9fa48("56154") ? membershipLifecycleSummary.recoveryActiveNodeIds : (stryCov_9fa48("56154"), membershipLifecycleSummary?.recoveryActiveNodeIds)) ? membershipLifecycleSummary.recoveryActiveNodeIds : stryMutAct_9fa48("56155") ? ["Stryker was here"] : (stryCov_9fa48("56155"), []))]));
    const explicitRecoveryActiveNodeSource = (stryMutAct_9fa48("56158") ? typeof normalizedPublicationConvergence?.recoveryActiveNodeSource === TYPEOF.STRING || normalizedPublicationConvergence.recoveryActiveNodeSource.trim().length > NUM.ZERO : stryMutAct_9fa48("56157") ? false : stryMutAct_9fa48("56156") ? true : (stryCov_9fa48("56156", "56157", "56158"), (stryMutAct_9fa48("56160") ? typeof normalizedPublicationConvergence?.recoveryActiveNodeSource !== TYPEOF.STRING : stryMutAct_9fa48("56159") ? true : (stryCov_9fa48("56159", "56160"), typeof (stryMutAct_9fa48("56161") ? normalizedPublicationConvergence.recoveryActiveNodeSource : (stryCov_9fa48("56161"), normalizedPublicationConvergence?.recoveryActiveNodeSource)) === TYPEOF.STRING)) && (stryMutAct_9fa48("56164") ? normalizedPublicationConvergence.recoveryActiveNodeSource.trim().length <= NUM.ZERO : stryMutAct_9fa48("56163") ? normalizedPublicationConvergence.recoveryActiveNodeSource.trim().length >= NUM.ZERO : stryMutAct_9fa48("56162") ? true : (stryCov_9fa48("56162", "56163", "56164"), (stryMutAct_9fa48("56165") ? normalizedPublicationConvergence.recoveryActiveNodeSource.length : (stryCov_9fa48("56165"), normalizedPublicationConvergence.recoveryActiveNodeSource.trim().length)) > NUM.ZERO)))) ? stryMutAct_9fa48("56166") ? normalizedPublicationConvergence.recoveryActiveNodeSource : (stryCov_9fa48("56166"), normalizedPublicationConvergence.recoveryActiveNodeSource.trim()) : (stryMutAct_9fa48("56169") ? typeof membershipLifecycleSummary?.recoveryActiveNodeSource === TYPEOF.STRING || membershipLifecycleSummary.recoveryActiveNodeSource.trim().length > NUM.ZERO : stryMutAct_9fa48("56168") ? false : stryMutAct_9fa48("56167") ? true : (stryCov_9fa48("56167", "56168", "56169"), (stryMutAct_9fa48("56171") ? typeof membershipLifecycleSummary?.recoveryActiveNodeSource !== TYPEOF.STRING : stryMutAct_9fa48("56170") ? true : (stryCov_9fa48("56170", "56171"), typeof (stryMutAct_9fa48("56172") ? membershipLifecycleSummary.recoveryActiveNodeSource : (stryCov_9fa48("56172"), membershipLifecycleSummary?.recoveryActiveNodeSource)) === TYPEOF.STRING)) && (stryMutAct_9fa48("56175") ? membershipLifecycleSummary.recoveryActiveNodeSource.trim().length <= NUM.ZERO : stryMutAct_9fa48("56174") ? membershipLifecycleSummary.recoveryActiveNodeSource.trim().length >= NUM.ZERO : stryMutAct_9fa48("56173") ? true : (stryCov_9fa48("56173", "56174", "56175"), (stryMutAct_9fa48("56176") ? membershipLifecycleSummary.recoveryActiveNodeSource.length : (stryCov_9fa48("56176"), membershipLifecycleSummary.recoveryActiveNodeSource.trim().length)) > NUM.ZERO)))) ? stryMutAct_9fa48("56177") ? membershipLifecycleSummary.recoveryActiveNodeSource : (stryCov_9fa48("56177"), membershipLifecycleSummary.recoveryActiveNodeSource.trim()) : null;
    const publishedActiveNodeIdSet = new Set(publishedActiveNodeIds);
    const projectionNodeIds = normalizeNodeIdList(stryMutAct_9fa48("56178") ? [] : (stryCov_9fa48("56178"), [...locallyEligibleNodeIds, ...projectedServingNodeIds, ...recoveryEligibleIncludedNodeIds]));
    const projectionAddsNodes = stryMutAct_9fa48("56179") ? projectionNodeIds.every(nodeId => !publishedActiveNodeIdSet.has(nodeId)) : (stryCov_9fa48("56179"), projectionNodeIds.some(stryMutAct_9fa48("56180") ? () => undefined : (stryCov_9fa48("56180"), nodeId => stryMutAct_9fa48("56181") ? publishedActiveNodeIdSet.has(nodeId) : (stryCov_9fa48("56181"), !publishedActiveNodeIdSet.has(nodeId)))));
    const shouldUseProjectionCohort = stryMutAct_9fa48("56184") ? projectionNodeIds.length > NUM.ZERO || publishedActiveNodeIds.length === NUM.ZERO || projectionAddsNodes || recoveryEligibleIncludedNodeIds.length > NUM.ZERO || livenessFallbackIncludedNodeIds.length > NUM.ZERO : stryMutAct_9fa48("56183") ? false : stryMutAct_9fa48("56182") ? true : (stryCov_9fa48("56182", "56183", "56184"), (stryMutAct_9fa48("56187") ? projectionNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56186") ? projectionNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56185") ? true : (stryCov_9fa48("56185", "56186", "56187"), projectionNodeIds.length > NUM.ZERO)) && (stryMutAct_9fa48("56189") ? (publishedActiveNodeIds.length === NUM.ZERO || projectionAddsNodes || recoveryEligibleIncludedNodeIds.length > NUM.ZERO) && livenessFallbackIncludedNodeIds.length > NUM.ZERO : stryMutAct_9fa48("56188") ? true : (stryCov_9fa48("56188", "56189"), (stryMutAct_9fa48("56191") ? (publishedActiveNodeIds.length === NUM.ZERO || projectionAddsNodes) && recoveryEligibleIncludedNodeIds.length > NUM.ZERO : stryMutAct_9fa48("56190") ? false : (stryCov_9fa48("56190", "56191"), (stryMutAct_9fa48("56193") ? publishedActiveNodeIds.length === NUM.ZERO && projectionAddsNodes : stryMutAct_9fa48("56192") ? false : (stryCov_9fa48("56192", "56193"), (stryMutAct_9fa48("56195") ? publishedActiveNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("56194") ? false : (stryCov_9fa48("56194", "56195"), publishedActiveNodeIds.length === NUM.ZERO)) || projectionAddsNodes)) || (stryMutAct_9fa48("56198") ? recoveryEligibleIncludedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56197") ? recoveryEligibleIncludedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56196") ? false : (stryCov_9fa48("56196", "56197", "56198"), recoveryEligibleIncludedNodeIds.length > NUM.ZERO)))) || (stryMutAct_9fa48("56201") ? livenessFallbackIncludedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56200") ? livenessFallbackIncludedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56199") ? false : (stryCov_9fa48("56199", "56200", "56201"), livenessFallbackIncludedNodeIds.length > NUM.ZERO)))));
    const buildProjectionCohortNodeIds = stryMutAct_9fa48("56202") ? () => undefined : (stryCov_9fa48("56202"), (() => {
      const buildProjectionCohortNodeIds = candidateNodeIds => normalizeNodeIdList(stryMutAct_9fa48("56203") ? [] : (stryCov_9fa48("56203"), [...publishedActiveNodeIds, ...candidateNodeIds]));
      return buildProjectionCohortNodeIds;
    })());
    let activeNodeIds = stryMutAct_9fa48("56204") ? ["Stryker was here"] : (stryCov_9fa48("56204"), []);
    let source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.NONE;
    if (stryMutAct_9fa48("56208") ? explicitRecoveryActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56207") ? explicitRecoveryActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56206") ? false : stryMutAct_9fa48("56205") ? true : (stryCov_9fa48("56205", "56206", "56207", "56208"), explicitRecoveryActiveNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("56209")) {
        {}
      } else {
        stryCov_9fa48("56209");
        activeNodeIds = explicitRecoveryActiveNodeIds;
        source = stryMutAct_9fa48("56212") ? explicitRecoveryActiveNodeSource && ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION : stryMutAct_9fa48("56211") ? false : stryMutAct_9fa48("56210") ? true : (stryCov_9fa48("56210", "56211", "56212"), explicitRecoveryActiveNodeSource || ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION);
      }
    } else if (stryMutAct_9fa48("56215") ? shouldUseProjectionCohort || locallyEligibleNodeIds.length > NUM.ZERO : stryMutAct_9fa48("56214") ? false : stryMutAct_9fa48("56213") ? true : (stryCov_9fa48("56213", "56214", "56215"), shouldUseProjectionCohort && (stryMutAct_9fa48("56218") ? locallyEligibleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56217") ? locallyEligibleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56216") ? true : (stryCov_9fa48("56216", "56217", "56218"), locallyEligibleNodeIds.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("56219")) {
        {}
      } else {
        stryCov_9fa48("56219");
        activeNodeIds = buildProjectionCohortNodeIds(locallyEligibleNodeIds);
        source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
      }
    } else if (stryMutAct_9fa48("56222") ? shouldUseProjectionCohort || projectedServingNodeIds.length > NUM.ZERO : stryMutAct_9fa48("56221") ? false : stryMutAct_9fa48("56220") ? true : (stryCov_9fa48("56220", "56221", "56222"), shouldUseProjectionCohort && (stryMutAct_9fa48("56225") ? projectedServingNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56224") ? projectedServingNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56223") ? true : (stryCov_9fa48("56223", "56224", "56225"), projectedServingNodeIds.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("56226")) {
        {}
      } else {
        stryCov_9fa48("56226");
        activeNodeIds = buildProjectionCohortNodeIds(projectedServingNodeIds);
        source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PROJECTED_SERVING;
      }
    } else if (stryMutAct_9fa48("56229") ? shouldUseProjectionCohort || recoveryEligibleIncludedNodeIds.length > NUM.ZERO : stryMutAct_9fa48("56228") ? false : stryMutAct_9fa48("56227") ? true : (stryCov_9fa48("56227", "56228", "56229"), shouldUseProjectionCohort && (stryMutAct_9fa48("56232") ? recoveryEligibleIncludedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56231") ? recoveryEligibleIncludedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56230") ? true : (stryCov_9fa48("56230", "56231", "56232"), recoveryEligibleIncludedNodeIds.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("56233")) {
        {}
      } else {
        stryCov_9fa48("56233");
        activeNodeIds = buildProjectionCohortNodeIds(recoveryEligibleIncludedNodeIds);
        source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.RECOVERY_ELIGIBLE_PROJECTION;
      }
    } else if (stryMutAct_9fa48("56237") ? publishedActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56236") ? publishedActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56235") ? false : stryMutAct_9fa48("56234") ? true : (stryCov_9fa48("56234", "56235", "56236", "56237"), publishedActiveNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("56238")) {
        {}
      } else {
        stryCov_9fa48("56238");
        activeNodeIds = publishedActiveNodeIds;
        source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PUBLISHED_MEMBERSHIP;
      }
    } else if (stryMutAct_9fa48("56242") ? locallyEligibleNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56241") ? locallyEligibleNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56240") ? false : stryMutAct_9fa48("56239") ? true : (stryCov_9fa48("56239", "56240", "56241", "56242"), locallyEligibleNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("56243")) {
        {}
      } else {
        stryCov_9fa48("56243");
        activeNodeIds = locallyEligibleNodeIds;
        source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.LOCALLY_ELIGIBLE_PROJECTION;
      }
    } else if (stryMutAct_9fa48("56247") ? projectedServingNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56246") ? projectedServingNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56245") ? false : stryMutAct_9fa48("56244") ? true : (stryCov_9fa48("56244", "56245", "56246", "56247"), projectedServingNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("56248")) {
        {}
      } else {
        stryCov_9fa48("56248");
        activeNodeIds = projectedServingNodeIds;
        source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.PROJECTED_SERVING;
      }
    } else if (stryMutAct_9fa48("56252") ? recoveryEligibleIncludedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("56251") ? recoveryEligibleIncludedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("56250") ? false : stryMutAct_9fa48("56249") ? true : (stryCov_9fa48("56249", "56250", "56251", "56252"), recoveryEligibleIncludedNodeIds.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("56253")) {
        {}
      } else {
        stryCov_9fa48("56253");
        activeNodeIds = recoveryEligibleIncludedNodeIds;
        source = ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE.RECOVERY_ELIGIBLE_PROJECTION;
      }
    }
    return Object.freeze(stryMutAct_9fa48("56254") ? {} : (stryCov_9fa48("56254"), {
      activeNodeIds: Object.freeze(stryMutAct_9fa48("56255") ? [] : (stryCov_9fa48("56255"), [...activeNodeIds])),
      source,
      publishedActiveNodeIds: Object.freeze(stryMutAct_9fa48("56256") ? [] : (stryCov_9fa48("56256"), [...publishedActiveNodeIds])),
      projectedServingNodeIds: Object.freeze(stryMutAct_9fa48("56257") ? [] : (stryCov_9fa48("56257"), [...projectedServingNodeIds])),
      locallyEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56258") ? [] : (stryCov_9fa48("56258"), [...locallyEligibleNodeIds])),
      recoveryEligibleIncludedNodeIds: Object.freeze(stryMutAct_9fa48("56259") ? [] : (stryCov_9fa48("56259"), [...recoveryEligibleIncludedNodeIds])),
      missingPublishedActiveNodeIds: Object.freeze(stryMutAct_9fa48("56260") ? activeNodeIds : (stryCov_9fa48("56260"), activeNodeIds.filter(stryMutAct_9fa48("56261") ? () => undefined : (stryCov_9fa48("56261"), nodeId => stryMutAct_9fa48("56262") ? publishedActiveNodeIds.includes(nodeId) : (stryCov_9fa48("56262"), !publishedActiveNodeIds.includes(nodeId))))))
    }));
  }
}
function buildActiveMembershipSnapshot(publicationConvergence = null) {
  if (stryMutAct_9fa48("56263")) {
    {}
  } else {
    stryCov_9fa48("56263");
    const normalizedPublicationConvergence = (stryMutAct_9fa48("56266") ? publicationConvergence || typeof publicationConvergence === TYPEOF.OBJECT : stryMutAct_9fa48("56265") ? false : stryMutAct_9fa48("56264") ? true : (stryCov_9fa48("56264", "56265", "56266"), publicationConvergence && (stryMutAct_9fa48("56268") ? typeof publicationConvergence !== TYPEOF.OBJECT : stryMutAct_9fa48("56267") ? true : (stryCov_9fa48("56267", "56268"), typeof publicationConvergence === TYPEOF.OBJECT)))) ? publicationConvergence : {};
    const membershipLifecycleSummary = (stryMutAct_9fa48("56271") ? normalizedPublicationConvergence.membershipLifecycleSummary || typeof normalizedPublicationConvergence.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("56270") ? false : stryMutAct_9fa48("56269") ? true : (stryCov_9fa48("56269", "56270", "56271"), normalizedPublicationConvergence.membershipLifecycleSummary && (stryMutAct_9fa48("56273") ? typeof normalizedPublicationConvergence.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("56272") ? true : (stryCov_9fa48("56272", "56273"), typeof normalizedPublicationConvergence.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? normalizedPublicationConvergence.membershipLifecycleSummary : null;
    const projectionDiagnostics = (stryMutAct_9fa48("56276") ? normalizedPublicationConvergence.projectionDiagnostics || typeof normalizedPublicationConvergence.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("56275") ? false : stryMutAct_9fa48("56274") ? true : (stryCov_9fa48("56274", "56275", "56276"), normalizedPublicationConvergence.projectionDiagnostics && (stryMutAct_9fa48("56278") ? typeof normalizedPublicationConvergence.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("56277") ? true : (stryCov_9fa48("56277", "56278"), typeof normalizedPublicationConvergence.projectionDiagnostics === TYPEOF.OBJECT)))) ? normalizedPublicationConvergence.projectionDiagnostics : (stryMutAct_9fa48("56281") ? membershipLifecycleSummary?.projectionDiagnostics || typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("56280") ? false : stryMutAct_9fa48("56279") ? true : (stryCov_9fa48("56279", "56280", "56281"), (stryMutAct_9fa48("56282") ? membershipLifecycleSummary.projectionDiagnostics : (stryCov_9fa48("56282"), membershipLifecycleSummary?.projectionDiagnostics)) && (stryMutAct_9fa48("56284") ? typeof membershipLifecycleSummary.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("56283") ? true : (stryCov_9fa48("56283", "56284"), typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT)))) ? membershipLifecycleSummary.projectionDiagnostics : null;
    const activeNodeCohort = resolvePriorityRecoveryActiveNodeCohort(normalizedPublicationConvergence);
    return Object.freeze(stryMutAct_9fa48("56285") ? {} : (stryCov_9fa48("56285"), {
      publishedActiveNodeIds: Object.freeze(stryMutAct_9fa48("56286") ? [] : (stryCov_9fa48("56286"), [...activeNodeCohort.publishedActiveNodeIds])),
      projectedServingNodeIds: Object.freeze(stryMutAct_9fa48("56287") ? [] : (stryCov_9fa48("56287"), [...activeNodeCohort.projectedServingNodeIds])),
      locallyEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56288") ? [] : (stryCov_9fa48("56288"), [...activeNodeCohort.locallyEligibleNodeIds])),
      projectionDiagnostics: (stryMutAct_9fa48("56291") ? projectionDiagnostics || typeof projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("56290") ? false : stryMutAct_9fa48("56289") ? true : (stryCov_9fa48("56289", "56290", "56291"), projectionDiagnostics && (stryMutAct_9fa48("56293") ? typeof projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("56292") ? true : (stryCov_9fa48("56292", "56293"), typeof projectionDiagnostics === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("56294") ? {} : (stryCov_9fa48("56294"), {
        ...projectionDiagnostics
      })) : null,
      recoveryEligibleIncludedNodeIds: Object.freeze(stryMutAct_9fa48("56295") ? [] : (stryCov_9fa48("56295"), [...activeNodeCohort.recoveryEligibleIncludedNodeIds])),
      concreteEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56296") ? [] : (stryCov_9fa48("56296"), [...activeNodeCohort.activeNodeIds])),
      recoveryActiveNodeIds: Object.freeze(stryMutAct_9fa48("56297") ? [] : (stryCov_9fa48("56297"), [...activeNodeCohort.activeNodeIds])),
      recoveryActiveNodeSource: activeNodeCohort.source,
      missingPublishedRecoveryActiveNodeIds: Object.freeze(stryMutAct_9fa48("56298") ? [] : (stryCov_9fa48("56298"), [...activeNodeCohort.missingPublishedActiveNodeIds])),
      missingPublishedEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56299") ? [] : (stryCov_9fa48("56299"), [...activeNodeCohort.missingPublishedActiveNodeIds]))
    }));
  }
}
function buildMembershipPublicationActiveSnapshot(membershipPublication = null) {
  if (stryMutAct_9fa48("56300")) {
    {}
  } else {
    stryCov_9fa48("56300");
    if (stryMutAct_9fa48("56303") ? !membershipPublication && typeof membershipPublication !== TYPEOF.OBJECT : stryMutAct_9fa48("56302") ? false : stryMutAct_9fa48("56301") ? true : (stryCov_9fa48("56301", "56302", "56303"), (stryMutAct_9fa48("56304") ? membershipPublication : (stryCov_9fa48("56304"), !membershipPublication)) || (stryMutAct_9fa48("56306") ? typeof membershipPublication === TYPEOF.OBJECT : stryMutAct_9fa48("56305") ? false : (stryCov_9fa48("56305", "56306"), typeof membershipPublication !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("56307")) {
        {}
      } else {
        stryCov_9fa48("56307");
        return null;
      }
    }
    const normalizedPublication = normalizeControlPlanePublicationRow(membershipPublication);
    const membershipLifecycleSummary = (stryMutAct_9fa48("56310") ? normalizedPublication.membershipLifecycleSummary || typeof normalizedPublication.membershipLifecycleSummary === TYPEOF.OBJECT : stryMutAct_9fa48("56309") ? false : stryMutAct_9fa48("56308") ? true : (stryCov_9fa48("56308", "56309", "56310"), normalizedPublication.membershipLifecycleSummary && (stryMutAct_9fa48("56312") ? typeof normalizedPublication.membershipLifecycleSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("56311") ? true : (stryCov_9fa48("56311", "56312"), typeof normalizedPublication.membershipLifecycleSummary === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("56313") ? {} : (stryCov_9fa48("56313"), {
      ...normalizedPublication.membershipLifecycleSummary
    })) : null;
    const projectionDiagnostics = (stryMutAct_9fa48("56316") ? membershipLifecycleSummary?.projectionDiagnostics || typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT : stryMutAct_9fa48("56315") ? false : stryMutAct_9fa48("56314") ? true : (stryCov_9fa48("56314", "56315", "56316"), (stryMutAct_9fa48("56317") ? membershipLifecycleSummary.projectionDiagnostics : (stryCov_9fa48("56317"), membershipLifecycleSummary?.projectionDiagnostics)) && (stryMutAct_9fa48("56319") ? typeof membershipLifecycleSummary.projectionDiagnostics !== TYPEOF.OBJECT : stryMutAct_9fa48("56318") ? true : (stryCov_9fa48("56318", "56319"), typeof membershipLifecycleSummary.projectionDiagnostics === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("56320") ? {} : (stryCov_9fa48("56320"), {
      ...membershipLifecycleSummary.projectionDiagnostics
    })) : null;
    const publicationStatus = (stryMutAct_9fa48("56323") ? typeof membershipPublication.status !== TYPEOF.STRING : stryMutAct_9fa48("56322") ? false : stryMutAct_9fa48("56321") ? true : (stryCov_9fa48("56321", "56322", "56323"), typeof membershipPublication.status === TYPEOF.STRING)) ? membershipPublication.status : stryMutAct_9fa48("56326") ? normalizedPublication.status && null : stryMutAct_9fa48("56325") ? false : stryMutAct_9fa48("56324") ? true : (stryCov_9fa48("56324", "56325", "56326"), normalizedPublication.status || null);
    const publishedActiveNodeIdsPresent = stryMutAct_9fa48("56329") ? (membershipPublication.publishedActiveNodeIdsPresent === true || Array.isArray(membershipPublication.publishedActiveNodeIds)) && Array.isArray(membershipPublication.published_active_node_ids) : stryMutAct_9fa48("56328") ? false : stryMutAct_9fa48("56327") ? true : (stryCov_9fa48("56327", "56328", "56329"), (stryMutAct_9fa48("56331") ? membershipPublication.publishedActiveNodeIdsPresent === true && Array.isArray(membershipPublication.publishedActiveNodeIds) : stryMutAct_9fa48("56330") ? false : (stryCov_9fa48("56330", "56331"), (stryMutAct_9fa48("56333") ? membershipPublication.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("56332") ? false : (stryCov_9fa48("56332", "56333"), membershipPublication.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("56334") ? false : (stryCov_9fa48("56334"), true)))) || Array.isArray(membershipPublication.publishedActiveNodeIds))) || Array.isArray(membershipPublication.published_active_node_ids));
    const priorityRecoveryPublicationContext = buildActiveMembershipSnapshot(stryMutAct_9fa48("56335") ? {} : (stryCov_9fa48("56335"), {
      publishedActiveNodeIds: normalizedPublication.publishedActiveNodeIds,
      membershipLifecycleSummary,
      projectionDiagnostics,
      recoveryActiveNodeIds: stryMutAct_9fa48("56336") ? membershipPublication.recoveryActiveNodeIds && membershipPublication.recovery_active_node_ids : (stryCov_9fa48("56336"), membershipPublication.recoveryActiveNodeIds ?? membershipPublication.recovery_active_node_ids),
      recoveryActiveNodeSource: stryMutAct_9fa48("56337") ? membershipPublication.recoveryActiveNodeSource && membershipPublication.recovery_active_node_source : (stryCov_9fa48("56337"), membershipPublication.recoveryActiveNodeSource ?? membershipPublication.recovery_active_node_source)
    }));
    return Object.freeze(stryMutAct_9fa48("56338") ? {} : (stryCov_9fa48("56338"), {
      publicationEpoch: Number.isFinite(normalizedPublication.publicationEpoch) ? normalizedPublication.publicationEpoch : null,
      status: publicationStatus,
      publicationStatus: publicationStatus,
      sourceTopologyEpoch: Number.isFinite(normalizedPublication.sourceTopologyEpoch) ? normalizedPublication.sourceTopologyEpoch : null,
      sourceSnapshotVersion: Number.isFinite(normalizedPublication.sourceSnapshotVersion) ? normalizedPublication.sourceSnapshotVersion : null,
      publishedActiveNodeIdsPresent,
      publishedActiveNodeIds: Object.freeze(stryMutAct_9fa48("56339") ? [] : (stryCov_9fa48("56339"), [...normalizedPublication.publishedActiveNodeIds])),
      requiredAckNodeIds: Object.freeze(stryMutAct_9fa48("56340") ? [] : (stryCov_9fa48("56340"), [...normalizedPublication.requiredAckNodeIds])),
      acknowledgedNodeIds: Object.freeze(stryMutAct_9fa48("56341") ? [] : (stryCov_9fa48("56341"), [...normalizedPublication.acknowledgedNodeIds])),
      priorityPartitionSummary: (stryMutAct_9fa48("56344") ? normalizedPublication.priorityPartitionSummary || typeof normalizedPublication.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("56343") ? false : stryMutAct_9fa48("56342") ? true : (stryCov_9fa48("56342", "56343", "56344"), normalizedPublication.priorityPartitionSummary && (stryMutAct_9fa48("56346") ? typeof normalizedPublication.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("56345") ? true : (stryCov_9fa48("56345", "56346"), typeof normalizedPublication.priorityPartitionSummary === TYPEOF.OBJECT)))) ? Object.freeze(stryMutAct_9fa48("56347") ? {} : (stryCov_9fa48("56347"), {
        ...normalizedPublication.priorityPartitionSummary
      })) : null,
      membershipLifecycleSummary,
      projectionDiagnostics,
      projectedServingNodeIds: Object.freeze(stryMutAct_9fa48("56348") ? [] : (stryCov_9fa48("56348"), [...priorityRecoveryPublicationContext.projectedServingNodeIds])),
      locallyEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56349") ? [] : (stryCov_9fa48("56349"), [...priorityRecoveryPublicationContext.locallyEligibleNodeIds])),
      recoveryEligibleIncludedNodeIds: Object.freeze(stryMutAct_9fa48("56350") ? [] : (stryCov_9fa48("56350"), [...priorityRecoveryPublicationContext.recoveryEligibleIncludedNodeIds])),
      concreteEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56351") ? [] : (stryCov_9fa48("56351"), [...priorityRecoveryPublicationContext.concreteEligibleNodeIds])),
      recoveryActiveNodeIds: Object.freeze(stryMutAct_9fa48("56352") ? [] : (stryCov_9fa48("56352"), [...priorityRecoveryPublicationContext.recoveryActiveNodeIds])),
      recoveryActiveNodeSource: priorityRecoveryPublicationContext.recoveryActiveNodeSource,
      missingPublishedRecoveryActiveNodeIds: Object.freeze(stryMutAct_9fa48("56353") ? [] : (stryCov_9fa48("56353"), [...priorityRecoveryPublicationContext.missingPublishedRecoveryActiveNodeIds])),
      missingPublishedEligibleNodeIds: Object.freeze(stryMutAct_9fa48("56354") ? [] : (stryCov_9fa48("56354"), [...priorityRecoveryPublicationContext.missingPublishedEligibleNodeIds]))
    }));
  }
}
export { ACTIVE_MEMBERSHIP_SNAPSHOT_SOURCE, buildActiveMembershipSnapshot, buildMembershipPublicationActiveSnapshot, resolveActiveNodeViews, buildReadinessByNodeId, hasCanonicalActiveService, hasCanonicalWebSocketEndpoint, hasCanonicalWebSocketEndpoints, isCanonicalWebSocketEndpointRow, isCanonicallyActiveNode, resolveLatestPublicationRow, resolveLatestPublishedPublicationRow, resolveProjectedActiveNodeIds, resolvePublishedActiveNodeIds, resolveCanonicalActiveNodeIds, resolvePriorityRecoveryActiveNodeCohort };