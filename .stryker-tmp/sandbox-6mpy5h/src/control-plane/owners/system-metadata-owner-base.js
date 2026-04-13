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
import { getSystemCachePrimaryKeyField } from '../../cache/system-cache-key-descriptor.js';
import { getControlPlaneErrorCode, getControlPlaneRetryAfterMs } from '../control-plane-error-classification.js';
import { CONTROL_PLANE_MUTATION_MERGE_POLICY, readAuthoritativeControlPlaneRows, readProjectionControlPlaneRows } from '../control-plane-system-table-gateway.js';
import { createSystemMetadataGatewayRequiredError } from '../system-metadata-access-error.js';
import { runRetryableControlPlaneWrite } from '../../bootstrap/shared/retryable-control-plane-write.js';
import { NUM, TYPEOF } from '../../constants/index.js';
function unwrapRowReadResult(result) {
  if (stryMutAct_9fa48("69421")) {
    {}
  } else {
    stryCov_9fa48("69421");
    if (stryMutAct_9fa48("69423") ? false : stryMutAct_9fa48("69422") ? true : (stryCov_9fa48("69422", "69423"), Array.isArray(result))) {
      if (stryMutAct_9fa48("69424")) {
        {}
      } else {
        stryCov_9fa48("69424");
        return stryMutAct_9fa48("69427") ? result[0] && null : stryMutAct_9fa48("69426") ? false : stryMutAct_9fa48("69425") ? true : (stryCov_9fa48("69425", "69426", "69427"), result[0] || null);
      }
    }
    if (stryMutAct_9fa48("69429") ? false : stryMutAct_9fa48("69428") ? true : (stryCov_9fa48("69428", "69429"), Array.isArray(stryMutAct_9fa48("69430") ? result.rows : (stryCov_9fa48("69430"), result?.rows)))) {
      if (stryMutAct_9fa48("69431")) {
        {}
      } else {
        stryCov_9fa48("69431");
        return stryMutAct_9fa48("69434") ? result.rows[0] && null : stryMutAct_9fa48("69433") ? false : stryMutAct_9fa48("69432") ? true : (stryCov_9fa48("69432", "69433", "69434"), result.rows[0] || null);
      }
    }
    if (stryMutAct_9fa48("69437") ? result || typeof result === 'object' : stryMutAct_9fa48("69436") ? false : stryMutAct_9fa48("69435") ? true : (stryCov_9fa48("69435", "69436", "69437"), result && (stryMutAct_9fa48("69439") ? typeof result !== 'object' : stryMutAct_9fa48("69438") ? true : (stryCov_9fa48("69438", "69439"), typeof result === (stryMutAct_9fa48("69440") ? "" : (stryCov_9fa48("69440"), 'object')))))) {
      if (stryMutAct_9fa48("69441")) {
        {}
      } else {
        stryCov_9fa48("69441");
        return result;
      }
    }
    return null;
  }
}
function cloneParticipantFailures(resultOrError) {
  if (stryMutAct_9fa48("69442")) {
    {}
  } else {
    stryCov_9fa48("69442");
    const participantFailures = Array.isArray(stryMutAct_9fa48("69443") ? resultOrError.participantFailures : (stryCov_9fa48("69443"), resultOrError?.participantFailures)) ? stryMutAct_9fa48("69444") ? resultOrError.participantFailures.map(entry => ({
      ...entry
    })) : (stryCov_9fa48("69444"), resultOrError.participantFailures.filter(stryMutAct_9fa48("69445") ? () => undefined : (stryCov_9fa48("69445"), entry => stryMutAct_9fa48("69448") ? entry || typeof entry === TYPEOF.OBJECT : stryMutAct_9fa48("69447") ? false : stryMutAct_9fa48("69446") ? true : (stryCov_9fa48("69446", "69447", "69448"), entry && (stryMutAct_9fa48("69450") ? typeof entry !== TYPEOF.OBJECT : stryMutAct_9fa48("69449") ? true : (stryCov_9fa48("69449", "69450"), typeof entry === TYPEOF.OBJECT))))).map(stryMutAct_9fa48("69451") ? () => undefined : (stryCov_9fa48("69451"), entry => stryMutAct_9fa48("69452") ? {} : (stryCov_9fa48("69452"), {
      ...entry
    })))) : stryMutAct_9fa48("69453") ? ["Stryker was here"] : (stryCov_9fa48("69453"), []);
    const firstFailedParticipant = (stryMutAct_9fa48("69456") ? resultOrError?.firstFailedParticipant || typeof resultOrError.firstFailedParticipant === TYPEOF.OBJECT : stryMutAct_9fa48("69455") ? false : stryMutAct_9fa48("69454") ? true : (stryCov_9fa48("69454", "69455", "69456"), (stryMutAct_9fa48("69457") ? resultOrError.firstFailedParticipant : (stryCov_9fa48("69457"), resultOrError?.firstFailedParticipant)) && (stryMutAct_9fa48("69459") ? typeof resultOrError.firstFailedParticipant !== TYPEOF.OBJECT : stryMutAct_9fa48("69458") ? true : (stryCov_9fa48("69458", "69459"), typeof resultOrError.firstFailedParticipant === TYPEOF.OBJECT)))) ? stryMutAct_9fa48("69460") ? {} : (stryCov_9fa48("69460"), {
      ...resultOrError.firstFailedParticipant
    }) : (stryMutAct_9fa48("69464") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("69463") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("69462") ? false : stryMutAct_9fa48("69461") ? true : (stryCov_9fa48("69461", "69462", "69463", "69464"), participantFailures.length > NUM.ZERO)) ? participantFailures[NUM.ZERO] : null;
    return stryMutAct_9fa48("69465") ? {} : (stryCov_9fa48("69465"), {
      participantFailures,
      firstFailedParticipant
    });
  }
}
function applySystemMetadataMutationErrorMetadata(error, resultOrError, metadata = {}) {
  if (stryMutAct_9fa48("69466")) {
    {}
  } else {
    stryCov_9fa48("69466");
    const errorCode = getControlPlaneErrorCode(resultOrError);
    if (stryMutAct_9fa48("69469") ? typeof errorCode === TYPEOF.STRING || errorCode.length > NUM.ZERO : stryMutAct_9fa48("69468") ? false : stryMutAct_9fa48("69467") ? true : (stryCov_9fa48("69467", "69468", "69469"), (stryMutAct_9fa48("69471") ? typeof errorCode !== TYPEOF.STRING : stryMutAct_9fa48("69470") ? true : (stryCov_9fa48("69470", "69471"), typeof errorCode === TYPEOF.STRING)) && (stryMutAct_9fa48("69474") ? errorCode.length <= NUM.ZERO : stryMutAct_9fa48("69473") ? errorCode.length >= NUM.ZERO : stryMutAct_9fa48("69472") ? true : (stryCov_9fa48("69472", "69473", "69474"), errorCode.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69475")) {
        {}
      } else {
        stryCov_9fa48("69475");
        error.errorCode = errorCode;
        if (stryMutAct_9fa48("69478") ? typeof error.code !== TYPEOF.STRING && error.code.length === NUM.ZERO : stryMutAct_9fa48("69477") ? false : stryMutAct_9fa48("69476") ? true : (stryCov_9fa48("69476", "69477", "69478"), (stryMutAct_9fa48("69480") ? typeof error.code === TYPEOF.STRING : stryMutAct_9fa48("69479") ? false : (stryCov_9fa48("69479", "69480"), typeof error.code !== TYPEOF.STRING)) || (stryMutAct_9fa48("69482") ? error.code.length !== NUM.ZERO : stryMutAct_9fa48("69481") ? false : (stryCov_9fa48("69481", "69482"), error.code.length === NUM.ZERO)))) {
          if (stryMutAct_9fa48("69483")) {
            {}
          } else {
            stryCov_9fa48("69483");
            error.code = errorCode;
          }
        }
      }
    }
    const retryAfterMs = getControlPlaneRetryAfterMs(resultOrError);
    if (stryMutAct_9fa48("69487") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("69486") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("69485") ? false : stryMutAct_9fa48("69484") ? true : (stryCov_9fa48("69484", "69485", "69486", "69487"), retryAfterMs > NUM.ZERO)) {
      if (stryMutAct_9fa48("69488")) {
        {}
      } else {
        stryCov_9fa48("69488");
        error.retryAfterMs = retryAfterMs;
      }
    }
    if (stryMutAct_9fa48("69491") ? resultOrError?.deferRetry === true && retryAfterMs > NUM.ZERO : stryMutAct_9fa48("69490") ? false : stryMutAct_9fa48("69489") ? true : (stryCov_9fa48("69489", "69490", "69491"), (stryMutAct_9fa48("69493") ? resultOrError?.deferRetry !== true : stryMutAct_9fa48("69492") ? false : (stryCov_9fa48("69492", "69493"), (stryMutAct_9fa48("69494") ? resultOrError.deferRetry : (stryCov_9fa48("69494"), resultOrError?.deferRetry)) === (stryMutAct_9fa48("69495") ? false : (stryCov_9fa48("69495"), true)))) || (stryMutAct_9fa48("69498") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("69497") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("69496") ? false : (stryCov_9fa48("69496", "69497", "69498"), retryAfterMs > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69499")) {
        {}
      } else {
        stryCov_9fa48("69499");
        error.deferRetry = stryMutAct_9fa48("69500") ? false : (stryCov_9fa48("69500"), true);
      }
    }
    if (stryMutAct_9fa48("69503") ? typeof resultOrError?.pressureAction === TYPEOF.STRING || resultOrError.pressureAction.length > NUM.ZERO : stryMutAct_9fa48("69502") ? false : stryMutAct_9fa48("69501") ? true : (stryCov_9fa48("69501", "69502", "69503"), (stryMutAct_9fa48("69505") ? typeof resultOrError?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("69504") ? true : (stryCov_9fa48("69504", "69505"), typeof (stryMutAct_9fa48("69506") ? resultOrError.pressureAction : (stryCov_9fa48("69506"), resultOrError?.pressureAction)) === TYPEOF.STRING)) && (stryMutAct_9fa48("69509") ? resultOrError.pressureAction.length <= NUM.ZERO : stryMutAct_9fa48("69508") ? resultOrError.pressureAction.length >= NUM.ZERO : stryMutAct_9fa48("69507") ? true : (stryCov_9fa48("69507", "69508", "69509"), resultOrError.pressureAction.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69510")) {
        {}
      } else {
        stryCov_9fa48("69510");
        error.pressureAction = resultOrError.pressureAction;
      }
    }
    if (stryMutAct_9fa48("69513") ? typeof resultOrError?.pressureReason === TYPEOF.STRING || resultOrError.pressureReason.length > NUM.ZERO : stryMutAct_9fa48("69512") ? false : stryMutAct_9fa48("69511") ? true : (stryCov_9fa48("69511", "69512", "69513"), (stryMutAct_9fa48("69515") ? typeof resultOrError?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("69514") ? true : (stryCov_9fa48("69514", "69515"), typeof (stryMutAct_9fa48("69516") ? resultOrError.pressureReason : (stryCov_9fa48("69516"), resultOrError?.pressureReason)) === TYPEOF.STRING)) && (stryMutAct_9fa48("69519") ? resultOrError.pressureReason.length <= NUM.ZERO : stryMutAct_9fa48("69518") ? resultOrError.pressureReason.length >= NUM.ZERO : stryMutAct_9fa48("69517") ? true : (stryCov_9fa48("69517", "69518", "69519"), resultOrError.pressureReason.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69520")) {
        {}
      } else {
        stryCov_9fa48("69520");
        error.pressureReason = resultOrError.pressureReason;
      }
    }
    if (stryMutAct_9fa48("69523") ? resultOrError?.pressureSummary || typeof resultOrError.pressureSummary === TYPEOF.OBJECT : stryMutAct_9fa48("69522") ? false : stryMutAct_9fa48("69521") ? true : (stryCov_9fa48("69521", "69522", "69523"), (stryMutAct_9fa48("69524") ? resultOrError.pressureSummary : (stryCov_9fa48("69524"), resultOrError?.pressureSummary)) && (stryMutAct_9fa48("69526") ? typeof resultOrError.pressureSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("69525") ? true : (stryCov_9fa48("69525", "69526"), typeof resultOrError.pressureSummary === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("69527")) {
        {}
      } else {
        stryCov_9fa48("69527");
        error.pressureSummary = stryMutAct_9fa48("69528") ? {} : (stryCov_9fa48("69528"), {
          ...resultOrError.pressureSummary
        });
      }
    }
    if (stryMutAct_9fa48("69531") ? typeof resultOrError?.reasonCode === TYPEOF.STRING || resultOrError.reasonCode.length > NUM.ZERO : stryMutAct_9fa48("69530") ? false : stryMutAct_9fa48("69529") ? true : (stryCov_9fa48("69529", "69530", "69531"), (stryMutAct_9fa48("69533") ? typeof resultOrError?.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("69532") ? true : (stryCov_9fa48("69532", "69533"), typeof (stryMutAct_9fa48("69534") ? resultOrError.reasonCode : (stryCov_9fa48("69534"), resultOrError?.reasonCode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("69537") ? resultOrError.reasonCode.length <= NUM.ZERO : stryMutAct_9fa48("69536") ? resultOrError.reasonCode.length >= NUM.ZERO : stryMutAct_9fa48("69535") ? true : (stryCov_9fa48("69535", "69536", "69537"), resultOrError.reasonCode.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69538")) {
        {}
      } else {
        stryCov_9fa48("69538");
        error.reasonCode = resultOrError.reasonCode;
      }
    }
    if (stryMutAct_9fa48("69541") ? typeof resultOrError?.participationKind === TYPEOF.STRING || resultOrError.participationKind.length > NUM.ZERO : stryMutAct_9fa48("69540") ? false : stryMutAct_9fa48("69539") ? true : (stryCov_9fa48("69539", "69540", "69541"), (stryMutAct_9fa48("69543") ? typeof resultOrError?.participationKind !== TYPEOF.STRING : stryMutAct_9fa48("69542") ? true : (stryCov_9fa48("69542", "69543"), typeof (stryMutAct_9fa48("69544") ? resultOrError.participationKind : (stryCov_9fa48("69544"), resultOrError?.participationKind)) === TYPEOF.STRING)) && (stryMutAct_9fa48("69547") ? resultOrError.participationKind.length <= NUM.ZERO : stryMutAct_9fa48("69546") ? resultOrError.participationKind.length >= NUM.ZERO : stryMutAct_9fa48("69545") ? true : (stryCov_9fa48("69545", "69546", "69547"), resultOrError.participationKind.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69548")) {
        {}
      } else {
        stryCov_9fa48("69548");
        error.participationKind = resultOrError.participationKind;
      }
    }
    if (stryMutAct_9fa48("69551") ? typeof resultOrError?.outcome === TYPEOF.STRING || resultOrError.outcome.length > NUM.ZERO : stryMutAct_9fa48("69550") ? false : stryMutAct_9fa48("69549") ? true : (stryCov_9fa48("69549", "69550", "69551"), (stryMutAct_9fa48("69553") ? typeof resultOrError?.outcome !== TYPEOF.STRING : stryMutAct_9fa48("69552") ? true : (stryCov_9fa48("69552", "69553"), typeof (stryMutAct_9fa48("69554") ? resultOrError.outcome : (stryCov_9fa48("69554"), resultOrError?.outcome)) === TYPEOF.STRING)) && (stryMutAct_9fa48("69557") ? resultOrError.outcome.length <= NUM.ZERO : stryMutAct_9fa48("69556") ? resultOrError.outcome.length >= NUM.ZERO : stryMutAct_9fa48("69555") ? true : (stryCov_9fa48("69555", "69556", "69557"), resultOrError.outcome.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69558")) {
        {}
      } else {
        stryCov_9fa48("69558");
        error.outcome = resultOrError.outcome;
      }
    }
    if (stryMutAct_9fa48("69561") ? typeof resultOrError?.backpressured !== TYPEOF.BOOLEAN : stryMutAct_9fa48("69560") ? false : stryMutAct_9fa48("69559") ? true : (stryCov_9fa48("69559", "69560", "69561"), typeof (stryMutAct_9fa48("69562") ? resultOrError.backpressured : (stryCov_9fa48("69562"), resultOrError?.backpressured)) === TYPEOF.BOOLEAN)) {
      if (stryMutAct_9fa48("69563")) {
        {}
      } else {
        stryCov_9fa48("69563");
        error.backpressured = resultOrError.backpressured;
      }
    }
    const {
      participantFailures,
      firstFailedParticipant
    } = cloneParticipantFailures(resultOrError);
    if (stryMutAct_9fa48("69567") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("69566") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("69565") ? false : stryMutAct_9fa48("69564") ? true : (stryCov_9fa48("69564", "69565", "69566", "69567"), participantFailures.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("69568")) {
        {}
      } else {
        stryCov_9fa48("69568");
        error.participantFailures = participantFailures;
      }
    }
    if (stryMutAct_9fa48("69570") ? false : stryMutAct_9fa48("69569") ? true : (stryCov_9fa48("69569", "69570"), firstFailedParticipant)) {
      if (stryMutAct_9fa48("69571")) {
        {}
      } else {
        stryCov_9fa48("69571");
        error.firstFailedParticipant = firstFailedParticipant;
      }
    }
    if (stryMutAct_9fa48("69574") ? resultOrError.cause : stryMutAct_9fa48("69573") ? false : stryMutAct_9fa48("69572") ? true : (stryCov_9fa48("69572", "69573", "69574"), resultOrError?.cause)) {
      if (stryMutAct_9fa48("69575")) {
        {}
      } else {
        stryCov_9fa48("69575");
        error.cause = resultOrError.cause;
      }
    }
    if (stryMutAct_9fa48("69578") ? typeof metadata.tableName === TYPEOF.STRING || metadata.tableName.length > NUM.ZERO : stryMutAct_9fa48("69577") ? false : stryMutAct_9fa48("69576") ? true : (stryCov_9fa48("69576", "69577", "69578"), (stryMutAct_9fa48("69580") ? typeof metadata.tableName !== TYPEOF.STRING : stryMutAct_9fa48("69579") ? true : (stryCov_9fa48("69579", "69580"), typeof metadata.tableName === TYPEOF.STRING)) && (stryMutAct_9fa48("69583") ? metadata.tableName.length <= NUM.ZERO : stryMutAct_9fa48("69582") ? metadata.tableName.length >= NUM.ZERO : stryMutAct_9fa48("69581") ? true : (stryCov_9fa48("69581", "69582", "69583"), metadata.tableName.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69584")) {
        {}
      } else {
        stryCov_9fa48("69584");
        error.tableName = metadata.tableName;
      }
    }
    if (stryMutAct_9fa48("69587") ? typeof metadata.ownerName === TYPEOF.STRING || metadata.ownerName.length > NUM.ZERO : stryMutAct_9fa48("69586") ? false : stryMutAct_9fa48("69585") ? true : (stryCov_9fa48("69585", "69586", "69587"), (stryMutAct_9fa48("69589") ? typeof metadata.ownerName !== TYPEOF.STRING : stryMutAct_9fa48("69588") ? true : (stryCov_9fa48("69588", "69589"), typeof metadata.ownerName === TYPEOF.STRING)) && (stryMutAct_9fa48("69592") ? metadata.ownerName.length <= NUM.ZERO : stryMutAct_9fa48("69591") ? metadata.ownerName.length >= NUM.ZERO : stryMutAct_9fa48("69590") ? true : (stryCov_9fa48("69590", "69591", "69592"), metadata.ownerName.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69593")) {
        {}
      } else {
        stryCov_9fa48("69593");
        error.ownerName = metadata.ownerName;
      }
    }
    if (stryMutAct_9fa48("69596") ? typeof metadata.operation === TYPEOF.STRING || metadata.operation.length > NUM.ZERO : stryMutAct_9fa48("69595") ? false : stryMutAct_9fa48("69594") ? true : (stryCov_9fa48("69594", "69595", "69596"), (stryMutAct_9fa48("69598") ? typeof metadata.operation !== TYPEOF.STRING : stryMutAct_9fa48("69597") ? true : (stryCov_9fa48("69597", "69598"), typeof metadata.operation === TYPEOF.STRING)) && (stryMutAct_9fa48("69601") ? metadata.operation.length <= NUM.ZERO : stryMutAct_9fa48("69600") ? metadata.operation.length >= NUM.ZERO : stryMutAct_9fa48("69599") ? true : (stryCov_9fa48("69599", "69600", "69601"), metadata.operation.length > NUM.ZERO)))) {
      if (stryMutAct_9fa48("69602")) {
        {}
      } else {
        stryCov_9fa48("69602");
        error.operation = metadata.operation;
      }
    }
    return error;
  }
}
function buildSystemMetadataMutationError(resultOrError, metadata = {}, fallbackMessage = null) {
  if (stryMutAct_9fa48("69603")) {
    {}
  } else {
    stryCov_9fa48("69603");
    const message = (stryMutAct_9fa48("69606") ? typeof resultOrError?.error === TYPEOF.STRING || resultOrError.error.length > NUM.ZERO : stryMutAct_9fa48("69605") ? false : stryMutAct_9fa48("69604") ? true : (stryCov_9fa48("69604", "69605", "69606"), (stryMutAct_9fa48("69608") ? typeof resultOrError?.error !== TYPEOF.STRING : stryMutAct_9fa48("69607") ? true : (stryCov_9fa48("69607", "69608"), typeof (stryMutAct_9fa48("69609") ? resultOrError.error : (stryCov_9fa48("69609"), resultOrError?.error)) === TYPEOF.STRING)) && (stryMutAct_9fa48("69612") ? resultOrError.error.length <= NUM.ZERO : stryMutAct_9fa48("69611") ? resultOrError.error.length >= NUM.ZERO : stryMutAct_9fa48("69610") ? true : (stryCov_9fa48("69610", "69611", "69612"), resultOrError.error.length > NUM.ZERO)))) ? resultOrError.error : (stryMutAct_9fa48("69615") ? typeof resultOrError?.message === TYPEOF.STRING || resultOrError.message.length > NUM.ZERO : stryMutAct_9fa48("69614") ? false : stryMutAct_9fa48("69613") ? true : (stryCov_9fa48("69613", "69614", "69615"), (stryMutAct_9fa48("69617") ? typeof resultOrError?.message !== TYPEOF.STRING : stryMutAct_9fa48("69616") ? true : (stryCov_9fa48("69616", "69617"), typeof (stryMutAct_9fa48("69618") ? resultOrError.message : (stryCov_9fa48("69618"), resultOrError?.message)) === TYPEOF.STRING)) && (stryMutAct_9fa48("69621") ? resultOrError.message.length <= NUM.ZERO : stryMutAct_9fa48("69620") ? resultOrError.message.length >= NUM.ZERO : stryMutAct_9fa48("69619") ? true : (stryCov_9fa48("69619", "69620", "69621"), resultOrError.message.length > NUM.ZERO)))) ? resultOrError.message : stryMutAct_9fa48("69624") ? fallbackMessage && `${metadata.ownerName || 'system-metadata-owner'} ` + `${metadata.operation || 'mutation'} failed` : stryMutAct_9fa48("69623") ? false : stryMutAct_9fa48("69622") ? true : (stryCov_9fa48("69622", "69623", "69624"), fallbackMessage || (stryMutAct_9fa48("69625") ? `` : (stryCov_9fa48("69625"), `${stryMutAct_9fa48("69628") ? metadata.ownerName && 'system-metadata-owner' : stryMutAct_9fa48("69627") ? false : stryMutAct_9fa48("69626") ? true : (stryCov_9fa48("69626", "69627", "69628"), metadata.ownerName || (stryMutAct_9fa48("69629") ? "" : (stryCov_9fa48("69629"), 'system-metadata-owner')))} `)) + (stryMutAct_9fa48("69630") ? `` : (stryCov_9fa48("69630"), `${stryMutAct_9fa48("69633") ? metadata.operation && 'mutation' : stryMutAct_9fa48("69632") ? false : stryMutAct_9fa48("69631") ? true : (stryCov_9fa48("69631", "69632", "69633"), metadata.operation || (stryMutAct_9fa48("69634") ? "" : (stryCov_9fa48("69634"), 'mutation')))} failed`)));
    const error = resultOrError instanceof Error ? resultOrError : new Error(message);
    if (stryMutAct_9fa48("69637") ? !error.message && error.message.length === NUM.ZERO : stryMutAct_9fa48("69636") ? false : stryMutAct_9fa48("69635") ? true : (stryCov_9fa48("69635", "69636", "69637"), (stryMutAct_9fa48("69638") ? error.message : (stryCov_9fa48("69638"), !error.message)) || (stryMutAct_9fa48("69640") ? error.message.length !== NUM.ZERO : stryMutAct_9fa48("69639") ? false : (stryCov_9fa48("69639", "69640"), error.message.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("69641")) {
        {}
      } else {
        stryCov_9fa48("69641");
        error.message = message;
      }
    }
    return applySystemMetadataMutationErrorMetadata(error, resultOrError, metadata);
  }
}
class SystemMetadataOwnerBase {
  constructor(options = {}) {
    if (stryMutAct_9fa48("69642")) {
      {}
    } else {
      stryCov_9fa48("69642");
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("69645") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("69644") ? false : stryMutAct_9fa48("69643") ? true : (stryCov_9fa48("69643", "69644", "69645"), options.controlPlaneSystemTableGateway || null);
      this.systemTableCache = stryMutAct_9fa48("69648") ? options.systemTableCache && null : stryMutAct_9fa48("69647") ? false : stryMutAct_9fa48("69646") ? true : (stryCov_9fa48("69646", "69647", "69648"), options.systemTableCache || null);
      this.controlPlaneWriteRetryTimeoutMs = options.controlPlaneWriteRetryTimeoutMs;
      this.controlPlaneWriteRetryBaseDelayMs = options.controlPlaneWriteRetryBaseDelayMs;
      this.controlPlaneWriteRetryMaxDelayMs = options.controlPlaneWriteRetryMaxDelayMs;
      this.controlPlaneWriteRetryNow = stryMutAct_9fa48("69651") ? options.controlPlaneWriteRetryNow && null : stryMutAct_9fa48("69650") ? false : stryMutAct_9fa48("69649") ? true : (stryCov_9fa48("69649", "69650", "69651"), options.controlPlaneWriteRetryNow || null);
      this.controlPlaneWriteRetrySleep = stryMutAct_9fa48("69654") ? options.controlPlaneWriteRetrySleep && null : stryMutAct_9fa48("69653") ? false : stryMutAct_9fa48("69652") ? true : (stryCov_9fa48("69652", "69653", "69654"), options.controlPlaneWriteRetrySleep || null);
    }
  }
  getOwnerName() {
    if (stryMutAct_9fa48("69655")) {
      {}
    } else {
      stryCov_9fa48("69655");
      return stryMutAct_9fa48("69658") ? this.constructor.OWNER_NAME && 'unknown-owner' : stryMutAct_9fa48("69657") ? false : stryMutAct_9fa48("69656") ? true : (stryCov_9fa48("69656", "69657", "69658"), this.constructor.OWNER_NAME || (stryMutAct_9fa48("69659") ? "" : (stryCov_9fa48("69659"), 'unknown-owner')));
    }
  }
  getTableName() {
    if (stryMutAct_9fa48("69660")) {
      {}
    } else {
      stryCov_9fa48("69660");
      return stryMutAct_9fa48("69663") ? this.constructor.TABLE_NAME && null : stryMutAct_9fa48("69662") ? false : stryMutAct_9fa48("69661") ? true : (stryCov_9fa48("69661", "69662", "69663"), this.constructor.TABLE_NAME || null);
    }
  }
  getGateway() {
    if (stryMutAct_9fa48("69664")) {
      {}
    } else {
      stryCov_9fa48("69664");
      return stryMutAct_9fa48("69667") ? this.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("69666") ? false : stryMutAct_9fa48("69665") ? true : (stryCov_9fa48("69665", "69666", "69667"), this.controlPlaneSystemTableGateway || null);
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("69668")) {
      {}
    } else {
      stryCov_9fa48("69668");
      return stryMutAct_9fa48("69671") ? this.systemTableCache && null : stryMutAct_9fa48("69670") ? false : stryMutAct_9fa48("69669") ? true : (stryCov_9fa48("69669", "69670", "69671"), this.systemTableCache || null);
    }
  }
  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    if (stryMutAct_9fa48("69672")) {
      {}
    } else {
      stryCov_9fa48("69672");
      this.controlPlaneSystemTableGateway = stryMutAct_9fa48("69675") ? controlPlaneSystemTableGateway && null : stryMutAct_9fa48("69674") ? false : stryMutAct_9fa48("69673") ? true : (stryCov_9fa48("69673", "69674", "69675"), controlPlaneSystemTableGateway || null);
      return this;
    }
  }
  setSystemTableCache(systemTableCache) {
    if (stryMutAct_9fa48("69676")) {
      {}
    } else {
      stryCov_9fa48("69676");
      this.systemTableCache = stryMutAct_9fa48("69679") ? systemTableCache && null : stryMutAct_9fa48("69678") ? false : stryMutAct_9fa48("69677") ? true : (stryCov_9fa48("69677", "69678", "69679"), systemTableCache || null);
      return this;
    }
  }
  getPrimaryKeyField() {
    if (stryMutAct_9fa48("69680")) {
      {}
    } else {
      stryCov_9fa48("69680");
      return getSystemCachePrimaryKeyField(this.getTableName());
    }
  }
  requireGateway() {
    if (stryMutAct_9fa48("69681")) {
      {}
    } else {
      stryCov_9fa48("69681");
      const gateway = this.getGateway();
      if (stryMutAct_9fa48("69683") ? false : stryMutAct_9fa48("69682") ? true : (stryCov_9fa48("69682", "69683"), gateway)) {
        if (stryMutAct_9fa48("69684")) {
          {}
        } else {
          stryCov_9fa48("69684");
          return gateway;
        }
      }
      throw createSystemMetadataGatewayRequiredError(stryMutAct_9fa48("69685") ? {} : (stryCov_9fa48("69685"), {
        ownerName: this.getOwnerName(),
        tableName: this.getTableName()
      }));
    }
  }
  buildSelectAllSql() {
    if (stryMutAct_9fa48("69686")) {
      {}
    } else {
      stryCov_9fa48("69686");
      return stryMutAct_9fa48("69687") ? `` : (stryCov_9fa48("69687"), `SELECT * FROM ${this.getTableName()}`);
    }
  }
  buildSelectByPrimaryKeySql() {
    if (stryMutAct_9fa48("69688")) {
      {}
    } else {
      stryCov_9fa48("69688");
      return stryMutAct_9fa48("69689") ? `` : (stryCov_9fa48("69689"), `${this.buildSelectAllSql()} WHERE ${this.getPrimaryKeyField()} = ?`);
    }
  }
  async executeCacheRead(readFromCache, options = {}) {
    if (stryMutAct_9fa48("69690")) {
      {}
    } else {
      stryCov_9fa48("69690");
      const cacheAwareOptions = (stryMutAct_9fa48("69693") ? typeof options.systemTableCache === 'undefined' || this.getSystemTableCache() : stryMutAct_9fa48("69692") ? false : stryMutAct_9fa48("69691") ? true : (stryCov_9fa48("69691", "69692", "69693"), (stryMutAct_9fa48("69695") ? typeof options.systemTableCache !== 'undefined' : stryMutAct_9fa48("69694") ? true : (stryCov_9fa48("69694", "69695"), typeof options.systemTableCache === (stryMutAct_9fa48("69696") ? "" : (stryCov_9fa48("69696"), 'undefined')))) && this.getSystemTableCache())) ? stryMutAct_9fa48("69697") ? {} : (stryCov_9fa48("69697"), {
        ...options,
        systemTableCache: this.getSystemTableCache()
      }) : options;
      return readProjectionControlPlaneRows(this.requireGateway(), this.getTableName(), stryMutAct_9fa48("69698") ? {} : (stryCov_9fa48("69698"), {
        ...cacheAwareOptions,
        owner: this.getOwnerName(),
        readFromCache
      }));
    }
  }
  async readCachedByPrimaryKey(primaryKeyValue, options = {}) {
    if (stryMutAct_9fa48("69699")) {
      {}
    } else {
      stryCov_9fa48("69699");
      const tableName = this.getTableName();
      const result = await this.executeCacheRead(systemTableCache => {
        if (stryMutAct_9fa48("69700")) {
          {}
        } else {
          stryCov_9fa48("69700");
          if (stryMutAct_9fa48("69703") ? false : stryMutAct_9fa48("69702") ? true : stryMutAct_9fa48("69701") ? systemTableCache : (stryCov_9fa48("69701", "69702", "69703"), !systemTableCache)) {
            if (stryMutAct_9fa48("69704")) {
              {}
            } else {
              stryCov_9fa48("69704");
              return stryMutAct_9fa48("69705") ? ["Stryker was here"] : (stryCov_9fa48("69705"), []);
            }
          }
          if (stryMutAct_9fa48("69708") ? typeof systemTableCache.get !== 'function' : stryMutAct_9fa48("69707") ? false : stryMutAct_9fa48("69706") ? true : (stryCov_9fa48("69706", "69707", "69708"), typeof systemTableCache.get === (stryMutAct_9fa48("69709") ? "" : (stryCov_9fa48("69709"), 'function')))) {
            if (stryMutAct_9fa48("69710")) {
              {}
            } else {
              stryCov_9fa48("69710");
              const row = systemTableCache.get(tableName, primaryKeyValue);
              return row ? stryMutAct_9fa48("69711") ? [] : (stryCov_9fa48("69711"), [row]) : stryMutAct_9fa48("69712") ? ["Stryker was here"] : (stryCov_9fa48("69712"), []);
            }
          }
          if (stryMutAct_9fa48("69715") ? typeof systemTableCache.getAll === 'function' : stryMutAct_9fa48("69714") ? false : stryMutAct_9fa48("69713") ? true : (stryCov_9fa48("69713", "69714", "69715"), typeof systemTableCache.getAll !== (stryMutAct_9fa48("69716") ? "" : (stryCov_9fa48("69716"), 'function')))) {
            if (stryMutAct_9fa48("69717")) {
              {}
            } else {
              stryCov_9fa48("69717");
              return stryMutAct_9fa48("69718") ? ["Stryker was here"] : (stryCov_9fa48("69718"), []);
            }
          }
          return stryMutAct_9fa48("69719") ? systemTableCache.getAll(tableName) || [] : (stryCov_9fa48("69719"), (stryMutAct_9fa48("69722") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("69721") ? false : stryMutAct_9fa48("69720") ? true : (stryCov_9fa48("69720", "69721", "69722"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("69723") ? ["Stryker was here"] : (stryCov_9fa48("69723"), [])))).filter(row => {
            if (stryMutAct_9fa48("69724")) {
              {}
            } else {
              stryCov_9fa48("69724");
              return stryMutAct_9fa48("69727") ? row?.[this.getPrimaryKeyField()] !== primaryKeyValue : stryMutAct_9fa48("69726") ? false : stryMutAct_9fa48("69725") ? true : (stryCov_9fa48("69725", "69726", "69727"), (stryMutAct_9fa48("69728") ? row[this.getPrimaryKeyField()] : (stryCov_9fa48("69728"), row?.[this.getPrimaryKeyField()])) === primaryKeyValue);
            }
          }));
        }
      }, options);
      return unwrapRowReadResult(result);
    }
  }
  async listCachedRows(options = {}) {
    if (stryMutAct_9fa48("69729")) {
      {}
    } else {
      stryCov_9fa48("69729");
      const tableName = this.getTableName();
      return this.executeCacheRead(systemTableCache => {
        if (stryMutAct_9fa48("69730")) {
          {}
        } else {
          stryCov_9fa48("69730");
          if (stryMutAct_9fa48("69733") ? typeof systemTableCache?.getAll === 'function' : stryMutAct_9fa48("69732") ? false : stryMutAct_9fa48("69731") ? true : (stryCov_9fa48("69731", "69732", "69733"), typeof (stryMutAct_9fa48("69734") ? systemTableCache.getAll : (stryCov_9fa48("69734"), systemTableCache?.getAll)) !== (stryMutAct_9fa48("69735") ? "" : (stryCov_9fa48("69735"), 'function')))) {
            if (stryMutAct_9fa48("69736")) {
              {}
            } else {
              stryCov_9fa48("69736");
              return stryMutAct_9fa48("69737") ? ["Stryker was here"] : (stryCov_9fa48("69737"), []);
            }
          }
          return stryMutAct_9fa48("69740") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("69739") ? false : stryMutAct_9fa48("69738") ? true : (stryCov_9fa48("69738", "69739", "69740"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("69741") ? ["Stryker was here"] : (stryCov_9fa48("69741"), [])));
        }
      }, options);
    }
  }
  async filterCachedRows(cachePredicate, options = {}) {
    if (stryMutAct_9fa48("69742")) {
      {}
    } else {
      stryCov_9fa48("69742");
      const tableName = this.getTableName();
      return this.executeCacheRead(systemTableCache => {
        if (stryMutAct_9fa48("69743")) {
          {}
        } else {
          stryCov_9fa48("69743");
          if (stryMutAct_9fa48("69746") ? !systemTableCache && typeof cachePredicate !== 'function' : stryMutAct_9fa48("69745") ? false : stryMutAct_9fa48("69744") ? true : (stryCov_9fa48("69744", "69745", "69746"), (stryMutAct_9fa48("69747") ? systemTableCache : (stryCov_9fa48("69747"), !systemTableCache)) || (stryMutAct_9fa48("69749") ? typeof cachePredicate === 'function' : stryMutAct_9fa48("69748") ? false : (stryCov_9fa48("69748", "69749"), typeof cachePredicate !== (stryMutAct_9fa48("69750") ? "" : (stryCov_9fa48("69750"), 'function')))))) {
            if (stryMutAct_9fa48("69751")) {
              {}
            } else {
              stryCov_9fa48("69751");
              return stryMutAct_9fa48("69752") ? ["Stryker was here"] : (stryCov_9fa48("69752"), []);
            }
          }
          if (stryMutAct_9fa48("69755") ? typeof systemTableCache.filter !== 'function' : stryMutAct_9fa48("69754") ? false : stryMutAct_9fa48("69753") ? true : (stryCov_9fa48("69753", "69754", "69755"), typeof systemTableCache.filter === (stryMutAct_9fa48("69756") ? "" : (stryCov_9fa48("69756"), 'function')))) {
            if (stryMutAct_9fa48("69757")) {
              {}
            } else {
              stryCov_9fa48("69757");
              return stryMutAct_9fa48("69760") ? systemTableCache.filter(tableName, cachePredicate) && [] : stryMutAct_9fa48("69759") ? false : stryMutAct_9fa48("69758") ? true : (stryCov_9fa48("69758", "69759", "69760"), (stryMutAct_9fa48("69761") ? systemTableCache : (stryCov_9fa48("69761"), systemTableCache.filter(tableName, cachePredicate))) || (stryMutAct_9fa48("69762") ? ["Stryker was here"] : (stryCov_9fa48("69762"), [])));
            }
          }
          if (stryMutAct_9fa48("69765") ? typeof systemTableCache.getAll === 'function' : stryMutAct_9fa48("69764") ? false : stryMutAct_9fa48("69763") ? true : (stryCov_9fa48("69763", "69764", "69765"), typeof systemTableCache.getAll !== (stryMutAct_9fa48("69766") ? "" : (stryCov_9fa48("69766"), 'function')))) {
            if (stryMutAct_9fa48("69767")) {
              {}
            } else {
              stryCov_9fa48("69767");
              return stryMutAct_9fa48("69768") ? ["Stryker was here"] : (stryCov_9fa48("69768"), []);
            }
          }
          return stryMutAct_9fa48("69769") ? systemTableCache.getAll(tableName) || [] : (stryCov_9fa48("69769"), (stryMutAct_9fa48("69772") ? systemTableCache.getAll(tableName) && [] : stryMutAct_9fa48("69771") ? false : stryMutAct_9fa48("69770") ? true : (stryCov_9fa48("69770", "69771", "69772"), systemTableCache.getAll(tableName) || (stryMutAct_9fa48("69773") ? ["Stryker was here"] : (stryCov_9fa48("69773"), [])))).filter(cachePredicate));
        }
      }, options);
    }
  }
  async readByPrimaryKey(primaryKeyValue, options = {}) {
    if (stryMutAct_9fa48("69774")) {
      {}
    } else {
      stryCov_9fa48("69774");
      const result = await readAuthoritativeControlPlaneRows(this.requireGateway(), this.getTableName(), this.buildSelectByPrimaryKeySql(), stryMutAct_9fa48("69775") ? [] : (stryCov_9fa48("69775"), [primaryKeyValue]), stryMutAct_9fa48("69776") ? {} : (stryCov_9fa48("69776"), {
        ...options,
        owner: this.getOwnerName()
      }));
      return unwrapRowReadResult(result);
    }
  }
  async listRows(options = {}) {
    if (stryMutAct_9fa48("69777")) {
      {}
    } else {
      stryCov_9fa48("69777");
      return readAuthoritativeControlPlaneRows(this.requireGateway(), this.getTableName(), this.buildSelectAllSql(), stryMutAct_9fa48("69778") ? ["Stryker was here"] : (stryCov_9fa48("69778"), []), stryMutAct_9fa48("69779") ? {} : (stryCov_9fa48("69779"), {
        ...options,
        owner: this.getOwnerName()
      }));
    }
  }
  getControlPlaneWriteRetryOptions(options = {}) {
    if (stryMutAct_9fa48("69780")) {
      {}
    } else {
      stryCov_9fa48("69780");
      const retryOptions = {};
      const timeoutMs = Number.isFinite(options.controlPlaneWriteRetryTimeoutMs) ? Math.floor(options.controlPlaneWriteRetryTimeoutMs) : Number.isFinite(this.controlPlaneWriteRetryTimeoutMs) ? Math.floor(this.controlPlaneWriteRetryTimeoutMs) : null;
      if (stryMutAct_9fa48("69783") ? timeoutMs !== null || timeoutMs >= NUM.ZERO : stryMutAct_9fa48("69782") ? false : stryMutAct_9fa48("69781") ? true : (stryCov_9fa48("69781", "69782", "69783"), (stryMutAct_9fa48("69785") ? timeoutMs === null : stryMutAct_9fa48("69784") ? true : (stryCov_9fa48("69784", "69785"), timeoutMs !== null)) && (stryMutAct_9fa48("69788") ? timeoutMs < NUM.ZERO : stryMutAct_9fa48("69787") ? timeoutMs > NUM.ZERO : stryMutAct_9fa48("69786") ? true : (stryCov_9fa48("69786", "69787", "69788"), timeoutMs >= NUM.ZERO)))) {
        if (stryMutAct_9fa48("69789")) {
          {}
        } else {
          stryCov_9fa48("69789");
          retryOptions.timeoutMs = timeoutMs;
        }
      }
      const baseDelayMs = Number.isFinite(options.controlPlaneWriteRetryBaseDelayMs) ? Math.floor(options.controlPlaneWriteRetryBaseDelayMs) : Number.isFinite(this.controlPlaneWriteRetryBaseDelayMs) ? Math.floor(this.controlPlaneWriteRetryBaseDelayMs) : null;
      if (stryMutAct_9fa48("69792") ? baseDelayMs !== null || baseDelayMs > NUM.ZERO : stryMutAct_9fa48("69791") ? false : stryMutAct_9fa48("69790") ? true : (stryCov_9fa48("69790", "69791", "69792"), (stryMutAct_9fa48("69794") ? baseDelayMs === null : stryMutAct_9fa48("69793") ? true : (stryCov_9fa48("69793", "69794"), baseDelayMs !== null)) && (stryMutAct_9fa48("69797") ? baseDelayMs <= NUM.ZERO : stryMutAct_9fa48("69796") ? baseDelayMs >= NUM.ZERO : stryMutAct_9fa48("69795") ? true : (stryCov_9fa48("69795", "69796", "69797"), baseDelayMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("69798")) {
          {}
        } else {
          stryCov_9fa48("69798");
          retryOptions.baseDelayMs = baseDelayMs;
        }
      }
      const maxDelayMs = Number.isFinite(options.controlPlaneWriteRetryMaxDelayMs) ? Math.floor(options.controlPlaneWriteRetryMaxDelayMs) : Number.isFinite(this.controlPlaneWriteRetryMaxDelayMs) ? Math.floor(this.controlPlaneWriteRetryMaxDelayMs) : null;
      if (stryMutAct_9fa48("69801") ? maxDelayMs !== null || maxDelayMs > NUM.ZERO : stryMutAct_9fa48("69800") ? false : stryMutAct_9fa48("69799") ? true : (stryCov_9fa48("69799", "69800", "69801"), (stryMutAct_9fa48("69803") ? maxDelayMs === null : stryMutAct_9fa48("69802") ? true : (stryCov_9fa48("69802", "69803"), maxDelayMs !== null)) && (stryMutAct_9fa48("69806") ? maxDelayMs <= NUM.ZERO : stryMutAct_9fa48("69805") ? maxDelayMs >= NUM.ZERO : stryMutAct_9fa48("69804") ? true : (stryCov_9fa48("69804", "69805", "69806"), maxDelayMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("69807")) {
          {}
        } else {
          stryCov_9fa48("69807");
          retryOptions.maxDelayMs = maxDelayMs;
        }
      }
      const now = (stryMutAct_9fa48("69810") ? typeof options.controlPlaneWriteRetryNow !== TYPEOF.FUNCTION : stryMutAct_9fa48("69809") ? false : stryMutAct_9fa48("69808") ? true : (stryCov_9fa48("69808", "69809", "69810"), typeof options.controlPlaneWriteRetryNow === TYPEOF.FUNCTION)) ? options.controlPlaneWriteRetryNow : this.controlPlaneWriteRetryNow;
      if (stryMutAct_9fa48("69813") ? typeof now !== TYPEOF.FUNCTION : stryMutAct_9fa48("69812") ? false : stryMutAct_9fa48("69811") ? true : (stryCov_9fa48("69811", "69812", "69813"), typeof now === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("69814")) {
          {}
        } else {
          stryCov_9fa48("69814");
          retryOptions.now = now;
        }
      }
      const sleep = (stryMutAct_9fa48("69817") ? typeof options.controlPlaneWriteRetrySleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("69816") ? false : stryMutAct_9fa48("69815") ? true : (stryCov_9fa48("69815", "69816", "69817"), typeof options.controlPlaneWriteRetrySleep === TYPEOF.FUNCTION)) ? options.controlPlaneWriteRetrySleep : this.controlPlaneWriteRetrySleep;
      if (stryMutAct_9fa48("69820") ? typeof sleep !== TYPEOF.FUNCTION : stryMutAct_9fa48("69819") ? false : stryMutAct_9fa48("69818") ? true : (stryCov_9fa48("69818", "69819", "69820"), typeof sleep === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("69821")) {
          {}
        } else {
          stryCov_9fa48("69821");
          retryOptions.sleep = sleep;
        }
      }
      if (stryMutAct_9fa48("69824") ? typeof options.controlPlaneWriteRetryOnRetry !== TYPEOF.FUNCTION : stryMutAct_9fa48("69823") ? false : stryMutAct_9fa48("69822") ? true : (stryCov_9fa48("69822", "69823", "69824"), typeof options.controlPlaneWriteRetryOnRetry === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("69825")) {
          {}
        } else {
          stryCov_9fa48("69825");
          retryOptions.onRetry = options.controlPlaneWriteRetryOnRetry;
        }
      }
      return retryOptions;
    }
  }
  buildMutationOptions(operation, payload = {}, options = {}) {
    if (stryMutAct_9fa48("69826")) {
      {}
    } else {
      stryCov_9fa48("69826");
      const mutationOptions = stryMutAct_9fa48("69827") ? {} : (stryCov_9fa48("69827"), {
        ...options,
        owner: (stryMutAct_9fa48("69830") ? typeof options.owner === TYPEOF.STRING || options.owner.length > NUM.ZERO : stryMutAct_9fa48("69829") ? false : stryMutAct_9fa48("69828") ? true : (stryCov_9fa48("69828", "69829", "69830"), (stryMutAct_9fa48("69832") ? typeof options.owner !== TYPEOF.STRING : stryMutAct_9fa48("69831") ? true : (stryCov_9fa48("69831", "69832"), typeof options.owner === TYPEOF.STRING)) && (stryMutAct_9fa48("69835") ? options.owner.length <= NUM.ZERO : stryMutAct_9fa48("69834") ? options.owner.length >= NUM.ZERO : stryMutAct_9fa48("69833") ? true : (stryCov_9fa48("69833", "69834", "69835"), options.owner.length > NUM.ZERO)))) ? options.owner : this.getOwnerName()
      });
      if (stryMutAct_9fa48("69838") ? operation === 'upsert' : stryMutAct_9fa48("69837") ? false : stryMutAct_9fa48("69836") ? true : (stryCov_9fa48("69836", "69837", "69838"), operation !== (stryMutAct_9fa48("69839") ? "" : (stryCov_9fa48("69839"), 'upsert')))) {
        if (stryMutAct_9fa48("69840")) {
          {}
        } else {
          stryCov_9fa48("69840");
          return mutationOptions;
        }
      }
      if (stryMutAct_9fa48("69843") ? typeof mutationOptions.coalescingKey === TYPEOF.STRING || mutationOptions.coalescingKey.length > NUM.ZERO : stryMutAct_9fa48("69842") ? false : stryMutAct_9fa48("69841") ? true : (stryCov_9fa48("69841", "69842", "69843"), (stryMutAct_9fa48("69845") ? typeof mutationOptions.coalescingKey !== TYPEOF.STRING : stryMutAct_9fa48("69844") ? true : (stryCov_9fa48("69844", "69845"), typeof mutationOptions.coalescingKey === TYPEOF.STRING)) && (stryMutAct_9fa48("69848") ? mutationOptions.coalescingKey.length <= NUM.ZERO : stryMutAct_9fa48("69847") ? mutationOptions.coalescingKey.length >= NUM.ZERO : stryMutAct_9fa48("69846") ? true : (stryCov_9fa48("69846", "69847", "69848"), mutationOptions.coalescingKey.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("69849")) {
          {}
        } else {
          stryCov_9fa48("69849");
          return mutationOptions;
        }
      }
      if (stryMutAct_9fa48("69852") ? mutationOptions.mergePolicy || mutationOptions.mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE : stryMutAct_9fa48("69851") ? false : stryMutAct_9fa48("69850") ? true : (stryCov_9fa48("69850", "69851", "69852"), mutationOptions.mergePolicy && (stryMutAct_9fa48("69854") ? mutationOptions.mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE : stryMutAct_9fa48("69853") ? true : (stryCov_9fa48("69853", "69854"), mutationOptions.mergePolicy !== CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE)))) {
        if (stryMutAct_9fa48("69855")) {
          {}
        } else {
          stryCov_9fa48("69855");
          return mutationOptions;
        }
      }
      const primaryKeyField = this.getPrimaryKeyField();
      const primaryKeyValue = stryMutAct_9fa48("69857") ? payload.row?.[primaryKeyField] : stryMutAct_9fa48("69856") ? payload?.row[primaryKeyField] : (stryCov_9fa48("69856", "69857"), payload?.row?.[primaryKeyField]);
      if (stryMutAct_9fa48("69860") ? typeof primaryKeyValue === TYPEOF.UNDEFINED && primaryKeyValue === null : stryMutAct_9fa48("69859") ? false : stryMutAct_9fa48("69858") ? true : (stryCov_9fa48("69858", "69859", "69860"), (stryMutAct_9fa48("69862") ? typeof primaryKeyValue !== TYPEOF.UNDEFINED : stryMutAct_9fa48("69861") ? false : (stryCov_9fa48("69861", "69862"), typeof primaryKeyValue === TYPEOF.UNDEFINED)) || (stryMutAct_9fa48("69864") ? primaryKeyValue !== null : stryMutAct_9fa48("69863") ? false : (stryCov_9fa48("69863", "69864"), primaryKeyValue === null)))) {
        if (stryMutAct_9fa48("69865")) {
          {}
        } else {
          stryCov_9fa48("69865");
          return mutationOptions;
        }
      }
      const normalizedPrimaryKey = (stryMutAct_9fa48("69868") ? typeof primaryKeyValue !== TYPEOF.STRING : stryMutAct_9fa48("69867") ? false : stryMutAct_9fa48("69866") ? true : (stryCov_9fa48("69866", "69867", "69868"), typeof primaryKeyValue === TYPEOF.STRING)) ? stryMutAct_9fa48("69869") ? primaryKeyValue : (stryCov_9fa48("69869"), primaryKeyValue.trim()) : String(primaryKeyValue);
      if (stryMutAct_9fa48("69872") ? normalizedPrimaryKey.length !== NUM.ZERO : stryMutAct_9fa48("69871") ? false : stryMutAct_9fa48("69870") ? true : (stryCov_9fa48("69870", "69871", "69872"), normalizedPrimaryKey.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("69873")) {
          {}
        } else {
          stryCov_9fa48("69873");
          return mutationOptions;
        }
      }
      return stryMutAct_9fa48("69874") ? {} : (stryCov_9fa48("69874"), {
        ...mutationOptions,
        coalescingKey: stryMutAct_9fa48("69875") ? `` : (stryCov_9fa48("69875"), `system-metadata:${this.getTableName()}:${normalizedPrimaryKey}`),
        mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING
      });
    }
  }
  async executeMutation(operation, payload, options = {}, executor) {
    if (stryMutAct_9fa48("69876")) {
      {}
    } else {
      stryCov_9fa48("69876");
      const mutationOptions = this.buildMutationOptions(operation, payload, options);
      const retryOptions = this.getControlPlaneWriteRetryOptions(options);
      const metadata = stryMutAct_9fa48("69877") ? {} : (stryCov_9fa48("69877"), {
        ownerName: this.getOwnerName(),
        tableName: this.getTableName(),
        operation
      });
      try {
        if (stryMutAct_9fa48("69878")) {
          {}
        } else {
          stryCov_9fa48("69878");
          const result = await runRetryableControlPlaneWrite(stryMutAct_9fa48("69879") ? () => undefined : (stryCov_9fa48("69879"), () => executor(mutationOptions)), retryOptions);
          if (stryMutAct_9fa48("69882") ? result?.success !== false : stryMutAct_9fa48("69881") ? false : stryMutAct_9fa48("69880") ? true : (stryCov_9fa48("69880", "69881", "69882"), (stryMutAct_9fa48("69883") ? result.success : (stryCov_9fa48("69883"), result?.success)) === (stryMutAct_9fa48("69884") ? true : (stryCov_9fa48("69884"), false)))) {
            if (stryMutAct_9fa48("69885")) {
              {}
            } else {
              stryCov_9fa48("69885");
              throw buildSystemMetadataMutationError(result, metadata);
            }
          }
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("69886")) {
          {}
        } else {
          stryCov_9fa48("69886");
          throw buildSystemMetadataMutationError(error, metadata);
        }
      }
    }
  }
  async insertRow(row, options = {}) {
    if (stryMutAct_9fa48("69887")) {
      {}
    } else {
      stryCov_9fa48("69887");
      return this.executeMutation(stryMutAct_9fa48("69888") ? "" : (stryCov_9fa48("69888"), 'insert'), stryMutAct_9fa48("69889") ? {} : (stryCov_9fa48("69889"), {
        row
      }), options, stryMutAct_9fa48("69890") ? () => undefined : (stryCov_9fa48("69890"), mutationOptions => this.requireGateway().insertSystemTableRow(this.getTableName(), row, mutationOptions)));
    }
  }
  async upsertRow(row, options = {}) {
    if (stryMutAct_9fa48("69891")) {
      {}
    } else {
      stryCov_9fa48("69891");
      return this.executeMutation(stryMutAct_9fa48("69892") ? "" : (stryCov_9fa48("69892"), 'upsert'), stryMutAct_9fa48("69893") ? {} : (stryCov_9fa48("69893"), {
        row
      }), options, stryMutAct_9fa48("69894") ? () => undefined : (stryCov_9fa48("69894"), mutationOptions => this.requireGateway().upsertSystemTableRow(this.getTableName(), row, mutationOptions)));
    }
  }
  async updateByPrimaryKey(primaryKeyValue, data, options = {}) {
    if (stryMutAct_9fa48("69895")) {
      {}
    } else {
      stryCov_9fa48("69895");
      return this.executeMutation(stryMutAct_9fa48("69896") ? "" : (stryCov_9fa48("69896"), 'update'), stryMutAct_9fa48("69897") ? {} : (stryCov_9fa48("69897"), {
        primaryKeyValue,
        data
      }), options, stryMutAct_9fa48("69898") ? () => undefined : (stryCov_9fa48("69898"), mutationOptions => this.requireGateway().updateSystemTableRow(this.getTableName(), stryMutAct_9fa48("69899") ? {} : (stryCov_9fa48("69899"), {
        [this.getPrimaryKeyField()]: primaryKeyValue
      }), data, mutationOptions)));
    }
  }
  async deleteByPrimaryKey(primaryKeyValue, options = {}) {
    if (stryMutAct_9fa48("69900")) {
      {}
    } else {
      stryCov_9fa48("69900");
      return this.executeMutation(stryMutAct_9fa48("69901") ? "" : (stryCov_9fa48("69901"), 'delete'), stryMutAct_9fa48("69902") ? {} : (stryCov_9fa48("69902"), {
        primaryKeyValue
      }), options, stryMutAct_9fa48("69903") ? () => undefined : (stryCov_9fa48("69903"), mutationOptions => this.requireGateway().deleteSystemTableRow(this.getTableName(), stryMutAct_9fa48("69904") ? {} : (stryCov_9fa48("69904"), {
        [this.getPrimaryKeyField()]: primaryKeyValue
      }), mutationOptions)));
    }
  }
}
export { buildSystemMetadataMutationError, SystemMetadataOwnerBase, unwrapRowReadResult };