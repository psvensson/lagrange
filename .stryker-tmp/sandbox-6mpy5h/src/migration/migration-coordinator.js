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
import { randomUUID } from 'node:crypto';
import { TABLES } from '../constants/index.js';
import { DurableWorkflowCoordinator } from '../workflow/durable-workflow-coordinator.js';
import { OperationLane } from '../workflow/operation-lane.js';
import { TimeoutPolicy } from '../workflow/timeout-policy.js';
import { WorkflowStepRunner } from '../workflow/workflow-step-runner.js';
import { MIGRATION_CANCELLABLE_STAGES, MIGRATION_COLUMN, MIGRATION_DEFAULT, MIGRATION_ERROR_MSG, MIGRATION_LOG_MSG, MIGRATION_PARTITION_OPERATION, MIGRATION_STAGE_ORDER, MIGRATION_STATUS, MIGRATION_TERMINAL_STATUSES, MIGRATION_TYPE } from './migration-constants.js';
const PARTITION_WRITE_DEFAULT_OPTIONS = Object.freeze(stryMutAct_9fa48("90055") ? {} : (stryCov_9fa48("90055"), {
  FOR_READ: stryMutAct_9fa48("90056") ? true : (stryCov_9fa48("90056"), false),
  PREFER_LEADER: stryMutAct_9fa48("90057") ? false : (stryCov_9fa48("90057"), true),
  PREFER_SAME_LATENCY_GROUP: stryMutAct_9fa48("90058") ? true : (stryCov_9fa48("90058"), false)
}));
const PARTITION_READ_DEFAULT_OPTIONS = Object.freeze(stryMutAct_9fa48("90059") ? {} : (stryCov_9fa48("90059"), {
  FOR_READ: stryMutAct_9fa48("90060") ? false : (stryCov_9fa48("90060"), true),
  PREFER_LEADER: stryMutAct_9fa48("90061") ? false : (stryCov_9fa48("90061"), true),
  PREFER_SAME_LATENCY_GROUP: stryMutAct_9fa48("90062") ? true : (stryCov_9fa48("90062"), false)
}));
const MIGRATION_STAGE_REASON = Object.freeze(stryMutAct_9fa48("90063") ? {} : (stryCov_9fa48("90063"), {
  INITIATE: stryMutAct_9fa48("90064") ? "" : (stryCov_9fa48("90064"), 'migration_initiated'),
  DUAL_WRITE_START: stryMutAct_9fa48("90065") ? "" : (stryCov_9fa48("90065"), 'dual_write_start'),
  DUAL_WRITE_COMPLETE: stryMutAct_9fa48("90066") ? "" : (stryCov_9fa48("90066"), 'dual_write_complete'),
  BACKFILL_START: stryMutAct_9fa48("90067") ? "" : (stryCov_9fa48("90067"), 'backfill_start'),
  BACKFILL_COMPLETE: stryMutAct_9fa48("90068") ? "" : (stryCov_9fa48("90068"), 'backfill_complete'),
  CUTOVER_PENDING: stryMutAct_9fa48("90069") ? "" : (stryCov_9fa48("90069"), 'cutover_pending'),
  CUTOVER_COMPLETE: stryMutAct_9fa48("90070") ? "" : (stryCov_9fa48("90070"), 'cutover_complete'),
  FAILURE: stryMutAct_9fa48("90071") ? "" : (stryCov_9fa48("90071"), 'migration_failed'),
  CANCELLING: stryMutAct_9fa48("90072") ? "" : (stryCov_9fa48("90072"), 'migration_cancelling'),
  CANCELLED: stryMutAct_9fa48("90073") ? "" : (stryCov_9fa48("90073"), 'migration_cancelled')
}));
const MIGRATION_SQL = Object.freeze(stryMutAct_9fa48("90074") ? {} : (stryCov_9fa48("90074"), {
  SELECT_TABLE_BY_ID: (stryMutAct_9fa48("90075") ? `` : (stryCov_9fa48("90075"), `SELECT table_id, table_name, schema_definition FROM ${TABLES.TABLES} `)) + (stryMutAct_9fa48("90076") ? "" : (stryCov_9fa48("90076"), 'WHERE table_id = ? LIMIT 1')),
  SELECT_TABLE_BY_NAME: (stryMutAct_9fa48("90077") ? `` : (stryCov_9fa48("90077"), `SELECT table_id, table_name, schema_definition FROM ${TABLES.TABLES} `)) + (stryMutAct_9fa48("90078") ? "" : (stryCov_9fa48("90078"), 'WHERE table_name = ? LIMIT 1')),
  SELECT_MIGRATION_BY_ID: (stryMutAct_9fa48("90079") ? `` : (stryCov_9fa48("90079"), `SELECT * FROM ${TABLES.SCHEMA_MIGRATIONS} `)) + (stryMutAct_9fa48("90080") ? "" : (stryCov_9fa48("90080"), 'WHERE migration_id = ? LIMIT 1')),
  SELECT_MIGRATIONS_BY_TABLE: (stryMutAct_9fa48("90081") ? `` : (stryCov_9fa48("90081"), `SELECT migration_id, status, current_stage FROM ${TABLES.SCHEMA_MIGRATIONS} `)) + (stryMutAct_9fa48("90082") ? "" : (stryCov_9fa48("90082"), 'WHERE table_id = ?')),
  SELECT_PARTITIONS_BY_TABLE: stryMutAct_9fa48("90083") ? `` : (stryCov_9fa48("90083"), `SELECT partition_id FROM ${TABLES.PARTITIONS} WHERE table_id = ?`),
  SELECT_PARTITION_MIGRATIONS: (stryMutAct_9fa48("90084") ? `` : (stryCov_9fa48("90084"), `SELECT * FROM ${TABLES.SCHEMA_MIGRATION_PARTITIONS} `)) + (stryMutAct_9fa48("90085") ? "" : (stryCov_9fa48("90085"), 'WHERE migration_id = ? ORDER BY partition_id')),
  SELECT_NON_TERMINAL_MIGRATIONS: (stryMutAct_9fa48("90086") ? `` : (stryCov_9fa48("90086"), `SELECT * FROM ${TABLES.SCHEMA_MIGRATIONS} `)) + (stryMutAct_9fa48("90087") ? "" : (stryCov_9fa48("90087"), 'WHERE status NOT IN (?, ?, ?)')),
  INSERT_MIGRATION: (stryMutAct_9fa48("90088") ? `` : (stryCov_9fa48("90088"), `INSERT INTO ${TABLES.SCHEMA_MIGRATIONS} `)) + (stryMutAct_9fa48("90089") ? "" : (stryCov_9fa48("90089"), '(migration_id, table_id, table_name, migration_type, source_schema, target_schema, ')) + (stryMutAct_9fa48("90090") ? "" : (stryCov_9fa48("90090"), 'status, current_stage, error_message, created_at, updated_at, completed_at) ')) + (stryMutAct_9fa48("90091") ? "" : (stryCov_9fa48("90091"), 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')),
  INSERT_PARTITION_MIGRATION: (stryMutAct_9fa48("90092") ? `` : (stryCov_9fa48("90092"), `INSERT INTO ${TABLES.SCHEMA_MIGRATION_PARTITIONS} `)) + (stryMutAct_9fa48("90093") ? "" : (stryCov_9fa48("90093"), '(migration_id, partition_id, status, backfill_cursor, retry_count, error_message, updated_at) ')) + (stryMutAct_9fa48("90094") ? "" : (stryCov_9fa48("90094"), 'VALUES (?, ?, ?, ?, ?, ?, ?)')),
  UPDATE_MIGRATION_BY_ID: (stryMutAct_9fa48("90095") ? `` : (stryCov_9fa48("90095"), `UPDATE ${TABLES.SCHEMA_MIGRATIONS} `)) + (stryMutAct_9fa48("90096") ? "" : (stryCov_9fa48("90096"), 'SET status = ?, current_stage = ?, error_message = ?, updated_at = ?, completed_at = ? ')) + (stryMutAct_9fa48("90097") ? "" : (stryCov_9fa48("90097"), 'WHERE migration_id = ?')),
  UPDATE_PARTITION_MIGRATION_BY_PK: (stryMutAct_9fa48("90098") ? `` : (stryCov_9fa48("90098"), `UPDATE ${TABLES.SCHEMA_MIGRATION_PARTITIONS} `)) + (stryMutAct_9fa48("90099") ? "" : (stryCov_9fa48("90099"), 'SET status = ?, backfill_cursor = ?, retry_count = ?, error_message = ?, updated_at = ? ')) + (stryMutAct_9fa48("90100") ? "" : (stryCov_9fa48("90100"), 'WHERE migration_id = ? AND partition_id = ?')),
  UPDATE_TABLE_SCHEMA_BY_ID: (stryMutAct_9fa48("90101") ? `` : (stryCov_9fa48("90101"), `UPDATE ${TABLES.TABLES} `)) + (stryMutAct_9fa48("90102") ? "" : (stryCov_9fa48("90102"), 'SET schema_definition = ?, updated_at = ? WHERE table_id = ?'))
}));
function sleep(delayMs) {
  if (stryMutAct_9fa48("90103")) {
    {}
  } else {
    stryCov_9fa48("90103");
    return new Promise(stryMutAct_9fa48("90104") ? () => undefined : (stryCov_9fa48("90104"), resolve => setTimeout(resolve, delayMs)));
  }
}
function parseJsonSafe(value, fallback) {
  if (stryMutAct_9fa48("90105")) {
    {}
  } else {
    stryCov_9fa48("90105");
    if (stryMutAct_9fa48("90108") ? typeof value !== 'string' && value.length === 0 : stryMutAct_9fa48("90107") ? false : stryMutAct_9fa48("90106") ? true : (stryCov_9fa48("90106", "90107", "90108"), (stryMutAct_9fa48("90110") ? typeof value === 'string' : stryMutAct_9fa48("90109") ? false : (stryCov_9fa48("90109", "90110"), typeof value !== (stryMutAct_9fa48("90111") ? "" : (stryCov_9fa48("90111"), 'string')))) || (stryMutAct_9fa48("90113") ? value.length !== 0 : stryMutAct_9fa48("90112") ? false : (stryCov_9fa48("90112", "90113"), value.length === 0)))) {
      if (stryMutAct_9fa48("90114")) {
        {}
      } else {
        stryCov_9fa48("90114");
        return fallback;
      }
    }
    try {
      if (stryMutAct_9fa48("90115")) {
        {}
      } else {
        stryCov_9fa48("90115");
        return JSON.parse(value);
      }
    } catch (_error) {
      if (stryMutAct_9fa48("90116")) {
        {}
      } else {
        stryCov_9fa48("90116");
        return fallback;
      }
    }
  }
}
function cloneJson(value) {
  if (stryMutAct_9fa48("90117")) {
    {}
  } else {
    stryCov_9fa48("90117");
    if (stryMutAct_9fa48("90120") ? value === null && value === undefined : stryMutAct_9fa48("90119") ? false : stryMutAct_9fa48("90118") ? true : (stryCov_9fa48("90118", "90119", "90120"), (stryMutAct_9fa48("90122") ? value !== null : stryMutAct_9fa48("90121") ? false : (stryCov_9fa48("90121", "90122"), value === null)) || (stryMutAct_9fa48("90124") ? value !== undefined : stryMutAct_9fa48("90123") ? false : (stryCov_9fa48("90123", "90124"), value === undefined)))) {
      if (stryMutAct_9fa48("90125")) {
        {}
      } else {
        stryCov_9fa48("90125");
        return value;
      }
    }
    return JSON.parse(JSON.stringify(value));
  }
}
function quoteIdentifier(identifier) {
  if (stryMutAct_9fa48("90126")) {
    {}
  } else {
    stryCov_9fa48("90126");
    return stryMutAct_9fa48("90127") ? `` : (stryCov_9fa48("90127"), `"${String(stryMutAct_9fa48("90130") ? identifier && '' : stryMutAct_9fa48("90129") ? false : stryMutAct_9fa48("90128") ? true : (stryCov_9fa48("90128", "90129", "90130"), identifier || (stryMutAct_9fa48("90131") ? "Stryker was here!" : (stryCov_9fa48("90131"), '')))).replaceAll(stryMutAct_9fa48("90132") ? "" : (stryCov_9fa48("90132"), '"'), stryMutAct_9fa48("90133") ? "" : (stryCov_9fa48("90133"), '""'))}"`);
  }
}
function normalizeInteger(value, fallback = 0) {
  if (stryMutAct_9fa48("90134")) {
    {}
  } else {
    stryCov_9fa48("90134");
    return Number.isFinite(value) ? Math.floor(value) : fallback;
  }
}
function formatBackfillCursor(value) {
  if (stryMutAct_9fa48("90135")) {
    {}
  } else {
    stryCov_9fa48("90135");
    if (stryMutAct_9fa48("90138") ? false : stryMutAct_9fa48("90137") ? true : stryMutAct_9fa48("90136") ? Number.isFinite(value) : (stryCov_9fa48("90136", "90137", "90138"), !Number.isFinite(value))) {
      if (stryMutAct_9fa48("90139")) {
        {}
      } else {
        stryCov_9fa48("90139");
        return null;
      }
    }
    return String(Math.floor(value));
  }
}
function parseBackfillCursor(value) {
  if (stryMutAct_9fa48("90140")) {
    {}
  } else {
    stryCov_9fa48("90140");
    const parsed = Number.parseInt(String(stryMutAct_9fa48("90143") ? value && '' : stryMutAct_9fa48("90142") ? false : stryMutAct_9fa48("90141") ? true : (stryCov_9fa48("90141", "90142", "90143"), value || (stryMutAct_9fa48("90144") ? "Stryker was here!" : (stryCov_9fa48("90144"), '')))), 10);
    if (stryMutAct_9fa48("90147") ? !Number.isFinite(parsed) && parsed < 0 : stryMutAct_9fa48("90146") ? false : stryMutAct_9fa48("90145") ? true : (stryCov_9fa48("90145", "90146", "90147"), (stryMutAct_9fa48("90148") ? Number.isFinite(parsed) : (stryCov_9fa48("90148"), !Number.isFinite(parsed))) || (stryMutAct_9fa48("90151") ? parsed >= 0 : stryMutAct_9fa48("90150") ? parsed <= 0 : stryMutAct_9fa48("90149") ? false : (stryCov_9fa48("90149", "90150", "90151"), parsed < 0)))) {
      if (stryMutAct_9fa48("90152")) {
        {}
      } else {
        stryCov_9fa48("90152");
        return 0;
      }
    }
    return parsed;
  }
}
function resolvePartitionIdList(rows) {
  if (stryMutAct_9fa48("90153")) {
    {}
  } else {
    stryCov_9fa48("90153");
    if (stryMutAct_9fa48("90156") ? false : stryMutAct_9fa48("90155") ? true : stryMutAct_9fa48("90154") ? Array.isArray(rows) : (stryCov_9fa48("90154", "90155", "90156"), !Array.isArray(rows))) {
      if (stryMutAct_9fa48("90157")) {
        {}
      } else {
        stryCov_9fa48("90157");
        return stryMutAct_9fa48("90158") ? ["Stryker was here"] : (stryCov_9fa48("90158"), []);
      }
    }
    return stryMutAct_9fa48("90159") ? rows.map(row => String(row?.[MIGRATION_COLUMN.PARTITION_ID] || '').trim()) : (stryCov_9fa48("90159"), rows.map(stryMutAct_9fa48("90160") ? () => undefined : (stryCov_9fa48("90160"), row => stryMutAct_9fa48("90161") ? String(row?.[MIGRATION_COLUMN.PARTITION_ID] || '') : (stryCov_9fa48("90161"), String(stryMutAct_9fa48("90164") ? row?.[MIGRATION_COLUMN.PARTITION_ID] && '' : stryMutAct_9fa48("90163") ? false : stryMutAct_9fa48("90162") ? true : (stryCov_9fa48("90162", "90163", "90164"), (stryMutAct_9fa48("90165") ? row[MIGRATION_COLUMN.PARTITION_ID] : (stryCov_9fa48("90165"), row?.[MIGRATION_COLUMN.PARTITION_ID])) || (stryMutAct_9fa48("90166") ? "Stryker was here!" : (stryCov_9fa48("90166"), '')))).trim()))).filter(stryMutAct_9fa48("90167") ? () => undefined : (stryCov_9fa48("90167"), partitionId => stryMutAct_9fa48("90171") ? partitionId.length <= 0 : stryMutAct_9fa48("90170") ? partitionId.length >= 0 : stryMutAct_9fa48("90169") ? false : stryMutAct_9fa48("90168") ? true : (stryCov_9fa48("90168", "90169", "90170", "90171"), partitionId.length > 0))));
  }
}
function mapStageIndex(status) {
  if (stryMutAct_9fa48("90172")) {
    {}
  } else {
    stryCov_9fa48("90172");
    return MIGRATION_STAGE_ORDER.indexOf(status);
  }
}
function resolveDefaultLiteral(value) {
  if (stryMutAct_9fa48("90173")) {
    {}
  } else {
    stryCov_9fa48("90173");
    if (stryMutAct_9fa48("90176") ? value === null && value === undefined : stryMutAct_9fa48("90175") ? false : stryMutAct_9fa48("90174") ? true : (stryCov_9fa48("90174", "90175", "90176"), (stryMutAct_9fa48("90178") ? value !== null : stryMutAct_9fa48("90177") ? false : (stryCov_9fa48("90177", "90178"), value === null)) || (stryMutAct_9fa48("90180") ? value !== undefined : stryMutAct_9fa48("90179") ? false : (stryCov_9fa48("90179", "90180"), value === undefined)))) {
      if (stryMutAct_9fa48("90181")) {
        {}
      } else {
        stryCov_9fa48("90181");
        return null;
      }
    }
    if (stryMutAct_9fa48("90184") ? typeof value !== 'number' : stryMutAct_9fa48("90183") ? false : stryMutAct_9fa48("90182") ? true : (stryCov_9fa48("90182", "90183", "90184"), typeof value === (stryMutAct_9fa48("90185") ? "" : (stryCov_9fa48("90185"), 'number')))) {
      if (stryMutAct_9fa48("90186")) {
        {}
      } else {
        stryCov_9fa48("90186");
        return value;
      }
    }
    if (stryMutAct_9fa48("90189") ? typeof value !== 'boolean' : stryMutAct_9fa48("90188") ? false : stryMutAct_9fa48("90187") ? true : (stryCov_9fa48("90187", "90188", "90189"), typeof value === (stryMutAct_9fa48("90190") ? "" : (stryCov_9fa48("90190"), 'boolean')))) {
      if (stryMutAct_9fa48("90191")) {
        {}
      } else {
        stryCov_9fa48("90191");
        return value ? 1 : 0;
      }
    }
    return String(value);
  }
}
class MigrationCoordinator {
  constructor(options = {}) {
    if (stryMutAct_9fa48("90192")) {
      {}
    } else {
      stryCov_9fa48("90192");
      this.sqlCore = stryMutAct_9fa48("90195") ? options.sqlCore && null : stryMutAct_9fa48("90194") ? false : stryMutAct_9fa48("90193") ? true : (stryCov_9fa48("90193", "90194", "90195"), options.sqlCore || null);
      if (stryMutAct_9fa48("90198") ? !this.sqlCore && typeof this.sqlCore.executeQuery !== 'function' : stryMutAct_9fa48("90197") ? false : stryMutAct_9fa48("90196") ? true : (stryCov_9fa48("90196", "90197", "90198"), (stryMutAct_9fa48("90199") ? this.sqlCore : (stryCov_9fa48("90199"), !this.sqlCore)) || (stryMutAct_9fa48("90201") ? typeof this.sqlCore.executeQuery === 'function' : stryMutAct_9fa48("90200") ? false : (stryCov_9fa48("90200", "90201"), typeof this.sqlCore.executeQuery !== (stryMutAct_9fa48("90202") ? "" : (stryCov_9fa48("90202"), 'function')))))) {
        if (stryMutAct_9fa48("90203")) {
          {}
        } else {
          stryCov_9fa48("90203");
          throw new Error(MIGRATION_ERROR_MSG.SQL_CORE_REQUIRED);
        }
      }
      this.systemTableCache = stryMutAct_9fa48("90206") ? options.systemTableCache && null : stryMutAct_9fa48("90205") ? false : stryMutAct_9fa48("90204") ? true : (stryCov_9fa48("90204", "90205", "90206"), options.systemTableCache || null);
      if (stryMutAct_9fa48("90209") ? false : stryMutAct_9fa48("90208") ? true : stryMutAct_9fa48("90207") ? this.systemTableCache : (stryCov_9fa48("90207", "90208", "90209"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("90210")) {
          {}
        } else {
          stryCov_9fa48("90210");
          throw new Error(MIGRATION_ERROR_MSG.SYSTEM_TABLE_CACHE_REQUIRED);
        }
      }
      this.transactionCoordinator = stryMutAct_9fa48("90213") ? options.transactionCoordinator && null : stryMutAct_9fa48("90212") ? false : stryMutAct_9fa48("90211") ? true : (stryCov_9fa48("90211", "90212", "90213"), options.transactionCoordinator || null);
      this.logger = stryMutAct_9fa48("90216") ? options.logger && console : stryMutAct_9fa48("90215") ? false : stryMutAct_9fa48("90214") ? true : (stryCov_9fa48("90214", "90215", "90216"), options.logger || console);
      this.now = (stryMutAct_9fa48("90219") ? typeof options.now !== 'function' : stryMutAct_9fa48("90218") ? false : stryMutAct_9fa48("90217") ? true : (stryCov_9fa48("90217", "90218", "90219"), typeof options.now === (stryMutAct_9fa48("90220") ? "" : (stryCov_9fa48("90220"), 'function')))) ? options.now : stryMutAct_9fa48("90221") ? () => undefined : (stryCov_9fa48("90221"), () => Date.now());
      this.workflowCoordinator = stryMutAct_9fa48("90224") ? options.workflowCoordinator && new DurableWorkflowCoordinator({
        now: this.now
      }) : stryMutAct_9fa48("90223") ? false : stryMutAct_9fa48("90222") ? true : (stryCov_9fa48("90222", "90223", "90224"), options.workflowCoordinator || new DurableWorkflowCoordinator(stryMutAct_9fa48("90225") ? {} : (stryCov_9fa48("90225"), {
        now: this.now
      })));
      this.migrationOperationLane = new OperationLane(stryMutAct_9fa48("90226") ? {} : (stryCov_9fa48("90226"), {
        name: stryMutAct_9fa48("90227") ? "" : (stryCov_9fa48("90227"), 'schema-migration'),
        workflowCoordinator: this.workflowCoordinator,
        ownerKeyFactory: stryMutAct_9fa48("90228") ? () => undefined : (stryCov_9fa48("90228"), ({
          migrationId,
          ownerKey
        }) => String(stryMutAct_9fa48("90231") ? (ownerKey || migrationId) && '' : stryMutAct_9fa48("90230") ? false : stryMutAct_9fa48("90229") ? true : (stryCov_9fa48("90229", "90230", "90231"), (stryMutAct_9fa48("90233") ? ownerKey && migrationId : stryMutAct_9fa48("90232") ? false : (stryCov_9fa48("90232", "90233"), ownerKey || migrationId)) || (stryMutAct_9fa48("90234") ? "Stryker was here!" : (stryCov_9fa48("90234"), '')))))
      }));
      this.migrationTimeoutPolicy = new TimeoutPolicy(stryMutAct_9fa48("90235") ? {} : (stryCov_9fa48("90235"), {
        operationName: stryMutAct_9fa48("90236") ? "" : (stryCov_9fa48("90236"), 'schema_migration'),
        configuredBudgetMs: MIGRATION_DEFAULT.TIMEOUT_BUDGET_MS,
        now: this.now
      }));
      this.workflowStepRunner = new WorkflowStepRunner(stryMutAct_9fa48("90237") ? {} : (stryCov_9fa48("90237"), {
        workflowCoordinator: this.workflowCoordinator,
        operationLane: this.migrationOperationLane,
        timeoutPolicy: this.migrationTimeoutPolicy,
        now: this.now
      }));
      this.inflightByMigrationId = new Map();
      this.cancellationRequestedByMigrationId = new Set();
    }
  }
  async resolveTableMetadata(tableIdOrName) {
    if (stryMutAct_9fa48("90238")) {
      {}
    } else {
      stryCov_9fa48("90238");
      const normalized = String(stryMutAct_9fa48("90241") ? tableIdOrName && '' : stryMutAct_9fa48("90240") ? false : stryMutAct_9fa48("90239") ? true : (stryCov_9fa48("90239", "90240", "90241"), tableIdOrName || (stryMutAct_9fa48("90242") ? "Stryker was here!" : (stryCov_9fa48("90242"), ''))));
      if (stryMutAct_9fa48("90245") ? false : stryMutAct_9fa48("90244") ? true : stryMutAct_9fa48("90243") ? normalized : (stryCov_9fa48("90243", "90244", "90245"), !normalized)) {
        if (stryMutAct_9fa48("90246")) {
          {}
        } else {
          stryCov_9fa48("90246");
          return null;
        }
      }
      const byId = await this.executeSql(MIGRATION_SQL.SELECT_TABLE_BY_ID, stryMutAct_9fa48("90247") ? [] : (stryCov_9fa48("90247"), [normalized]), {}, stryMutAct_9fa48("90248") ? false : (stryCov_9fa48("90248"), true));
      if (stryMutAct_9fa48("90252") ? byId.rows.length <= 0 : stryMutAct_9fa48("90251") ? byId.rows.length >= 0 : stryMutAct_9fa48("90250") ? false : stryMutAct_9fa48("90249") ? true : (stryCov_9fa48("90249", "90250", "90251", "90252"), byId.rows.length > 0)) {
        if (stryMutAct_9fa48("90253")) {
          {}
        } else {
          stryCov_9fa48("90253");
          return byId.rows[0];
        }
      }
      const byName = await this.executeSql(MIGRATION_SQL.SELECT_TABLE_BY_NAME, stryMutAct_9fa48("90254") ? [] : (stryCov_9fa48("90254"), [normalized]), {}, stryMutAct_9fa48("90255") ? false : (stryCov_9fa48("90255"), true));
      return stryMutAct_9fa48("90258") ? byName.rows[0] && null : stryMutAct_9fa48("90257") ? false : stryMutAct_9fa48("90256") ? true : (stryCov_9fa48("90256", "90257", "90258"), byName.rows[0] || null);
    }
  }
  async findActiveMigrationByTableId(tableId) {
    if (stryMutAct_9fa48("90259")) {
      {}
    } else {
      stryCov_9fa48("90259");
      const result = await this.executeSql(MIGRATION_SQL.SELECT_MIGRATIONS_BY_TABLE, stryMutAct_9fa48("90260") ? [] : (stryCov_9fa48("90260"), [tableId]), {}, stryMutAct_9fa48("90261") ? false : (stryCov_9fa48("90261"), true));
      return stryMutAct_9fa48("90264") ? result.rows.find(row => {
        return !MIGRATION_TERMINAL_STATUSES.has(String(row.status || ''));
      }) && null : stryMutAct_9fa48("90263") ? false : stryMutAct_9fa48("90262") ? true : (stryCov_9fa48("90262", "90263", "90264"), result.rows.find(row => {
        if (stryMutAct_9fa48("90265")) {
          {}
        } else {
          stryCov_9fa48("90265");
          return stryMutAct_9fa48("90266") ? MIGRATION_TERMINAL_STATUSES.has(String(row.status || '')) : (stryCov_9fa48("90266"), !MIGRATION_TERMINAL_STATUSES.has(String(stryMutAct_9fa48("90269") ? row.status && '' : stryMutAct_9fa48("90268") ? false : stryMutAct_9fa48("90267") ? true : (stryCov_9fa48("90267", "90268", "90269"), row.status || (stryMutAct_9fa48("90270") ? "Stryker was here!" : (stryCov_9fa48("90270"), ''))))));
        }
      }) || null);
    }
  }
  async hasActiveMigrationForTable(tableId) {
    if (stryMutAct_9fa48("90271")) {
      {}
    } else {
      stryCov_9fa48("90271");
      const activeMigration = await this.findActiveMigrationByTableId(tableId);
      return stryMutAct_9fa48("90274") ? activeMigration === null : stryMutAct_9fa48("90273") ? false : stryMutAct_9fa48("90272") ? true : (stryCov_9fa48("90272", "90273", "90274"), activeMigration !== null);
    }
  }
  async getMigrationById(migrationId) {
    if (stryMutAct_9fa48("90275")) {
      {}
    } else {
      stryCov_9fa48("90275");
      const result = await this.executeSql(MIGRATION_SQL.SELECT_MIGRATION_BY_ID, stryMutAct_9fa48("90276") ? [] : (stryCov_9fa48("90276"), [migrationId]), {}, stryMutAct_9fa48("90277") ? false : (stryCov_9fa48("90277"), true));
      return stryMutAct_9fa48("90280") ? result.rows[0] && null : stryMutAct_9fa48("90279") ? false : stryMutAct_9fa48("90278") ? true : (stryCov_9fa48("90278", "90279", "90280"), result.rows[0] || null);
    }
  }
  async getPartitionMigrationRows(migrationId) {
    if (stryMutAct_9fa48("90281")) {
      {}
    } else {
      stryCov_9fa48("90281");
      const result = await this.executeSql(MIGRATION_SQL.SELECT_PARTITION_MIGRATIONS, stryMutAct_9fa48("90282") ? [] : (stryCov_9fa48("90282"), [migrationId]), {}, stryMutAct_9fa48("90283") ? false : (stryCov_9fa48("90283"), true));
      return result.rows;
    }
  }
  async executeSql(sql, params = stryMutAct_9fa48("90284") ? ["Stryker was here"] : (stryCov_9fa48("90284"), []), options = {}, allowReadFailure = stryMutAct_9fa48("90285") ? true : (stryCov_9fa48("90285"), false)) {
    if (stryMutAct_9fa48("90286")) {
      {}
    } else {
      stryCov_9fa48("90286");
      const result = await this.sqlCore.executeQuery(sql, params, options);
      if (stryMutAct_9fa48("90289") ? !allowReadFailure || result?.success !== true : stryMutAct_9fa48("90288") ? false : stryMutAct_9fa48("90287") ? true : (stryCov_9fa48("90287", "90288", "90289"), (stryMutAct_9fa48("90290") ? allowReadFailure : (stryCov_9fa48("90290"), !allowReadFailure)) && (stryMutAct_9fa48("90292") ? result?.success === true : stryMutAct_9fa48("90291") ? true : (stryCov_9fa48("90291", "90292"), (stryMutAct_9fa48("90293") ? result.success : (stryCov_9fa48("90293"), result?.success)) !== (stryMutAct_9fa48("90294") ? false : (stryCov_9fa48("90294"), true)))))) {
        if (stryMutAct_9fa48("90295")) {
          {}
        } else {
          stryCov_9fa48("90295");
          throw new Error(stryMutAct_9fa48("90298") ? result?.error && MIGRATION_ERROR_MSG.RETRY_EXHAUSTED : stryMutAct_9fa48("90297") ? false : stryMutAct_9fa48("90296") ? true : (stryCov_9fa48("90296", "90297", "90298"), (stryMutAct_9fa48("90299") ? result.error : (stryCov_9fa48("90299"), result?.error)) || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED));
        }
      }
      if (stryMutAct_9fa48("90302") ? allowReadFailure || result?.success !== true : stryMutAct_9fa48("90301") ? false : stryMutAct_9fa48("90300") ? true : (stryCov_9fa48("90300", "90301", "90302"), allowReadFailure && (stryMutAct_9fa48("90304") ? result?.success === true : stryMutAct_9fa48("90303") ? true : (stryCov_9fa48("90303", "90304"), (stryMutAct_9fa48("90305") ? result.success : (stryCov_9fa48("90305"), result?.success)) !== (stryMutAct_9fa48("90306") ? false : (stryCov_9fa48("90306"), true)))))) {
        if (stryMutAct_9fa48("90307")) {
          {}
        } else {
          stryCov_9fa48("90307");
          return stryMutAct_9fa48("90308") ? {} : (stryCov_9fa48("90308"), {
            success: stryMutAct_9fa48("90309") ? true : (stryCov_9fa48("90309"), false),
            rows: stryMutAct_9fa48("90310") ? ["Stryker was here"] : (stryCov_9fa48("90310"), []),
            error: stryMutAct_9fa48("90313") ? result?.error && null : stryMutAct_9fa48("90312") ? false : stryMutAct_9fa48("90311") ? true : (stryCov_9fa48("90311", "90312", "90313"), (stryMutAct_9fa48("90314") ? result.error : (stryCov_9fa48("90314"), result?.error)) || null)
          });
        }
      }
      return result;
    }
  }
  async ensureWorkflowRegistered(migrationRow) {
    if (stryMutAct_9fa48("90315")) {
      {}
    } else {
      stryCov_9fa48("90315");
      const migrationId = String(stryMutAct_9fa48("90318") ? migrationRow?.migration_id && '' : stryMutAct_9fa48("90317") ? false : stryMutAct_9fa48("90316") ? true : (stryCov_9fa48("90316", "90317", "90318"), (stryMutAct_9fa48("90319") ? migrationRow.migration_id : (stryCov_9fa48("90319"), migrationRow?.migration_id)) || (stryMutAct_9fa48("90320") ? "Stryker was here!" : (stryCov_9fa48("90320"), ''))));
      if (stryMutAct_9fa48("90323") ? false : stryMutAct_9fa48("90322") ? true : stryMutAct_9fa48("90321") ? migrationId : (stryCov_9fa48("90321", "90322", "90323"), !migrationId)) {
        if (stryMutAct_9fa48("90324")) {
          {}
        } else {
          stryCov_9fa48("90324");
          return null;
        }
      }
      const existing = this.workflowCoordinator.getWorkflowById(migrationId);
      if (stryMutAct_9fa48("90326") ? false : stryMutAct_9fa48("90325") ? true : (stryCov_9fa48("90325", "90326"), existing)) {
        if (stryMutAct_9fa48("90327")) {
          {}
        } else {
          stryCov_9fa48("90327");
          return existing;
        }
      }
      return this.workflowCoordinator.registerWorkflow(stryMutAct_9fa48("90328") ? {} : (stryCov_9fa48("90328"), {
        workflowId: migrationId,
        ownerKey: migrationId,
        step: stryMutAct_9fa48("90331") ? migrationRow.current_stage && migrationRow.status : stryMutAct_9fa48("90330") ? false : stryMutAct_9fa48("90329") ? true : (stryCov_9fa48("90329", "90330", "90331"), migrationRow.current_stage || migrationRow.status),
        status: migrationRow.status,
        tableId: migrationRow.table_id,
        tableName: migrationRow.table_name,
        metadata: stryMutAct_9fa48("90332") ? {} : (stryCov_9fa48("90332"), {
          migrationType: migrationRow.migration_type
        }),
        createdAt: normalizeInteger(migrationRow.created_at, this.now()),
        updatedAt: normalizeInteger(migrationRow.updated_at, this.now()),
        transitionHistory: stryMutAct_9fa48("90333") ? ["Stryker was here"] : (stryCov_9fa48("90333"), [])
      }));
    }
  }
  generateMigrationId() {
    if (stryMutAct_9fa48("90334")) {
      {}
    } else {
      stryCov_9fa48("90334");
      return randomUUID();
    }
  }
  isMonotonicTransitionAllowed(previousStatus, nextStatus) {
    if (stryMutAct_9fa48("90335")) {
      {}
    } else {
      stryCov_9fa48("90335");
      const normalizedPrevious = String(stryMutAct_9fa48("90338") ? previousStatus && '' : stryMutAct_9fa48("90337") ? false : stryMutAct_9fa48("90336") ? true : (stryCov_9fa48("90336", "90337", "90338"), previousStatus || (stryMutAct_9fa48("90339") ? "Stryker was here!" : (stryCov_9fa48("90339"), ''))));
      const normalizedNext = String(stryMutAct_9fa48("90342") ? nextStatus && '' : stryMutAct_9fa48("90341") ? false : stryMutAct_9fa48("90340") ? true : (stryCov_9fa48("90340", "90341", "90342"), nextStatus || (stryMutAct_9fa48("90343") ? "Stryker was here!" : (stryCov_9fa48("90343"), ''))));
      if (stryMutAct_9fa48("90346") ? normalizedPrevious !== normalizedNext : stryMutAct_9fa48("90345") ? false : stryMutAct_9fa48("90344") ? true : (stryCov_9fa48("90344", "90345", "90346"), normalizedPrevious === normalizedNext)) {
        if (stryMutAct_9fa48("90347")) {
          {}
        } else {
          stryCov_9fa48("90347");
          return stryMutAct_9fa48("90348") ? false : (stryCov_9fa48("90348"), true);
        }
      }
      if (stryMutAct_9fa48("90351") ? normalizedNext === MIGRATION_STATUS.FAILED && normalizedNext === MIGRATION_STATUS.CANCELLING : stryMutAct_9fa48("90350") ? false : stryMutAct_9fa48("90349") ? true : (stryCov_9fa48("90349", "90350", "90351"), (stryMutAct_9fa48("90353") ? normalizedNext !== MIGRATION_STATUS.FAILED : stryMutAct_9fa48("90352") ? false : (stryCov_9fa48("90352", "90353"), normalizedNext === MIGRATION_STATUS.FAILED)) || (stryMutAct_9fa48("90355") ? normalizedNext !== MIGRATION_STATUS.CANCELLING : stryMutAct_9fa48("90354") ? false : (stryCov_9fa48("90354", "90355"), normalizedNext === MIGRATION_STATUS.CANCELLING)))) {
        if (stryMutAct_9fa48("90356")) {
          {}
        } else {
          stryCov_9fa48("90356");
          return stryMutAct_9fa48("90357") ? MIGRATION_TERMINAL_STATUSES.has(normalizedPrevious) : (stryCov_9fa48("90357"), !MIGRATION_TERMINAL_STATUSES.has(normalizedPrevious));
        }
      }
      if (stryMutAct_9fa48("90360") ? normalizedPrevious === MIGRATION_STATUS.CANCELLING || normalizedNext === MIGRATION_STATUS.CANCELLED : stryMutAct_9fa48("90359") ? false : stryMutAct_9fa48("90358") ? true : (stryCov_9fa48("90358", "90359", "90360"), (stryMutAct_9fa48("90362") ? normalizedPrevious !== MIGRATION_STATUS.CANCELLING : stryMutAct_9fa48("90361") ? true : (stryCov_9fa48("90361", "90362"), normalizedPrevious === MIGRATION_STATUS.CANCELLING)) && (stryMutAct_9fa48("90364") ? normalizedNext !== MIGRATION_STATUS.CANCELLED : stryMutAct_9fa48("90363") ? true : (stryCov_9fa48("90363", "90364"), normalizedNext === MIGRATION_STATUS.CANCELLED)))) {
        if (stryMutAct_9fa48("90365")) {
          {}
        } else {
          stryCov_9fa48("90365");
          return stryMutAct_9fa48("90366") ? false : (stryCov_9fa48("90366"), true);
        }
      }
      const previousIndex = mapStageIndex(normalizedPrevious);
      const nextIndex = mapStageIndex(normalizedNext);
      if (stryMutAct_9fa48("90369") ? previousIndex < 0 && nextIndex < 0 : stryMutAct_9fa48("90368") ? false : stryMutAct_9fa48("90367") ? true : (stryCov_9fa48("90367", "90368", "90369"), (stryMutAct_9fa48("90372") ? previousIndex >= 0 : stryMutAct_9fa48("90371") ? previousIndex <= 0 : stryMutAct_9fa48("90370") ? false : (stryCov_9fa48("90370", "90371", "90372"), previousIndex < 0)) || (stryMutAct_9fa48("90375") ? nextIndex >= 0 : stryMutAct_9fa48("90374") ? nextIndex <= 0 : stryMutAct_9fa48("90373") ? false : (stryCov_9fa48("90373", "90374", "90375"), nextIndex < 0)))) {
        if (stryMutAct_9fa48("90376")) {
          {}
        } else {
          stryCov_9fa48("90376");
          return stryMutAct_9fa48("90377") ? true : (stryCov_9fa48("90377"), false);
        }
      }
      return stryMutAct_9fa48("90381") ? nextIndex <= previousIndex : stryMutAct_9fa48("90380") ? nextIndex >= previousIndex : stryMutAct_9fa48("90379") ? false : stryMutAct_9fa48("90378") ? true : (stryCov_9fa48("90378", "90379", "90380", "90381"), nextIndex > previousIndex);
    }
  }
  buildTargetSchema(sourceSchemaDefinition, alterSpec) {
    if (stryMutAct_9fa48("90382")) {
      {}
    } else {
      stryCov_9fa48("90382");
      const sourceSchema = parseJsonSafe(sourceSchemaDefinition, {});
      const sourceColumns = Array.isArray(stryMutAct_9fa48("90383") ? sourceSchema.columns : (stryCov_9fa48("90383"), sourceSchema?.columns)) ? sourceSchema.columns.map(stryMutAct_9fa48("90384") ? () => undefined : (stryCov_9fa48("90384"), column => stryMutAct_9fa48("90385") ? {} : (stryCov_9fa48("90385"), {
        ...column
      }))) : stryMutAct_9fa48("90386") ? ["Stryker was here"] : (stryCov_9fa48("90386"), []);
      const nextSchema = stryMutAct_9fa48("90387") ? {} : (stryCov_9fa48("90387"), {
        ...sourceSchema,
        columns: sourceColumns
      });
      const operation = stryMutAct_9fa48("90390") ? alterSpec && {} : stryMutAct_9fa48("90389") ? false : stryMutAct_9fa48("90388") ? true : (stryCov_9fa48("90388", "90389", "90390"), alterSpec || {});
      if (stryMutAct_9fa48("90393") ? operation.migrationType !== MIGRATION_TYPE.ADD_COLUMN : stryMutAct_9fa48("90392") ? false : stryMutAct_9fa48("90391") ? true : (stryCov_9fa48("90391", "90392", "90393"), operation.migrationType === MIGRATION_TYPE.ADD_COLUMN)) {
        if (stryMutAct_9fa48("90394")) {
          {}
        } else {
          stryCov_9fa48("90394");
          nextSchema.columns.push(stryMutAct_9fa48("90395") ? {} : (stryCov_9fa48("90395"), {
            name: operation.columnName,
            type: operation.dataType,
            default: stryMutAct_9fa48("90396") ? operation.defaultValue && null : (stryCov_9fa48("90396"), operation.defaultValue ?? null)
          }));
        }
      } else if (stryMutAct_9fa48("90399") ? operation.migrationType !== MIGRATION_TYPE.DROP_COLUMN : stryMutAct_9fa48("90398") ? false : stryMutAct_9fa48("90397") ? true : (stryCov_9fa48("90397", "90398", "90399"), operation.migrationType === MIGRATION_TYPE.DROP_COLUMN)) {
        if (stryMutAct_9fa48("90400")) {
          {}
        } else {
          stryCov_9fa48("90400");
          nextSchema.columns = stryMutAct_9fa48("90401") ? nextSchema.columns : (stryCov_9fa48("90401"), nextSchema.columns.filter(stryMutAct_9fa48("90402") ? () => undefined : (stryCov_9fa48("90402"), column => stryMutAct_9fa48("90405") ? column.name === operation.columnName : stryMutAct_9fa48("90404") ? false : stryMutAct_9fa48("90403") ? true : (stryCov_9fa48("90403", "90404", "90405"), column.name !== operation.columnName))));
        }
      } else if (stryMutAct_9fa48("90408") ? operation.migrationType !== MIGRATION_TYPE.RENAME_COLUMN : stryMutAct_9fa48("90407") ? false : stryMutAct_9fa48("90406") ? true : (stryCov_9fa48("90406", "90407", "90408"), operation.migrationType === MIGRATION_TYPE.RENAME_COLUMN)) {
        if (stryMutAct_9fa48("90409")) {
          {}
        } else {
          stryCov_9fa48("90409");
          nextSchema.columns = nextSchema.columns.map(column => {
            if (stryMutAct_9fa48("90410")) {
              {}
            } else {
              stryCov_9fa48("90410");
              if (stryMutAct_9fa48("90413") ? column.name === operation.columnName : stryMutAct_9fa48("90412") ? false : stryMutAct_9fa48("90411") ? true : (stryCov_9fa48("90411", "90412", "90413"), column.name !== operation.columnName)) {
                if (stryMutAct_9fa48("90414")) {
                  {}
                } else {
                  stryCov_9fa48("90414");
                  return column;
                }
              }
              return stryMutAct_9fa48("90415") ? {} : (stryCov_9fa48("90415"), {
                ...column,
                name: operation.newColumnName
              });
            }
          });
        }
      } else if (stryMutAct_9fa48("90418") ? operation.migrationType !== MIGRATION_TYPE.ALTER_COLUMN_TYPE : stryMutAct_9fa48("90417") ? false : stryMutAct_9fa48("90416") ? true : (stryCov_9fa48("90416", "90417", "90418"), operation.migrationType === MIGRATION_TYPE.ALTER_COLUMN_TYPE)) {
        if (stryMutAct_9fa48("90419")) {
          {}
        } else {
          stryCov_9fa48("90419");
          nextSchema.columns = nextSchema.columns.map(column => {
            if (stryMutAct_9fa48("90420")) {
              {}
            } else {
              stryCov_9fa48("90420");
              if (stryMutAct_9fa48("90423") ? column.name === operation.columnName : stryMutAct_9fa48("90422") ? false : stryMutAct_9fa48("90421") ? true : (stryCov_9fa48("90421", "90422", "90423"), column.name !== operation.columnName)) {
                if (stryMutAct_9fa48("90424")) {
                  {}
                } else {
                  stryCov_9fa48("90424");
                  return column;
                }
              }
              return stryMutAct_9fa48("90425") ? {} : (stryCov_9fa48("90425"), {
                ...column,
                type: operation.dataType
              });
            }
          });
        }
      }
      return stryMutAct_9fa48("90426") ? {} : (stryCov_9fa48("90426"), {
        schema: nextSchema,
        alterSpec: cloneJson(operation)
      });
    }
  }
  resolveAlterSpecFromMigration(migrationRow) {
    if (stryMutAct_9fa48("90427")) {
      {}
    } else {
      stryCov_9fa48("90427");
      const targetPayload = parseJsonSafe(stryMutAct_9fa48("90428") ? migrationRow.target_schema : (stryCov_9fa48("90428"), migrationRow?.target_schema), {});
      const alterSpec = stryMutAct_9fa48("90431") ? targetPayload?.alterSpec && null : stryMutAct_9fa48("90430") ? false : stryMutAct_9fa48("90429") ? true : (stryCov_9fa48("90429", "90430", "90431"), (stryMutAct_9fa48("90432") ? targetPayload.alterSpec : (stryCov_9fa48("90432"), targetPayload?.alterSpec)) || null);
      if (stryMutAct_9fa48("90435") ? alterSpec || typeof alterSpec === 'object' : stryMutAct_9fa48("90434") ? false : stryMutAct_9fa48("90433") ? true : (stryCov_9fa48("90433", "90434", "90435"), alterSpec && (stryMutAct_9fa48("90437") ? typeof alterSpec !== 'object' : stryMutAct_9fa48("90436") ? true : (stryCov_9fa48("90436", "90437"), typeof alterSpec === (stryMutAct_9fa48("90438") ? "" : (stryCov_9fa48("90438"), 'object')))))) {
        if (stryMutAct_9fa48("90439")) {
          {}
        } else {
          stryCov_9fa48("90439");
          return alterSpec;
        }
      }
      return stryMutAct_9fa48("90440") ? {} : (stryCov_9fa48("90440"), {
        migrationType: stryMutAct_9fa48("90443") ? migrationRow?.migration_type && null : stryMutAct_9fa48("90442") ? false : stryMutAct_9fa48("90441") ? true : (stryCov_9fa48("90441", "90442", "90443"), (stryMutAct_9fa48("90444") ? migrationRow.migration_type : (stryCov_9fa48("90444"), migrationRow?.migration_type)) || null),
        sql: null
      });
    }
  }
  async transitionMigrationStage(migrationId, nextStage, reason, options = {}) {
    if (stryMutAct_9fa48("90445")) {
      {}
    } else {
      stryCov_9fa48("90445");
      const migrationRow = await this.getMigrationById(migrationId);
      if (stryMutAct_9fa48("90448") ? false : stryMutAct_9fa48("90447") ? true : stryMutAct_9fa48("90446") ? migrationRow : (stryCov_9fa48("90446", "90447", "90448"), !migrationRow)) {
        if (stryMutAct_9fa48("90449")) {
          {}
        } else {
          stryCov_9fa48("90449");
          throw new Error(stryMutAct_9fa48("90450") ? `` : (stryCov_9fa48("90450"), `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`));
        }
      }
      const previousStage = String(stryMutAct_9fa48("90453") ? (migrationRow[MIGRATION_COLUMN.CURRENT_STAGE] || migrationRow[MIGRATION_COLUMN.STATUS]) && '' : stryMutAct_9fa48("90452") ? false : stryMutAct_9fa48("90451") ? true : (stryCov_9fa48("90451", "90452", "90453"), (stryMutAct_9fa48("90455") ? migrationRow[MIGRATION_COLUMN.CURRENT_STAGE] && migrationRow[MIGRATION_COLUMN.STATUS] : stryMutAct_9fa48("90454") ? false : (stryCov_9fa48("90454", "90455"), migrationRow[MIGRATION_COLUMN.CURRENT_STAGE] || migrationRow[MIGRATION_COLUMN.STATUS])) || (stryMutAct_9fa48("90456") ? "Stryker was here!" : (stryCov_9fa48("90456"), ''))));
      if (stryMutAct_9fa48("90459") ? false : stryMutAct_9fa48("90458") ? true : stryMutAct_9fa48("90457") ? this.isMonotonicTransitionAllowed(previousStage, nextStage) : (stryCov_9fa48("90457", "90458", "90459"), !this.isMonotonicTransitionAllowed(previousStage, nextStage))) {
        if (stryMutAct_9fa48("90460")) {
          {}
        } else {
          stryCov_9fa48("90460");
          throw new Error((stryMutAct_9fa48("90461") ? `` : (stryCov_9fa48("90461"), `${MIGRATION_ERROR_MSG.INVALID_STAGE_TRANSITION_PREFIX}`)) + (stryMutAct_9fa48("90462") ? `` : (stryCov_9fa48("90462"), `${previousStage} -> ${nextStage}`)));
        }
      }
      await this.ensureWorkflowRegistered(migrationRow);
      await this.workflowCoordinator.transitionStep(migrationId, stryMutAct_9fa48("90463") ? {} : (stryCov_9fa48("90463"), {
        nextStep: nextStage,
        reason,
        metadata: stryMutAct_9fa48("90464") ? {} : (stryCov_9fa48("90464"), {
          previous_stage: previousStage,
          next_stage: nextStage,
          reason,
          timestamp: this.now()
        })
      }), stryMutAct_9fa48("90465") ? {} : (stryCov_9fa48("90465"), {
        status: nextStage
      }));
      const updatedAt = this.now();
      const completedAt = (stryMutAct_9fa48("90468") ? options.completedAt === undefined : stryMutAct_9fa48("90467") ? false : stryMutAct_9fa48("90466") ? true : (stryCov_9fa48("90466", "90467", "90468"), options.completedAt !== undefined)) ? options.completedAt : (stryMutAct_9fa48("90471") ? nextStage !== MIGRATION_STATUS.COMPLETED : stryMutAct_9fa48("90470") ? false : stryMutAct_9fa48("90469") ? true : (stryCov_9fa48("90469", "90470", "90471"), nextStage === MIGRATION_STATUS.COMPLETED)) ? updatedAt : null;
      const errorMessage = Object.prototype.hasOwnProperty.call(options, stryMutAct_9fa48("90472") ? "" : (stryCov_9fa48("90472"), 'errorMessage')) ? options.errorMessage : null;
      await this.executeSql(MIGRATION_SQL.UPDATE_MIGRATION_BY_ID, stryMutAct_9fa48("90473") ? [] : (stryCov_9fa48("90473"), [nextStage, nextStage, errorMessage, updatedAt, completedAt, migrationId]));
      this.logger.info(MIGRATION_LOG_MSG.STAGE_TRANSITION, stryMutAct_9fa48("90474") ? {} : (stryCov_9fa48("90474"), {
        migration_id: migrationId,
        previous_stage: previousStage,
        next_stage: nextStage,
        reason
      }));
    }
  }
  async updatePartitionMigration(migrationId, partitionId, updates = {}) {
    if (stryMutAct_9fa48("90475")) {
      {}
    } else {
      stryCov_9fa48("90475");
      const row = await this.getPartitionMigrationRow(migrationId, partitionId);
      const status = stryMutAct_9fa48("90478") ? (updates.status || row?.status) && MIGRATION_STATUS.PENDING : stryMutAct_9fa48("90477") ? false : stryMutAct_9fa48("90476") ? true : (stryCov_9fa48("90476", "90477", "90478"), (stryMutAct_9fa48("90480") ? updates.status && row?.status : stryMutAct_9fa48("90479") ? false : (stryCov_9fa48("90479", "90480"), updates.status || (stryMutAct_9fa48("90481") ? row.status : (stryCov_9fa48("90481"), row?.status)))) || MIGRATION_STATUS.PENDING);
      const backfillCursor = Object.prototype.hasOwnProperty.call(updates, stryMutAct_9fa48("90482") ? "" : (stryCov_9fa48("90482"), 'backfill_cursor')) ? updates.backfill_cursor : stryMutAct_9fa48("90485") ? row?.backfill_cursor && null : stryMutAct_9fa48("90484") ? false : stryMutAct_9fa48("90483") ? true : (stryCov_9fa48("90483", "90484", "90485"), (stryMutAct_9fa48("90486") ? row.backfill_cursor : (stryCov_9fa48("90486"), row?.backfill_cursor)) || null);
      const retryCount = Object.prototype.hasOwnProperty.call(updates, stryMutAct_9fa48("90487") ? "" : (stryCov_9fa48("90487"), 'retry_count')) ? updates.retry_count : normalizeInteger(stryMutAct_9fa48("90488") ? row.retry_count : (stryCov_9fa48("90488"), row?.retry_count), 0);
      const errorMessage = Object.prototype.hasOwnProperty.call(updates, stryMutAct_9fa48("90489") ? "" : (stryCov_9fa48("90489"), 'error_message')) ? updates.error_message : stryMutAct_9fa48("90492") ? row?.error_message && null : stryMutAct_9fa48("90491") ? false : stryMutAct_9fa48("90490") ? true : (stryCov_9fa48("90490", "90491", "90492"), (stryMutAct_9fa48("90493") ? row.error_message : (stryCov_9fa48("90493"), row?.error_message)) || null);
      await this.executeSql(MIGRATION_SQL.UPDATE_PARTITION_MIGRATION_BY_PK, stryMutAct_9fa48("90494") ? [] : (stryCov_9fa48("90494"), [status, backfillCursor, retryCount, errorMessage, this.now(), migrationId, partitionId]));
    }
  }
  async getPartitionMigrationRow(migrationId, partitionId) {
    if (stryMutAct_9fa48("90495")) {
      {}
    } else {
      stryCov_9fa48("90495");
      const rows = await this.getPartitionMigrationRows(migrationId);
      return stryMutAct_9fa48("90498") ? rows.find(row => String(row.partition_id) === String(partitionId)) && null : stryMutAct_9fa48("90497") ? false : stryMutAct_9fa48("90496") ? true : (stryCov_9fa48("90496", "90497", "90498"), rows.find(stryMutAct_9fa48("90499") ? () => undefined : (stryCov_9fa48("90499"), row => stryMutAct_9fa48("90502") ? String(row.partition_id) !== String(partitionId) : stryMutAct_9fa48("90501") ? false : stryMutAct_9fa48("90500") ? true : (stryCov_9fa48("90500", "90501", "90502"), String(row.partition_id) === String(partitionId)))) || null);
    }
  }
  async executePartitionSql(partitionId, sql, params = stryMutAct_9fa48("90503") ? ["Stryker was here"] : (stryCov_9fa48("90503"), []), options = {}) {
    if (stryMutAct_9fa48("90504")) {
      {}
    } else {
      stryCov_9fa48("90504");
      const queryExecutor = stryMutAct_9fa48("90507") ? this.sqlCore?.queryExecutor && null : stryMutAct_9fa48("90506") ? false : stryMutAct_9fa48("90505") ? true : (stryCov_9fa48("90505", "90506", "90507"), (stryMutAct_9fa48("90508") ? this.sqlCore.queryExecutor : (stryCov_9fa48("90508"), this.sqlCore?.queryExecutor)) || null);
      if (stryMutAct_9fa48("90511") ? !queryExecutor && typeof queryExecutor.executeOnPartition !== 'function' : stryMutAct_9fa48("90510") ? false : stryMutAct_9fa48("90509") ? true : (stryCov_9fa48("90509", "90510", "90511"), (stryMutAct_9fa48("90512") ? queryExecutor : (stryCov_9fa48("90512"), !queryExecutor)) || (stryMutAct_9fa48("90514") ? typeof queryExecutor.executeOnPartition === 'function' : stryMutAct_9fa48("90513") ? false : (stryCov_9fa48("90513", "90514"), typeof queryExecutor.executeOnPartition !== (stryMutAct_9fa48("90515") ? "" : (stryCov_9fa48("90515"), 'function')))))) {
        if (stryMutAct_9fa48("90516")) {
          {}
        } else {
          stryCov_9fa48("90516");
          throw new Error(stryMutAct_9fa48("90517") ? "" : (stryCov_9fa48("90517"), 'MigrationCoordinator requires sqlCore.queryExecutor'));
        }
      }
      const forRead = stryMutAct_9fa48("90520") ? options.forRead !== true : stryMutAct_9fa48("90519") ? false : stryMutAct_9fa48("90518") ? true : (stryCov_9fa48("90518", "90519", "90520"), options.forRead === (stryMutAct_9fa48("90521") ? false : (stryCov_9fa48("90521"), true)));
      const defaultOptions = forRead ? PARTITION_READ_DEFAULT_OPTIONS : PARTITION_WRITE_DEFAULT_OPTIONS;
      return queryExecutor.executeOnPartition(partitionId, sql, params, defaultOptions.FOR_READ, defaultOptions.PREFER_LEADER, defaultOptions.PREFER_SAME_LATENCY_GROUP, stryMutAct_9fa48("90524") ? options.executionOptions && {} : stryMutAct_9fa48("90523") ? false : stryMutAct_9fa48("90522") ? true : (stryCov_9fa48("90522", "90523", "90524"), options.executionOptions || {}));
    }
  }
  buildExponentialBackoffDelay(retryCount) {
    if (stryMutAct_9fa48("90525")) {
      {}
    } else {
      stryCov_9fa48("90525");
      const boundedRetryCount = stryMutAct_9fa48("90526") ? Math.min(0, normalizeInteger(retryCount, 0)) : (stryCov_9fa48("90526"), Math.max(0, normalizeInteger(retryCount, 0)));
      const delay = stryMutAct_9fa48("90527") ? MIGRATION_DEFAULT.RETRY_BASE_DELAY_MS / 2 ** boundedRetryCount : (stryCov_9fa48("90527"), MIGRATION_DEFAULT.RETRY_BASE_DELAY_MS * 2 ** boundedRetryCount);
      return stryMutAct_9fa48("90528") ? Math.max(delay, MIGRATION_DEFAULT.RETRY_MAX_DELAY_MS) : (stryCov_9fa48("90528"), Math.min(delay, MIGRATION_DEFAULT.RETRY_MAX_DELAY_MS));
    }
  }
  shouldStopForCancellation(migrationId) {
    if (stryMutAct_9fa48("90529")) {
      {}
    } else {
      stryCov_9fa48("90529");
      return this.cancellationRequestedByMigrationId.has(String(stryMutAct_9fa48("90532") ? migrationId && '' : stryMutAct_9fa48("90531") ? false : stryMutAct_9fa48("90530") ? true : (stryCov_9fa48("90530", "90531", "90532"), migrationId || (stryMutAct_9fa48("90533") ? "Stryker was here!" : (stryCov_9fa48("90533"), '')))));
    }
  }
  async initiateMigration(tableId, alterSpec) {
    if (stryMutAct_9fa48("90534")) {
      {}
    } else {
      stryCov_9fa48("90534");
      const normalizedTableId = stryMutAct_9fa48("90535") ? String(tableId || '') : (stryCov_9fa48("90535"), String(stryMutAct_9fa48("90538") ? tableId && '' : stryMutAct_9fa48("90537") ? false : stryMutAct_9fa48("90536") ? true : (stryCov_9fa48("90536", "90537", "90538"), tableId || (stryMutAct_9fa48("90539") ? "Stryker was here!" : (stryCov_9fa48("90539"), '')))).trim());
      if (stryMutAct_9fa48("90542") ? false : stryMutAct_9fa48("90541") ? true : stryMutAct_9fa48("90540") ? normalizedTableId : (stryCov_9fa48("90540", "90541", "90542"), !normalizedTableId)) {
        if (stryMutAct_9fa48("90543")) {
          {}
        } else {
          stryCov_9fa48("90543");
          throw new Error(stryMutAct_9fa48("90544") ? "" : (stryCov_9fa48("90544"), 'Migration tableId is required'));
        }
      }
      const activeMigration = await this.findActiveMigrationByTableId(normalizedTableId);
      if (stryMutAct_9fa48("90546") ? false : stryMutAct_9fa48("90545") ? true : (stryCov_9fa48("90545", "90546"), activeMigration)) {
        if (stryMutAct_9fa48("90547")) {
          {}
        } else {
          stryCov_9fa48("90547");
          throw new Error((stryMutAct_9fa48("90548") ? `` : (stryCov_9fa48("90548"), `${MIGRATION_ERROR_MSG.ACTIVE_MIGRATION_CONFLICT_PREFIX}`)) + (stryMutAct_9fa48("90549") ? `` : (stryCov_9fa48("90549"), `${activeMigration.migration_id}`)));
        }
      }
      const tableMetadata = await this.resolveTableMetadata(normalizedTableId);
      if (stryMutAct_9fa48("90552") ? false : stryMutAct_9fa48("90551") ? true : stryMutAct_9fa48("90550") ? tableMetadata : (stryCov_9fa48("90550", "90551", "90552"), !tableMetadata)) {
        if (stryMutAct_9fa48("90553")) {
          {}
        } else {
          stryCov_9fa48("90553");
          throw new Error(stryMutAct_9fa48("90554") ? `` : (stryCov_9fa48("90554"), `Table not found for migration: ${normalizedTableId}`));
        }
      }
      const sourceSchema = String(stryMutAct_9fa48("90557") ? tableMetadata.schema_definition && '{}' : stryMutAct_9fa48("90556") ? false : stryMutAct_9fa48("90555") ? true : (stryCov_9fa48("90555", "90556", "90557"), tableMetadata.schema_definition || (stryMutAct_9fa48("90558") ? "" : (stryCov_9fa48("90558"), '{}'))));
      const targetPayload = this.buildTargetSchema(sourceSchema, alterSpec);
      const migrationId = this.generateMigrationId();
      const createdAt = this.now();
      await this.executeSql(MIGRATION_SQL.INSERT_MIGRATION, stryMutAct_9fa48("90559") ? [] : (stryCov_9fa48("90559"), [migrationId, tableMetadata.table_id, tableMetadata.table_name, alterSpec.migrationType, sourceSchema, JSON.stringify(targetPayload), MIGRATION_STATUS.PENDING, MIGRATION_STATUS.PENDING, null, createdAt, createdAt, null]));
      const partitionRowsFromCache = (stryMutAct_9fa48("90562") ? typeof this.systemTableCache.filter !== 'function' : stryMutAct_9fa48("90561") ? false : stryMutAct_9fa48("90560") ? true : (stryCov_9fa48("90560", "90561", "90562"), typeof this.systemTableCache.filter === (stryMutAct_9fa48("90563") ? "" : (stryCov_9fa48("90563"), 'function')))) ? stryMutAct_9fa48("90564") ? this.systemTableCache : (stryCov_9fa48("90564"), this.systemTableCache.filter(TABLES.PARTITIONS, stryMutAct_9fa48("90565") ? () => undefined : (stryCov_9fa48("90565"), row => stryMutAct_9fa48("90568") ? String(row?.table_id || '') !== String(tableMetadata.table_id || '') : stryMutAct_9fa48("90567") ? false : stryMutAct_9fa48("90566") ? true : (stryCov_9fa48("90566", "90567", "90568"), String(stryMutAct_9fa48("90571") ? row?.table_id && '' : stryMutAct_9fa48("90570") ? false : stryMutAct_9fa48("90569") ? true : (stryCov_9fa48("90569", "90570", "90571"), (stryMutAct_9fa48("90572") ? row.table_id : (stryCov_9fa48("90572"), row?.table_id)) || (stryMutAct_9fa48("90573") ? "Stryker was here!" : (stryCov_9fa48("90573"), '')))) === String(stryMutAct_9fa48("90576") ? tableMetadata.table_id && '' : stryMutAct_9fa48("90575") ? false : stryMutAct_9fa48("90574") ? true : (stryCov_9fa48("90574", "90575", "90576"), tableMetadata.table_id || (stryMutAct_9fa48("90577") ? "Stryker was here!" : (stryCov_9fa48("90577"), '')))))))) : stryMutAct_9fa48("90578") ? ["Stryker was here"] : (stryCov_9fa48("90578"), []);
      let partitionIds = resolvePartitionIdList(partitionRowsFromCache);
      if (stryMutAct_9fa48("90581") ? partitionIds.length !== 0 : stryMutAct_9fa48("90580") ? false : stryMutAct_9fa48("90579") ? true : (stryCov_9fa48("90579", "90580", "90581"), partitionIds.length === 0)) {
        if (stryMutAct_9fa48("90582")) {
          {}
        } else {
          stryCov_9fa48("90582");
          const partitionQueryResult = await this.executeSql(MIGRATION_SQL.SELECT_PARTITIONS_BY_TABLE, stryMutAct_9fa48("90583") ? [] : (stryCov_9fa48("90583"), [tableMetadata.table_id]));
          partitionIds = resolvePartitionIdList(partitionQueryResult.rows);
        }
      }
      for (const partitionId of partitionIds) {
        if (stryMutAct_9fa48("90584")) {
          {}
        } else {
          stryCov_9fa48("90584");
          await this.executeSql(MIGRATION_SQL.INSERT_PARTITION_MIGRATION, stryMutAct_9fa48("90585") ? [] : (stryCov_9fa48("90585"), [migrationId, partitionId, MIGRATION_STATUS.PENDING, null, 0, null, createdAt]));
        }
      }
      await this.workflowCoordinator.registerWorkflow(stryMutAct_9fa48("90586") ? {} : (stryCov_9fa48("90586"), {
        workflowId: migrationId,
        ownerKey: migrationId,
        step: MIGRATION_STATUS.PENDING,
        status: MIGRATION_STATUS.PENDING,
        tableId: tableMetadata.table_id,
        tableName: tableMetadata.table_name,
        metadata: stryMutAct_9fa48("90587") ? {} : (stryCov_9fa48("90587"), {
          migrationType: alterSpec.migrationType
        }),
        createdAt,
        updatedAt: createdAt,
        transitionHistory: stryMutAct_9fa48("90588") ? ["Stryker was here"] : (stryCov_9fa48("90588"), [])
      }));
      this.logger.info(MIGRATION_LOG_MSG.MIGRATION_INITIATED, stryMutAct_9fa48("90589") ? {} : (stryCov_9fa48("90589"), {
        migration_id: migrationId,
        table_id: tableMetadata.table_id,
        table_name: tableMetadata.table_name,
        migration_type: alterSpec.migrationType,
        partition_count: partitionIds.length
      }));
      return migrationId;
    }
  }
  async advanceMigration(migrationId, options = {}) {
    if (stryMutAct_9fa48("90590")) {
      {}
    } else {
      stryCov_9fa48("90590");
      const normalizedMigrationId = stryMutAct_9fa48("90591") ? String(migrationId || '') : (stryCov_9fa48("90591"), String(stryMutAct_9fa48("90594") ? migrationId && '' : stryMutAct_9fa48("90593") ? false : stryMutAct_9fa48("90592") ? true : (stryCov_9fa48("90592", "90593", "90594"), migrationId || (stryMutAct_9fa48("90595") ? "Stryker was here!" : (stryCov_9fa48("90595"), '')))).trim());
      if (stryMutAct_9fa48("90598") ? false : stryMutAct_9fa48("90597") ? true : stryMutAct_9fa48("90596") ? normalizedMigrationId : (stryCov_9fa48("90596", "90597", "90598"), !normalizedMigrationId)) {
        if (stryMutAct_9fa48("90599")) {
          {}
        } else {
          stryCov_9fa48("90599");
          throw new Error(stryMutAct_9fa48("90600") ? `` : (stryCov_9fa48("90600"), `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`));
        }
      }
      if (stryMutAct_9fa48("90602") ? false : stryMutAct_9fa48("90601") ? true : (stryCov_9fa48("90601", "90602"), this.inflightByMigrationId.has(normalizedMigrationId))) {
        if (stryMutAct_9fa48("90603")) {
          {}
        } else {
          stryCov_9fa48("90603");
          return this.inflightByMigrationId.get(normalizedMigrationId);
        }
      }
      const executionPromise = (async () => {
        if (stryMutAct_9fa48("90604")) {
          {}
        } else {
          stryCov_9fa48("90604");
          const migrationRow = await this.getMigrationById(normalizedMigrationId);
          if (stryMutAct_9fa48("90607") ? false : stryMutAct_9fa48("90606") ? true : stryMutAct_9fa48("90605") ? migrationRow : (stryCov_9fa48("90605", "90606", "90607"), !migrationRow)) {
            if (stryMutAct_9fa48("90608")) {
              {}
            } else {
              stryCov_9fa48("90608");
              throw new Error(stryMutAct_9fa48("90609") ? `` : (stryCov_9fa48("90609"), `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`));
            }
          }
          await this.ensureWorkflowRegistered(migrationRow);
          return this.workflowStepRunner.runStep(stryMutAct_9fa48("90610") ? {} : (stryCov_9fa48("90610"), {
            workflowId: normalizedMigrationId,
            ownerKey: normalizedMigrationId,
            stepName: stryMutAct_9fa48("90611") ? "" : (stryCov_9fa48("90611"), 'advance_migration'),
            timeoutBudget: stryMutAct_9fa48("90614") ? options.timeoutBudget && null : stryMutAct_9fa48("90613") ? false : stryMutAct_9fa48("90612") ? true : (stryCov_9fa48("90612", "90613", "90614"), options.timeoutBudget || null),
            execute: async ({
              timeoutBudget
            }) => {
              if (stryMutAct_9fa48("90615")) {
                {}
              } else {
                stryCov_9fa48("90615");
                let activeMigration = await this.getMigrationById(normalizedMigrationId);
                if (stryMutAct_9fa48("90618") ? false : stryMutAct_9fa48("90617") ? true : stryMutAct_9fa48("90616") ? activeMigration : (stryCov_9fa48("90616", "90617", "90618"), !activeMigration)) {
                  if (stryMutAct_9fa48("90619")) {
                    {}
                  } else {
                    stryCov_9fa48("90619");
                    throw new Error(stryMutAct_9fa48("90620") ? `` : (stryCov_9fa48("90620"), `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`));
                  }
                }
                if (stryMutAct_9fa48("90622") ? false : stryMutAct_9fa48("90621") ? true : (stryCov_9fa48("90621", "90622"), MIGRATION_TERMINAL_STATUSES.has(String(stryMutAct_9fa48("90625") ? activeMigration.status && '' : stryMutAct_9fa48("90624") ? false : stryMutAct_9fa48("90623") ? true : (stryCov_9fa48("90623", "90624", "90625"), activeMigration.status || (stryMutAct_9fa48("90626") ? "Stryker was here!" : (stryCov_9fa48("90626"), ''))))))) {
                  if (stryMutAct_9fa48("90627")) {
                    {}
                  } else {
                    stryCov_9fa48("90627");
                    return stryMutAct_9fa48("90628") ? {} : (stryCov_9fa48("90628"), {
                      result: stryMutAct_9fa48("90629") ? {} : (stryCov_9fa48("90629"), {
                        migrationId: normalizedMigrationId,
                        status: activeMigration.status
                      })
                    });
                  }
                }
                if (stryMutAct_9fa48("90632") ? String(activeMigration.status || '') !== MIGRATION_STATUS.CANCELLING : stryMutAct_9fa48("90631") ? false : stryMutAct_9fa48("90630") ? true : (stryCov_9fa48("90630", "90631", "90632"), String(stryMutAct_9fa48("90635") ? activeMigration.status && '' : stryMutAct_9fa48("90634") ? false : stryMutAct_9fa48("90633") ? true : (stryCov_9fa48("90633", "90634", "90635"), activeMigration.status || (stryMutAct_9fa48("90636") ? "Stryker was here!" : (stryCov_9fa48("90636"), '')))) === MIGRATION_STATUS.CANCELLING)) {
                  if (stryMutAct_9fa48("90637")) {
                    {}
                  } else {
                    stryCov_9fa48("90637");
                    return stryMutAct_9fa48("90638") ? {} : (stryCov_9fa48("90638"), {
                      result: stryMutAct_9fa48("90639") ? {} : (stryCov_9fa48("90639"), {
                        migrationId: normalizedMigrationId,
                        status: activeMigration.status
                      })
                    });
                  }
                }
                try {
                  if (stryMutAct_9fa48("90640")) {
                    {}
                  } else {
                    stryCov_9fa48("90640");
                    if (stryMutAct_9fa48("90643") ? activeMigration.status === MIGRATION_STATUS.PENDING && activeMigration.status === MIGRATION_STATUS.DUAL_WRITE : stryMutAct_9fa48("90642") ? false : stryMutAct_9fa48("90641") ? true : (stryCov_9fa48("90641", "90642", "90643"), (stryMutAct_9fa48("90645") ? activeMigration.status !== MIGRATION_STATUS.PENDING : stryMutAct_9fa48("90644") ? false : (stryCov_9fa48("90644", "90645"), activeMigration.status === MIGRATION_STATUS.PENDING)) || (stryMutAct_9fa48("90647") ? activeMigration.status !== MIGRATION_STATUS.DUAL_WRITE : stryMutAct_9fa48("90646") ? false : (stryCov_9fa48("90646", "90647"), activeMigration.status === MIGRATION_STATUS.DUAL_WRITE)))) {
                      if (stryMutAct_9fa48("90648")) {
                        {}
                      } else {
                        stryCov_9fa48("90648");
                        await this.executeDualWriteStage(activeMigration, timeoutBudget);
                        activeMigration = await this.getMigrationById(normalizedMigrationId);
                      }
                    }
                    if (stryMutAct_9fa48("90651") ? activeMigration?.status === MIGRATION_STATUS.DUAL_WRITE_COMPLETE && activeMigration?.status === MIGRATION_STATUS.BACKFILL : stryMutAct_9fa48("90650") ? false : stryMutAct_9fa48("90649") ? true : (stryCov_9fa48("90649", "90650", "90651"), (stryMutAct_9fa48("90653") ? activeMigration?.status !== MIGRATION_STATUS.DUAL_WRITE_COMPLETE : stryMutAct_9fa48("90652") ? false : (stryCov_9fa48("90652", "90653"), (stryMutAct_9fa48("90654") ? activeMigration.status : (stryCov_9fa48("90654"), activeMigration?.status)) === MIGRATION_STATUS.DUAL_WRITE_COMPLETE)) || (stryMutAct_9fa48("90656") ? activeMigration?.status !== MIGRATION_STATUS.BACKFILL : stryMutAct_9fa48("90655") ? false : (stryCov_9fa48("90655", "90656"), (stryMutAct_9fa48("90657") ? activeMigration.status : (stryCov_9fa48("90657"), activeMigration?.status)) === MIGRATION_STATUS.BACKFILL)))) {
                      if (stryMutAct_9fa48("90658")) {
                        {}
                      } else {
                        stryCov_9fa48("90658");
                        await this.executeBackfillStage(activeMigration, timeoutBudget);
                        activeMigration = await this.getMigrationById(normalizedMigrationId);
                      }
                    }
                    if (stryMutAct_9fa48("90661") ? activeMigration?.status === MIGRATION_STATUS.BACKFILL_COMPLETE && activeMigration?.status === MIGRATION_STATUS.CUTOVER_PENDING : stryMutAct_9fa48("90660") ? false : stryMutAct_9fa48("90659") ? true : (stryCov_9fa48("90659", "90660", "90661"), (stryMutAct_9fa48("90663") ? activeMigration?.status !== MIGRATION_STATUS.BACKFILL_COMPLETE : stryMutAct_9fa48("90662") ? false : (stryCov_9fa48("90662", "90663"), (stryMutAct_9fa48("90664") ? activeMigration.status : (stryCov_9fa48("90664"), activeMigration?.status)) === MIGRATION_STATUS.BACKFILL_COMPLETE)) || (stryMutAct_9fa48("90666") ? activeMigration?.status !== MIGRATION_STATUS.CUTOVER_PENDING : stryMutAct_9fa48("90665") ? false : (stryCov_9fa48("90665", "90666"), (stryMutAct_9fa48("90667") ? activeMigration.status : (stryCov_9fa48("90667"), activeMigration?.status)) === MIGRATION_STATUS.CUTOVER_PENDING)))) {
                      if (stryMutAct_9fa48("90668")) {
                        {}
                      } else {
                        stryCov_9fa48("90668");
                        await this.executeCutoverStage(activeMigration, timeoutBudget);
                        activeMigration = await this.getMigrationById(normalizedMigrationId);
                      }
                    }
                  }
                } catch (error) {
                  if (stryMutAct_9fa48("90669")) {
                    {}
                  } else {
                    stryCov_9fa48("90669");
                    const latestMigration = await this.getMigrationById(normalizedMigrationId);
                    if (stryMutAct_9fa48("90672") ? latestMigration && String(latestMigration.status || '') !== MIGRATION_STATUS.CANCELLING || !MIGRATION_TERMINAL_STATUSES.has(String(latestMigration.status || '')) : stryMutAct_9fa48("90671") ? false : stryMutAct_9fa48("90670") ? true : (stryCov_9fa48("90670", "90671", "90672"), (stryMutAct_9fa48("90674") ? latestMigration || String(latestMigration.status || '') !== MIGRATION_STATUS.CANCELLING : stryMutAct_9fa48("90673") ? true : (stryCov_9fa48("90673", "90674"), latestMigration && (stryMutAct_9fa48("90676") ? String(latestMigration.status || '') === MIGRATION_STATUS.CANCELLING : stryMutAct_9fa48("90675") ? true : (stryCov_9fa48("90675", "90676"), String(stryMutAct_9fa48("90679") ? latestMigration.status && '' : stryMutAct_9fa48("90678") ? false : stryMutAct_9fa48("90677") ? true : (stryCov_9fa48("90677", "90678", "90679"), latestMigration.status || (stryMutAct_9fa48("90680") ? "Stryker was here!" : (stryCov_9fa48("90680"), '')))) !== MIGRATION_STATUS.CANCELLING)))) && (stryMutAct_9fa48("90681") ? MIGRATION_TERMINAL_STATUSES.has(String(latestMigration.status || '')) : (stryCov_9fa48("90681"), !MIGRATION_TERMINAL_STATUSES.has(String(stryMutAct_9fa48("90684") ? latestMigration.status && '' : stryMutAct_9fa48("90683") ? false : stryMutAct_9fa48("90682") ? true : (stryCov_9fa48("90682", "90683", "90684"), latestMigration.status || (stryMutAct_9fa48("90685") ? "Stryker was here!" : (stryCov_9fa48("90685"), ''))))))))) {
                      if (stryMutAct_9fa48("90686")) {
                        {}
                      } else {
                        stryCov_9fa48("90686");
                        await this.transitionMigrationStage(normalizedMigrationId, MIGRATION_STATUS.FAILED, MIGRATION_STAGE_REASON.FAILURE, stryMutAct_9fa48("90687") ? {} : (stryCov_9fa48("90687"), {
                          errorMessage: stryMutAct_9fa48("90690") ? error?.message && MIGRATION_ERROR_MSG.RETRY_EXHAUSTED : stryMutAct_9fa48("90689") ? false : stryMutAct_9fa48("90688") ? true : (stryCov_9fa48("90688", "90689", "90690"), (stryMutAct_9fa48("90691") ? error.message : (stryCov_9fa48("90691"), error?.message)) || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED)
                        }));
                      }
                    }
                    activeMigration = await this.getMigrationById(normalizedMigrationId);
                  }
                }
                return stryMutAct_9fa48("90692") ? {} : (stryCov_9fa48("90692"), {
                  result: stryMutAct_9fa48("90693") ? {} : (stryCov_9fa48("90693"), {
                    migrationId: normalizedMigrationId,
                    status: stryMutAct_9fa48("90696") ? activeMigration?.status && null : stryMutAct_9fa48("90695") ? false : stryMutAct_9fa48("90694") ? true : (stryCov_9fa48("90694", "90695", "90696"), (stryMutAct_9fa48("90697") ? activeMigration.status : (stryCov_9fa48("90697"), activeMigration?.status)) || null)
                  })
                });
              }
            }
          }));
        }
      })().finally(() => {
        if (stryMutAct_9fa48("90698")) {
          {}
        } else {
          stryCov_9fa48("90698");
          this.inflightByMigrationId.delete(normalizedMigrationId);
        }
      });
      this.inflightByMigrationId.set(normalizedMigrationId, executionPromise);
      return executionPromise;
    }
  }
  async cancelMigration(migrationId) {
    if (stryMutAct_9fa48("90699")) {
      {}
    } else {
      stryCov_9fa48("90699");
      const normalizedMigrationId = stryMutAct_9fa48("90700") ? String(migrationId || '') : (stryCov_9fa48("90700"), String(stryMutAct_9fa48("90703") ? migrationId && '' : stryMutAct_9fa48("90702") ? false : stryMutAct_9fa48("90701") ? true : (stryCov_9fa48("90701", "90702", "90703"), migrationId || (stryMutAct_9fa48("90704") ? "Stryker was here!" : (stryCov_9fa48("90704"), '')))).trim());
      if (stryMutAct_9fa48("90707") ? false : stryMutAct_9fa48("90706") ? true : stryMutAct_9fa48("90705") ? normalizedMigrationId : (stryCov_9fa48("90705", "90706", "90707"), !normalizedMigrationId)) {
        if (stryMutAct_9fa48("90708")) {
          {}
        } else {
          stryCov_9fa48("90708");
          throw new Error(stryMutAct_9fa48("90709") ? `` : (stryCov_9fa48("90709"), `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`));
        }
      }
      const migrationRow = await this.getMigrationById(normalizedMigrationId);
      if (stryMutAct_9fa48("90712") ? false : stryMutAct_9fa48("90711") ? true : stryMutAct_9fa48("90710") ? migrationRow : (stryCov_9fa48("90710", "90711", "90712"), !migrationRow)) {
        if (stryMutAct_9fa48("90713")) {
          {}
        } else {
          stryCov_9fa48("90713");
          throw new Error(stryMutAct_9fa48("90714") ? `` : (stryCov_9fa48("90714"), `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`));
        }
      }
      const currentStage = String(stryMutAct_9fa48("90717") ? (migrationRow.current_stage || migrationRow.status) && '' : stryMutAct_9fa48("90716") ? false : stryMutAct_9fa48("90715") ? true : (stryCov_9fa48("90715", "90716", "90717"), (stryMutAct_9fa48("90719") ? migrationRow.current_stage && migrationRow.status : stryMutAct_9fa48("90718") ? false : (stryCov_9fa48("90718", "90719"), migrationRow.current_stage || migrationRow.status)) || (stryMutAct_9fa48("90720") ? "Stryker was here!" : (stryCov_9fa48("90720"), ''))));
      if (stryMutAct_9fa48("90723") ? false : stryMutAct_9fa48("90722") ? true : stryMutAct_9fa48("90721") ? MIGRATION_CANCELLABLE_STAGES.has(currentStage) : (stryCov_9fa48("90721", "90722", "90723"), !MIGRATION_CANCELLABLE_STAGES.has(currentStage))) {
        if (stryMutAct_9fa48("90724")) {
          {}
        } else {
          stryCov_9fa48("90724");
          throw new Error(stryMutAct_9fa48("90725") ? `` : (stryCov_9fa48("90725"), `${MIGRATION_ERROR_MSG.NOT_CANCELLABLE_PREFIX}${currentStage}`));
        }
      }
      this.cancellationRequestedByMigrationId.add(normalizedMigrationId);
      try {
        if (stryMutAct_9fa48("90726")) {
          {}
        } else {
          stryCov_9fa48("90726");
          await this.transitionMigrationStage(normalizedMigrationId, MIGRATION_STATUS.CANCELLING, MIGRATION_STAGE_REASON.CANCELLING);
          if (stryMutAct_9fa48("90728") ? false : stryMutAct_9fa48("90727") ? true : (stryCov_9fa48("90727", "90728"), this.inflightByMigrationId.has(normalizedMigrationId))) {
            if (stryMutAct_9fa48("90729")) {
              {}
            } else {
              stryCov_9fa48("90729");
              await this.inflightByMigrationId.get(normalizedMigrationId);
            }
          }
          const latestMigrationRow = await this.getMigrationById(normalizedMigrationId);
          if (stryMutAct_9fa48("90732") ? false : stryMutAct_9fa48("90731") ? true : stryMutAct_9fa48("90730") ? latestMigrationRow : (stryCov_9fa48("90730", "90731", "90732"), !latestMigrationRow)) {
            if (stryMutAct_9fa48("90733")) {
              {}
            } else {
              stryCov_9fa48("90733");
              throw new Error(stryMutAct_9fa48("90734") ? `` : (stryCov_9fa48("90734"), `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`));
            }
          }
          await this.rollbackMigration(latestMigrationRow);
          await this.transitionMigrationStage(normalizedMigrationId, MIGRATION_STATUS.CANCELLED, MIGRATION_STAGE_REASON.CANCELLED, stryMutAct_9fa48("90735") ? {} : (stryCov_9fa48("90735"), {
            errorMessage: null,
            completedAt: this.now()
          }));
          this.logger.info(MIGRATION_LOG_MSG.MIGRATION_CANCELLED, stryMutAct_9fa48("90736") ? {} : (stryCov_9fa48("90736"), {
            migration_id: normalizedMigrationId
          }));
          return stryMutAct_9fa48("90737") ? {} : (stryCov_9fa48("90737"), {
            success: stryMutAct_9fa48("90738") ? false : (stryCov_9fa48("90738"), true),
            migrationId: normalizedMigrationId,
            status: MIGRATION_STATUS.CANCELLED
          });
        }
      } finally {
        if (stryMutAct_9fa48("90739")) {
          {}
        } else {
          stryCov_9fa48("90739");
          this.cancellationRequestedByMigrationId.delete(normalizedMigrationId);
        }
      }
    }
  }
  async recoverMigrations() {
    if (stryMutAct_9fa48("90740")) {
      {}
    } else {
      stryCov_9fa48("90740");
      const result = await this.executeSql(MIGRATION_SQL.SELECT_NON_TERMINAL_MIGRATIONS, stryMutAct_9fa48("90741") ? [] : (stryCov_9fa48("90741"), [MIGRATION_STATUS.COMPLETED, MIGRATION_STATUS.CANCELLED, MIGRATION_STATUS.FAILED]), {}, stryMutAct_9fa48("90742") ? false : (stryCov_9fa48("90742"), true));
      const rows = Array.isArray(result.rows) ? result.rows : stryMutAct_9fa48("90743") ? ["Stryker was here"] : (stryCov_9fa48("90743"), []);
      const recoveredMigrationIds = stryMutAct_9fa48("90744") ? ["Stryker was here"] : (stryCov_9fa48("90744"), []);
      for (const row of rows) {
        if (stryMutAct_9fa48("90745")) {
          {}
        } else {
          stryCov_9fa48("90745");
          const migrationId = String(stryMutAct_9fa48("90748") ? row.migration_id && '' : stryMutAct_9fa48("90747") ? false : stryMutAct_9fa48("90746") ? true : (stryCov_9fa48("90746", "90747", "90748"), row.migration_id || (stryMutAct_9fa48("90749") ? "Stryker was here!" : (stryCov_9fa48("90749"), ''))));
          if (stryMutAct_9fa48("90752") ? false : stryMutAct_9fa48("90751") ? true : stryMutAct_9fa48("90750") ? migrationId : (stryCov_9fa48("90750", "90751", "90752"), !migrationId)) {
            if (stryMutAct_9fa48("90753")) {
              {}
            } else {
              stryCov_9fa48("90753");
              continue;
            }
          }
          await this.ensureWorkflowRegistered(row);
          this.logger.info(MIGRATION_LOG_MSG.MIGRATION_RECOVERED, stryMutAct_9fa48("90754") ? {} : (stryCov_9fa48("90754"), {
            migration_id: migrationId,
            stage: stryMutAct_9fa48("90757") ? row.current_stage && row.status : stryMutAct_9fa48("90756") ? false : stryMutAct_9fa48("90755") ? true : (stryCov_9fa48("90755", "90756", "90757"), row.current_stage || row.status)
          }));
          await this.advanceMigration(migrationId);
          recoveredMigrationIds.push(migrationId);
        }
      }
      return stryMutAct_9fa48("90758") ? {} : (stryCov_9fa48("90758"), {
        success: stryMutAct_9fa48("90759") ? false : (stryCov_9fa48("90759"), true),
        recovered: recoveredMigrationIds.length,
        migrationIds: recoveredMigrationIds
      });
    }
  }
  async executeDualWriteStage(migrationRow, timeoutBudget) {
    if (stryMutAct_9fa48("90760")) {
      {}
    } else {
      stryCov_9fa48("90760");
      if (stryMutAct_9fa48("90763") ? false : stryMutAct_9fa48("90762") ? true : stryMutAct_9fa48("90761") ? migrationRow : (stryCov_9fa48("90761", "90762", "90763"), !migrationRow)) {
        if (stryMutAct_9fa48("90764")) {
          {}
        } else {
          stryCov_9fa48("90764");
          return;
        }
      }
      const migrationId = String(stryMutAct_9fa48("90767") ? migrationRow.migration_id && '' : stryMutAct_9fa48("90766") ? false : stryMutAct_9fa48("90765") ? true : (stryCov_9fa48("90765", "90766", "90767"), migrationRow.migration_id || (stryMutAct_9fa48("90768") ? "Stryker was here!" : (stryCov_9fa48("90768"), ''))));
      if (stryMutAct_9fa48("90771") ? false : stryMutAct_9fa48("90770") ? true : stryMutAct_9fa48("90769") ? migrationId : (stryCov_9fa48("90769", "90770", "90771"), !migrationId)) {
        if (stryMutAct_9fa48("90772")) {
          {}
        } else {
          stryCov_9fa48("90772");
          return;
        }
      }
      const currentStatus = String(stryMutAct_9fa48("90775") ? (migrationRow[MIGRATION_COLUMN.STATUS] || migrationRow[MIGRATION_COLUMN.CURRENT_STAGE]) && '' : stryMutAct_9fa48("90774") ? false : stryMutAct_9fa48("90773") ? true : (stryCov_9fa48("90773", "90774", "90775"), (stryMutAct_9fa48("90777") ? migrationRow[MIGRATION_COLUMN.STATUS] && migrationRow[MIGRATION_COLUMN.CURRENT_STAGE] : stryMutAct_9fa48("90776") ? false : (stryCov_9fa48("90776", "90777"), migrationRow[MIGRATION_COLUMN.STATUS] || migrationRow[MIGRATION_COLUMN.CURRENT_STAGE])) || (stryMutAct_9fa48("90778") ? "Stryker was here!" : (stryCov_9fa48("90778"), ''))));
      if (stryMutAct_9fa48("90781") ? currentStatus !== MIGRATION_STATUS.PENDING : stryMutAct_9fa48("90780") ? false : stryMutAct_9fa48("90779") ? true : (stryCov_9fa48("90779", "90780", "90781"), currentStatus === MIGRATION_STATUS.PENDING)) {
        if (stryMutAct_9fa48("90782")) {
          {}
        } else {
          stryCov_9fa48("90782");
          await this.transitionMigrationStage(migrationId, MIGRATION_STATUS.DUAL_WRITE, MIGRATION_STAGE_REASON.DUAL_WRITE_START);
        }
      }
      const activeMigrationRow = await this.getMigrationById(migrationId);
      const alterSpec = this.resolveAlterSpecFromMigration(activeMigrationRow);
      const alterSql = stryMutAct_9fa48("90783") ? String(alterSpec?.sql || '') : (stryCov_9fa48("90783"), String(stryMutAct_9fa48("90786") ? alterSpec?.sql && '' : stryMutAct_9fa48("90785") ? false : stryMutAct_9fa48("90784") ? true : (stryCov_9fa48("90784", "90785", "90786"), (stryMutAct_9fa48("90787") ? alterSpec.sql : (stryCov_9fa48("90787"), alterSpec?.sql)) || (stryMutAct_9fa48("90788") ? "Stryker was here!" : (stryCov_9fa48("90788"), '')))).trim());
      if (stryMutAct_9fa48("90791") ? false : stryMutAct_9fa48("90790") ? true : stryMutAct_9fa48("90789") ? alterSql : (stryCov_9fa48("90789", "90790", "90791"), !alterSql)) {
        if (stryMutAct_9fa48("90792")) {
          {}
        } else {
          stryCov_9fa48("90792");
          throw new Error(stryMutAct_9fa48("90793") ? "" : (stryCov_9fa48("90793"), 'Migration alter SQL is required for dual-write stage'));
        }
      }
      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("90794")) {
          {}
        } else {
          stryCov_9fa48("90794");
          const partitionId = String(stryMutAct_9fa48("90797") ? partitionRow.partition_id && '' : stryMutAct_9fa48("90796") ? false : stryMutAct_9fa48("90795") ? true : (stryCov_9fa48("90795", "90796", "90797"), partitionRow.partition_id || (stryMutAct_9fa48("90798") ? "Stryker was here!" : (stryCov_9fa48("90798"), ''))));
          if (stryMutAct_9fa48("90801") ? false : stryMutAct_9fa48("90800") ? true : stryMutAct_9fa48("90799") ? partitionId : (stryCov_9fa48("90799", "90800", "90801"), !partitionId)) {
            if (stryMutAct_9fa48("90802")) {
              {}
            } else {
              stryCov_9fa48("90802");
              continue;
            }
          }
          const partitionStatus = String(stryMutAct_9fa48("90805") ? partitionRow.status && '' : stryMutAct_9fa48("90804") ? false : stryMutAct_9fa48("90803") ? true : (stryCov_9fa48("90803", "90804", "90805"), partitionRow.status || (stryMutAct_9fa48("90806") ? "Stryker was here!" : (stryCov_9fa48("90806"), ''))));
          const partitionStageIndex = mapStageIndex(partitionStatus);
          const dualWriteStageIndex = mapStageIndex(MIGRATION_STATUS.DUAL_WRITE);
          if (stryMutAct_9fa48("90810") ? partitionStageIndex < dualWriteStageIndex : stryMutAct_9fa48("90809") ? partitionStageIndex > dualWriteStageIndex : stryMutAct_9fa48("90808") ? false : stryMutAct_9fa48("90807") ? true : (stryCov_9fa48("90807", "90808", "90809", "90810"), partitionStageIndex >= dualWriteStageIndex)) {
            if (stryMutAct_9fa48("90811")) {
              {}
            } else {
              stryCov_9fa48("90811");
              continue;
            }
          }
          await this.runPartitionOperationWithRetry(stryMutAct_9fa48("90812") ? {} : (stryCov_9fa48("90812"), {
            migrationId,
            partitionId,
            statusOnFailure: MIGRATION_STATUS.DUAL_WRITE,
            timeoutBudget,
            operation: async _childTimeoutBudget => {
              if (stryMutAct_9fa48("90813")) {
                {}
              } else {
                stryCov_9fa48("90813");
                const result = await this.executePartitionSql(partitionId, alterSql, stryMutAct_9fa48("90814") ? ["Stryker was here"] : (stryCov_9fa48("90814"), []), stryMutAct_9fa48("90815") ? {} : (stryCov_9fa48("90815"), {
                  forRead: stryMutAct_9fa48("90816") ? true : (stryCov_9fa48("90816"), false),
                  executionOptions: stryMutAct_9fa48("90817") ? {} : (stryCov_9fa48("90817"), {
                    migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
                    migrationId
                  })
                }));
                if (stryMutAct_9fa48("90820") ? result?.success === true : stryMutAct_9fa48("90819") ? false : stryMutAct_9fa48("90818") ? true : (stryCov_9fa48("90818", "90819", "90820"), (stryMutAct_9fa48("90821") ? result.success : (stryCov_9fa48("90821"), result?.success)) !== (stryMutAct_9fa48("90822") ? false : (stryCov_9fa48("90822"), true)))) {
                  if (stryMutAct_9fa48("90823")) {
                    {}
                  } else {
                    stryCov_9fa48("90823");
                    throw new Error(stryMutAct_9fa48("90826") ? result?.error && 'Partition ALTER TABLE failed' : stryMutAct_9fa48("90825") ? false : stryMutAct_9fa48("90824") ? true : (stryCov_9fa48("90824", "90825", "90826"), (stryMutAct_9fa48("90827") ? result.error : (stryCov_9fa48("90827"), result?.error)) || (stryMutAct_9fa48("90828") ? "" : (stryCov_9fa48("90828"), 'Partition ALTER TABLE failed'))));
                  }
                }
                await this.updatePartitionMigration(migrationId, partitionId, stryMutAct_9fa48("90829") ? {} : (stryCov_9fa48("90829"), {
                  status: MIGRATION_STATUS.DUAL_WRITE,
                  error_message: null,
                  retry_count: normalizeInteger(partitionRow.retry_count, 0)
                }));
                return result;
              }
            }
          }));
        }
      }
      const refreshedPartitionRows = await this.getPartitionMigrationRows(migrationId);
      const allInDualWrite = stryMutAct_9fa48("90830") ? refreshedPartitionRows.some(row => {
        const status = String(row.status || '');
        if (MIGRATION_TERMINAL_STATUSES.has(status)) {
          return true;
        }
        return mapStageIndex(status) >= mapStageIndex(MIGRATION_STATUS.DUAL_WRITE);
      }) : (stryCov_9fa48("90830"), refreshedPartitionRows.every(row => {
        if (stryMutAct_9fa48("90831")) {
          {}
        } else {
          stryCov_9fa48("90831");
          const status = String(stryMutAct_9fa48("90834") ? row.status && '' : stryMutAct_9fa48("90833") ? false : stryMutAct_9fa48("90832") ? true : (stryCov_9fa48("90832", "90833", "90834"), row.status || (stryMutAct_9fa48("90835") ? "Stryker was here!" : (stryCov_9fa48("90835"), ''))));
          if (stryMutAct_9fa48("90837") ? false : stryMutAct_9fa48("90836") ? true : (stryCov_9fa48("90836", "90837"), MIGRATION_TERMINAL_STATUSES.has(status))) {
            if (stryMutAct_9fa48("90838")) {
              {}
            } else {
              stryCov_9fa48("90838");
              return stryMutAct_9fa48("90839") ? false : (stryCov_9fa48("90839"), true);
            }
          }
          return stryMutAct_9fa48("90843") ? mapStageIndex(status) < mapStageIndex(MIGRATION_STATUS.DUAL_WRITE) : stryMutAct_9fa48("90842") ? mapStageIndex(status) > mapStageIndex(MIGRATION_STATUS.DUAL_WRITE) : stryMutAct_9fa48("90841") ? false : stryMutAct_9fa48("90840") ? true : (stryCov_9fa48("90840", "90841", "90842", "90843"), mapStageIndex(status) >= mapStageIndex(MIGRATION_STATUS.DUAL_WRITE));
        }
      }));
      if (stryMutAct_9fa48("90845") ? false : stryMutAct_9fa48("90844") ? true : (stryCov_9fa48("90844", "90845"), allInDualWrite)) {
        if (stryMutAct_9fa48("90846")) {
          {}
        } else {
          stryCov_9fa48("90846");
          await this.transitionMigrationStage(migrationId, MIGRATION_STATUS.DUAL_WRITE_COMPLETE, MIGRATION_STAGE_REASON.DUAL_WRITE_COMPLETE);
        }
      }
    }
  }
  async executeBackfillStage(migrationRow, timeoutBudget) {
    if (stryMutAct_9fa48("90847")) {
      {}
    } else {
      stryCov_9fa48("90847");
      if (stryMutAct_9fa48("90850") ? false : stryMutAct_9fa48("90849") ? true : stryMutAct_9fa48("90848") ? migrationRow : (stryCov_9fa48("90848", "90849", "90850"), !migrationRow)) {
        if (stryMutAct_9fa48("90851")) {
          {}
        } else {
          stryCov_9fa48("90851");
          return;
        }
      }
      const migrationId = String(stryMutAct_9fa48("90854") ? migrationRow.migration_id && '' : stryMutAct_9fa48("90853") ? false : stryMutAct_9fa48("90852") ? true : (stryCov_9fa48("90852", "90853", "90854"), migrationRow.migration_id || (stryMutAct_9fa48("90855") ? "Stryker was here!" : (stryCov_9fa48("90855"), ''))));
      if (stryMutAct_9fa48("90858") ? false : stryMutAct_9fa48("90857") ? true : stryMutAct_9fa48("90856") ? migrationId : (stryCov_9fa48("90856", "90857", "90858"), !migrationId)) {
        if (stryMutAct_9fa48("90859")) {
          {}
        } else {
          stryCov_9fa48("90859");
          return;
        }
      }
      if (stryMutAct_9fa48("90862") ? String(migrationRow.status || '') !== MIGRATION_STATUS.DUAL_WRITE_COMPLETE : stryMutAct_9fa48("90861") ? false : stryMutAct_9fa48("90860") ? true : (stryCov_9fa48("90860", "90861", "90862"), String(stryMutAct_9fa48("90865") ? migrationRow.status && '' : stryMutAct_9fa48("90864") ? false : stryMutAct_9fa48("90863") ? true : (stryCov_9fa48("90863", "90864", "90865"), migrationRow.status || (stryMutAct_9fa48("90866") ? "Stryker was here!" : (stryCov_9fa48("90866"), '')))) === MIGRATION_STATUS.DUAL_WRITE_COMPLETE)) {
        if (stryMutAct_9fa48("90867")) {
          {}
        } else {
          stryCov_9fa48("90867");
          await this.transitionMigrationStage(migrationId, MIGRATION_STATUS.BACKFILL, MIGRATION_STAGE_REASON.BACKFILL_START);
        }
      }
      const refreshedMigrationRow = await this.getMigrationById(migrationId);
      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      const backfillCompleteStageIndex = mapStageIndex(MIGRATION_STATUS.BACKFILL_COMPLETE);
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("90868")) {
          {}
        } else {
          stryCov_9fa48("90868");
          const partitionId = String(stryMutAct_9fa48("90871") ? partitionRow.partition_id && '' : stryMutAct_9fa48("90870") ? false : stryMutAct_9fa48("90869") ? true : (stryCov_9fa48("90869", "90870", "90871"), partitionRow.partition_id || (stryMutAct_9fa48("90872") ? "Stryker was here!" : (stryCov_9fa48("90872"), ''))));
          if (stryMutAct_9fa48("90875") ? false : stryMutAct_9fa48("90874") ? true : stryMutAct_9fa48("90873") ? partitionId : (stryCov_9fa48("90873", "90874", "90875"), !partitionId)) {
            if (stryMutAct_9fa48("90876")) {
              {}
            } else {
              stryCov_9fa48("90876");
              continue;
            }
          }
          const partitionStageIndex = mapStageIndex(String(stryMutAct_9fa48("90879") ? partitionRow.status && '' : stryMutAct_9fa48("90878") ? false : stryMutAct_9fa48("90877") ? true : (stryCov_9fa48("90877", "90878", "90879"), partitionRow.status || (stryMutAct_9fa48("90880") ? "Stryker was here!" : (stryCov_9fa48("90880"), '')))));
          if (stryMutAct_9fa48("90884") ? partitionStageIndex < backfillCompleteStageIndex : stryMutAct_9fa48("90883") ? partitionStageIndex > backfillCompleteStageIndex : stryMutAct_9fa48("90882") ? false : stryMutAct_9fa48("90881") ? true : (stryCov_9fa48("90881", "90882", "90883", "90884"), partitionStageIndex >= backfillCompleteStageIndex)) {
            if (stryMutAct_9fa48("90885")) {
              {}
            } else {
              stryCov_9fa48("90885");
              continue;
            }
          }
          await this.runPartitionOperationWithRetry(stryMutAct_9fa48("90886") ? {} : (stryCov_9fa48("90886"), {
            migrationId,
            partitionId,
            statusOnFailure: MIGRATION_STATUS.BACKFILL,
            timeoutBudget,
            operation: async _childTimeoutBudget => {
              if (stryMutAct_9fa48("90887")) {
                {}
              } else {
                stryCov_9fa48("90887");
                return this.runBackfillPartitionLoop(refreshedMigrationRow, partitionRow, timeoutBudget);
              }
            }
          }));
        }
      }
      const finalPartitionRows = await this.getPartitionMigrationRows(migrationId);
      const allBackfilled = stryMutAct_9fa48("90888") ? finalPartitionRows.some(row => {
        const status = String(row.status || '');
        if (MIGRATION_TERMINAL_STATUSES.has(status)) {
          return true;
        }
        return mapStageIndex(status) >= backfillCompleteStageIndex;
      }) : (stryCov_9fa48("90888"), finalPartitionRows.every(row => {
        if (stryMutAct_9fa48("90889")) {
          {}
        } else {
          stryCov_9fa48("90889");
          const status = String(stryMutAct_9fa48("90892") ? row.status && '' : stryMutAct_9fa48("90891") ? false : stryMutAct_9fa48("90890") ? true : (stryCov_9fa48("90890", "90891", "90892"), row.status || (stryMutAct_9fa48("90893") ? "Stryker was here!" : (stryCov_9fa48("90893"), ''))));
          if (stryMutAct_9fa48("90895") ? false : stryMutAct_9fa48("90894") ? true : (stryCov_9fa48("90894", "90895"), MIGRATION_TERMINAL_STATUSES.has(status))) {
            if (stryMutAct_9fa48("90896")) {
              {}
            } else {
              stryCov_9fa48("90896");
              return stryMutAct_9fa48("90897") ? false : (stryCov_9fa48("90897"), true);
            }
          }
          return stryMutAct_9fa48("90901") ? mapStageIndex(status) < backfillCompleteStageIndex : stryMutAct_9fa48("90900") ? mapStageIndex(status) > backfillCompleteStageIndex : stryMutAct_9fa48("90899") ? false : stryMutAct_9fa48("90898") ? true : (stryCov_9fa48("90898", "90899", "90900", "90901"), mapStageIndex(status) >= backfillCompleteStageIndex);
        }
      }));
      if (stryMutAct_9fa48("90903") ? false : stryMutAct_9fa48("90902") ? true : (stryCov_9fa48("90902", "90903"), allBackfilled)) {
        if (stryMutAct_9fa48("90904")) {
          {}
        } else {
          stryCov_9fa48("90904");
          await this.transitionMigrationStage(migrationId, MIGRATION_STATUS.BACKFILL_COMPLETE, MIGRATION_STAGE_REASON.BACKFILL_COMPLETE);
        }
      }
    }
  }
  async executeCutoverStage(migrationRow, _timeoutBudget) {
    if (stryMutAct_9fa48("90905")) {
      {}
    } else {
      stryCov_9fa48("90905");
      if (stryMutAct_9fa48("90908") ? false : stryMutAct_9fa48("90907") ? true : stryMutAct_9fa48("90906") ? migrationRow : (stryCov_9fa48("90906", "90907", "90908"), !migrationRow)) {
        if (stryMutAct_9fa48("90909")) {
          {}
        } else {
          stryCov_9fa48("90909");
          return;
        }
      }
      const migrationId = String(stryMutAct_9fa48("90912") ? migrationRow.migration_id && '' : stryMutAct_9fa48("90911") ? false : stryMutAct_9fa48("90910") ? true : (stryCov_9fa48("90910", "90911", "90912"), migrationRow.migration_id || (stryMutAct_9fa48("90913") ? "Stryker was here!" : (stryCov_9fa48("90913"), ''))));
      if (stryMutAct_9fa48("90916") ? false : stryMutAct_9fa48("90915") ? true : stryMutAct_9fa48("90914") ? migrationId : (stryCov_9fa48("90914", "90915", "90916"), !migrationId)) {
        if (stryMutAct_9fa48("90917")) {
          {}
        } else {
          stryCov_9fa48("90917");
          return;
        }
      }
      if (stryMutAct_9fa48("90920") ? String(migrationRow.status || '') !== MIGRATION_STATUS.BACKFILL_COMPLETE : stryMutAct_9fa48("90919") ? false : stryMutAct_9fa48("90918") ? true : (stryCov_9fa48("90918", "90919", "90920"), String(stryMutAct_9fa48("90923") ? migrationRow.status && '' : stryMutAct_9fa48("90922") ? false : stryMutAct_9fa48("90921") ? true : (stryCov_9fa48("90921", "90922", "90923"), migrationRow.status || (stryMutAct_9fa48("90924") ? "Stryker was here!" : (stryCov_9fa48("90924"), '')))) === MIGRATION_STATUS.BACKFILL_COMPLETE)) {
        if (stryMutAct_9fa48("90925")) {
          {}
        } else {
          stryCov_9fa48("90925");
          await this.transitionMigrationStage(migrationId, MIGRATION_STATUS.CUTOVER_PENDING, MIGRATION_STAGE_REASON.CUTOVER_PENDING);
        }
      }
      const refreshedMigrationRow = await this.getMigrationById(migrationId);
      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      let lastError = null;
      for (let attempt = 0; stryMutAct_9fa48("90928") ? attempt > MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("90927") ? attempt < MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("90926") ? false : (stryCov_9fa48("90926", "90927", "90928"), attempt <= MIGRATION_DEFAULT.MAX_RETRY_COUNT); stryMutAct_9fa48("90929") ? attempt-- : (stryCov_9fa48("90929"), attempt++)) {
        if (stryMutAct_9fa48("90930")) {
          {}
        } else {
          stryCov_9fa48("90930");
          try {
            if (stryMutAct_9fa48("90931")) {
              {}
            } else {
              stryCov_9fa48("90931");
              await this.executeCutoverTransaction(refreshedMigrationRow, partitionRows);
              await this.transitionMigrationStage(migrationId, MIGRATION_STATUS.COMPLETED, MIGRATION_STAGE_REASON.CUTOVER_COMPLETE, stryMutAct_9fa48("90932") ? {} : (stryCov_9fa48("90932"), {
                completedAt: this.now(),
                errorMessage: null
              }));
              return;
            }
          } catch (error) {
            if (stryMutAct_9fa48("90933")) {
              {}
            } else {
              stryCov_9fa48("90933");
              lastError = error;
              if (stryMutAct_9fa48("90937") ? attempt < MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("90936") ? attempt > MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("90935") ? false : stryMutAct_9fa48("90934") ? true : (stryCov_9fa48("90934", "90935", "90936", "90937"), attempt >= MIGRATION_DEFAULT.MAX_RETRY_COUNT)) {
                if (stryMutAct_9fa48("90938")) {
                  {}
                } else {
                  stryCov_9fa48("90938");
                  break;
                }
              }
              const delayMs = this.buildExponentialBackoffDelay(attempt);
              this.logger.info(MIGRATION_LOG_MSG.CUTOVER_RETRY, stryMutAct_9fa48("90939") ? {} : (stryCov_9fa48("90939"), {
                migration_id: migrationId,
                retry_count: stryMutAct_9fa48("90940") ? attempt - 1 : (stryCov_9fa48("90940"), attempt + 1),
                delay_ms: delayMs,
                error: stryMutAct_9fa48("90943") ? error?.message && null : stryMutAct_9fa48("90942") ? false : stryMutAct_9fa48("90941") ? true : (stryCov_9fa48("90941", "90942", "90943"), (stryMutAct_9fa48("90944") ? error.message : (stryCov_9fa48("90944"), error?.message)) || null)
              }));
              await sleep(delayMs);
            }
          }
        }
      }
      await this.transitionMigrationStage(migrationId, MIGRATION_STATUS.FAILED, MIGRATION_STAGE_REASON.FAILURE, stryMutAct_9fa48("90945") ? {} : (stryCov_9fa48("90945"), {
        errorMessage: stryMutAct_9fa48("90948") ? lastError?.message && MIGRATION_ERROR_MSG.RETRY_EXHAUSTED : stryMutAct_9fa48("90947") ? false : stryMutAct_9fa48("90946") ? true : (stryCov_9fa48("90946", "90947", "90948"), (stryMutAct_9fa48("90949") ? lastError.message : (stryCov_9fa48("90949"), lastError?.message)) || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED)
      }));
    }
  }
  async rollbackMigration(migrationRow) {
    if (stryMutAct_9fa48("90950")) {
      {}
    } else {
      stryCov_9fa48("90950");
      const migrationId = String(stryMutAct_9fa48("90953") ? migrationRow?.migration_id && '' : stryMutAct_9fa48("90952") ? false : stryMutAct_9fa48("90951") ? true : (stryCov_9fa48("90951", "90952", "90953"), (stryMutAct_9fa48("90954") ? migrationRow.migration_id : (stryCov_9fa48("90954"), migrationRow?.migration_id)) || (stryMutAct_9fa48("90955") ? "Stryker was here!" : (stryCov_9fa48("90955"), ''))));
      if (stryMutAct_9fa48("90958") ? false : stryMutAct_9fa48("90957") ? true : stryMutAct_9fa48("90956") ? migrationId : (stryCov_9fa48("90956", "90957", "90958"), !migrationId)) {
        if (stryMutAct_9fa48("90959")) {
          {}
        } else {
          stryCov_9fa48("90959");
          throw new Error(stryMutAct_9fa48("90960") ? "" : (stryCov_9fa48("90960"), 'Missing migration_id for rollback'));
        }
      }
      const rollbackSql = this.resolveRollbackSql(migrationRow);
      if (stryMutAct_9fa48("90963") ? false : stryMutAct_9fa48("90962") ? true : stryMutAct_9fa48("90961") ? rollbackSql : (stryCov_9fa48("90961", "90962", "90963"), !rollbackSql)) {
        if (stryMutAct_9fa48("90964")) {
          {}
        } else {
          stryCov_9fa48("90964");
          return stryMutAct_9fa48("90965") ? {} : (stryCov_9fa48("90965"), {
            success: stryMutAct_9fa48("90966") ? false : (stryCov_9fa48("90966"), true),
            migrationId,
            skipped: stryMutAct_9fa48("90967") ? false : (stryCov_9fa48("90967"), true)
          });
        }
      }
      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      for (const partitionRow of partitionRows) {
        if (stryMutAct_9fa48("90968")) {
          {}
        } else {
          stryCov_9fa48("90968");
          const partitionId = String(stryMutAct_9fa48("90971") ? partitionRow.partition_id && '' : stryMutAct_9fa48("90970") ? false : stryMutAct_9fa48("90969") ? true : (stryCov_9fa48("90969", "90970", "90971"), partitionRow.partition_id || (stryMutAct_9fa48("90972") ? "Stryker was here!" : (stryCov_9fa48("90972"), ''))));
          if (stryMutAct_9fa48("90975") ? false : stryMutAct_9fa48("90974") ? true : stryMutAct_9fa48("90973") ? partitionId : (stryCov_9fa48("90973", "90974", "90975"), !partitionId)) {
            if (stryMutAct_9fa48("90976")) {
              {}
            } else {
              stryCov_9fa48("90976");
              continue;
            }
          }
          await this.runPartitionOperationWithRetry(stryMutAct_9fa48("90977") ? {} : (stryCov_9fa48("90977"), {
            migrationId,
            partitionId,
            statusOnFailure: MIGRATION_STATUS.CANCELLING,
            timeoutBudget: null,
            operation: async () => {
              if (stryMutAct_9fa48("90978")) {
                {}
              } else {
                stryCov_9fa48("90978");
                const result = await this.executePartitionSql(partitionId, rollbackSql, stryMutAct_9fa48("90979") ? ["Stryker was here"] : (stryCov_9fa48("90979"), []), stryMutAct_9fa48("90980") ? {} : (stryCov_9fa48("90980"), {
                  forRead: stryMutAct_9fa48("90981") ? true : (stryCov_9fa48("90981"), false),
                  executionOptions: stryMutAct_9fa48("90982") ? {} : (stryCov_9fa48("90982"), {
                    migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
                    migrationId
                  })
                }));
                if (stryMutAct_9fa48("90985") ? result?.success === true : stryMutAct_9fa48("90984") ? false : stryMutAct_9fa48("90983") ? true : (stryCov_9fa48("90983", "90984", "90985"), (stryMutAct_9fa48("90986") ? result.success : (stryCov_9fa48("90986"), result?.success)) !== (stryMutAct_9fa48("90987") ? false : (stryCov_9fa48("90987"), true)))) {
                  if (stryMutAct_9fa48("90988")) {
                    {}
                  } else {
                    stryCov_9fa48("90988");
                    throw new Error(stryMutAct_9fa48("90991") ? result?.error && 'Partition rollback ALTER TABLE failed' : stryMutAct_9fa48("90990") ? false : stryMutAct_9fa48("90989") ? true : (stryCov_9fa48("90989", "90990", "90991"), (stryMutAct_9fa48("90992") ? result.error : (stryCov_9fa48("90992"), result?.error)) || (stryMutAct_9fa48("90993") ? "" : (stryCov_9fa48("90993"), 'Partition rollback ALTER TABLE failed'))));
                  }
                }
                await this.updatePartitionMigration(migrationId, partitionId, stryMutAct_9fa48("90994") ? {} : (stryCov_9fa48("90994"), {
                  status: MIGRATION_STATUS.CANCELLED,
                  error_message: null
                }));
                return result;
              }
            }
          }));
        }
      }
      return stryMutAct_9fa48("90995") ? {} : (stryCov_9fa48("90995"), {
        success: stryMutAct_9fa48("90996") ? false : (stryCov_9fa48("90996"), true),
        migrationId,
        rollbackSql,
        partitionCount: partitionRows.length
      });
    }
  }
  async runPartitionOperationWithRetry(options = {}) {
    if (stryMutAct_9fa48("90997")) {
      {}
    } else {
      stryCov_9fa48("90997");
      const migrationId = String(stryMutAct_9fa48("91000") ? options.migrationId && '' : stryMutAct_9fa48("90999") ? false : stryMutAct_9fa48("90998") ? true : (stryCov_9fa48("90998", "90999", "91000"), options.migrationId || (stryMutAct_9fa48("91001") ? "Stryker was here!" : (stryCov_9fa48("91001"), ''))));
      const partitionId = String(stryMutAct_9fa48("91004") ? options.partitionId && '' : stryMutAct_9fa48("91003") ? false : stryMutAct_9fa48("91002") ? true : (stryCov_9fa48("91002", "91003", "91004"), options.partitionId || (stryMutAct_9fa48("91005") ? "Stryker was here!" : (stryCov_9fa48("91005"), ''))));
      const statusOnFailure = stryMutAct_9fa48("91008") ? options.statusOnFailure && MIGRATION_STATUS.FAILED : stryMutAct_9fa48("91007") ? false : stryMutAct_9fa48("91006") ? true : (stryCov_9fa48("91006", "91007", "91008"), options.statusOnFailure || MIGRATION_STATUS.FAILED);
      const operation = (stryMutAct_9fa48("91011") ? typeof options.operation !== 'function' : stryMutAct_9fa48("91010") ? false : stryMutAct_9fa48("91009") ? true : (stryCov_9fa48("91009", "91010", "91011"), typeof options.operation === (stryMutAct_9fa48("91012") ? "" : (stryCov_9fa48("91012"), 'function')))) ? options.operation : null;
      if (stryMutAct_9fa48("91015") ? (!migrationId || !partitionId) && !operation : stryMutAct_9fa48("91014") ? false : stryMutAct_9fa48("91013") ? true : (stryCov_9fa48("91013", "91014", "91015"), (stryMutAct_9fa48("91017") ? !migrationId && !partitionId : stryMutAct_9fa48("91016") ? false : (stryCov_9fa48("91016", "91017"), (stryMutAct_9fa48("91018") ? migrationId : (stryCov_9fa48("91018"), !migrationId)) || (stryMutAct_9fa48("91019") ? partitionId : (stryCov_9fa48("91019"), !partitionId)))) || (stryMutAct_9fa48("91020") ? operation : (stryCov_9fa48("91020"), !operation)))) {
        if (stryMutAct_9fa48("91021")) {
          {}
        } else {
          stryCov_9fa48("91021");
          throw new Error(stryMutAct_9fa48("91022") ? "" : (stryCov_9fa48("91022"), 'Invalid partition retry operation context'));
        }
      }
      let lastError = null;
      for (let attempt = 0; stryMutAct_9fa48("91025") ? attempt > MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("91024") ? attempt < MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("91023") ? false : (stryCov_9fa48("91023", "91024", "91025"), attempt <= MIGRATION_DEFAULT.MAX_RETRY_COUNT); stryMutAct_9fa48("91026") ? attempt-- : (stryCov_9fa48("91026"), attempt++)) {
        if (stryMutAct_9fa48("91027")) {
          {}
        } else {
          stryCov_9fa48("91027");
          const childBudget = this.migrationTimeoutPolicy.allocateOrThrow(stryMutAct_9fa48("91028") ? {} : (stryCov_9fa48("91028"), {
            timeoutBudget: stryMutAct_9fa48("91031") ? options.timeoutBudget && null : stryMutAct_9fa48("91030") ? false : stryMutAct_9fa48("91029") ? true : (stryCov_9fa48("91029", "91030", "91031"), options.timeoutBudget || null),
            nestedOperation: stryMutAct_9fa48("91032") ? `` : (stryCov_9fa48("91032"), `partition_${partitionId}_attempt_${attempt}`)
          }));
          try {
            if (stryMutAct_9fa48("91033")) {
              {}
            } else {
              stryCov_9fa48("91033");
              return await operation(childBudget);
            }
          } catch (error) {
            if (stryMutAct_9fa48("91034")) {
              {}
            } else {
              stryCov_9fa48("91034");
              lastError = error;
              const retryCount = stryMutAct_9fa48("91035") ? attempt - 1 : (stryCov_9fa48("91035"), attempt + 1);
              await this.updatePartitionMigration(migrationId, partitionId, stryMutAct_9fa48("91036") ? {} : (stryCov_9fa48("91036"), {
                status: statusOnFailure,
                retry_count: retryCount,
                error_message: stryMutAct_9fa48("91039") ? error?.message && null : stryMutAct_9fa48("91038") ? false : stryMutAct_9fa48("91037") ? true : (stryCov_9fa48("91037", "91038", "91039"), (stryMutAct_9fa48("91040") ? error.message : (stryCov_9fa48("91040"), error?.message)) || null)
              }));
              if (stryMutAct_9fa48("91044") ? attempt < MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("91043") ? attempt > MIGRATION_DEFAULT.MAX_RETRY_COUNT : stryMutAct_9fa48("91042") ? false : stryMutAct_9fa48("91041") ? true : (stryCov_9fa48("91041", "91042", "91043", "91044"), attempt >= MIGRATION_DEFAULT.MAX_RETRY_COUNT)) {
                if (stryMutAct_9fa48("91045")) {
                  {}
                } else {
                  stryCov_9fa48("91045");
                  break;
                }
              }
              const delayMs = this.buildExponentialBackoffDelay(attempt);
              this.logger.info(MIGRATION_LOG_MSG.PARTITION_RETRY, stryMutAct_9fa48("91046") ? {} : (stryCov_9fa48("91046"), {
                migration_id: migrationId,
                partition_id: partitionId,
                retry_count: retryCount,
                delay_ms: delayMs,
                error: stryMutAct_9fa48("91049") ? error?.message && null : stryMutAct_9fa48("91048") ? false : stryMutAct_9fa48("91047") ? true : (stryCov_9fa48("91047", "91048", "91049"), (stryMutAct_9fa48("91050") ? error.message : (stryCov_9fa48("91050"), error?.message)) || null)
              }));
              await sleep(delayMs);
            }
          }
        }
      }
      throw stryMutAct_9fa48("91053") ? lastError && new Error(MIGRATION_ERROR_MSG.RETRY_EXHAUSTED) : stryMutAct_9fa48("91052") ? false : stryMutAct_9fa48("91051") ? true : (stryCov_9fa48("91051", "91052", "91053"), lastError || new Error(MIGRATION_ERROR_MSG.RETRY_EXHAUSTED));
    }
  }
  async runBackfillPartitionLoop(migrationRow, partitionRow, timeoutBudget) {
    if (stryMutAct_9fa48("91054")) {
      {}
    } else {
      stryCov_9fa48("91054");
      const migrationId = String(stryMutAct_9fa48("91057") ? migrationRow?.migration_id && '' : stryMutAct_9fa48("91056") ? false : stryMutAct_9fa48("91055") ? true : (stryCov_9fa48("91055", "91056", "91057"), (stryMutAct_9fa48("91058") ? migrationRow.migration_id : (stryCov_9fa48("91058"), migrationRow?.migration_id)) || (stryMutAct_9fa48("91059") ? "Stryker was here!" : (stryCov_9fa48("91059"), ''))));
      const partitionId = String(stryMutAct_9fa48("91062") ? partitionRow?.partition_id && '' : stryMutAct_9fa48("91061") ? false : stryMutAct_9fa48("91060") ? true : (stryCov_9fa48("91060", "91061", "91062"), (stryMutAct_9fa48("91063") ? partitionRow.partition_id : (stryCov_9fa48("91063"), partitionRow?.partition_id)) || (stryMutAct_9fa48("91064") ? "Stryker was here!" : (stryCov_9fa48("91064"), ''))));
      const tableName = String(stryMutAct_9fa48("91067") ? migrationRow?.table_name && '' : stryMutAct_9fa48("91066") ? false : stryMutAct_9fa48("91065") ? true : (stryCov_9fa48("91065", "91066", "91067"), (stryMutAct_9fa48("91068") ? migrationRow.table_name : (stryCov_9fa48("91068"), migrationRow?.table_name)) || (stryMutAct_9fa48("91069") ? "Stryker was here!" : (stryCov_9fa48("91069"), ''))));
      if (stryMutAct_9fa48("91072") ? (!migrationId || !partitionId) && !tableName : stryMutAct_9fa48("91071") ? false : stryMutAct_9fa48("91070") ? true : (stryCov_9fa48("91070", "91071", "91072"), (stryMutAct_9fa48("91074") ? !migrationId && !partitionId : stryMutAct_9fa48("91073") ? false : (stryCov_9fa48("91073", "91074"), (stryMutAct_9fa48("91075") ? migrationId : (stryCov_9fa48("91075"), !migrationId)) || (stryMutAct_9fa48("91076") ? partitionId : (stryCov_9fa48("91076"), !partitionId)))) || (stryMutAct_9fa48("91077") ? tableName : (stryCov_9fa48("91077"), !tableName)))) {
        if (stryMutAct_9fa48("91078")) {
          {}
        } else {
          stryCov_9fa48("91078");
          throw new Error(stryMutAct_9fa48("91079") ? "" : (stryCov_9fa48("91079"), 'Missing migration backfill context'));
        }
      }
      let cursor = parseBackfillCursor(stryMutAct_9fa48("91080") ? partitionRow.backfill_cursor : (stryCov_9fa48("91080"), partitionRow?.backfill_cursor));
      const quotedTableName = quoteIdentifier(tableName);
      const selectSql = (stryMutAct_9fa48("91081") ? `` : (stryCov_9fa48("91081"), `SELECT rowid AS row_id FROM ${quotedTableName} `)) + (stryMutAct_9fa48("91082") ? "" : (stryCov_9fa48("91082"), 'WHERE rowid > ? ORDER BY rowid LIMIT ?'));
      const backfillUpdateSqlContext = this.resolveBackfillUpdateSql(migrationRow);
      while (stryMutAct_9fa48("91084") ? false : stryMutAct_9fa48("91083") ? false : (stryCov_9fa48("91083", "91084"), true)) {
        if (stryMutAct_9fa48("91085")) {
          {}
        } else {
          stryCov_9fa48("91085");
          if (stryMutAct_9fa48("91087") ? false : stryMutAct_9fa48("91086") ? true : (stryCov_9fa48("91086", "91087"), this.shouldStopForCancellation(migrationId))) {
            if (stryMutAct_9fa48("91088")) {
              {}
            } else {
              stryCov_9fa48("91088");
              return stryMutAct_9fa48("91089") ? {} : (stryCov_9fa48("91089"), {
                cancelled: stryMutAct_9fa48("91090") ? false : (stryCov_9fa48("91090"), true),
                partitionId,
                cursor
              });
            }
          }
          const readBudget = this.migrationTimeoutPolicy.allocateOrThrow(stryMutAct_9fa48("91091") ? {} : (stryCov_9fa48("91091"), {
            timeoutBudget,
            nestedOperation: stryMutAct_9fa48("91092") ? `` : (stryCov_9fa48("91092"), `backfill_scan_${partitionId}`)
          }));
          const scanResult = await this.executePartitionSql(partitionId, selectSql, stryMutAct_9fa48("91093") ? [] : (stryCov_9fa48("91093"), [cursor, MIGRATION_DEFAULT.BACKFILL_BATCH_SIZE]), stryMutAct_9fa48("91094") ? {} : (stryCov_9fa48("91094"), {
            forRead: stryMutAct_9fa48("91095") ? false : (stryCov_9fa48("91095"), true),
            executionOptions: stryMutAct_9fa48("91096") ? {} : (stryCov_9fa48("91096"), {
              timeoutBudget: readBudget
            })
          }));
          if (stryMutAct_9fa48("91099") ? scanResult?.success === true : stryMutAct_9fa48("91098") ? false : stryMutAct_9fa48("91097") ? true : (stryCov_9fa48("91097", "91098", "91099"), (stryMutAct_9fa48("91100") ? scanResult.success : (stryCov_9fa48("91100"), scanResult?.success)) !== (stryMutAct_9fa48("91101") ? false : (stryCov_9fa48("91101"), true)))) {
            if (stryMutAct_9fa48("91102")) {
              {}
            } else {
              stryCov_9fa48("91102");
              throw new Error(stryMutAct_9fa48("91105") ? scanResult?.error && 'Backfill scan failed' : stryMutAct_9fa48("91104") ? false : stryMutAct_9fa48("91103") ? true : (stryCov_9fa48("91103", "91104", "91105"), (stryMutAct_9fa48("91106") ? scanResult.error : (stryCov_9fa48("91106"), scanResult?.error)) || (stryMutAct_9fa48("91107") ? "" : (stryCov_9fa48("91107"), 'Backfill scan failed'))));
            }
          }
          const rows = Array.isArray(scanResult.rows) ? scanResult.rows : stryMutAct_9fa48("91108") ? ["Stryker was here"] : (stryCov_9fa48("91108"), []);
          if (stryMutAct_9fa48("91111") ? rows.length !== 0 : stryMutAct_9fa48("91110") ? false : stryMutAct_9fa48("91109") ? true : (stryCov_9fa48("91109", "91110", "91111"), rows.length === 0)) {
            if (stryMutAct_9fa48("91112")) {
              {}
            } else {
              stryCov_9fa48("91112");
              await this.updatePartitionMigration(migrationId, partitionId, stryMutAct_9fa48("91113") ? {} : (stryCov_9fa48("91113"), {
                status: MIGRATION_STATUS.BACKFILL_COMPLETE,
                backfill_cursor: formatBackfillCursor(cursor),
                error_message: null
              }));
              return stryMutAct_9fa48("91114") ? {} : (stryCov_9fa48("91114"), {
                completed: stryMutAct_9fa48("91115") ? false : (stryCov_9fa48("91115"), true),
                partitionId,
                cursor
              });
            }
          }
          const lastRow = rows[stryMutAct_9fa48("91116") ? rows.length + 1 : (stryCov_9fa48("91116"), rows.length - 1)];
          const lastRowId = normalizeInteger(stryMutAct_9fa48("91117") ? lastRow.row_id : (stryCov_9fa48("91117"), lastRow?.row_id), cursor);
          if (stryMutAct_9fa48("91119") ? false : stryMutAct_9fa48("91118") ? true : (stryCov_9fa48("91118", "91119"), backfillUpdateSqlContext)) {
            if (stryMutAct_9fa48("91120")) {
              {}
            } else {
              stryCov_9fa48("91120");
              const updateBudget = this.migrationTimeoutPolicy.allocateOrThrow(stryMutAct_9fa48("91121") ? {} : (stryCov_9fa48("91121"), {
                timeoutBudget,
                nestedOperation: stryMutAct_9fa48("91122") ? `` : (stryCov_9fa48("91122"), `backfill_update_${partitionId}`)
              }));
              const updateParams = stryMutAct_9fa48("91123") ? [] : (stryCov_9fa48("91123"), [...backfillUpdateSqlContext.params, cursor, lastRowId]);
              const updateResult = await this.executePartitionSql(partitionId, backfillUpdateSqlContext.sql, updateParams, stryMutAct_9fa48("91124") ? {} : (stryCov_9fa48("91124"), {
                forRead: stryMutAct_9fa48("91125") ? true : (stryCov_9fa48("91125"), false),
                executionOptions: stryMutAct_9fa48("91126") ? {} : (stryCov_9fa48("91126"), {
                  timeoutBudget: updateBudget
                })
              }));
              if (stryMutAct_9fa48("91129") ? updateResult?.success === true : stryMutAct_9fa48("91128") ? false : stryMutAct_9fa48("91127") ? true : (stryCov_9fa48("91127", "91128", "91129"), (stryMutAct_9fa48("91130") ? updateResult.success : (stryCov_9fa48("91130"), updateResult?.success)) !== (stryMutAct_9fa48("91131") ? false : (stryCov_9fa48("91131"), true)))) {
                if (stryMutAct_9fa48("91132")) {
                  {}
                } else {
                  stryCov_9fa48("91132");
                  throw new Error(stryMutAct_9fa48("91135") ? updateResult?.error && 'Backfill update failed' : stryMutAct_9fa48("91134") ? false : stryMutAct_9fa48("91133") ? true : (stryCov_9fa48("91133", "91134", "91135"), (stryMutAct_9fa48("91136") ? updateResult.error : (stryCov_9fa48("91136"), updateResult?.error)) || (stryMutAct_9fa48("91137") ? "" : (stryCov_9fa48("91137"), 'Backfill update failed'))));
                }
              }
            }
          }
          cursor = lastRowId;
          await this.updatePartitionMigration(migrationId, partitionId, stryMutAct_9fa48("91138") ? {} : (stryCov_9fa48("91138"), {
            status: MIGRATION_STATUS.BACKFILL,
            backfill_cursor: formatBackfillCursor(cursor),
            error_message: null
          }));
        }
      }
    }
  }
  async executeCutoverTransaction(migrationRow, partitionRows) {
    if (stryMutAct_9fa48("91139")) {
      {}
    } else {
      stryCov_9fa48("91139");
      const migrationId = String(stryMutAct_9fa48("91142") ? migrationRow?.migration_id && '' : stryMutAct_9fa48("91141") ? false : stryMutAct_9fa48("91140") ? true : (stryCov_9fa48("91140", "91141", "91142"), (stryMutAct_9fa48("91143") ? migrationRow.migration_id : (stryCov_9fa48("91143"), migrationRow?.migration_id)) || (stryMutAct_9fa48("91144") ? "Stryker was here!" : (stryCov_9fa48("91144"), ''))));
      if (stryMutAct_9fa48("91147") ? false : stryMutAct_9fa48("91146") ? true : stryMutAct_9fa48("91145") ? migrationId : (stryCov_9fa48("91145", "91146", "91147"), !migrationId)) {
        if (stryMutAct_9fa48("91148")) {
          {}
        } else {
          stryCov_9fa48("91148");
          throw new Error(stryMutAct_9fa48("91149") ? "" : (stryCov_9fa48("91149"), 'Missing migration_id for cutover'));
        }
      }
      const sessionId = stryMutAct_9fa48("91150") ? `` : (stryCov_9fa48("91150"), `schema-migration-cutover-${migrationId}`);
      const updatedAt = this.now();
      const targetPayload = parseJsonSafe(stryMutAct_9fa48("91151") ? migrationRow.target_schema : (stryCov_9fa48("91151"), migrationRow?.target_schema), {});
      const targetSchema = stryMutAct_9fa48("91154") ? (targetPayload?.schema || targetPayload) && {} : stryMutAct_9fa48("91153") ? false : stryMutAct_9fa48("91152") ? true : (stryCov_9fa48("91152", "91153", "91154"), (stryMutAct_9fa48("91156") ? targetPayload?.schema && targetPayload : stryMutAct_9fa48("91155") ? false : (stryCov_9fa48("91155", "91156"), (stryMutAct_9fa48("91157") ? targetPayload.schema : (stryCov_9fa48("91157"), targetPayload?.schema)) || targetPayload)) || {});
      try {
        if (stryMutAct_9fa48("91158")) {
          {}
        } else {
          stryCov_9fa48("91158");
          await this.executeSql(stryMutAct_9fa48("91159") ? "" : (stryCov_9fa48("91159"), 'BEGIN'), stryMutAct_9fa48("91160") ? ["Stryker was here"] : (stryCov_9fa48("91160"), []), stryMutAct_9fa48("91161") ? {} : (stryCov_9fa48("91161"), {
            sessionId
          }));
          await this.executeSql(MIGRATION_SQL.UPDATE_TABLE_SCHEMA_BY_ID, stryMutAct_9fa48("91162") ? [] : (stryCov_9fa48("91162"), [JSON.stringify(targetSchema), updatedAt, migrationRow.table_id]), stryMutAct_9fa48("91163") ? {} : (stryCov_9fa48("91163"), {
            sessionId
          }));
          for (const row of stryMutAct_9fa48("91166") ? partitionRows && [] : stryMutAct_9fa48("91165") ? false : stryMutAct_9fa48("91164") ? true : (stryCov_9fa48("91164", "91165", "91166"), partitionRows || (stryMutAct_9fa48("91167") ? ["Stryker was here"] : (stryCov_9fa48("91167"), [])))) {
            if (stryMutAct_9fa48("91168")) {
              {}
            } else {
              stryCov_9fa48("91168");
              await this.executeSql(MIGRATION_SQL.UPDATE_PARTITION_MIGRATION_BY_PK, stryMutAct_9fa48("91169") ? [] : (stryCov_9fa48("91169"), [MIGRATION_STATUS.COMPLETED, stryMutAct_9fa48("91172") ? row?.backfill_cursor && null : stryMutAct_9fa48("91171") ? false : stryMutAct_9fa48("91170") ? true : (stryCov_9fa48("91170", "91171", "91172"), (stryMutAct_9fa48("91173") ? row.backfill_cursor : (stryCov_9fa48("91173"), row?.backfill_cursor)) || null), normalizeInteger(stryMutAct_9fa48("91174") ? row.retry_count : (stryCov_9fa48("91174"), row?.retry_count), 0), null, updatedAt, migrationId, stryMutAct_9fa48("91175") ? row.partition_id : (stryCov_9fa48("91175"), row?.partition_id)]), stryMutAct_9fa48("91176") ? {} : (stryCov_9fa48("91176"), {
                sessionId
              }));
            }
          }
          await this.executeSql(stryMutAct_9fa48("91177") ? "" : (stryCov_9fa48("91177"), 'COMMIT'), stryMutAct_9fa48("91178") ? ["Stryker was here"] : (stryCov_9fa48("91178"), []), stryMutAct_9fa48("91179") ? {} : (stryCov_9fa48("91179"), {
            sessionId
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("91180")) {
          {}
        } else {
          stryCov_9fa48("91180");
          try {
            if (stryMutAct_9fa48("91181")) {
              {}
            } else {
              stryCov_9fa48("91181");
              await this.executeSql(stryMutAct_9fa48("91182") ? "" : (stryCov_9fa48("91182"), 'ROLLBACK'), stryMutAct_9fa48("91183") ? ["Stryker was here"] : (stryCov_9fa48("91183"), []), stryMutAct_9fa48("91184") ? {} : (stryCov_9fa48("91184"), {
                sessionId
              }), stryMutAct_9fa48("91185") ? false : (stryCov_9fa48("91185"), true));
            }
          } catch (_rollbackError) {
            // Intentionally ignored; rollback errors are secondary to cutover failure.
          }
          throw error;
        }
      }
    }
  }
  resolveRollbackSql(migrationRow) {
    if (stryMutAct_9fa48("91186")) {
      {}
    } else {
      stryCov_9fa48("91186");
      const alterSpec = this.resolveAlterSpecFromMigration(migrationRow);
      const tableName = quoteIdentifier(stryMutAct_9fa48("91189") ? migrationRow?.table_name && '' : stryMutAct_9fa48("91188") ? false : stryMutAct_9fa48("91187") ? true : (stryCov_9fa48("91187", "91188", "91189"), (stryMutAct_9fa48("91190") ? migrationRow.table_name : (stryCov_9fa48("91190"), migrationRow?.table_name)) || (stryMutAct_9fa48("91191") ? "Stryker was here!" : (stryCov_9fa48("91191"), ''))));
      const sourceSchema = parseJsonSafe(stryMutAct_9fa48("91192") ? migrationRow.source_schema : (stryCov_9fa48("91192"), migrationRow?.source_schema), {});
      if (stryMutAct_9fa48("91195") ? alterSpec?.migrationType !== MIGRATION_TYPE.ADD_COLUMN : stryMutAct_9fa48("91194") ? false : stryMutAct_9fa48("91193") ? true : (stryCov_9fa48("91193", "91194", "91195"), (stryMutAct_9fa48("91196") ? alterSpec.migrationType : (stryCov_9fa48("91196"), alterSpec?.migrationType)) === MIGRATION_TYPE.ADD_COLUMN)) {
        if (stryMutAct_9fa48("91197")) {
          {}
        } else {
          stryCov_9fa48("91197");
          const columnName = quoteIdentifier(stryMutAct_9fa48("91200") ? alterSpec?.columnName && '' : stryMutAct_9fa48("91199") ? false : stryMutAct_9fa48("91198") ? true : (stryCov_9fa48("91198", "91199", "91200"), (stryMutAct_9fa48("91201") ? alterSpec.columnName : (stryCov_9fa48("91201"), alterSpec?.columnName)) || (stryMutAct_9fa48("91202") ? "Stryker was here!" : (stryCov_9fa48("91202"), ''))));
          return stryMutAct_9fa48("91203") ? `` : (stryCov_9fa48("91203"), `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
        }
      }
      if (stryMutAct_9fa48("91206") ? alterSpec?.migrationType !== MIGRATION_TYPE.RENAME_COLUMN : stryMutAct_9fa48("91205") ? false : stryMutAct_9fa48("91204") ? true : (stryCov_9fa48("91204", "91205", "91206"), (stryMutAct_9fa48("91207") ? alterSpec.migrationType : (stryCov_9fa48("91207"), alterSpec?.migrationType)) === MIGRATION_TYPE.RENAME_COLUMN)) {
        if (stryMutAct_9fa48("91208")) {
          {}
        } else {
          stryCov_9fa48("91208");
          const fromColumn = quoteIdentifier(stryMutAct_9fa48("91211") ? alterSpec?.newColumnName && '' : stryMutAct_9fa48("91210") ? false : stryMutAct_9fa48("91209") ? true : (stryCov_9fa48("91209", "91210", "91211"), (stryMutAct_9fa48("91212") ? alterSpec.newColumnName : (stryCov_9fa48("91212"), alterSpec?.newColumnName)) || (stryMutAct_9fa48("91213") ? "Stryker was here!" : (stryCov_9fa48("91213"), ''))));
          const toColumn = quoteIdentifier(stryMutAct_9fa48("91216") ? alterSpec?.columnName && '' : stryMutAct_9fa48("91215") ? false : stryMutAct_9fa48("91214") ? true : (stryCov_9fa48("91214", "91215", "91216"), (stryMutAct_9fa48("91217") ? alterSpec.columnName : (stryCov_9fa48("91217"), alterSpec?.columnName)) || (stryMutAct_9fa48("91218") ? "Stryker was here!" : (stryCov_9fa48("91218"), ''))));
          return stryMutAct_9fa48("91219") ? `` : (stryCov_9fa48("91219"), `ALTER TABLE ${tableName} RENAME COLUMN ${fromColumn} TO ${toColumn}`);
        }
      }
      if (stryMutAct_9fa48("91222") ? alterSpec?.migrationType !== MIGRATION_TYPE.ALTER_COLUMN_TYPE : stryMutAct_9fa48("91221") ? false : stryMutAct_9fa48("91220") ? true : (stryCov_9fa48("91220", "91221", "91222"), (stryMutAct_9fa48("91223") ? alterSpec.migrationType : (stryCov_9fa48("91223"), alterSpec?.migrationType)) === MIGRATION_TYPE.ALTER_COLUMN_TYPE)) {
        if (stryMutAct_9fa48("91224")) {
          {}
        } else {
          stryCov_9fa48("91224");
          const sourceColumn = Array.isArray(stryMutAct_9fa48("91225") ? sourceSchema.columns : (stryCov_9fa48("91225"), sourceSchema?.columns)) ? sourceSchema.columns.find(stryMutAct_9fa48("91226") ? () => undefined : (stryCov_9fa48("91226"), column => stryMutAct_9fa48("91229") ? column.name !== alterSpec.columnName : stryMutAct_9fa48("91228") ? false : stryMutAct_9fa48("91227") ? true : (stryCov_9fa48("91227", "91228", "91229"), column.name === alterSpec.columnName))) : null;
          if (stryMutAct_9fa48("91232") ? !sourceColumn && !sourceColumn.type : stryMutAct_9fa48("91231") ? false : stryMutAct_9fa48("91230") ? true : (stryCov_9fa48("91230", "91231", "91232"), (stryMutAct_9fa48("91233") ? sourceColumn : (stryCov_9fa48("91233"), !sourceColumn)) || (stryMutAct_9fa48("91234") ? sourceColumn.type : (stryCov_9fa48("91234"), !sourceColumn.type)))) {
            if (stryMutAct_9fa48("91235")) {
              {}
            } else {
              stryCov_9fa48("91235");
              return null;
            }
          }
          const columnName = quoteIdentifier(stryMutAct_9fa48("91238") ? alterSpec?.columnName && '' : stryMutAct_9fa48("91237") ? false : stryMutAct_9fa48("91236") ? true : (stryCov_9fa48("91236", "91237", "91238"), (stryMutAct_9fa48("91239") ? alterSpec.columnName : (stryCov_9fa48("91239"), alterSpec?.columnName)) || (stryMutAct_9fa48("91240") ? "Stryker was here!" : (stryCov_9fa48("91240"), ''))));
          return stryMutAct_9fa48("91241") ? `` : (stryCov_9fa48("91241"), `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${sourceColumn.type}`);
        }
      }
      if (stryMutAct_9fa48("91244") ? alterSpec?.migrationType !== MIGRATION_TYPE.DROP_COLUMN : stryMutAct_9fa48("91243") ? false : stryMutAct_9fa48("91242") ? true : (stryCov_9fa48("91242", "91243", "91244"), (stryMutAct_9fa48("91245") ? alterSpec.migrationType : (stryCov_9fa48("91245"), alterSpec?.migrationType)) === MIGRATION_TYPE.DROP_COLUMN)) {
        if (stryMutAct_9fa48("91246")) {
          {}
        } else {
          stryCov_9fa48("91246");
          const sourceColumn = Array.isArray(stryMutAct_9fa48("91247") ? sourceSchema.columns : (stryCov_9fa48("91247"), sourceSchema?.columns)) ? sourceSchema.columns.find(stryMutAct_9fa48("91248") ? () => undefined : (stryCov_9fa48("91248"), column => stryMutAct_9fa48("91251") ? column.name !== alterSpec.columnName : stryMutAct_9fa48("91250") ? false : stryMutAct_9fa48("91249") ? true : (stryCov_9fa48("91249", "91250", "91251"), column.name === alterSpec.columnName))) : null;
          if (stryMutAct_9fa48("91254") ? !sourceColumn && !sourceColumn.type : stryMutAct_9fa48("91253") ? false : stryMutAct_9fa48("91252") ? true : (stryCov_9fa48("91252", "91253", "91254"), (stryMutAct_9fa48("91255") ? sourceColumn : (stryCov_9fa48("91255"), !sourceColumn)) || (stryMutAct_9fa48("91256") ? sourceColumn.type : (stryCov_9fa48("91256"), !sourceColumn.type)))) {
            if (stryMutAct_9fa48("91257")) {
              {}
            } else {
              stryCov_9fa48("91257");
              return null;
            }
          }
          const columnName = quoteIdentifier(sourceColumn.name);
          const dataType = String(sourceColumn.type);
          let sql = stryMutAct_9fa48("91258") ? `` : (stryCov_9fa48("91258"), `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${dataType}`);
          if (stryMutAct_9fa48("91261") ? sourceColumn.default !== undefined || sourceColumn.default !== null : stryMutAct_9fa48("91260") ? false : stryMutAct_9fa48("91259") ? true : (stryCov_9fa48("91259", "91260", "91261"), (stryMutAct_9fa48("91263") ? sourceColumn.default === undefined : stryMutAct_9fa48("91262") ? true : (stryCov_9fa48("91262", "91263"), sourceColumn.default !== undefined)) && (stryMutAct_9fa48("91265") ? sourceColumn.default === null : stryMutAct_9fa48("91264") ? true : (stryCov_9fa48("91264", "91265"), sourceColumn.default !== null)))) {
            if (stryMutAct_9fa48("91266")) {
              {}
            } else {
              stryCov_9fa48("91266");
              const defaultLiteral = resolveDefaultLiteral(sourceColumn.default);
              if (stryMutAct_9fa48("91269") ? typeof defaultLiteral !== 'number' : stryMutAct_9fa48("91268") ? false : stryMutAct_9fa48("91267") ? true : (stryCov_9fa48("91267", "91268", "91269"), typeof defaultLiteral === (stryMutAct_9fa48("91270") ? "" : (stryCov_9fa48("91270"), 'number')))) {
                if (stryMutAct_9fa48("91271")) {
                  {}
                } else {
                  stryCov_9fa48("91271");
                  sql += stryMutAct_9fa48("91272") ? `` : (stryCov_9fa48("91272"), ` DEFAULT ${defaultLiteral}`);
                }
              } else {
                if (stryMutAct_9fa48("91273")) {
                  {}
                } else {
                  stryCov_9fa48("91273");
                  const escaped = String(defaultLiteral).replaceAll(stryMutAct_9fa48("91274") ? "" : (stryCov_9fa48("91274"), '\''), stryMutAct_9fa48("91275") ? "" : (stryCov_9fa48("91275"), '\'\''));
                  sql += stryMutAct_9fa48("91276") ? `` : (stryCov_9fa48("91276"), ` DEFAULT '${escaped}'`);
                }
              }
            }
          }
          return sql;
        }
      }
      return null;
    }
  }
  resolveBackfillUpdateSql(migrationRow) {
    if (stryMutAct_9fa48("91277")) {
      {}
    } else {
      stryCov_9fa48("91277");
      const alterSpec = this.resolveAlterSpecFromMigration(migrationRow);
      if (stryMutAct_9fa48("91280") ? alterSpec?.migrationType === MIGRATION_TYPE.ADD_COLUMN : stryMutAct_9fa48("91279") ? false : stryMutAct_9fa48("91278") ? true : (stryCov_9fa48("91278", "91279", "91280"), (stryMutAct_9fa48("91281") ? alterSpec.migrationType : (stryCov_9fa48("91281"), alterSpec?.migrationType)) !== MIGRATION_TYPE.ADD_COLUMN)) {
        if (stryMutAct_9fa48("91282")) {
          {}
        } else {
          stryCov_9fa48("91282");
          return null;
        }
      }
      const tableName = quoteIdentifier(stryMutAct_9fa48("91285") ? migrationRow?.table_name && '' : stryMutAct_9fa48("91284") ? false : stryMutAct_9fa48("91283") ? true : (stryCov_9fa48("91283", "91284", "91285"), (stryMutAct_9fa48("91286") ? migrationRow.table_name : (stryCov_9fa48("91286"), migrationRow?.table_name)) || (stryMutAct_9fa48("91287") ? "Stryker was here!" : (stryCov_9fa48("91287"), ''))));
      const columnName = quoteIdentifier(stryMutAct_9fa48("91290") ? alterSpec?.columnName && '' : stryMutAct_9fa48("91289") ? false : stryMutAct_9fa48("91288") ? true : (stryCov_9fa48("91288", "91289", "91290"), (stryMutAct_9fa48("91291") ? alterSpec.columnName : (stryCov_9fa48("91291"), alterSpec?.columnName)) || (stryMutAct_9fa48("91292") ? "Stryker was here!" : (stryCov_9fa48("91292"), ''))));
      const params = stryMutAct_9fa48("91293") ? ["Stryker was here"] : (stryCov_9fa48("91293"), []);
      const defaultValue = resolveDefaultLiteral(stryMutAct_9fa48("91294") ? alterSpec.defaultValue : (stryCov_9fa48("91294"), alterSpec?.defaultValue));
      if (stryMutAct_9fa48("91297") ? defaultValue !== null || defaultValue !== undefined : stryMutAct_9fa48("91296") ? false : stryMutAct_9fa48("91295") ? true : (stryCov_9fa48("91295", "91296", "91297"), (stryMutAct_9fa48("91299") ? defaultValue === null : stryMutAct_9fa48("91298") ? true : (stryCov_9fa48("91298", "91299"), defaultValue !== null)) && (stryMutAct_9fa48("91301") ? defaultValue === undefined : stryMutAct_9fa48("91300") ? true : (stryCov_9fa48("91300", "91301"), defaultValue !== undefined)))) {
        if (stryMutAct_9fa48("91302")) {
          {}
        } else {
          stryCov_9fa48("91302");
          params.push(defaultValue);
          return stryMutAct_9fa48("91303") ? {} : (stryCov_9fa48("91303"), {
            sql: (stryMutAct_9fa48("91304") ? `` : (stryCov_9fa48("91304"), `UPDATE ${tableName} `)) + (stryMutAct_9fa48("91305") ? `` : (stryCov_9fa48("91305"), `SET ${columnName} = COALESCE(${columnName}, ?) `)) + (stryMutAct_9fa48("91306") ? "" : (stryCov_9fa48("91306"), 'WHERE rowid > ? AND rowid <= ?')),
            params
          });
        }
      }
      return stryMutAct_9fa48("91307") ? {} : (stryCov_9fa48("91307"), {
        sql: (stryMutAct_9fa48("91308") ? `` : (stryCov_9fa48("91308"), `UPDATE ${tableName} `)) + (stryMutAct_9fa48("91309") ? `` : (stryCov_9fa48("91309"), `SET ${columnName} = NULL `)) + (stryMutAct_9fa48("91310") ? `` : (stryCov_9fa48("91310"), `WHERE ${columnName} IS NULL AND rowid > ? AND rowid <= ?`)),
        params
      });
    }
  }
}
export { MIGRATION_STAGE_REASON, MIGRATION_SQL, MigrationCoordinator, formatBackfillCursor, normalizeInteger, parseBackfillCursor, parseJsonSafe, quoteIdentifier, resolveDefaultLiteral, resolvePartitionIdList, sleep };