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
import { QUERY_AST_TYPE, QUERY_OPERATION } from '../query/query-constants.js';
import { MIGRATION_ERROR_MSG, MIGRATION_STATUS, MIGRATION_TYPE } from './migration-constants.js';
const ALTER_ACTION = Object.freeze(stryMutAct_9fa48("91311") ? {} : (stryCov_9fa48("91311"), {
  ADD: stryMutAct_9fa48("91312") ? "" : (stryCov_9fa48("91312"), 'add'),
  DROP: stryMutAct_9fa48("91313") ? "" : (stryCov_9fa48("91313"), 'drop'),
  RENAME: stryMutAct_9fa48("91314") ? "" : (stryCov_9fa48("91314"), 'rename'),
  ALTER: stryMutAct_9fa48("91315") ? "" : (stryCov_9fa48("91315"), 'alter')
}));
const MIGRATION_PIPELINE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("91316") ? {} : (stryCov_9fa48("91316"), {
  MIGRATION_COORDINATOR_REQUIRED: stryMutAct_9fa48("91317") ? "" : (stryCov_9fa48("91317"), 'MigrationPipeline requires migrationCoordinator'),
  INVALID_ALTER_TABLE_AST: stryMutAct_9fa48("91318") ? "" : (stryCov_9fa48("91318"), 'Invalid ALTER TABLE AST'),
  ALTER_TABLE_TARGET_REQUIRED: stryMutAct_9fa48("91319") ? "" : (stryCov_9fa48("91319"), 'ALTER TABLE target table is required'),
  UNSUPPORTED_ALTER_RESOURCE_PREFIX: stryMutAct_9fa48("91320") ? "" : (stryCov_9fa48("91320"), 'Unsupported ALTER TABLE resource: '),
  COLUMN_NAME_REQUIRED: stryMutAct_9fa48("91321") ? "" : (stryCov_9fa48("91321"), 'ALTER TABLE column name is required'),
  NEW_COLUMN_NAME_REQUIRED: stryMutAct_9fa48("91322") ? "" : (stryCov_9fa48("91322"), 'ALTER TABLE new column name is required'),
  DATA_TYPE_REQUIRED: stryMutAct_9fa48("91323") ? "" : (stryCov_9fa48("91323"), 'ALTER TABLE data type is required'),
  TABLE_NOT_FOUND_PREFIX: stryMutAct_9fa48("91324") ? "" : (stryCov_9fa48("91324"), 'Table not found for ALTER TABLE: ')
}));
class MigrationPipeline {
  constructor(options = {}) {
    if (stryMutAct_9fa48("91325")) {
      {}
    } else {
      stryCov_9fa48("91325");
      this.migrationCoordinator = stryMutAct_9fa48("91328") ? options.migrationCoordinator && null : stryMutAct_9fa48("91327") ? false : stryMutAct_9fa48("91326") ? true : (stryCov_9fa48("91326", "91327", "91328"), options.migrationCoordinator || null);
      if (stryMutAct_9fa48("91331") ? false : stryMutAct_9fa48("91330") ? true : stryMutAct_9fa48("91329") ? this.migrationCoordinator : (stryCov_9fa48("91329", "91330", "91331"), !this.migrationCoordinator)) {
        if (stryMutAct_9fa48("91332")) {
          {}
        } else {
          stryCov_9fa48("91332");
          throw new Error(MIGRATION_PIPELINE_ERROR_MSG.MIGRATION_COORDINATOR_REQUIRED);
        }
      }
      this.logger = stryMutAct_9fa48("91335") ? options.logger && console : stryMutAct_9fa48("91334") ? false : stryMutAct_9fa48("91333") ? true : (stryCov_9fa48("91333", "91334", "91335"), options.logger || console);
    }
  }
  resolveMigrationType(operation = {}) {
    if (stryMutAct_9fa48("91336")) {
      {}
    } else {
      stryCov_9fa48("91336");
      const action = stryMutAct_9fa48("91337") ? String(operation.action || '').toUpperCase() : (stryCov_9fa48("91337"), String(stryMutAct_9fa48("91340") ? operation.action && '' : stryMutAct_9fa48("91339") ? false : stryMutAct_9fa48("91338") ? true : (stryCov_9fa48("91338", "91339", "91340"), operation.action || (stryMutAct_9fa48("91341") ? "Stryker was here!" : (stryCov_9fa48("91341"), '')))).toLowerCase());
      if (stryMutAct_9fa48("91344") ? action !== ALTER_ACTION.ADD : stryMutAct_9fa48("91343") ? false : stryMutAct_9fa48("91342") ? true : (stryCov_9fa48("91342", "91343", "91344"), action === ALTER_ACTION.ADD)) {
        if (stryMutAct_9fa48("91345")) {
          {}
        } else {
          stryCov_9fa48("91345");
          return MIGRATION_TYPE.ADD_COLUMN;
        }
      }
      if (stryMutAct_9fa48("91348") ? action !== ALTER_ACTION.DROP : stryMutAct_9fa48("91347") ? false : stryMutAct_9fa48("91346") ? true : (stryCov_9fa48("91346", "91347", "91348"), action === ALTER_ACTION.DROP)) {
        if (stryMutAct_9fa48("91349")) {
          {}
        } else {
          stryCov_9fa48("91349");
          return MIGRATION_TYPE.DROP_COLUMN;
        }
      }
      if (stryMutAct_9fa48("91352") ? action !== ALTER_ACTION.RENAME : stryMutAct_9fa48("91351") ? false : stryMutAct_9fa48("91350") ? true : (stryCov_9fa48("91350", "91351", "91352"), action === ALTER_ACTION.RENAME)) {
        if (stryMutAct_9fa48("91353")) {
          {}
        } else {
          stryCov_9fa48("91353");
          return MIGRATION_TYPE.RENAME_COLUMN;
        }
      }
      if (stryMutAct_9fa48("91356") ? action !== ALTER_ACTION.ALTER : stryMutAct_9fa48("91355") ? false : stryMutAct_9fa48("91354") ? true : (stryCov_9fa48("91354", "91355", "91356"), action === ALTER_ACTION.ALTER)) {
        if (stryMutAct_9fa48("91357")) {
          {}
        } else {
          stryCov_9fa48("91357");
          return MIGRATION_TYPE.ALTER_COLUMN_TYPE;
        }
      }
      return null;
    }
  }
  buildAlterSpec(ast) {
    if (stryMutAct_9fa48("91358")) {
      {}
    } else {
      stryCov_9fa48("91358");
      if (stryMutAct_9fa48("91361") ? (!ast || ast.type !== QUERY_AST_TYPE.ALTER_TABLE) && !ast.operation : stryMutAct_9fa48("91360") ? false : stryMutAct_9fa48("91359") ? true : (stryCov_9fa48("91359", "91360", "91361"), (stryMutAct_9fa48("91363") ? !ast && ast.type !== QUERY_AST_TYPE.ALTER_TABLE : stryMutAct_9fa48("91362") ? false : (stryCov_9fa48("91362", "91363"), (stryMutAct_9fa48("91364") ? ast : (stryCov_9fa48("91364"), !ast)) || (stryMutAct_9fa48("91366") ? ast.type === QUERY_AST_TYPE.ALTER_TABLE : stryMutAct_9fa48("91365") ? false : (stryCov_9fa48("91365", "91366"), ast.type !== QUERY_AST_TYPE.ALTER_TABLE)))) || (stryMutAct_9fa48("91367") ? ast.operation : (stryCov_9fa48("91367"), !ast.operation)))) {
        if (stryMutAct_9fa48("91368")) {
          {}
        } else {
          stryCov_9fa48("91368");
          throw new Error(MIGRATION_PIPELINE_ERROR_MSG.INVALID_ALTER_TABLE_AST);
        }
      }
      const tableName = stryMutAct_9fa48("91369") ? String(ast.table || '') : (stryCov_9fa48("91369"), String(stryMutAct_9fa48("91372") ? ast.table && '' : stryMutAct_9fa48("91371") ? false : stryMutAct_9fa48("91370") ? true : (stryCov_9fa48("91370", "91371", "91372"), ast.table || (stryMutAct_9fa48("91373") ? "Stryker was here!" : (stryCov_9fa48("91373"), '')))).trim());
      if (stryMutAct_9fa48("91376") ? false : stryMutAct_9fa48("91375") ? true : stryMutAct_9fa48("91374") ? tableName : (stryCov_9fa48("91374", "91375", "91376"), !tableName)) {
        if (stryMutAct_9fa48("91377")) {
          {}
        } else {
          stryCov_9fa48("91377");
          throw new Error(MIGRATION_PIPELINE_ERROR_MSG.ALTER_TABLE_TARGET_REQUIRED);
        }
      }
      const operationResource = stryMutAct_9fa48("91378") ? String(ast.operation.resource || '').toUpperCase() : (stryCov_9fa48("91378"), String(stryMutAct_9fa48("91381") ? ast.operation.resource && '' : stryMutAct_9fa48("91380") ? false : stryMutAct_9fa48("91379") ? true : (stryCov_9fa48("91379", "91380", "91381"), ast.operation.resource || (stryMutAct_9fa48("91382") ? "Stryker was here!" : (stryCov_9fa48("91382"), '')))).toLowerCase());
      if (stryMutAct_9fa48("91385") ? operationResource || operationResource !== 'column' : stryMutAct_9fa48("91384") ? false : stryMutAct_9fa48("91383") ? true : (stryCov_9fa48("91383", "91384", "91385"), operationResource && (stryMutAct_9fa48("91387") ? operationResource === 'column' : stryMutAct_9fa48("91386") ? true : (stryCov_9fa48("91386", "91387"), operationResource !== (stryMutAct_9fa48("91388") ? "" : (stryCov_9fa48("91388"), 'column')))))) {
        if (stryMutAct_9fa48("91389")) {
          {}
        } else {
          stryCov_9fa48("91389");
          throw new Error((stryMutAct_9fa48("91390") ? `` : (stryCov_9fa48("91390"), `${MIGRATION_PIPELINE_ERROR_MSG.UNSUPPORTED_ALTER_RESOURCE_PREFIX}`)) + (stryMutAct_9fa48("91391") ? `` : (stryCov_9fa48("91391"), `${operationResource}`)));
        }
      }
      const migrationType = this.resolveMigrationType(ast.operation);
      if (stryMutAct_9fa48("91394") ? !migrationType && !Object.values(MIGRATION_TYPE).includes(migrationType) : stryMutAct_9fa48("91393") ? false : stryMutAct_9fa48("91392") ? true : (stryCov_9fa48("91392", "91393", "91394"), (stryMutAct_9fa48("91395") ? migrationType : (stryCov_9fa48("91395"), !migrationType)) || (stryMutAct_9fa48("91396") ? Object.values(MIGRATION_TYPE).includes(migrationType) : (stryCov_9fa48("91396"), !Object.values(MIGRATION_TYPE).includes(migrationType))))) {
        if (stryMutAct_9fa48("91397")) {
          {}
        } else {
          stryCov_9fa48("91397");
          throw new Error(stryMutAct_9fa48("91398") ? `` : (stryCov_9fa48("91398"), `${MIGRATION_ERROR_MSG.UNSUPPORTED_MIGRATION_TYPE_PREFIX}${ast.operation.action}`));
        }
      }
      const baseSpec = stryMutAct_9fa48("91399") ? {} : (stryCov_9fa48("91399"), {
        migrationType,
        sql: stryMutAct_9fa48("91400") ? String(ast.rawSql || '') : (stryCov_9fa48("91400"), String(stryMutAct_9fa48("91403") ? ast.rawSql && '' : stryMutAct_9fa48("91402") ? false : stryMutAct_9fa48("91401") ? true : (stryCov_9fa48("91401", "91402", "91403"), ast.rawSql || (stryMutAct_9fa48("91404") ? "Stryker was here!" : (stryCov_9fa48("91404"), '')))).trim())
      });
      const columnName = stryMutAct_9fa48("91405") ? String(ast.operation.columnName || '') : (stryCov_9fa48("91405"), String(stryMutAct_9fa48("91408") ? ast.operation.columnName && '' : stryMutAct_9fa48("91407") ? false : stryMutAct_9fa48("91406") ? true : (stryCov_9fa48("91406", "91407", "91408"), ast.operation.columnName || (stryMutAct_9fa48("91409") ? "Stryker was here!" : (stryCov_9fa48("91409"), '')))).trim());
      const dataType = stryMutAct_9fa48("91412") ? ast.operation.dataType && null : stryMutAct_9fa48("91411") ? false : stryMutAct_9fa48("91410") ? true : (stryCov_9fa48("91410", "91411", "91412"), ast.operation.dataType || null);
      if (stryMutAct_9fa48("91415") ? migrationType !== MIGRATION_TYPE.ADD_COLUMN : stryMutAct_9fa48("91414") ? false : stryMutAct_9fa48("91413") ? true : (stryCov_9fa48("91413", "91414", "91415"), migrationType === MIGRATION_TYPE.ADD_COLUMN)) {
        if (stryMutAct_9fa48("91416")) {
          {}
        } else {
          stryCov_9fa48("91416");
          if (stryMutAct_9fa48("91419") ? false : stryMutAct_9fa48("91418") ? true : stryMutAct_9fa48("91417") ? columnName : (stryCov_9fa48("91417", "91418", "91419"), !columnName)) {
            if (stryMutAct_9fa48("91420")) {
              {}
            } else {
              stryCov_9fa48("91420");
              throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
            }
          }
          if (stryMutAct_9fa48("91423") ? false : stryMutAct_9fa48("91422") ? true : stryMutAct_9fa48("91421") ? dataType : (stryCov_9fa48("91421", "91422", "91423"), !dataType)) {
            if (stryMutAct_9fa48("91424")) {
              {}
            } else {
              stryCov_9fa48("91424");
              throw new Error(MIGRATION_PIPELINE_ERROR_MSG.DATA_TYPE_REQUIRED);
            }
          }
          return stryMutAct_9fa48("91425") ? {} : (stryCov_9fa48("91425"), {
            ...baseSpec,
            columnName,
            dataType,
            defaultValue: stryMutAct_9fa48("91426") ? ast.operation.defaultValue && null : (stryCov_9fa48("91426"), ast.operation.defaultValue ?? null)
          });
        }
      }
      if (stryMutAct_9fa48("91429") ? migrationType !== MIGRATION_TYPE.DROP_COLUMN : stryMutAct_9fa48("91428") ? false : stryMutAct_9fa48("91427") ? true : (stryCov_9fa48("91427", "91428", "91429"), migrationType === MIGRATION_TYPE.DROP_COLUMN)) {
        if (stryMutAct_9fa48("91430")) {
          {}
        } else {
          stryCov_9fa48("91430");
          if (stryMutAct_9fa48("91433") ? false : stryMutAct_9fa48("91432") ? true : stryMutAct_9fa48("91431") ? columnName : (stryCov_9fa48("91431", "91432", "91433"), !columnName)) {
            if (stryMutAct_9fa48("91434")) {
              {}
            } else {
              stryCov_9fa48("91434");
              throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
            }
          }
          return stryMutAct_9fa48("91435") ? {} : (stryCov_9fa48("91435"), {
            ...baseSpec,
            columnName
          });
        }
      }
      if (stryMutAct_9fa48("91438") ? migrationType !== MIGRATION_TYPE.RENAME_COLUMN : stryMutAct_9fa48("91437") ? false : stryMutAct_9fa48("91436") ? true : (stryCov_9fa48("91436", "91437", "91438"), migrationType === MIGRATION_TYPE.RENAME_COLUMN)) {
        if (stryMutAct_9fa48("91439")) {
          {}
        } else {
          stryCov_9fa48("91439");
          const newColumnName = stryMutAct_9fa48("91440") ? String(ast.operation.newColumnName || '') : (stryCov_9fa48("91440"), String(stryMutAct_9fa48("91443") ? ast.operation.newColumnName && '' : stryMutAct_9fa48("91442") ? false : stryMutAct_9fa48("91441") ? true : (stryCov_9fa48("91441", "91442", "91443"), ast.operation.newColumnName || (stryMutAct_9fa48("91444") ? "Stryker was here!" : (stryCov_9fa48("91444"), '')))).trim());
          if (stryMutAct_9fa48("91447") ? false : stryMutAct_9fa48("91446") ? true : stryMutAct_9fa48("91445") ? columnName : (stryCov_9fa48("91445", "91446", "91447"), !columnName)) {
            if (stryMutAct_9fa48("91448")) {
              {}
            } else {
              stryCov_9fa48("91448");
              throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
            }
          }
          if (stryMutAct_9fa48("91451") ? false : stryMutAct_9fa48("91450") ? true : stryMutAct_9fa48("91449") ? newColumnName : (stryCov_9fa48("91449", "91450", "91451"), !newColumnName)) {
            if (stryMutAct_9fa48("91452")) {
              {}
            } else {
              stryCov_9fa48("91452");
              throw new Error(MIGRATION_PIPELINE_ERROR_MSG.NEW_COLUMN_NAME_REQUIRED);
            }
          }
          return stryMutAct_9fa48("91453") ? {} : (stryCov_9fa48("91453"), {
            ...baseSpec,
            columnName,
            newColumnName
          });
        }
      }
      if (stryMutAct_9fa48("91456") ? false : stryMutAct_9fa48("91455") ? true : stryMutAct_9fa48("91454") ? columnName : (stryCov_9fa48("91454", "91455", "91456"), !columnName)) {
        if (stryMutAct_9fa48("91457")) {
          {}
        } else {
          stryCov_9fa48("91457");
          throw new Error(MIGRATION_PIPELINE_ERROR_MSG.COLUMN_NAME_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("91460") ? false : stryMutAct_9fa48("91459") ? true : stryMutAct_9fa48("91458") ? dataType : (stryCov_9fa48("91458", "91459", "91460"), !dataType)) {
        if (stryMutAct_9fa48("91461")) {
          {}
        } else {
          stryCov_9fa48("91461");
          throw new Error(MIGRATION_PIPELINE_ERROR_MSG.DATA_TYPE_REQUIRED);
        }
      }
      return stryMutAct_9fa48("91462") ? {} : (stryCov_9fa48("91462"), {
        ...baseSpec,
        columnName,
        dataType
      });
    }
  }
  async handleAlterTable(ast, sessionId = null) {
    if (stryMutAct_9fa48("91463")) {
      {}
    } else {
      stryCov_9fa48("91463");
      const alterSpec = this.buildAlterSpec(ast);
      const tableRef = stryMutAct_9fa48("91464") ? String(ast.table || '') : (stryCov_9fa48("91464"), String(stryMutAct_9fa48("91467") ? ast.table && '' : stryMutAct_9fa48("91466") ? false : stryMutAct_9fa48("91465") ? true : (stryCov_9fa48("91465", "91466", "91467"), ast.table || (stryMutAct_9fa48("91468") ? "Stryker was here!" : (stryCov_9fa48("91468"), '')))).trim());
      const tableMetadata = await this.migrationCoordinator.resolveTableMetadata(tableRef);
      if (stryMutAct_9fa48("91471") ? false : stryMutAct_9fa48("91470") ? true : stryMutAct_9fa48("91469") ? tableMetadata : (stryCov_9fa48("91469", "91470", "91471"), !tableMetadata)) {
        if (stryMutAct_9fa48("91472")) {
          {}
        } else {
          stryCov_9fa48("91472");
          throw new Error(stryMutAct_9fa48("91473") ? `` : (stryCov_9fa48("91473"), `${MIGRATION_PIPELINE_ERROR_MSG.TABLE_NOT_FOUND_PREFIX}${tableRef}`));
        }
      }
      const activeMigration = await this.migrationCoordinator.findActiveMigrationByTableId(tableMetadata.table_id);
      if (stryMutAct_9fa48("91475") ? false : stryMutAct_9fa48("91474") ? true : (stryCov_9fa48("91474", "91475"), activeMigration)) {
        if (stryMutAct_9fa48("91476")) {
          {}
        } else {
          stryCov_9fa48("91476");
          throw new Error((stryMutAct_9fa48("91477") ? `` : (stryCov_9fa48("91477"), `${MIGRATION_ERROR_MSG.ACTIVE_MIGRATION_CONFLICT_PREFIX}`)) + (stryMutAct_9fa48("91478") ? `` : (stryCov_9fa48("91478"), `${activeMigration.migration_id}`)));
        }
      }
      const migrationId = await this.migrationCoordinator.initiateMigration(tableMetadata.table_id, alterSpec);
      return stryMutAct_9fa48("91479") ? {} : (stryCov_9fa48("91479"), {
        success: stryMutAct_9fa48("91480") ? false : (stryCov_9fa48("91480"), true),
        operation: QUERY_OPERATION.ALTER_TABLE,
        migrationId,
        tableId: tableMetadata.table_id,
        tableName: tableMetadata.table_name,
        status: MIGRATION_STATUS.PENDING,
        sessionId
      });
    }
  }
}
export { MigrationPipeline, MIGRATION_PIPELINE_ERROR_MSG };