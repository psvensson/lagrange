/**
 * Dependency lock persistence service.
 *
 * Creates, serializes, and builds SQL for dependency lock
 * records tied to module/service revisions.
 *
 * Reuses validators and serializers from wasm-meta-models.js.
 * Lock IDs are deterministic based on module identity and
 * resolved dependency digests.
 *
 * Requirements: 5.2
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
import { createHash } from 'node:crypto';
import { NUM } from '../constants/index.js';
import { TABLES } from '../constants/tables.js';
import { DEPENDENCY_LOCK_FIELD as DL, DEPENDENCY_LOCK_COL as DL_COL } from './wasm-meta-models-constants.js';
import { MODULE_MANIFEST_FIELD as MF, MODULE_MANIFEST_ERROR_MSG as ERR } from './module-manifest-constants.js';
import { validateDependencyLock, serializeDependencyLock } from './wasm-meta-models.js';

/**
 * Generate a deterministic lock ID from module identity
 * and resolved dependency digests.
 *
 * @param {string} namespace - Module namespace.
 * @param {string} name - Module name.
 * @param {string} version - Module version.
 * @param {Array<Object>} resolvedDependencies - Resolved deps
 *   with moduleId and digest fields.
 * @return {string} Deterministic hex lock ID.
 */
function generateLockId(namespace, name, version, resolvedDependencies) {
  if (stryMutAct_9fa48("160485")) {
    {}
  } else {
    stryCov_9fa48("160485");
    const sorted = stryMutAct_9fa48("160486") ? [...(resolvedDependencies || [])] : (stryCov_9fa48("160486"), (stryMutAct_9fa48("160487") ? [] : (stryCov_9fa48("160487"), [...(stryMutAct_9fa48("160490") ? resolvedDependencies && [] : stryMutAct_9fa48("160489") ? false : stryMutAct_9fa48("160488") ? true : (stryCov_9fa48("160488", "160489", "160490"), resolvedDependencies || (stryMutAct_9fa48("160491") ? ["Stryker was here"] : (stryCov_9fa48("160491"), []))))])).sort(stryMutAct_9fa48("160492") ? () => undefined : (stryCov_9fa48("160492"), (a, b) => (stryMutAct_9fa48("160495") ? a.moduleId && '' : stryMutAct_9fa48("160494") ? false : stryMutAct_9fa48("160493") ? true : (stryCov_9fa48("160493", "160494", "160495"), a.moduleId || (stryMutAct_9fa48("160496") ? "Stryker was here!" : (stryCov_9fa48("160496"), '')))).localeCompare(stryMutAct_9fa48("160499") ? b.moduleId && '' : stryMutAct_9fa48("160498") ? false : stryMutAct_9fa48("160497") ? true : (stryCov_9fa48("160497", "160498", "160499"), b.moduleId || (stryMutAct_9fa48("160500") ? "Stryker was here!" : (stryCov_9fa48("160500"), '')))))));
    const payload = JSON.stringify(stryMutAct_9fa48("160501") ? {} : (stryCov_9fa48("160501"), {
      namespace,
      name,
      version,
      deps: sorted
    }));
    return createHash(stryMutAct_9fa48("160502") ? "" : (stryCov_9fa48("160502"), 'sha256')).update(payload).digest(stryMutAct_9fa48("160503") ? "" : (stryCov_9fa48("160503"), 'hex'));
  }
}

/**
 * Create a dependency lock record from a manifest and its
 * resolved dependencies.
 *
 * @param {Object} manifest - Module manifest with namespace,
 *   name, and version fields.
 * @param {Array<Object>} resolvedDependencies - Array of
 *   {moduleId, digest} objects from dependency resolution.
 * @param {string} [serviceId] - Optional service ID to tie
 *   the lock to a specific service revision.
 * @return {{valid: boolean, lock?: Object, errors?: string[]}}
 */
function createDependencyLock(manifest, resolvedDependencies, serviceId) {
  if (stryMutAct_9fa48("160504")) {
    {}
  } else {
    stryCov_9fa48("160504");
    const namespace = manifest[MF.NAMESPACE];
    const name = manifest[MF.NAME];
    const version = manifest[MF.VERSION];
    const deps = stryMutAct_9fa48("160507") ? resolvedDependencies && [] : stryMutAct_9fa48("160506") ? false : stryMutAct_9fa48("160505") ? true : (stryCov_9fa48("160505", "160506", "160507"), resolvedDependencies || (stryMutAct_9fa48("160508") ? ["Stryker was here"] : (stryCov_9fa48("160508"), [])));
    const lockId = generateLockId(namespace, name, version, deps);
    const lock = stryMutAct_9fa48("160509") ? {} : (stryCov_9fa48("160509"), {
      [DL.LOCK_ID]: lockId,
      [DL.TARGET_MODULE_NAMESPACE]: namespace,
      [DL.TARGET_MODULE_NAME]: name,
      [DL.TARGET_MODULE_VERSION]: version,
      [DL.TARGET_SERVICE_ID]: stryMutAct_9fa48("160510") ? serviceId && null : (stryCov_9fa48("160510"), serviceId ?? null),
      [DL.RESOLVED_DEPENDENCIES]: deps
    });
    const validation = validateDependencyLock(lock);
    if (stryMutAct_9fa48("160513") ? false : stryMutAct_9fa48("160512") ? true : stryMutAct_9fa48("160511") ? validation.valid : (stryCov_9fa48("160511", "160512", "160513"), !validation.valid)) {
      if (stryMutAct_9fa48("160514")) {
        {}
      } else {
        stryCov_9fa48("160514");
        return stryMutAct_9fa48("160515") ? {} : (stryCov_9fa48("160515"), {
          valid: stryMutAct_9fa48("160516") ? true : (stryCov_9fa48("160516"), false),
          errors: validation.errors
        });
      }
    }
    return stryMutAct_9fa48("160517") ? {} : (stryCov_9fa48("160517"), {
      valid: stryMutAct_9fa48("160518") ? false : (stryCov_9fa48("160518"), true),
      lock
    });
  }
}

/**
 * Build a serialized row ready for SQL INSERT from a lock.
 *
 * @param {Object} lock - Dependency lock object with
 *   camelCase field names.
 * @return {Object} Serialized row with snake_case column keys.
 */
function buildLockRow(lock) {
  if (stryMutAct_9fa48("160519")) {
    {}
  } else {
    stryCov_9fa48("160519");
    return serializeDependencyLock(lock);
  }
}

/**
 * Build a SQL INSERT statement for persisting a dependency
 * lock row.
 *
 * @param {Object} lock - Dependency lock object with
 *   camelCase field names.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array ready for execution via SQL engine.
 */
function buildInsertLockSQL(lock) {
  if (stryMutAct_9fa48("160520")) {
    {}
  } else {
    stryCov_9fa48("160520");
    const row = serializeDependencyLock(lock);
    const columns = stryMutAct_9fa48("160521") ? [] : (stryCov_9fa48("160521"), [DL_COL.LOCK_ID, DL_COL.TARGET_MODULE_NAMESPACE, DL_COL.TARGET_MODULE_NAME, DL_COL.TARGET_MODULE_VERSION, DL_COL.TARGET_SERVICE_ID, DL_COL.RESOLVED_DEPENDENCIES, DL_COL.CREATED_AT]);
    const placeholders = columns.map(stryMutAct_9fa48("160522") ? () => undefined : (stryCov_9fa48("160522"), (_c, i) => stryMutAct_9fa48("160523") ? `` : (stryCov_9fa48("160523"), `$${stryMutAct_9fa48("160524") ? i - 1 : (stryCov_9fa48("160524"), i + 1)}`))).join(stryMutAct_9fa48("160525") ? "" : (stryCov_9fa48("160525"), ', '));
    const params = columns.map(stryMutAct_9fa48("160526") ? () => undefined : (stryCov_9fa48("160526"), col => row[col]));
    const sql = (stryMutAct_9fa48("160527") ? `` : (stryCov_9fa48("160527"), `INSERT INTO ${TABLES.MODULE_DEPENDENCY_LOCKS}`)) + (stryMutAct_9fa48("160528") ? `` : (stryCov_9fa48("160528"), ` (${columns.join(stryMutAct_9fa48("160529") ? "" : (stryCov_9fa48("160529"), ', '))})`)) + (stryMutAct_9fa48("160530") ? `` : (stryCov_9fa48("160530"), ` VALUES (${placeholders})`));
    return stryMutAct_9fa48("160531") ? {} : (stryCov_9fa48("160531"), {
      sql,
      params
    });
  }
}

/**
 * Compare resolved dependencies against an existing lock
 * to detect mutable dependency drift.
 *
 * Rejects when:
 * - A dependency digest changed from the locked value
 *   (DEPENDENCY_VERSION_MUTABLE)
 * - A new dependency appears that was not in the lock
 *   (UNDECLARED_IMPORT)
 *
 * @param {Object} currentLock - Existing dependency lock with
 *   resolvedDependencies array of {moduleId, digest}.
 * @param {Array<Object>} newResolvedDependencies - Newly
 *   resolved deps with moduleId and digest fields.
 * @return {{valid: boolean, errors?: string[],
 *   driftedDependencies?: Array<Object>}}
 */
function validateLockConsistency(currentLock, newResolvedDependencies) {
  if (stryMutAct_9fa48("160532")) {
    {}
  } else {
    stryCov_9fa48("160532");
    const lockedDeps = stryMutAct_9fa48("160535") ? currentLock[DL.RESOLVED_DEPENDENCIES] && [] : stryMutAct_9fa48("160534") ? false : stryMutAct_9fa48("160533") ? true : (stryCov_9fa48("160533", "160534", "160535"), currentLock[DL.RESOLVED_DEPENDENCIES] || (stryMutAct_9fa48("160536") ? ["Stryker was here"] : (stryCov_9fa48("160536"), [])));
    const lockedMap = new Map(lockedDeps.map(stryMutAct_9fa48("160537") ? () => undefined : (stryCov_9fa48("160537"), d => stryMutAct_9fa48("160538") ? [] : (stryCov_9fa48("160538"), [d.moduleId, d.digest]))));
    const newDeps = stryMutAct_9fa48("160541") ? newResolvedDependencies && [] : stryMutAct_9fa48("160540") ? false : stryMutAct_9fa48("160539") ? true : (stryCov_9fa48("160539", "160540", "160541"), newResolvedDependencies || (stryMutAct_9fa48("160542") ? ["Stryker was here"] : (stryCov_9fa48("160542"), [])));
    const errors = stryMutAct_9fa48("160543") ? ["Stryker was here"] : (stryCov_9fa48("160543"), []);
    const driftedDependencies = stryMutAct_9fa48("160544") ? ["Stryker was here"] : (stryCov_9fa48("160544"), []);
    for (const dep of newDeps) {
      if (stryMutAct_9fa48("160545")) {
        {}
      } else {
        stryCov_9fa48("160545");
        const lockedDigest = lockedMap.get(dep.moduleId);
        if (stryMutAct_9fa48("160548") ? lockedDigest !== undefined : stryMutAct_9fa48("160547") ? false : stryMutAct_9fa48("160546") ? true : (stryCov_9fa48("160546", "160547", "160548"), lockedDigest === undefined)) {
          if (stryMutAct_9fa48("160549")) {
            {}
          } else {
            stryCov_9fa48("160549");
            errors.push(stryMutAct_9fa48("160550") ? `` : (stryCov_9fa48("160550"), `${ERR.UNDECLARED_IMPORT}: ${dep.moduleId}`));
            driftedDependencies.push(stryMutAct_9fa48("160551") ? {} : (stryCov_9fa48("160551"), {
              moduleId: dep.moduleId,
              reason: stryMutAct_9fa48("160552") ? "" : (stryCov_9fa48("160552"), 'added')
            }));
          }
        } else if (stryMutAct_9fa48("160555") ? lockedDigest === dep.digest : stryMutAct_9fa48("160554") ? false : stryMutAct_9fa48("160553") ? true : (stryCov_9fa48("160553", "160554", "160555"), lockedDigest !== dep.digest)) {
          if (stryMutAct_9fa48("160556")) {
            {}
          } else {
            stryCov_9fa48("160556");
            errors.push(stryMutAct_9fa48("160557") ? `` : (stryCov_9fa48("160557"), `${ERR.DEPENDENCY_VERSION_MUTABLE}: ${dep.moduleId}`));
            driftedDependencies.push(stryMutAct_9fa48("160558") ? {} : (stryCov_9fa48("160558"), {
              moduleId: dep.moduleId,
              lockedDigest,
              newDigest: dep.digest,
              reason: stryMutAct_9fa48("160559") ? "" : (stryCov_9fa48("160559"), 'changed')
            }));
          }
        }
      }
    }
    if (stryMutAct_9fa48("160563") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("160562") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("160561") ? false : stryMutAct_9fa48("160560") ? true : (stryCov_9fa48("160560", "160561", "160562", "160563"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("160564")) {
        {}
      } else {
        stryCov_9fa48("160564");
        return stryMutAct_9fa48("160565") ? {} : (stryCov_9fa48("160565"), {
          valid: stryMutAct_9fa48("160566") ? true : (stryCov_9fa48("160566"), false),
          errors,
          driftedDependencies
        });
      }
    }
    return stryMutAct_9fa48("160567") ? {} : (stryCov_9fa48("160567"), {
      valid: stryMutAct_9fa48("160568") ? false : (stryCov_9fa48("160568"), true)
    });
  }
}

/**
 * Full activation validation combining lock consistency
 * with explicit rollout bypass.
 *
 * When isExplicitRollout is true, drift checks are skipped
 * to allow lock updates during intentional rollouts.
 *
 * @param {Object} _manifest - Module manifest (reserved for
 *   future manifest-level checks).
 * @param {Object} existingLock - Current dependency lock.
 * @param {Array<Object>} resolvedDependencies - Newly
 *   resolved deps with moduleId and digest fields.
 * @param {boolean} isExplicitRollout - Whether this is an
 *   explicit rollout that may update lock state.
 * @return {{valid: boolean, errors?: string[],
 *   driftedDependencies?: Array<Object>}}
 */
function validateActivationLock(_manifest, existingLock, resolvedDependencies, isExplicitRollout) {
  if (stryMutAct_9fa48("160569")) {
    {}
  } else {
    stryCov_9fa48("160569");
    if (stryMutAct_9fa48("160571") ? false : stryMutAct_9fa48("160570") ? true : (stryCov_9fa48("160570", "160571"), isExplicitRollout)) {
      if (stryMutAct_9fa48("160572")) {
        {}
      } else {
        stryCov_9fa48("160572");
        return stryMutAct_9fa48("160573") ? {} : (stryCov_9fa48("160573"), {
          valid: stryMutAct_9fa48("160574") ? false : (stryCov_9fa48("160574"), true)
        });
      }
    }
    return validateLockConsistency(existingLock, resolvedDependencies);
  }
}

/**
 * Build a SQL SELECT for a single lock by lock_id.
 *
 * @param {string} lockId - The lock ID to query.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array.
 */
function buildSelectLockSQL(lockId) {
  if (stryMutAct_9fa48("160575")) {
    {}
  } else {
    stryCov_9fa48("160575");
    const sql = (stryMutAct_9fa48("160576") ? `` : (stryCov_9fa48("160576"), `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}`)) + (stryMutAct_9fa48("160577") ? `` : (stryCov_9fa48("160577"), ` WHERE ${DL_COL.LOCK_ID} = $1`));
    return stryMutAct_9fa48("160578") ? {} : (stryCov_9fa48("160578"), {
      sql,
      params: stryMutAct_9fa48("160579") ? [] : (stryCov_9fa48("160579"), [lockId])
    });
  }
}

/**
 * Build a SQL SELECT for all locks matching a module
 * identity (namespace + name + version).
 *
 * @param {string} namespace - Module namespace.
 * @param {string} name - Module name.
 * @param {string} version - Module version.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array.
 */
function buildSelectLocksByModuleSQL(namespace, name, version) {
  if (stryMutAct_9fa48("160580")) {
    {}
  } else {
    stryCov_9fa48("160580");
    const sql = (stryMutAct_9fa48("160581") ? `` : (stryCov_9fa48("160581"), `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}`)) + (stryMutAct_9fa48("160582") ? `` : (stryCov_9fa48("160582"), ` WHERE ${DL_COL.TARGET_MODULE_NAMESPACE} = $1`)) + (stryMutAct_9fa48("160583") ? `` : (stryCov_9fa48("160583"), ` AND ${DL_COL.TARGET_MODULE_NAME} = $2`)) + (stryMutAct_9fa48("160584") ? `` : (stryCov_9fa48("160584"), ` AND ${DL_COL.TARGET_MODULE_VERSION} = $3`));
    return stryMutAct_9fa48("160585") ? {} : (stryCov_9fa48("160585"), {
      sql,
      params: stryMutAct_9fa48("160586") ? [] : (stryCov_9fa48("160586"), [namespace, name, version])
    });
  }
}

/**
 * Build a SQL SELECT for all locks tied to a specific
 * service.
 *
 * @param {string} serviceId - The service ID to query.
 * @return {{sql: string, params: Array}} SQL statement and
 *   parameter array.
 */
function buildSelectLocksByServiceSQL(serviceId) {
  if (stryMutAct_9fa48("160587")) {
    {}
  } else {
    stryCov_9fa48("160587");
    const sql = (stryMutAct_9fa48("160588") ? `` : (stryCov_9fa48("160588"), `SELECT * FROM ${TABLES.MODULE_DEPENDENCY_LOCKS}`)) + (stryMutAct_9fa48("160589") ? `` : (stryCov_9fa48("160589"), ` WHERE ${DL_COL.TARGET_SERVICE_ID} = $1`));
    return stryMutAct_9fa48("160590") ? {} : (stryCov_9fa48("160590"), {
      sql,
      params: stryMutAct_9fa48("160591") ? [] : (stryCov_9fa48("160591"), [serviceId])
    });
  }
}
export { generateLockId, createDependencyLock, buildLockRow, buildInsertLockSQL, buildSelectLockSQL, buildSelectLocksByModuleSQL, buildSelectLocksByServiceSQL, validateLockConsistency, validateActivationLock };