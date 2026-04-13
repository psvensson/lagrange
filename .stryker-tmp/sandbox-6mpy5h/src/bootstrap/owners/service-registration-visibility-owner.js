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
import { subscribeToSystemTableCacheChanges, waitForStartupConvergence } from '../shared/startup-convergence-gate.js';
import { BOOTSTRAP_API_CACHE_VISIBILITY, BOOTSTRAP_API_DEFAULT, BOOTSTRAP_API_ERROR, BOOTSTRAP_API_LOG_MSG, BOOTSTRAP_API_SQL } from '../bootstrap-api-constants.js';
import { BOOTSTRAP_PIPELINE_ERROR_CODE } from '../bootstrap-constants.js';
import { COLUMN, HTTP_STATUS, NUM, TABLES, TYPEOF } from '../../constants/index.js';
const SERVICE_REGISTRATION_VISIBILITY_OWNER_LITERAL = Object.freeze(stryMutAct_9fa48("23891") ? {} : (stryCov_9fa48("23891"), {
  BOOTSTRAP_API_SERVICE_REGISTRATION: stryMutAct_9fa48("23892") ? "" : (stryCov_9fa48("23892"), 'bootstrap_api_service_registration'),
  AUTHORITATIVE_SERVICES_CACHE_REPAIR_FAILED_DURING_REGISTER_SERVICE_VISIBILITY_WAIT: stryMutAct_9fa48("23893") ? "" : (stryCov_9fa48("23893"), 'Authoritative services-cache repair failed during register-service visibility wait')
}));
const REGISTERED_SERVICE_CACHE_REQUIRED_FIELDS = Object.freeze(stryMutAct_9fa48("23894") ? [] : (stryCov_9fa48("23894"), [COLUMN.SERVICE_ID, COLUMN.NODE_ID, COLUMN.SERVICE_TYPE, COLUMN.STATUS]));
const REGISTERED_SERVICE_CACHE_OPTIONAL_FIELDS = Object.freeze(stryMutAct_9fa48("23895") ? [] : (stryCov_9fa48("23895"), [COLUMN.GROUP_ID, COLUMN.REPLICA_ID, COLUMN.ADDRESS]));
class ServiceRegistrationVisibilityOwner {
  constructor(options = {}) {
    if (stryMutAct_9fa48("23896")) {
      {}
    } else {
      stryCov_9fa48("23896");
      this.delegates = stryMutAct_9fa48("23899") ? options.delegates && {} : stryMutAct_9fa48("23898") ? false : stryMutAct_9fa48("23897") ? true : (stryCov_9fa48("23897", "23898", "23899"), options.delegates || {});
    }
  }
  getSystemTableCache() {
    if (stryMutAct_9fa48("23900")) {
      {}
    } else {
      stryCov_9fa48("23900");
      return stryMutAct_9fa48("23903") ? this.delegates.getSystemTableCache?.() && null : stryMutAct_9fa48("23902") ? false : stryMutAct_9fa48("23901") ? true : (stryCov_9fa48("23901", "23902", "23903"), (stryMutAct_9fa48("23904") ? this.delegates.getSystemTableCache() : (stryCov_9fa48("23904"), this.delegates.getSystemTableCache?.())) || null);
    }
  }
  getLogger() {
    if (stryMutAct_9fa48("23905")) {
      {}
    } else {
      stryCov_9fa48("23905");
      return stryMutAct_9fa48("23908") ? this.delegates.getLogger?.() && console : stryMutAct_9fa48("23907") ? false : stryMutAct_9fa48("23906") ? true : (stryCov_9fa48("23906", "23907", "23908"), (stryMutAct_9fa48("23909") ? this.delegates.getLogger() : (stryCov_9fa48("23909"), this.delegates.getLogger?.())) || console);
    }
  }
  getCdcIntegrationService() {
    if (stryMutAct_9fa48("23910")) {
      {}
    } else {
      stryCov_9fa48("23910");
      return stryMutAct_9fa48("23913") ? this.delegates.getCdcIntegrationService?.() && null : stryMutAct_9fa48("23912") ? false : stryMutAct_9fa48("23911") ? true : (stryCov_9fa48("23911", "23912", "23913"), (stryMutAct_9fa48("23914") ? this.delegates.getCdcIntegrationService() : (stryCov_9fa48("23914"), this.delegates.getCdcIntegrationService?.())) || null);
    }
  }
  async executeBootstrapControlPlaneQuery(sql, params) {
    if (stryMutAct_9fa48("23915")) {
      {}
    } else {
      stryCov_9fa48("23915");
      return stryMutAct_9fa48("23916") ? this.delegates.executeBootstrapControlPlaneQuery(sql, params) : (stryCov_9fa48("23916"), this.delegates.executeBootstrapControlPlaneQuery?.(sql, params));
    }
  }
  buildRegisterServiceValidationError(...args) {
    if (stryMutAct_9fa48("23917")) {
      {}
    } else {
      stryCov_9fa48("23917");
      return stryMutAct_9fa48("23918") ? this.delegates.buildRegisterServiceValidationError(...args) : (stryCov_9fa48("23918"), this.delegates.buildRegisterServiceValidationError?.(...args));
    }
  }
  async isRegisteredServiceVisibleInCache(expectedService) {
    if (stryMutAct_9fa48("23919")) {
      {}
    } else {
      stryCov_9fa48("23919");
      const evaluation = await this.evaluateRegisteredServiceCacheVisibility(expectedService);
      return evaluation.visible;
    }
  }
  buildRegisteredServiceVisibilitySnapshot(serviceRow) {
    if (stryMutAct_9fa48("23920")) {
      {}
    } else {
      stryCov_9fa48("23920");
      if (stryMutAct_9fa48("23923") ? !serviceRow && typeof serviceRow !== TYPEOF.OBJECT : stryMutAct_9fa48("23922") ? false : stryMutAct_9fa48("23921") ? true : (stryCov_9fa48("23921", "23922", "23923"), (stryMutAct_9fa48("23924") ? serviceRow : (stryCov_9fa48("23924"), !serviceRow)) || (stryMutAct_9fa48("23926") ? typeof serviceRow === TYPEOF.OBJECT : stryMutAct_9fa48("23925") ? false : (stryCov_9fa48("23925", "23926"), typeof serviceRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("23927")) {
          {}
        } else {
          stryCov_9fa48("23927");
          return null;
        }
      }
      return stryMutAct_9fa48("23928") ? {} : (stryCov_9fa48("23928"), {
        [COLUMN.SERVICE_ID]: stryMutAct_9fa48("23931") ? serviceRow[COLUMN.SERVICE_ID] && null : stryMutAct_9fa48("23930") ? false : stryMutAct_9fa48("23929") ? true : (stryCov_9fa48("23929", "23930", "23931"), serviceRow[COLUMN.SERVICE_ID] || null),
        [COLUMN.NODE_ID]: stryMutAct_9fa48("23934") ? serviceRow[COLUMN.NODE_ID] && null : stryMutAct_9fa48("23933") ? false : stryMutAct_9fa48("23932") ? true : (stryCov_9fa48("23932", "23933", "23934"), serviceRow[COLUMN.NODE_ID] || null),
        [COLUMN.SERVICE_TYPE]: stryMutAct_9fa48("23937") ? serviceRow[COLUMN.SERVICE_TYPE] && null : stryMutAct_9fa48("23936") ? false : stryMutAct_9fa48("23935") ? true : (stryCov_9fa48("23935", "23936", "23937"), serviceRow[COLUMN.SERVICE_TYPE] || null),
        [COLUMN.STATUS]: stryMutAct_9fa48("23940") ? serviceRow[COLUMN.STATUS] && null : stryMutAct_9fa48("23939") ? false : stryMutAct_9fa48("23938") ? true : (stryCov_9fa48("23938", "23939", "23940"), serviceRow[COLUMN.STATUS] || null),
        [COLUMN.GROUP_ID]: stryMutAct_9fa48("23943") ? serviceRow[COLUMN.GROUP_ID] && null : stryMutAct_9fa48("23942") ? false : stryMutAct_9fa48("23941") ? true : (stryCov_9fa48("23941", "23942", "23943"), serviceRow[COLUMN.GROUP_ID] || null),
        [COLUMN.REPLICA_ID]: stryMutAct_9fa48("23946") ? serviceRow[COLUMN.REPLICA_ID] && null : stryMutAct_9fa48("23945") ? false : stryMutAct_9fa48("23944") ? true : (stryCov_9fa48("23944", "23945", "23946"), serviceRow[COLUMN.REPLICA_ID] || null),
        [COLUMN.ADDRESS]: stryMutAct_9fa48("23949") ? serviceRow[COLUMN.ADDRESS] && null : stryMutAct_9fa48("23948") ? false : stryMutAct_9fa48("23947") ? true : (stryCov_9fa48("23947", "23948", "23949"), serviceRow[COLUMN.ADDRESS] || null),
        [COLUMN.CREATED_AT]: stryMutAct_9fa48("23952") ? serviceRow[COLUMN.CREATED_AT] && null : stryMutAct_9fa48("23951") ? false : stryMutAct_9fa48("23950") ? true : (stryCov_9fa48("23950", "23951", "23952"), serviceRow[COLUMN.CREATED_AT] || null),
        [COLUMN.UPDATED_AT]: stryMutAct_9fa48("23955") ? serviceRow[COLUMN.UPDATED_AT] && null : stryMutAct_9fa48("23954") ? false : stryMutAct_9fa48("23953") ? true : (stryCov_9fa48("23953", "23954", "23955"), serviceRow[COLUMN.UPDATED_AT] || null)
      });
    }
  }
  buildRegisteredServiceCacheObservation(expectedService, diagnostics) {
    if (stryMutAct_9fa48("23956")) {
      {}
    } else {
      stryCov_9fa48("23956");
      const cache = this.getSystemTableCache();
      if (stryMutAct_9fa48("23959") ? false : stryMutAct_9fa48("23958") ? true : stryMutAct_9fa48("23957") ? cache : (stryCov_9fa48("23957", "23958", "23959"), !cache)) {
        if (stryMutAct_9fa48("23960")) {
          {}
        } else {
          stryCov_9fa48("23960");
          return stryMutAct_9fa48("23961") ? {} : (stryCov_9fa48("23961"), {
            cachedService: null,
            cacheMismatchFields: stryMutAct_9fa48("23962") ? ["Stryker was here"] : (stryCov_9fa48("23962"), []),
            cacheReason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_CACHE_UNAVAILABLE,
            visibleResult: null
          });
        }
      }
      const cachedService = cache.get(TABLES.SERVICES, expectedService[COLUMN.SERVICE_ID]);
      if (stryMutAct_9fa48("23965") ? false : stryMutAct_9fa48("23964") ? true : stryMutAct_9fa48("23963") ? cachedService : (stryCov_9fa48("23963", "23964", "23965"), !cachedService)) {
        if (stryMutAct_9fa48("23966")) {
          {}
        } else {
          stryCov_9fa48("23966");
          return stryMutAct_9fa48("23967") ? {} : (stryCov_9fa48("23967"), {
            cachedService: null,
            cacheMismatchFields: stryMutAct_9fa48("23968") ? ["Stryker was here"] : (stryCov_9fa48("23968"), []),
            cacheReason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_SERVICE_ROW_MISSING,
            visibleResult: null
          });
        }
      }
      const cacheMismatchFields = this.getRegisteredServiceMismatchFields(cachedService, expectedService);
      if (stryMutAct_9fa48("23971") ? cacheMismatchFields.length !== NUM.ZERO : stryMutAct_9fa48("23970") ? false : stryMutAct_9fa48("23969") ? true : (stryCov_9fa48("23969", "23970", "23971"), cacheMismatchFields.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("23972")) {
          {}
        } else {
          stryCov_9fa48("23972");
          return stryMutAct_9fa48("23973") ? {} : (stryCov_9fa48("23973"), {
            cachedService,
            cacheMismatchFields,
            cacheReason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_VISIBLE,
            visibleResult: stryMutAct_9fa48("23974") ? {} : (stryCov_9fa48("23974"), {
              visible: stryMutAct_9fa48("23975") ? false : (stryCov_9fa48("23975"), true),
              diagnostics: stryMutAct_9fa48("23976") ? {} : (stryCov_9fa48("23976"), {
                ...diagnostics,
                reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_VISIBLE,
                observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService)
              })
            })
          });
        }
      }
      return stryMutAct_9fa48("23977") ? {} : (stryCov_9fa48("23977"), {
        cachedService,
        cacheMismatchFields,
        cacheReason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_FIELD_MISMATCH,
        visibleResult: null
      });
    }
  }
  buildRegisteredServiceVisibilityExpectation(serviceRow) {
    if (stryMutAct_9fa48("23978")) {
      {}
    } else {
      stryCov_9fa48("23978");
      if (stryMutAct_9fa48("23981") ? !serviceRow && typeof serviceRow !== TYPEOF.OBJECT : stryMutAct_9fa48("23980") ? false : stryMutAct_9fa48("23979") ? true : (stryCov_9fa48("23979", "23980", "23981"), (stryMutAct_9fa48("23982") ? serviceRow : (stryCov_9fa48("23982"), !serviceRow)) || (stryMutAct_9fa48("23984") ? typeof serviceRow === TYPEOF.OBJECT : stryMutAct_9fa48("23983") ? false : (stryCov_9fa48("23983", "23984"), typeof serviceRow !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("23985")) {
          {}
        } else {
          stryCov_9fa48("23985");
          return null;
        }
      }
      const expectation = {};
      for (const fieldName of REGISTERED_SERVICE_CACHE_REQUIRED_FIELDS) {
        if (stryMutAct_9fa48("23986")) {
          {}
        } else {
          stryCov_9fa48("23986");
          expectation[fieldName] = stryMutAct_9fa48("23989") ? serviceRow[fieldName] && null : stryMutAct_9fa48("23988") ? false : stryMutAct_9fa48("23987") ? true : (stryCov_9fa48("23987", "23988", "23989"), serviceRow[fieldName] || null);
        }
      }
      for (const fieldName of REGISTERED_SERVICE_CACHE_OPTIONAL_FIELDS) {
        if (stryMutAct_9fa48("23990")) {
          {}
        } else {
          stryCov_9fa48("23990");
          if (stryMutAct_9fa48("23992") ? false : stryMutAct_9fa48("23991") ? true : (stryCov_9fa48("23991", "23992"), serviceRow[fieldName])) {
            if (stryMutAct_9fa48("23993")) {
              {}
            } else {
              stryCov_9fa48("23993");
              expectation[fieldName] = serviceRow[fieldName];
            }
          }
        }
      }
      return expectation;
    }
  }
  getRegisteredServiceMismatchFields(observedService, expectedService) {
    if (stryMutAct_9fa48("23994")) {
      {}
    } else {
      stryCov_9fa48("23994");
      const mismatchFields = stryMutAct_9fa48("23995") ? ["Stryker was here"] : (stryCov_9fa48("23995"), []);
      for (const fieldName of REGISTERED_SERVICE_CACHE_REQUIRED_FIELDS) {
        if (stryMutAct_9fa48("23996")) {
          {}
        } else {
          stryCov_9fa48("23996");
          if (stryMutAct_9fa48("23999") ? observedService[fieldName] === expectedService[fieldName] : stryMutAct_9fa48("23998") ? false : stryMutAct_9fa48("23997") ? true : (stryCov_9fa48("23997", "23998", "23999"), observedService[fieldName] !== expectedService[fieldName])) {
            if (stryMutAct_9fa48("24000")) {
              {}
            } else {
              stryCov_9fa48("24000");
              mismatchFields.push(fieldName);
            }
          }
        }
      }
      for (const fieldName of REGISTERED_SERVICE_CACHE_OPTIONAL_FIELDS) {
        if (stryMutAct_9fa48("24001")) {
          {}
        } else {
          stryCov_9fa48("24001");
          if (stryMutAct_9fa48("24004") ? false : stryMutAct_9fa48("24003") ? true : stryMutAct_9fa48("24002") ? expectedService[fieldName] : (stryCov_9fa48("24002", "24003", "24004"), !expectedService[fieldName])) {
            if (stryMutAct_9fa48("24005")) {
              {}
            } else {
              stryCov_9fa48("24005");
              continue;
            }
          }
          if (stryMutAct_9fa48("24008") ? observedService[fieldName] === expectedService[fieldName] : stryMutAct_9fa48("24007") ? false : stryMutAct_9fa48("24006") ? true : (stryCov_9fa48("24006", "24007", "24008"), observedService[fieldName] !== expectedService[fieldName])) {
            if (stryMutAct_9fa48("24009")) {
              {}
            } else {
              stryCov_9fa48("24009");
              mismatchFields.push(fieldName);
            }
          }
        }
      }
      return mismatchFields;
    }
  }
  async readRegisteredServiceFromStorage(serviceId) {
    if (stryMutAct_9fa48("24010")) {
      {}
    } else {
      stryCov_9fa48("24010");
      const executeQuery = this.delegates.executeBootstrapControlPlaneQuery;
      if (stryMutAct_9fa48("24013") ? typeof executeQuery === TYPEOF.FUNCTION : stryMutAct_9fa48("24012") ? false : stryMutAct_9fa48("24011") ? true : (stryCov_9fa48("24011", "24012", "24013"), typeof executeQuery !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("24014")) {
          {}
        } else {
          stryCov_9fa48("24014");
          return stryMutAct_9fa48("24015") ? {} : (stryCov_9fa48("24015"), {
            row: null,
            error: null
          });
        }
      }
      try {
        if (stryMutAct_9fa48("24016")) {
          {}
        } else {
          stryCov_9fa48("24016");
          const result = await this.executeBootstrapControlPlaneQuery(BOOTSTRAP_API_SQL.SELECT_REGISTERED_SERVICE_BY_ID, stryMutAct_9fa48("24017") ? [] : (stryCov_9fa48("24017"), [serviceId]));
          if (stryMutAct_9fa48("24020") ? !result && result.success === false : stryMutAct_9fa48("24019") ? false : stryMutAct_9fa48("24018") ? true : (stryCov_9fa48("24018", "24019", "24020"), (stryMutAct_9fa48("24021") ? result : (stryCov_9fa48("24021"), !result)) || (stryMutAct_9fa48("24023") ? result.success !== false : stryMutAct_9fa48("24022") ? false : (stryCov_9fa48("24022", "24023"), result.success === (stryMutAct_9fa48("24024") ? true : (stryCov_9fa48("24024"), false)))))) {
            if (stryMutAct_9fa48("24025")) {
              {}
            } else {
              stryCov_9fa48("24025");
              return stryMutAct_9fa48("24026") ? {} : (stryCov_9fa48("24026"), {
                row: null,
                error: stryMutAct_9fa48("24029") ? result?.error && BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED : stryMutAct_9fa48("24028") ? false : stryMutAct_9fa48("24027") ? true : (stryCov_9fa48("24027", "24028", "24029"), (stryMutAct_9fa48("24030") ? result.error : (stryCov_9fa48("24030"), result?.error)) || BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_FAILED)
              });
            }
          }
          const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("24031") ? ["Stryker was here"] : (stryCov_9fa48("24031"), []);
          return stryMutAct_9fa48("24032") ? {} : (stryCov_9fa48("24032"), {
            row: stryMutAct_9fa48("24035") ? rows[NUM.ZERO] && null : stryMutAct_9fa48("24034") ? false : stryMutAct_9fa48("24033") ? true : (stryCov_9fa48("24033", "24034", "24035"), rows[NUM.ZERO] || null),
            error: null
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("24036")) {
          {}
        } else {
          stryCov_9fa48("24036");
          return stryMutAct_9fa48("24037") ? {} : (stryCov_9fa48("24037"), {
            row: null,
            error: error.message
          });
        }
      }
    }
  }
  async evaluateRegisteredServiceCacheVisibility(expectedService) {
    if (stryMutAct_9fa48("24038")) {
      {}
    } else {
      stryCov_9fa48("24038");
      const diagnostics = stryMutAct_9fa48("24039") ? {} : (stryCov_9fa48("24039"), {
        reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_CACHE_UNAVAILABLE,
        serviceId: expectedService[COLUMN.SERVICE_ID],
        expected: this.buildRegisteredServiceVisibilitySnapshot(expectedService),
        observed: null,
        mismatchFields: stryMutAct_9fa48("24040") ? ["Stryker was here"] : (stryCov_9fa48("24040"), []),
        authoritative: null
      });
      const {
        cachedService,
        cacheMismatchFields,
        cacheReason,
        visibleResult
      } = this.buildRegisteredServiceCacheObservation(expectedService, diagnostics);
      if (stryMutAct_9fa48("24042") ? false : stryMutAct_9fa48("24041") ? true : (stryCov_9fa48("24041", "24042"), visibleResult)) {
        if (stryMutAct_9fa48("24043")) {
          {}
        } else {
          stryCov_9fa48("24043");
          return visibleResult;
        }
      }
      const storageLookup = await this.readRegisteredServiceFromStorage(expectedService[COLUMN.SERVICE_ID]);
      if (stryMutAct_9fa48("24045") ? false : stryMutAct_9fa48("24044") ? true : (stryCov_9fa48("24044", "24045"), storageLookup.error)) {
        if (stryMutAct_9fa48("24046")) {
          {}
        } else {
          stryCov_9fa48("24046");
          return stryMutAct_9fa48("24047") ? {} : (stryCov_9fa48("24047"), {
            visible: stryMutAct_9fa48("24048") ? true : (stryCov_9fa48("24048"), false),
            diagnostics: stryMutAct_9fa48("24049") ? {} : (stryCov_9fa48("24049"), {
              ...diagnostics,
              reason: cacheReason,
              observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
              mismatchFields: cacheMismatchFields,
              authoritative: stryMutAct_9fa48("24050") ? {} : (stryCov_9fa48("24050"), {
                reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_LOOKUP_FAILED,
                error: storageLookup.error,
                observed: null,
                mismatchFields: stryMutAct_9fa48("24051") ? ["Stryker was here"] : (stryCov_9fa48("24051"), [])
              })
            })
          });
        }
      }
      if (stryMutAct_9fa48("24054") ? false : stryMutAct_9fa48("24053") ? true : stryMutAct_9fa48("24052") ? storageLookup.row : (stryCov_9fa48("24052", "24053", "24054"), !storageLookup.row)) {
        if (stryMutAct_9fa48("24055")) {
          {}
        } else {
          stryCov_9fa48("24055");
          return stryMutAct_9fa48("24056") ? {} : (stryCov_9fa48("24056"), {
            visible: stryMutAct_9fa48("24057") ? true : (stryCov_9fa48("24057"), false),
            diagnostics: stryMutAct_9fa48("24058") ? {} : (stryCov_9fa48("24058"), {
              ...diagnostics,
              reason: cacheReason,
              observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
              mismatchFields: cacheMismatchFields,
              authoritative: stryMutAct_9fa48("24059") ? {} : (stryCov_9fa48("24059"), {
                reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_MISSING,
                observed: null,
                mismatchFields: stryMutAct_9fa48("24060") ? ["Stryker was here"] : (stryCov_9fa48("24060"), [])
              })
            })
          });
        }
      }
      const storageMismatchFields = this.getRegisteredServiceMismatchFields(storageLookup.row, expectedService);
      const authoritativeDiagnostics = stryMutAct_9fa48("24061") ? {} : (stryCov_9fa48("24061"), {
        reason: (stryMutAct_9fa48("24064") ? storageMismatchFields.length !== NUM.ZERO : stryMutAct_9fa48("24063") ? false : stryMutAct_9fa48("24062") ? true : (stryCov_9fa48("24062", "24063", "24064"), storageMismatchFields.length === NUM.ZERO)) ? BOOTSTRAP_API_CACHE_VISIBILITY.REASON_VISIBLE : BOOTSTRAP_API_CACHE_VISIBILITY.REASON_FIELD_MISMATCH,
        observed: this.buildRegisteredServiceVisibilitySnapshot(storageLookup.row),
        mismatchFields: storageMismatchFields
      });
      if (stryMutAct_9fa48("24067") ? storageMismatchFields.length !== NUM.ZERO : stryMutAct_9fa48("24066") ? false : stryMutAct_9fa48("24065") ? true : (stryCov_9fa48("24065", "24066", "24067"), storageMismatchFields.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("24068")) {
          {}
        } else {
          stryCov_9fa48("24068");
          return stryMutAct_9fa48("24069") ? {} : (stryCov_9fa48("24069"), {
            visible: stryMutAct_9fa48("24070") ? true : (stryCov_9fa48("24070"), false),
            diagnostics: stryMutAct_9fa48("24071") ? {} : (stryCov_9fa48("24071"), {
              ...diagnostics,
              reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_VISIBLE_CACHE_STALE,
              observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
              mismatchFields: cacheMismatchFields,
              authoritative: authoritativeDiagnostics
            })
          });
        }
      }
      return stryMutAct_9fa48("24072") ? {} : (stryCov_9fa48("24072"), {
        visible: stryMutAct_9fa48("24073") ? true : (stryCov_9fa48("24073"), false),
        diagnostics: stryMutAct_9fa48("24074") ? {} : (stryCov_9fa48("24074"), {
          ...diagnostics,
          reason: cacheReason,
          observed: this.buildRegisteredServiceVisibilitySnapshot(cachedService),
          mismatchFields: cacheMismatchFields,
          authoritative: authoritativeDiagnostics
        })
      });
    }
  }
  async maybeRepairRegisteredServiceCacheVisibility(expectedService, diagnostics) {
    if (stryMutAct_9fa48("24075")) {
      {}
    } else {
      stryCov_9fa48("24075");
      if (stryMutAct_9fa48("24078") ? !expectedService && diagnostics?.reason !== BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_VISIBLE_CACHE_STALE : stryMutAct_9fa48("24077") ? false : stryMutAct_9fa48("24076") ? true : (stryCov_9fa48("24076", "24077", "24078"), (stryMutAct_9fa48("24079") ? expectedService : (stryCov_9fa48("24079"), !expectedService)) || (stryMutAct_9fa48("24081") ? diagnostics?.reason === BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_VISIBLE_CACHE_STALE : stryMutAct_9fa48("24080") ? false : (stryCov_9fa48("24080", "24081"), (stryMutAct_9fa48("24082") ? diagnostics.reason : (stryCov_9fa48("24082"), diagnostics?.reason)) !== BOOTSTRAP_API_CACHE_VISIBILITY.REASON_STORAGE_ROW_VISIBLE_CACHE_STALE)))) {
        if (stryMutAct_9fa48("24083")) {
          {}
        } else {
          stryCov_9fa48("24083");
          return stryMutAct_9fa48("24084") ? true : (stryCov_9fa48("24084"), false);
        }
      }
      const cdcIntegrationService = this.getCdcIntegrationService();
      if (stryMutAct_9fa48("24087") ? !cdcIntegrationService && typeof cdcIntegrationService.repairCacheVisibilityHole !== TYPEOF.FUNCTION : stryMutAct_9fa48("24086") ? false : stryMutAct_9fa48("24085") ? true : (stryCov_9fa48("24085", "24086", "24087"), (stryMutAct_9fa48("24088") ? cdcIntegrationService : (stryCov_9fa48("24088"), !cdcIntegrationService)) || (stryMutAct_9fa48("24090") ? typeof cdcIntegrationService.repairCacheVisibilityHole === TYPEOF.FUNCTION : stryMutAct_9fa48("24089") ? false : (stryCov_9fa48("24089", "24090"), typeof cdcIntegrationService.repairCacheVisibilityHole !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("24091")) {
          {}
        } else {
          stryCov_9fa48("24091");
          return stryMutAct_9fa48("24092") ? true : (stryCov_9fa48("24092"), false);
        }
      }
      try {
        if (stryMutAct_9fa48("24093")) {
          {}
        } else {
          stryCov_9fa48("24093");
          const expectedFields = this.buildRegisteredServiceVisibilityExpectation(expectedService);
          return await cdcIntegrationService.repairCacheVisibilityHole(TABLES.SERVICES, expectedService[COLUMN.SERVICE_ID], stryMutAct_9fa48("24094") ? false : (stryCov_9fa48("24094"), true), expectedFields, null, stryMutAct_9fa48("24095") ? {} : (stryCov_9fa48("24095"), {
            fallbackPhase: SERVICE_REGISTRATION_VISIBILITY_OWNER_LITERAL.BOOTSTRAP_API_SERVICE_REGISTRATION
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("24096")) {
          {}
        } else {
          stryCov_9fa48("24096");
          this.getLogger().warn(SERVICE_REGISTRATION_VISIBILITY_OWNER_LITERAL.AUTHORITATIVE_SERVICES_CACHE_REPAIR_FAILED_DURING_REGISTER_SERVICE_VISIBILITY_WAIT, stryMutAct_9fa48("24097") ? {} : (stryCov_9fa48("24097"), {
            serviceId: expectedService[COLUMN.SERVICE_ID],
            nodeId: expectedService[COLUMN.NODE_ID],
            error: stryMutAct_9fa48("24100") ? error?.message && String(error) : stryMutAct_9fa48("24099") ? false : stryMutAct_9fa48("24098") ? true : (stryCov_9fa48("24098", "24099", "24100"), (stryMutAct_9fa48("24101") ? error.message : (stryCov_9fa48("24101"), error?.message)) || String(error))
          }));
          return stryMutAct_9fa48("24102") ? true : (stryCov_9fa48("24102"), false);
        }
      }
    }
  }
  buildRegisteredServiceVisibilityTimeoutDiagnostics(expectedService, lastDiagnostics, timeoutMs, elapsedMs) {
    if (stryMutAct_9fa48("24103")) {
      {}
    } else {
      stryCov_9fa48("24103");
      return stryMutAct_9fa48("24104") ? {} : (stryCov_9fa48("24104"), {
        serviceId: expectedService[COLUMN.SERVICE_ID],
        nodeId: expectedService[COLUMN.NODE_ID],
        timeoutMs,
        elapsedMs,
        lastVisibilityCheck: stryMutAct_9fa48("24107") ? lastDiagnostics && {
          reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_CACHE_UNAVAILABLE,
          serviceId: expectedService[COLUMN.SERVICE_ID],
          expected: this.buildRegisteredServiceVisibilitySnapshot(expectedService),
          observed: null,
          mismatchFields: [],
          authoritative: null
        } : stryMutAct_9fa48("24106") ? false : stryMutAct_9fa48("24105") ? true : (stryCov_9fa48("24105", "24106", "24107"), lastDiagnostics || (stryMutAct_9fa48("24108") ? {} : (stryCov_9fa48("24108"), {
          reason: BOOTSTRAP_API_CACHE_VISIBILITY.REASON_CACHE_UNAVAILABLE,
          serviceId: expectedService[COLUMN.SERVICE_ID],
          expected: this.buildRegisteredServiceVisibilitySnapshot(expectedService),
          observed: null,
          mismatchFields: stryMutAct_9fa48("24109") ? ["Stryker was here"] : (stryCov_9fa48("24109"), []),
          authoritative: null
        })))
      });
    }
  }
  async waitForRegisteredServiceCacheVisibility(expectedService) {
    if (stryMutAct_9fa48("24110")) {
      {}
    } else {
      stryCov_9fa48("24110");
      const serviceRegistrationCacheVisibilityTimeout = BOOTSTRAP_API_ERROR.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT;
      const timeoutMs = BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT_MS;
      const pollIntervalMs = BOOTSTRAP_API_DEFAULT.SERVICE_REGISTRATION_CACHE_VISIBILITY_POLL_INTERVAL_MS;
      let lastDiagnostics = null;
      await waitForStartupConvergence(stryMutAct_9fa48("24111") ? {} : (stryCov_9fa48("24111"), {
        timeoutMs,
        pollIntervalMs,
        subscriptions: stryMutAct_9fa48("24112") ? [] : (stryCov_9fa48("24112"), [stryMutAct_9fa48("24113") ? () => undefined : (stryCov_9fa48("24113"), notify => subscribeToSystemTableCacheChanges(this.getSystemTableCache(), notify, stryMutAct_9fa48("24114") ? {} : (stryCov_9fa48("24114"), {
          tableNames: stryMutAct_9fa48("24115") ? [] : (stryCov_9fa48("24115"), [TABLES.SERVICES])
        })))]),
        evaluate: async () => {
          if (stryMutAct_9fa48("24116")) {
            {}
          } else {
            stryCov_9fa48("24116");
            const evaluation = await this.evaluateRegisteredServiceCacheVisibility(expectedService);
            lastDiagnostics = evaluation.diagnostics;
            return stryMutAct_9fa48("24117") ? {} : (stryCov_9fa48("24117"), {
              ready: evaluation.visible,
              diagnostics: evaluation.diagnostics
            });
          }
        },
        onBlocked: async result => {
          if (stryMutAct_9fa48("24118")) {
            {}
          } else {
            stryCov_9fa48("24118");
            return this.maybeRepairRegisteredServiceCacheVisibility(expectedService, stryMutAct_9fa48("24121") ? result?.diagnostics && null : stryMutAct_9fa48("24120") ? false : stryMutAct_9fa48("24119") ? true : (stryCov_9fa48("24119", "24120", "24121"), (stryMutAct_9fa48("24122") ? result.diagnostics : (stryCov_9fa48("24122"), result?.diagnostics)) || null));
          }
        },
        createTimeoutError: (_result, context) => {
          if (stryMutAct_9fa48("24123")) {
            {}
          } else {
            stryCov_9fa48("24123");
            const timeoutDiagnostics = this.buildRegisteredServiceVisibilityTimeoutDiagnostics(expectedService, lastDiagnostics, timeoutMs, context.elapsedMs);
            this.getLogger().warn(BOOTSTRAP_API_LOG_MSG.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT, timeoutDiagnostics);
            return this.buildRegisterServiceValidationError(HTTP_STATUS.SERVICE_UNAVAILABLE, serviceRegistrationCacheVisibilityTimeout(expectedService[COLUMN.SERVICE_ID], expectedService[COLUMN.NODE_ID], timeoutMs), BOOTSTRAP_PIPELINE_ERROR_CODE.SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT, stryMutAct_9fa48("24124") ? {} : (stryCov_9fa48("24124"), {
              retryAfterMs: pollIntervalMs,
              details: stryMutAct_9fa48("24125") ? {} : (stryCov_9fa48("24125"), {
                ...timeoutDiagnostics,
                timeoutKind: context.timeoutKind
              })
            }));
          }
        }
      }));
    }
  }
  async readCurrentRegisteredServiceRow(serviceId) {
    if (stryMutAct_9fa48("24126")) {
      {}
    } else {
      stryCov_9fa48("24126");
      if (stryMutAct_9fa48("24129") ? typeof serviceId !== TYPEOF.STRING && serviceId.length === NUM.ZERO : stryMutAct_9fa48("24128") ? false : stryMutAct_9fa48("24127") ? true : (stryCov_9fa48("24127", "24128", "24129"), (stryMutAct_9fa48("24131") ? typeof serviceId === TYPEOF.STRING : stryMutAct_9fa48("24130") ? false : (stryCov_9fa48("24130", "24131"), typeof serviceId !== TYPEOF.STRING)) || (stryMutAct_9fa48("24133") ? serviceId.length !== NUM.ZERO : stryMutAct_9fa48("24132") ? false : (stryCov_9fa48("24132", "24133"), serviceId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("24134")) {
          {}
        } else {
          stryCov_9fa48("24134");
          return null;
        }
      }
      const cachedRow = stryMutAct_9fa48("24137") ? this.getSystemTableCache()?.get?.(TABLES.SERVICES, serviceId) && null : stryMutAct_9fa48("24136") ? false : stryMutAct_9fa48("24135") ? true : (stryCov_9fa48("24135", "24136", "24137"), (stryMutAct_9fa48("24139") ? this.getSystemTableCache().get?.(TABLES.SERVICES, serviceId) : stryMutAct_9fa48("24138") ? this.getSystemTableCache()?.get(TABLES.SERVICES, serviceId) : (stryCov_9fa48("24138", "24139"), this.getSystemTableCache()?.get?.(TABLES.SERVICES, serviceId))) || null);
      if (stryMutAct_9fa48("24141") ? false : stryMutAct_9fa48("24140") ? true : (stryCov_9fa48("24140", "24141"), cachedRow)) {
        if (stryMutAct_9fa48("24142")) {
          {}
        } else {
          stryCov_9fa48("24142");
          return stryMutAct_9fa48("24143") ? {} : (stryCov_9fa48("24143"), {
            ...cachedRow
          });
        }
      }
      const storageLookup = await this.readRegisteredServiceFromStorage(serviceId);
      if (stryMutAct_9fa48("24146") ? storageLookup.row : stryMutAct_9fa48("24145") ? false : stryMutAct_9fa48("24144") ? true : (stryCov_9fa48("24144", "24145", "24146"), storageLookup?.row)) {
        if (stryMutAct_9fa48("24147")) {
          {}
        } else {
          stryCov_9fa48("24147");
          return stryMutAct_9fa48("24148") ? {} : (stryCov_9fa48("24148"), {
            ...storageLookup.row
          });
        }
      }
      return null;
    }
  }
}
export { ServiceRegistrationVisibilityOwner };