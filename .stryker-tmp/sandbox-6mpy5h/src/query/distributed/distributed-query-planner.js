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
import { NUM, TYPEOF } from '../../constants/index.js';
import { QUERY_AST_NODE, QUERY_AST_TYPE, QUERY_JOIN_TYPE, QUERY_OPERATOR } from '../query-constants.js';
import { DISTRIBUTED_EXECUTION_POLICY, DISTRIBUTED_JOIN_STRATEGY, DISTRIBUTED_PLAN_FIELD as PLAN_FIELD, DISTRIBUTED_PLANNER_DEFAULT, DISTRIBUTED_PREDICATE_SHAPE, DISTRIBUTED_ROLE_HINT, DISTRIBUTED_STATEMENT_TYPE } from './distributed-query-plan-constants.js';
const PLAN_HASH = Object.freeze(stryMutAct_9fa48("110257") ? {} : (stryCov_9fa48("110257"), {
  SHA1: stryMutAct_9fa48("110258") ? "" : (stryCov_9fa48("110258"), 'sha1'),
  HEX: stryMutAct_9fa48("110259") ? "" : (stryCov_9fa48("110259"), 'hex'),
  PREFIX: stryMutAct_9fa48("110260") ? "" : (stryCov_9fa48("110260"), 'dqp-'),
  LENGTH: NUM.SIXTEEN
}));

/**
 * Canonical planner for distributed SQL plans.
 * Owns query-table graph extraction, per-table partition planning,
 * join strategy selection, and diagnostics envelope construction.
 */
class DistributedQueryPlanner {
  /**
   * @param {Object} options
   * @param {Object} options.partitionResolver
   * @param {Function} options.getTablePartitions
   * @param {Function} [options.getTableInfo]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("110261")) {
      {}
    } else {
      stryCov_9fa48("110261");
      this.partitionResolver = stryMutAct_9fa48("110264") ? options.partitionResolver && null : stryMutAct_9fa48("110263") ? false : stryMutAct_9fa48("110262") ? true : (stryCov_9fa48("110262", "110263", "110264"), options.partitionResolver || null);
      this.getTablePartitions = stryMutAct_9fa48("110267") ? options.getTablePartitions && (() => []) : stryMutAct_9fa48("110266") ? false : stryMutAct_9fa48("110265") ? true : (stryCov_9fa48("110265", "110266", "110267"), options.getTablePartitions || (stryMutAct_9fa48("110268") ? () => undefined : (stryCov_9fa48("110268"), () => stryMutAct_9fa48("110269") ? ["Stryker was here"] : (stryCov_9fa48("110269"), []))));
      this.getTableInfo = stryMutAct_9fa48("110272") ? options.getTableInfo && (() => null) : stryMutAct_9fa48("110271") ? false : stryMutAct_9fa48("110270") ? true : (stryCov_9fa48("110270", "110271", "110272"), options.getTableInfo || (stryMutAct_9fa48("110273") ? () => undefined : (stryCov_9fa48("110273"), () => null)));
    }
  }

  /**
   * Build a canonical distributed query plan for a statement AST.
   * @param {Object} ast - Parsed statement AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Planning options.
   * @return {Object} Distributed plan object.
   */
  planStatement(ast, params = stryMutAct_9fa48("110274") ? ["Stryker was here"] : (stryCov_9fa48("110274"), []), options = {}) {
    if (stryMutAct_9fa48("110275")) {
      {}
    } else {
      stryCov_9fa48("110275");
      switch (ast.type) {
        case QUERY_AST_TYPE.SELECT:
          if (stryMutAct_9fa48("110276")) {} else {
            stryCov_9fa48("110276");
            return this.planSelect(ast, params, options);
          }
        case QUERY_AST_TYPE.INSERT:
          if (stryMutAct_9fa48("110277")) {} else {
            stryCov_9fa48("110277");
            return this.planInsert(ast, params, options);
          }
        case QUERY_AST_TYPE.UPDATE:
          if (stryMutAct_9fa48("110278")) {} else {
            stryCov_9fa48("110278");
            return this.planUpdate(ast, params, options);
          }
        case QUERY_AST_TYPE.DELETE:
          if (stryMutAct_9fa48("110279")) {} else {
            stryCov_9fa48("110279");
            return this.planDelete(ast, params, options);
          }
        default:
          if (stryMutAct_9fa48("110280")) {} else {
            stryCov_9fa48("110280");
            return null;
          }
      }
    }
  }

  /**
   * Plan a distributed SELECT statement.
   * @param {Object} ast - SELECT AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} options - Planning options.
   * @return {Object} Distributed query plan.
   */
  planSelect(ast, params = stryMutAct_9fa48("110281") ? ["Stryker was here"] : (stryCov_9fa48("110281"), []), options = {}) {
    if (stryMutAct_9fa48("110282")) {
      {}
    } else {
      stryCov_9fa48("110282");
      const tableGraph = this.extractTableGraph(ast);
      const tablePlans = this.buildTablePlans(tableGraph, ast, params);
      const joinPlan = this.buildJoinPlan(ast, tablePlans);
      const fragmentPlans = this.buildReadFragmentPlans(tablePlans, ast, params);
      const mergePlan = this.buildMergePlan(ast);
      const diagnostics = this.buildDiagnostics(tableGraph, tablePlans, joinPlan, options);
      const planId = this.createDeterministicPlanId(DISTRIBUTED_STATEMENT_TYPE.SELECT, ast, params, tablePlans, joinPlan);
      return stryMutAct_9fa48("110283") ? {} : (stryCov_9fa48("110283"), {
        [PLAN_FIELD.PLAN_ID]: planId,
        [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.SELECT,
        [PLAN_FIELD.TABLE_PLANS]: tablePlans,
        [PLAN_FIELD.JOIN_PLAN]: joinPlan,
        [PLAN_FIELD.SET_OPERATION_PLAN]: stryMutAct_9fa48("110286") ? ast.setOperation && null : stryMutAct_9fa48("110285") ? false : stryMutAct_9fa48("110284") ? true : (stryCov_9fa48("110284", "110285", "110286"), ast.setOperation || null),
        [PLAN_FIELD.FRAGMENT_PLANS]: fragmentPlans,
        [PLAN_FIELD.MERGE_PLAN]: mergePlan,
        [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.READ_FAIL_CLOSED,
        [PLAN_FIELD.DIAGNOSTICS]: diagnostics
      });
    }
  }

  /**
   * Plan a distributed INSERT statement.
   * @param {Object} ast - INSERT AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planInsert(ast, params = stryMutAct_9fa48("110287") ? ["Stryker was here"] : (stryCov_9fa48("110287"), []), _options = {}) {
    if (stryMutAct_9fa48("110288")) {
      {}
    } else {
      stryCov_9fa48("110288");
      const tableAlias = ast.table;
      const tableGraph = stryMutAct_9fa48("110289") ? [] : (stryCov_9fa48("110289"), [stryMutAct_9fa48("110290") ? {} : (stryCov_9fa48("110290"), {
        tableName: ast.table,
        tableAlias,
        joinType: null
      })]);
      const tablePlans = this.buildTablePlans(tableGraph, null, params);
      const planId = this.createDeterministicPlanId(DISTRIBUTED_STATEMENT_TYPE.INSERT, ast, params, tablePlans, null);
      return stryMutAct_9fa48("110291") ? {} : (stryCov_9fa48("110291"), {
        [PLAN_FIELD.PLAN_ID]: planId,
        [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.INSERT,
        [PLAN_FIELD.TABLE_PLANS]: tablePlans,
        [PLAN_FIELD.JOIN_PLAN]: null,
        [PLAN_FIELD.SET_OPERATION_PLAN]: null,
        [PLAN_FIELD.FRAGMENT_PLANS]: stryMutAct_9fa48("110292") ? ["Stryker was here"] : (stryCov_9fa48("110292"), []),
        [PLAN_FIELD.MERGE_PLAN]: null,
        [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.WRITE_FAIL_CLOSED,
        [PLAN_FIELD.DIAGNOSTICS]: this.buildDiagnostics(tableGraph, tablePlans, null, {})
      });
    }
  }

  /**
   * Plan a distributed UPDATE statement.
   * @param {Object} ast - UPDATE AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planUpdate(ast, params = stryMutAct_9fa48("110293") ? ["Stryker was here"] : (stryCov_9fa48("110293"), []), _options = {}) {
    if (stryMutAct_9fa48("110294")) {
      {}
    } else {
      stryCov_9fa48("110294");
      const tableAlias = ast.table;
      const tableGraph = stryMutAct_9fa48("110295") ? [] : (stryCov_9fa48("110295"), [stryMutAct_9fa48("110296") ? {} : (stryCov_9fa48("110296"), {
        tableName: ast.table,
        tableAlias,
        joinType: null
      })]);
      const tablePlans = this.buildTablePlans(tableGraph, stryMutAct_9fa48("110297") ? {} : (stryCov_9fa48("110297"), {
        where: ast.where,
        columns: null,
        joins: stryMutAct_9fa48("110298") ? ["Stryker was here"] : (stryCov_9fa48("110298"), [])
      }), params);
      const planId = this.createDeterministicPlanId(DISTRIBUTED_STATEMENT_TYPE.UPDATE, ast, params, tablePlans, null);
      return stryMutAct_9fa48("110299") ? {} : (stryCov_9fa48("110299"), {
        [PLAN_FIELD.PLAN_ID]: planId,
        [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.UPDATE,
        [PLAN_FIELD.TABLE_PLANS]: tablePlans,
        [PLAN_FIELD.JOIN_PLAN]: null,
        [PLAN_FIELD.SET_OPERATION_PLAN]: null,
        [PLAN_FIELD.FRAGMENT_PLANS]: stryMutAct_9fa48("110300") ? ["Stryker was here"] : (stryCov_9fa48("110300"), []),
        [PLAN_FIELD.MERGE_PLAN]: null,
        [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.WRITE_FAIL_CLOSED,
        [PLAN_FIELD.DIAGNOSTICS]: this.buildDiagnostics(tableGraph, tablePlans, null, {})
      });
    }
  }

  /**
   * Plan a distributed DELETE statement.
   * @param {Object} ast - DELETE AST.
   * @param {Array} params - Bound parameters.
   * @param {Object} _options - Planning options.
   * @return {Object} Distributed write plan.
   */
  planDelete(ast, params = stryMutAct_9fa48("110301") ? ["Stryker was here"] : (stryCov_9fa48("110301"), []), _options = {}) {
    if (stryMutAct_9fa48("110302")) {
      {}
    } else {
      stryCov_9fa48("110302");
      const tableAlias = ast.table;
      const tableGraph = stryMutAct_9fa48("110303") ? [] : (stryCov_9fa48("110303"), [stryMutAct_9fa48("110304") ? {} : (stryCov_9fa48("110304"), {
        tableName: ast.table,
        tableAlias,
        joinType: null
      })]);
      const tablePlans = this.buildTablePlans(tableGraph, stryMutAct_9fa48("110305") ? {} : (stryCov_9fa48("110305"), {
        where: ast.where,
        columns: null,
        joins: stryMutAct_9fa48("110306") ? ["Stryker was here"] : (stryCov_9fa48("110306"), [])
      }), params);
      const planId = this.createDeterministicPlanId(DISTRIBUTED_STATEMENT_TYPE.DELETE, ast, params, tablePlans, null);
      return stryMutAct_9fa48("110307") ? {} : (stryCov_9fa48("110307"), {
        [PLAN_FIELD.PLAN_ID]: planId,
        [PLAN_FIELD.STATEMENT_TYPE]: DISTRIBUTED_STATEMENT_TYPE.DELETE,
        [PLAN_FIELD.TABLE_PLANS]: tablePlans,
        [PLAN_FIELD.JOIN_PLAN]: null,
        [PLAN_FIELD.SET_OPERATION_PLAN]: null,
        [PLAN_FIELD.FRAGMENT_PLANS]: stryMutAct_9fa48("110308") ? ["Stryker was here"] : (stryCov_9fa48("110308"), []),
        [PLAN_FIELD.MERGE_PLAN]: null,
        [PLAN_FIELD.EXECUTION_POLICY]: DISTRIBUTED_EXECUTION_POLICY.WRITE_FAIL_CLOSED,
        [PLAN_FIELD.DIAGNOSTICS]: this.buildDiagnostics(tableGraph, tablePlans, null, {})
      });
    }
  }

  /**
   * Extract query table graph from a SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {Object[]} Ordered table graph nodes.
   */
  extractTableGraph(ast) {
    if (stryMutAct_9fa48("110309")) {
      {}
    } else {
      stryCov_9fa48("110309");
      if (stryMutAct_9fa48("110312") ? !ast && !ast.from : stryMutAct_9fa48("110311") ? false : stryMutAct_9fa48("110310") ? true : (stryCov_9fa48("110310", "110311", "110312"), (stryMutAct_9fa48("110313") ? ast : (stryCov_9fa48("110313"), !ast)) || (stryMutAct_9fa48("110314") ? ast.from : (stryCov_9fa48("110314"), !ast.from)))) {
        if (stryMutAct_9fa48("110315")) {
          {}
        } else {
          stryCov_9fa48("110315");
          return stryMutAct_9fa48("110316") ? ["Stryker was here"] : (stryCov_9fa48("110316"), []);
        }
      }
      const graph = stryMutAct_9fa48("110317") ? ["Stryker was here"] : (stryCov_9fa48("110317"), []);
      const rootAlias = stryMutAct_9fa48("110320") ? ast.from.alias && ast.from.name : stryMutAct_9fa48("110319") ? false : stryMutAct_9fa48("110318") ? true : (stryCov_9fa48("110318", "110319", "110320"), ast.from.alias || ast.from.name);
      graph.push(stryMutAct_9fa48("110321") ? {} : (stryCov_9fa48("110321"), {
        tableName: stryMutAct_9fa48("110324") ? ast.from.name && null : stryMutAct_9fa48("110323") ? false : stryMutAct_9fa48("110322") ? true : (stryCov_9fa48("110322", "110323", "110324"), ast.from.name || null),
        tableAlias: stryMutAct_9fa48("110327") ? rootAlias && null : stryMutAct_9fa48("110326") ? false : stryMutAct_9fa48("110325") ? true : (stryCov_9fa48("110325", "110326", "110327"), rootAlias || null),
        joinType: null
      }));
      for (const join of stryMutAct_9fa48("110330") ? ast.joins && [] : stryMutAct_9fa48("110329") ? false : stryMutAct_9fa48("110328") ? true : (stryCov_9fa48("110328", "110329", "110330"), ast.joins || (stryMutAct_9fa48("110331") ? ["Stryker was here"] : (stryCov_9fa48("110331"), [])))) {
        if (stryMutAct_9fa48("110332")) {
          {}
        } else {
          stryCov_9fa48("110332");
          graph.push(stryMutAct_9fa48("110333") ? {} : (stryCov_9fa48("110333"), {
            tableName: stryMutAct_9fa48("110336") ? join.table?.name && null : stryMutAct_9fa48("110335") ? false : stryMutAct_9fa48("110334") ? true : (stryCov_9fa48("110334", "110335", "110336"), (stryMutAct_9fa48("110337") ? join.table.name : (stryCov_9fa48("110337"), join.table?.name)) || null),
            tableAlias: stryMutAct_9fa48("110340") ? (join.table?.alias || join.table?.name) && null : stryMutAct_9fa48("110339") ? false : stryMutAct_9fa48("110338") ? true : (stryCov_9fa48("110338", "110339", "110340"), (stryMutAct_9fa48("110342") ? join.table?.alias && join.table?.name : stryMutAct_9fa48("110341") ? false : (stryCov_9fa48("110341", "110342"), (stryMutAct_9fa48("110343") ? join.table.alias : (stryCov_9fa48("110343"), join.table?.alias)) || (stryMutAct_9fa48("110344") ? join.table.name : (stryCov_9fa48("110344"), join.table?.name)))) || null),
            joinType: stryMutAct_9fa48("110347") ? join.joinType && null : stryMutAct_9fa48("110346") ? false : stryMutAct_9fa48("110345") ? true : (stryCov_9fa48("110345", "110346", "110347"), join.joinType || null)
          }));
        }
      }
      return graph;
    }
  }

  /**
   * Build per-table access plans for every table alias in the graph.
   * @param {Object[]} tableGraph - Ordered table graph.
   * @param {Object|null} ast - SELECT-like AST shape.
   * @param {Array} params - Bound parameters.
   * @return {Map<string, Object>} Table alias -> TableAccessPlan.
   */
  buildTablePlans(tableGraph, ast, params) {
    if (stryMutAct_9fa48("110348")) {
      {}
    } else {
      stryCov_9fa48("110348");
      const tablePlans = new Map();
      for (const tableNode of tableGraph) {
        if (stryMutAct_9fa48("110349")) {
          {}
        } else {
          stryCov_9fa48("110349");
          if (stryMutAct_9fa48("110352") ? !tableNode.tableName && !tableNode.tableAlias : stryMutAct_9fa48("110351") ? false : stryMutAct_9fa48("110350") ? true : (stryCov_9fa48("110350", "110351", "110352"), (stryMutAct_9fa48("110353") ? tableNode.tableName : (stryCov_9fa48("110353"), !tableNode.tableName)) || (stryMutAct_9fa48("110354") ? tableNode.tableAlias : (stryCov_9fa48("110354"), !tableNode.tableAlias)))) {
            if (stryMutAct_9fa48("110355")) {
              {}
            } else {
              stryCov_9fa48("110355");
              continue;
            }
          }
          const tableName = tableNode.tableName;
          const tableAlias = tableNode.tableAlias;
          const partitions = stryMutAct_9fa48("110358") ? this.getTablePartitions(tableName) && [] : stryMutAct_9fa48("110357") ? false : stryMutAct_9fa48("110356") ? true : (stryCov_9fa48("110356", "110357", "110358"), this.getTablePartitions(tableName) || (stryMutAct_9fa48("110359") ? ["Stryker was here"] : (stryCov_9fa48("110359"), [])));
          const localPredicate = this.extractTableLocalPredicate(stryMutAct_9fa48("110362") ? ast?.where && null : stryMutAct_9fa48("110361") ? false : stryMutAct_9fa48("110360") ? true : (stryCov_9fa48("110360", "110361", "110362"), (stryMutAct_9fa48("110363") ? ast.where : (stryCov_9fa48("110363"), ast?.where)) || null), tableAlias);
          const targetPredicate = stryMutAct_9fa48("110366") ? (localPredicate || ast?.where) && null : stryMutAct_9fa48("110365") ? false : stryMutAct_9fa48("110364") ? true : (stryCov_9fa48("110364", "110365", "110366"), (stryMutAct_9fa48("110368") ? localPredicate && ast?.where : stryMutAct_9fa48("110367") ? false : (stryCov_9fa48("110367", "110368"), localPredicate || (stryMutAct_9fa48("110369") ? ast.where : (stryCov_9fa48("110369"), ast?.where)))) || null);
          const partitionIds = this.partitionResolver ? this.partitionResolver.resolvePartitions(tableName, targetPredicate, partitions, stryMutAct_9fa48("110370") ? {} : (stryCov_9fa48("110370"), {
            params,
            tableAliases: stryMutAct_9fa48("110371") ? [] : (stryCov_9fa48("110371"), [tableAlias, tableName])
          })) : partitions.map(stryMutAct_9fa48("110372") ? () => undefined : (stryCov_9fa48("110372"), partition => stryMutAct_9fa48("110375") ? partition.partition_id && partition.partitionId : stryMutAct_9fa48("110374") ? false : stryMutAct_9fa48("110373") ? true : (stryCov_9fa48("110373", "110374", "110375"), partition.partition_id || partition.partitionId)));
          const resolutionInfo = (stryMutAct_9fa48("110378") ? this.partitionResolver || typeof this.partitionResolver.getLastResolutionInfo === 'function' : stryMutAct_9fa48("110377") ? false : stryMutAct_9fa48("110376") ? true : (stryCov_9fa48("110376", "110377", "110378"), this.partitionResolver && (stryMutAct_9fa48("110380") ? typeof this.partitionResolver.getLastResolutionInfo !== 'function' : stryMutAct_9fa48("110379") ? true : (stryCov_9fa48("110379", "110380"), typeof this.partitionResolver.getLastResolutionInfo === (stryMutAct_9fa48("110381") ? "" : (stryCov_9fa48("110381"), 'function')))))) ? this.partitionResolver.getLastResolutionInfo() : null;
          tablePlans.set(tableAlias, stryMutAct_9fa48("110382") ? {} : (stryCov_9fa48("110382"), {
            tableName,
            tableAlias,
            partitions: partitionIds,
            localPredicate,
            projectedColumns: this.extractProjectedColumns(ast, tableAlias),
            keyPredicateShape: stryMutAct_9fa48("110385") ? resolutionInfo?.predicateShape && DISTRIBUTED_PREDICATE_SHAPE.SCATTER : stryMutAct_9fa48("110384") ? false : stryMutAct_9fa48("110383") ? true : (stryCov_9fa48("110383", "110384", "110385"), (stryMutAct_9fa48("110386") ? resolutionInfo.predicateShape : (stryCov_9fa48("110386"), resolutionInfo?.predicateShape)) || DISTRIBUTED_PREDICATE_SHAPE.SCATTER)
          }));
        }
      }
      return tablePlans;
    }
  }

  /**
   * Build read fragment plans from per-table access plans.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @param {Object} _ast - SELECT AST.
   * @param {Array} params - Bound parameters.
   * @return {Object[]} Fragment plans.
   */
  buildReadFragmentPlans(tablePlans, _ast, params) {
    if (stryMutAct_9fa48("110387")) {
      {}
    } else {
      stryCov_9fa48("110387");
      const fragments = stryMutAct_9fa48("110388") ? ["Stryker was here"] : (stryCov_9fa48("110388"), []);
      for (const [tableAlias, tablePlan] of tablePlans) {
        if (stryMutAct_9fa48("110389")) {
          {}
        } else {
          stryCov_9fa48("110389");
          const fragmentSql = this.buildFragmentSql(tablePlan);
          for (const partitionId of tablePlan.partitions) {
            if (stryMutAct_9fa48("110390")) {
              {}
            } else {
              stryCov_9fa48("110390");
              fragments.push(stryMutAct_9fa48("110391") ? {} : (stryCov_9fa48("110391"), {
                fragmentId: stryMutAct_9fa48("110392") ? `` : (stryCov_9fa48("110392"), `${tableAlias}:${partitionId}`),
                tableAlias,
                partitionId,
                sql: fragmentSql,
                params,
                roleHint: DISTRIBUTED_ROLE_HINT.FOLLOWER_OK,
                pushdown: stryMutAct_9fa48("110393") ? {} : (stryCov_9fa48("110393"), {
                  predicatePushedDown: Boolean(tablePlan.localPredicate),
                  projectionPushedDown: Array.isArray(tablePlan.projectedColumns)
                })
              }));
            }
          }
        }
      }
      return fragments;
    }
  }

  /**
   * Build merge-stage metadata from a SELECT AST.
   * @param {Object} ast - SELECT AST.
   * @return {Object} Merge plan.
   */
  buildMergePlan(ast) {
    if (stryMutAct_9fa48("110394")) {
      {}
    } else {
      stryCov_9fa48("110394");
      return stryMutAct_9fa48("110395") ? {} : (stryCov_9fa48("110395"), {
        needsDistinct: Boolean(ast.distinct),
        groupBy: stryMutAct_9fa48("110398") ? ast.groupBy && null : stryMutAct_9fa48("110397") ? false : stryMutAct_9fa48("110396") ? true : (stryCov_9fa48("110396", "110397", "110398"), ast.groupBy || null),
        having: stryMutAct_9fa48("110401") ? ast.having && null : stryMutAct_9fa48("110400") ? false : stryMutAct_9fa48("110399") ? true : (stryCov_9fa48("110399", "110400", "110401"), ast.having || null),
        orderBy: stryMutAct_9fa48("110404") ? ast.orderBy && null : stryMutAct_9fa48("110403") ? false : stryMutAct_9fa48("110402") ? true : (stryCov_9fa48("110402", "110403", "110404"), ast.orderBy || null),
        limit: stryMutAct_9fa48("110407") ? ast.limit && null : stryMutAct_9fa48("110406") ? false : stryMutAct_9fa48("110405") ? true : (stryCov_9fa48("110405", "110406", "110407"), ast.limit || null)
      });
    }
  }

  /**
   * Build join plan edges and selected execution strategies.
   * @param {Object} ast - SELECT AST.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @return {Object[]|null} Join plan edges.
   */
  buildJoinPlan(ast, tablePlans) {
    if (stryMutAct_9fa48("110408")) {
      {}
    } else {
      stryCov_9fa48("110408");
      if (stryMutAct_9fa48("110411") ? !ast.joins && ast.joins.length === NUM.ZERO : stryMutAct_9fa48("110410") ? false : stryMutAct_9fa48("110409") ? true : (stryCov_9fa48("110409", "110410", "110411"), (stryMutAct_9fa48("110412") ? ast.joins : (stryCov_9fa48("110412"), !ast.joins)) || (stryMutAct_9fa48("110414") ? ast.joins.length !== NUM.ZERO : stryMutAct_9fa48("110413") ? false : (stryCov_9fa48("110413", "110414"), ast.joins.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("110415")) {
          {}
        } else {
          stryCov_9fa48("110415");
          return null;
        }
      }
      const joinPlan = stryMutAct_9fa48("110416") ? ["Stryker was here"] : (stryCov_9fa48("110416"), []);
      let leftAlias = stryMutAct_9fa48("110419") ? ast.from.alias && ast.from.name : stryMutAct_9fa48("110418") ? false : stryMutAct_9fa48("110417") ? true : (stryCov_9fa48("110417", "110418", "110419"), ast.from.alias || ast.from.name);
      for (const join of ast.joins) {
        if (stryMutAct_9fa48("110420")) {
          {}
        } else {
          stryCov_9fa48("110420");
          const rightAlias = stryMutAct_9fa48("110423") ? join.table?.alias && join.table?.name : stryMutAct_9fa48("110422") ? false : stryMutAct_9fa48("110421") ? true : (stryCov_9fa48("110421", "110422", "110423"), (stryMutAct_9fa48("110424") ? join.table.alias : (stryCov_9fa48("110424"), join.table?.alias)) || (stryMutAct_9fa48("110425") ? join.table.name : (stryCov_9fa48("110425"), join.table?.name)));
          if (stryMutAct_9fa48("110428") ? false : stryMutAct_9fa48("110427") ? true : stryMutAct_9fa48("110426") ? rightAlias : (stryCov_9fa48("110426", "110427", "110428"), !rightAlias)) {
            if (stryMutAct_9fa48("110429")) {
              {}
            } else {
              stryCov_9fa48("110429");
              continue;
            }
          }
          const leftPlan = tablePlans.get(leftAlias);
          const rightPlan = tablePlans.get(rightAlias);
          const strategy = this.selectJoinStrategy(join, leftPlan, rightPlan);
          joinPlan.push(stryMutAct_9fa48("110430") ? {} : (stryCov_9fa48("110430"), {
            leftAlias,
            rightAlias,
            joinType: stryMutAct_9fa48("110433") ? join.joinType && QUERY_JOIN_TYPE.INNER : stryMutAct_9fa48("110432") ? false : stryMutAct_9fa48("110431") ? true : (stryCov_9fa48("110431", "110432", "110433"), join.joinType || QUERY_JOIN_TYPE.INNER),
            strategy
          }));
          leftAlias = rightAlias;
        }
      }
      return joinPlan;
    }
  }

  /**
   * Select join strategy for a join edge.
   * @param {Object} join - JOIN AST node.
   * @param {Object|null} leftPlan - Left table access plan.
   * @param {Object|null} rightPlan - Right table access plan.
   * @return {string} Join strategy.
   */
  selectJoinStrategy(join, leftPlan, rightPlan) {
    if (stryMutAct_9fa48("110434")) {
      {}
    } else {
      stryCov_9fa48("110434");
      if (stryMutAct_9fa48("110437") ? false : stryMutAct_9fa48("110436") ? true : stryMutAct_9fa48("110435") ? this.isEquiJoin(join) : (stryCov_9fa48("110435", "110436", "110437"), !this.isEquiJoin(join))) {
        if (stryMutAct_9fa48("110438")) {
          {}
        } else {
          stryCov_9fa48("110438");
          return DISTRIBUTED_JOIN_STRATEGY.NESTED_LOOP;
        }
      }
      const leftPartitions = stryMutAct_9fa48("110441") ? leftPlan?.partitions?.length && NUM.ZERO : stryMutAct_9fa48("110440") ? false : stryMutAct_9fa48("110439") ? true : (stryCov_9fa48("110439", "110440", "110441"), (stryMutAct_9fa48("110443") ? leftPlan.partitions?.length : stryMutAct_9fa48("110442") ? leftPlan?.partitions.length : (stryCov_9fa48("110442", "110443"), leftPlan?.partitions?.length)) || NUM.ZERO);
      const rightPartitions = stryMutAct_9fa48("110446") ? rightPlan?.partitions?.length && NUM.ZERO : stryMutAct_9fa48("110445") ? false : stryMutAct_9fa48("110444") ? true : (stryCov_9fa48("110444", "110445", "110446"), (stryMutAct_9fa48("110448") ? rightPlan.partitions?.length : stryMutAct_9fa48("110447") ? rightPlan?.partitions.length : (stryCov_9fa48("110447", "110448"), rightPlan?.partitions?.length)) || NUM.ZERO);
      const minPartitions = stryMutAct_9fa48("110449") ? Math.max(leftPartitions, rightPartitions) : (stryCov_9fa48("110449"), Math.min(leftPartitions, rightPartitions));
      const maxPartitions = stryMutAct_9fa48("110450") ? Math.min(leftPartitions, rightPartitions) : (stryCov_9fa48("110450"), Math.max(leftPartitions, rightPartitions));
      if (stryMutAct_9fa48("110454") ? minPartitions > DISTRIBUTED_PLANNER_DEFAULT.JOIN_BROADCAST_PARTITION_THRESHOLD : stryMutAct_9fa48("110453") ? minPartitions < DISTRIBUTED_PLANNER_DEFAULT.JOIN_BROADCAST_PARTITION_THRESHOLD : stryMutAct_9fa48("110452") ? false : stryMutAct_9fa48("110451") ? true : (stryCov_9fa48("110451", "110452", "110453", "110454"), minPartitions <= DISTRIBUTED_PLANNER_DEFAULT.JOIN_BROADCAST_PARTITION_THRESHOLD)) {
        if (stryMutAct_9fa48("110455")) {
          {}
        } else {
          stryCov_9fa48("110455");
          return DISTRIBUTED_JOIN_STRATEGY.BROADCAST;
        }
      }
      if (stryMutAct_9fa48("110459") ? maxPartitions <= minPartitions : stryMutAct_9fa48("110458") ? maxPartitions >= minPartitions : stryMutAct_9fa48("110457") ? false : stryMutAct_9fa48("110456") ? true : (stryCov_9fa48("110456", "110457", "110458", "110459"), maxPartitions > minPartitions)) {
        if (stryMutAct_9fa48("110460")) {
          {}
        } else {
          stryCov_9fa48("110460");
          return DISTRIBUTED_JOIN_STRATEGY.REPARTITION;
        }
      }
      return DISTRIBUTED_JOIN_STRATEGY.REPARTITION;
    }
  }

  /**
   * Check if join condition is an equality between two column refs.
   * @param {Object} join - JOIN AST node.
   * @return {boolean} True when equi-join is detected.
   */
  isEquiJoin(join) {
    if (stryMutAct_9fa48("110461")) {
      {}
    } else {
      stryCov_9fa48("110461");
      const condition = stryMutAct_9fa48("110462") ? join.condition : (stryCov_9fa48("110462"), join?.condition);
      if (stryMutAct_9fa48("110465") ? !condition && condition.type !== QUERY_AST_NODE.BINARY : stryMutAct_9fa48("110464") ? false : stryMutAct_9fa48("110463") ? true : (stryCov_9fa48("110463", "110464", "110465"), (stryMutAct_9fa48("110466") ? condition : (stryCov_9fa48("110466"), !condition)) || (stryMutAct_9fa48("110468") ? condition.type === QUERY_AST_NODE.BINARY : stryMutAct_9fa48("110467") ? false : (stryCov_9fa48("110467", "110468"), condition.type !== QUERY_AST_NODE.BINARY)))) {
        if (stryMutAct_9fa48("110469")) {
          {}
        } else {
          stryCov_9fa48("110469");
          return stryMutAct_9fa48("110470") ? true : (stryCov_9fa48("110470"), false);
        }
      }
      if (stryMutAct_9fa48("110473") ? condition.operator === QUERY_OPERATOR.EQUALS : stryMutAct_9fa48("110472") ? false : stryMutAct_9fa48("110471") ? true : (stryCov_9fa48("110471", "110472", "110473"), condition.operator !== QUERY_OPERATOR.EQUALS)) {
        if (stryMutAct_9fa48("110474")) {
          {}
        } else {
          stryCov_9fa48("110474");
          return stryMutAct_9fa48("110475") ? true : (stryCov_9fa48("110475"), false);
        }
      }
      return stryMutAct_9fa48("110478") ? condition.left?.type === QUERY_AST_NODE.COLUMN_REF || condition.right?.type === QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("110477") ? false : stryMutAct_9fa48("110476") ? true : (stryCov_9fa48("110476", "110477", "110478"), (stryMutAct_9fa48("110480") ? condition.left?.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("110479") ? true : (stryCov_9fa48("110479", "110480"), (stryMutAct_9fa48("110481") ? condition.left.type : (stryCov_9fa48("110481"), condition.left?.type)) === QUERY_AST_NODE.COLUMN_REF)) && (stryMutAct_9fa48("110483") ? condition.right?.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("110482") ? true : (stryCov_9fa48("110482", "110483"), (stryMutAct_9fa48("110484") ? condition.right.type : (stryCov_9fa48("110484"), condition.right?.type)) === QUERY_AST_NODE.COLUMN_REF)));
    }
  }

  /**
   * Build planner diagnostics envelope.
   * @param {Object[]} tableGraph - Table graph.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @param {Object[]|null} joinPlan - Join plan.
   * @param {Object} options - Planner options.
   * @return {Object} Diagnostics payload.
   */
  buildDiagnostics(tableGraph, tablePlans, joinPlan, options) {
    if (stryMutAct_9fa48("110485")) {
      {}
    } else {
      stryCov_9fa48("110485");
      const pushdownDecisions = Array.from(tablePlans.values()).map(stryMutAct_9fa48("110486") ? () => undefined : (stryCov_9fa48("110486"), tablePlan => stryMutAct_9fa48("110487") ? {} : (stryCov_9fa48("110487"), {
        tableAlias: tablePlan.tableAlias,
        predicatePushedDown: Boolean(tablePlan.localPredicate),
        projectionPushedDown: Array.isArray(tablePlan.projectedColumns),
        projectedColumnCount: Array.isArray(tablePlan.projectedColumns) ? tablePlan.projectedColumns.length : null
      })));
      return stryMutAct_9fa48("110488") ? {} : (stryCov_9fa48("110488"), {
        tableGraph,
        tablePlans: Array.from(tablePlans.values()),
        joinPlan: stryMutAct_9fa48("110491") ? joinPlan && null : stryMutAct_9fa48("110490") ? false : stryMutAct_9fa48("110489") ? true : (stryCov_9fa48("110489", "110490", "110491"), joinPlan || null),
        pushdownDecisions,
        explain: stryMutAct_9fa48("110494") ? options.explain !== true : stryMutAct_9fa48("110493") ? false : stryMutAct_9fa48("110492") ? true : (stryCov_9fa48("110492", "110493", "110494"), options.explain === (stryMutAct_9fa48("110495") ? false : (stryCov_9fa48("110495"), true))),
        generatedAt: Date.now()
      });
    }
  }

  /**
   * Build deterministic plan ID from normalized planning payload.
   * @param {string} statementType - Statement type.
   * @param {Object} ast - Statement AST.
   * @param {Array} params - Bound params.
   * @param {Map<string, Object>} tablePlans - Table access plans.
   * @param {Object[]|null} joinPlan - Join plan.
   * @return {string} Deterministic plan ID.
   */
  createDeterministicPlanId(statementType, ast, params, tablePlans, joinPlan) {
    if (stryMutAct_9fa48("110496")) {
      {}
    } else {
      stryCov_9fa48("110496");
      const serializedTablePlans = stryMutAct_9fa48("110497") ? Array.from(tablePlans.entries()).map(([alias, plan]) => ({
        alias,
        tableName: plan.tableName,
        partitions: [...plan.partitions].sort(),
        keyPredicateShape: plan.keyPredicateShape
      })) : (stryCov_9fa48("110497"), Array.from(tablePlans.entries()).map(stryMutAct_9fa48("110498") ? () => undefined : (stryCov_9fa48("110498"), ([alias, plan]) => stryMutAct_9fa48("110499") ? {} : (stryCov_9fa48("110499"), {
        alias,
        tableName: plan.tableName,
        partitions: stryMutAct_9fa48("110500") ? [...plan.partitions] : (stryCov_9fa48("110500"), (stryMutAct_9fa48("110501") ? [] : (stryCov_9fa48("110501"), [...plan.partitions])).sort()),
        keyPredicateShape: plan.keyPredicateShape
      }))).sort(stryMutAct_9fa48("110502") ? () => undefined : (stryCov_9fa48("110502"), (left, right) => left.alias.localeCompare(right.alias))));
      const payload = stryMutAct_9fa48("110503") ? {} : (stryCov_9fa48("110503"), {
        statementType,
        ast: this.normalizePlanPayload(ast),
        paramsCount: params.length,
        tablePlans: serializedTablePlans,
        joinPlan: stryMutAct_9fa48("110506") ? joinPlan && null : stryMutAct_9fa48("110505") ? false : stryMutAct_9fa48("110504") ? true : (stryCov_9fa48("110504", "110505", "110506"), joinPlan || null)
      });
      const digest = stryMutAct_9fa48("110507") ? createHash(PLAN_HASH.SHA1).update(JSON.stringify(payload)).digest(PLAN_HASH.HEX) : (stryCov_9fa48("110507"), createHash(PLAN_HASH.SHA1).update(JSON.stringify(payload)).digest(PLAN_HASH.HEX).slice(NUM.ZERO, PLAN_HASH.LENGTH));
      return stryMutAct_9fa48("110508") ? `` : (stryCov_9fa48("110508"), `${PLAN_HASH.PREFIX}${digest}`);
    }
  }

  /**
   * Normalize an object into a JSON-safe payload for deterministic hashing.
   * @param {*} value - Input value.
   * @return {*} Normalized value.
   */
  normalizePlanPayload(value) {
    if (stryMutAct_9fa48("110509")) {
      {}
    } else {
      stryCov_9fa48("110509");
      if (stryMutAct_9fa48("110511") ? false : stryMutAct_9fa48("110510") ? true : (stryCov_9fa48("110510", "110511"), Array.isArray(value))) {
        if (stryMutAct_9fa48("110512")) {
          {}
        } else {
          stryCov_9fa48("110512");
          return value.map(stryMutAct_9fa48("110513") ? () => undefined : (stryCov_9fa48("110513"), entry => this.normalizePlanPayload(entry)));
        }
      }
      if (stryMutAct_9fa48("110516") ? !value && typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("110515") ? false : stryMutAct_9fa48("110514") ? true : (stryCov_9fa48("110514", "110515", "110516"), (stryMutAct_9fa48("110517") ? value : (stryCov_9fa48("110517"), !value)) || (stryMutAct_9fa48("110519") ? typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("110518") ? false : (stryCov_9fa48("110518", "110519"), typeof value !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("110520")) {
          {}
        } else {
          stryCov_9fa48("110520");
          return value;
        }
      }
      const normalized = {};
      const keys = stryMutAct_9fa48("110521") ? Object.keys(value) : (stryCov_9fa48("110521"), Object.keys(value).sort());
      for (const key of keys) {
        if (stryMutAct_9fa48("110522")) {
          {}
        } else {
          stryCov_9fa48("110522");
          const entry = value[key];
          if (stryMutAct_9fa48("110525") ? typeof entry === TYPEOF.FUNCTION && entry === undefined : stryMutAct_9fa48("110524") ? false : stryMutAct_9fa48("110523") ? true : (stryCov_9fa48("110523", "110524", "110525"), (stryMutAct_9fa48("110527") ? typeof entry !== TYPEOF.FUNCTION : stryMutAct_9fa48("110526") ? false : (stryCov_9fa48("110526", "110527"), typeof entry === TYPEOF.FUNCTION)) || (stryMutAct_9fa48("110529") ? entry !== undefined : stryMutAct_9fa48("110528") ? false : (stryCov_9fa48("110528", "110529"), entry === undefined)))) {
            if (stryMutAct_9fa48("110530")) {
              {}
            } else {
              stryCov_9fa48("110530");
              continue;
            }
          }
          normalized[key] = this.normalizePlanPayload(entry);
        }
      }
      return normalized;
    }
  }

  /**
   * Extract table-local predicate expression from WHERE clause.
   * @param {Object|null} expr - WHERE expression.
   * @param {string} tableAlias - Target table alias.
   * @return {Object|null} Local predicate AST or null.
   */
  extractTableLocalPredicate(expr, tableAlias) {
    if (stryMutAct_9fa48("110531")) {
      {}
    } else {
      stryCov_9fa48("110531");
      if (stryMutAct_9fa48("110534") ? false : stryMutAct_9fa48("110533") ? true : stryMutAct_9fa48("110532") ? expr : (stryCov_9fa48("110532", "110533", "110534"), !expr)) {
        if (stryMutAct_9fa48("110535")) {
          {}
        } else {
          stryCov_9fa48("110535");
          return null;
        }
      }
      if (stryMutAct_9fa48("110538") ? expr.type === QUERY_AST_NODE.BINARY || expr.operator === QUERY_OPERATOR.AND : stryMutAct_9fa48("110537") ? false : stryMutAct_9fa48("110536") ? true : (stryCov_9fa48("110536", "110537", "110538"), (stryMutAct_9fa48("110540") ? expr.type !== QUERY_AST_NODE.BINARY : stryMutAct_9fa48("110539") ? true : (stryCov_9fa48("110539", "110540"), expr.type === QUERY_AST_NODE.BINARY)) && (stryMutAct_9fa48("110542") ? expr.operator !== QUERY_OPERATOR.AND : stryMutAct_9fa48("110541") ? true : (stryCov_9fa48("110541", "110542"), expr.operator === QUERY_OPERATOR.AND)))) {
        if (stryMutAct_9fa48("110543")) {
          {}
        } else {
          stryCov_9fa48("110543");
          const left = this.extractTableLocalPredicate(expr.left, tableAlias);
          const right = this.extractTableLocalPredicate(expr.right, tableAlias);
          if (stryMutAct_9fa48("110546") ? left || right : stryMutAct_9fa48("110545") ? false : stryMutAct_9fa48("110544") ? true : (stryCov_9fa48("110544", "110545", "110546"), left && right)) {
            if (stryMutAct_9fa48("110547")) {
              {}
            } else {
              stryCov_9fa48("110547");
              return stryMutAct_9fa48("110548") ? {} : (stryCov_9fa48("110548"), {
                ...expr,
                left,
                right
              });
            }
          }
          return stryMutAct_9fa48("110551") ? (left || right) && null : stryMutAct_9fa48("110550") ? false : stryMutAct_9fa48("110549") ? true : (stryCov_9fa48("110549", "110550", "110551"), (stryMutAct_9fa48("110553") ? left && right : stryMutAct_9fa48("110552") ? false : (stryCov_9fa48("110552", "110553"), left || right)) || null);
        }
      }
      if (stryMutAct_9fa48("110556") ? expr.type === QUERY_AST_NODE.BINARY || expr.operator === QUERY_OPERATOR.OR : stryMutAct_9fa48("110555") ? false : stryMutAct_9fa48("110554") ? true : (stryCov_9fa48("110554", "110555", "110556"), (stryMutAct_9fa48("110558") ? expr.type !== QUERY_AST_NODE.BINARY : stryMutAct_9fa48("110557") ? true : (stryCov_9fa48("110557", "110558"), expr.type === QUERY_AST_NODE.BINARY)) && (stryMutAct_9fa48("110560") ? expr.operator !== QUERY_OPERATOR.OR : stryMutAct_9fa48("110559") ? true : (stryCov_9fa48("110559", "110560"), expr.operator === QUERY_OPERATOR.OR)))) {
        if (stryMutAct_9fa48("110561")) {
          {}
        } else {
          stryCov_9fa48("110561");
          const left = this.extractTableLocalPredicate(expr.left, tableAlias);
          const right = this.extractTableLocalPredicate(expr.right, tableAlias);
          if (stryMutAct_9fa48("110564") ? left || right : stryMutAct_9fa48("110563") ? false : stryMutAct_9fa48("110562") ? true : (stryCov_9fa48("110562", "110563", "110564"), left && right)) {
            if (stryMutAct_9fa48("110565")) {
              {}
            } else {
              stryCov_9fa48("110565");
              return stryMutAct_9fa48("110566") ? {} : (stryCov_9fa48("110566"), {
                ...expr,
                left,
                right
              });
            }
          }
          return null;
        }
      }
      return this.expressionReferencesAlias(expr, tableAlias) ? expr : null;
    }
  }

  /**
   * Check whether expression references only a target table alias.
   * @param {Object} expr - Expression AST.
   * @param {string} tableAlias - Target table alias.
   * @return {boolean} True when local to target alias.
   */
  expressionReferencesAlias(expr, tableAlias) {
    if (stryMutAct_9fa48("110567")) {
      {}
    } else {
      stryCov_9fa48("110567");
      if (stryMutAct_9fa48("110570") ? !expr && typeof expr !== TYPEOF.OBJECT : stryMutAct_9fa48("110569") ? false : stryMutAct_9fa48("110568") ? true : (stryCov_9fa48("110568", "110569", "110570"), (stryMutAct_9fa48("110571") ? expr : (stryCov_9fa48("110571"), !expr)) || (stryMutAct_9fa48("110573") ? typeof expr === TYPEOF.OBJECT : stryMutAct_9fa48("110572") ? false : (stryCov_9fa48("110572", "110573"), typeof expr !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("110574")) {
          {}
        } else {
          stryCov_9fa48("110574");
          return stryMutAct_9fa48("110575") ? false : (stryCov_9fa48("110575"), true);
        }
      }
      if (stryMutAct_9fa48("110578") ? expr.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("110577") ? false : stryMutAct_9fa48("110576") ? true : (stryCov_9fa48("110576", "110577", "110578"), expr.type === QUERY_AST_NODE.COLUMN_REF)) {
        if (stryMutAct_9fa48("110579")) {
          {}
        } else {
          stryCov_9fa48("110579");
          if (stryMutAct_9fa48("110582") ? false : stryMutAct_9fa48("110581") ? true : stryMutAct_9fa48("110580") ? expr.table : (stryCov_9fa48("110580", "110581", "110582"), !expr.table)) {
            if (stryMutAct_9fa48("110583")) {
              {}
            } else {
              stryCov_9fa48("110583");
              return stryMutAct_9fa48("110584") ? false : (stryCov_9fa48("110584"), true);
            }
          }
          return stryMutAct_9fa48("110587") ? String(expr.table).toLowerCase() !== String(tableAlias).toLowerCase() : stryMutAct_9fa48("110586") ? false : stryMutAct_9fa48("110585") ? true : (stryCov_9fa48("110585", "110586", "110587"), (stryMutAct_9fa48("110588") ? String(expr.table).toUpperCase() : (stryCov_9fa48("110588"), String(expr.table).toLowerCase())) === (stryMutAct_9fa48("110589") ? String(tableAlias).toUpperCase() : (stryCov_9fa48("110589"), String(tableAlias).toLowerCase())));
        }
      }
      if (stryMutAct_9fa48("110592") ? expr.type !== QUERY_AST_NODE.BINARY : stryMutAct_9fa48("110591") ? false : stryMutAct_9fa48("110590") ? true : (stryCov_9fa48("110590", "110591", "110592"), expr.type === QUERY_AST_NODE.BINARY)) {
        if (stryMutAct_9fa48("110593")) {
          {}
        } else {
          stryCov_9fa48("110593");
          return stryMutAct_9fa48("110596") ? this.expressionReferencesAlias(expr.left, tableAlias) || this.expressionReferencesAlias(expr.right, tableAlias) : stryMutAct_9fa48("110595") ? false : stryMutAct_9fa48("110594") ? true : (stryCov_9fa48("110594", "110595", "110596"), this.expressionReferencesAlias(expr.left, tableAlias) && this.expressionReferencesAlias(expr.right, tableAlias));
        }
      }
      if (stryMutAct_9fa48("110599") ? expr.type !== QUERY_AST_NODE.UNARY : stryMutAct_9fa48("110598") ? false : stryMutAct_9fa48("110597") ? true : (stryCov_9fa48("110597", "110598", "110599"), expr.type === QUERY_AST_NODE.UNARY)) {
        if (stryMutAct_9fa48("110600")) {
          {}
        } else {
          stryCov_9fa48("110600");
          return this.expressionReferencesAlias(expr.operand, tableAlias);
        }
      }
      if (stryMutAct_9fa48("110603") ? expr.type !== QUERY_AST_NODE.IN : stryMutAct_9fa48("110602") ? false : stryMutAct_9fa48("110601") ? true : (stryCov_9fa48("110601", "110602", "110603"), expr.type === QUERY_AST_NODE.IN)) {
        if (stryMutAct_9fa48("110604")) {
          {}
        } else {
          stryCov_9fa48("110604");
          const expressionLocal = this.expressionReferencesAlias(expr.expression, tableAlias);
          if (stryMutAct_9fa48("110607") ? false : stryMutAct_9fa48("110606") ? true : stryMutAct_9fa48("110605") ? expressionLocal : (stryCov_9fa48("110605", "110606", "110607"), !expressionLocal)) {
            if (stryMutAct_9fa48("110608")) {
              {}
            } else {
              stryCov_9fa48("110608");
              return stryMutAct_9fa48("110609") ? true : (stryCov_9fa48("110609"), false);
            }
          }
          return stryMutAct_9fa48("110610") ? (expr.values || []).some(valueExpr => this.expressionReferencesAlias(valueExpr, tableAlias)) : (stryCov_9fa48("110610"), (stryMutAct_9fa48("110613") ? expr.values && [] : stryMutAct_9fa48("110612") ? false : stryMutAct_9fa48("110611") ? true : (stryCov_9fa48("110611", "110612", "110613"), expr.values || (stryMutAct_9fa48("110614") ? ["Stryker was here"] : (stryCov_9fa48("110614"), [])))).every(stryMutAct_9fa48("110615") ? () => undefined : (stryCov_9fa48("110615"), valueExpr => this.expressionReferencesAlias(valueExpr, tableAlias))));
        }
      }
      if (stryMutAct_9fa48("110618") ? expr.type !== QUERY_AST_NODE.BETWEEN : stryMutAct_9fa48("110617") ? false : stryMutAct_9fa48("110616") ? true : (stryCov_9fa48("110616", "110617", "110618"), expr.type === QUERY_AST_NODE.BETWEEN)) {
        if (stryMutAct_9fa48("110619")) {
          {}
        } else {
          stryCov_9fa48("110619");
          return stryMutAct_9fa48("110622") ? this.expressionReferencesAlias(expr.expression, tableAlias) && this.expressionReferencesAlias(expr.low, tableAlias) || this.expressionReferencesAlias(expr.high, tableAlias) : stryMutAct_9fa48("110621") ? false : stryMutAct_9fa48("110620") ? true : (stryCov_9fa48("110620", "110621", "110622"), (stryMutAct_9fa48("110624") ? this.expressionReferencesAlias(expr.expression, tableAlias) || this.expressionReferencesAlias(expr.low, tableAlias) : stryMutAct_9fa48("110623") ? true : (stryCov_9fa48("110623", "110624"), this.expressionReferencesAlias(expr.expression, tableAlias) && this.expressionReferencesAlias(expr.low, tableAlias))) && this.expressionReferencesAlias(expr.high, tableAlias));
        }
      }
      if (stryMutAct_9fa48("110627") ? expr.type !== QUERY_AST_NODE.LIKE : stryMutAct_9fa48("110626") ? false : stryMutAct_9fa48("110625") ? true : (stryCov_9fa48("110625", "110626", "110627"), expr.type === QUERY_AST_NODE.LIKE)) {
        if (stryMutAct_9fa48("110628")) {
          {}
        } else {
          stryCov_9fa48("110628");
          return stryMutAct_9fa48("110631") ? this.expressionReferencesAlias(expr.expression, tableAlias) || this.expressionReferencesAlias(expr.pattern, tableAlias) : stryMutAct_9fa48("110630") ? false : stryMutAct_9fa48("110629") ? true : (stryCov_9fa48("110629", "110630", "110631"), this.expressionReferencesAlias(expr.expression, tableAlias) && this.expressionReferencesAlias(expr.pattern, tableAlias));
        }
      }
      return stryMutAct_9fa48("110632") ? false : (stryCov_9fa48("110632"), true);
    }
  }

  /**
   * Compute projected columns for a table alias.
   * @param {Object|null} ast - SELECT AST.
   * @param {string} tableAlias - Table alias.
   * @return {string[]|null} Projected columns or null for wildcard.
   */
  extractProjectedColumns(ast, tableAlias) {
    if (stryMutAct_9fa48("110633")) {
      {}
    } else {
      stryCov_9fa48("110633");
      if (stryMutAct_9fa48("110636") ? !ast && !Array.isArray(ast.columns) : stryMutAct_9fa48("110635") ? false : stryMutAct_9fa48("110634") ? true : (stryCov_9fa48("110634", "110635", "110636"), (stryMutAct_9fa48("110637") ? ast : (stryCov_9fa48("110637"), !ast)) || (stryMutAct_9fa48("110638") ? Array.isArray(ast.columns) : (stryCov_9fa48("110638"), !Array.isArray(ast.columns))))) {
        if (stryMutAct_9fa48("110639")) {
          {}
        } else {
          stryCov_9fa48("110639");
          return null;
        }
      }
      if (stryMutAct_9fa48("110642") ? ast.columns.every(column => column.type === QUERY_AST_NODE.STAR || column.expression && column.expression.type === QUERY_AST_NODE.STAR) : stryMutAct_9fa48("110641") ? false : stryMutAct_9fa48("110640") ? true : (stryCov_9fa48("110640", "110641", "110642"), ast.columns.some(stryMutAct_9fa48("110643") ? () => undefined : (stryCov_9fa48("110643"), column => stryMutAct_9fa48("110646") ? column.type === QUERY_AST_NODE.STAR && column.expression && column.expression.type === QUERY_AST_NODE.STAR : stryMutAct_9fa48("110645") ? false : stryMutAct_9fa48("110644") ? true : (stryCov_9fa48("110644", "110645", "110646"), (stryMutAct_9fa48("110648") ? column.type !== QUERY_AST_NODE.STAR : stryMutAct_9fa48("110647") ? false : (stryCov_9fa48("110647", "110648"), column.type === QUERY_AST_NODE.STAR)) || (stryMutAct_9fa48("110650") ? column.expression || column.expression.type === QUERY_AST_NODE.STAR : stryMutAct_9fa48("110649") ? false : (stryCov_9fa48("110649", "110650"), column.expression && (stryMutAct_9fa48("110652") ? column.expression.type !== QUERY_AST_NODE.STAR : stryMutAct_9fa48("110651") ? true : (stryCov_9fa48("110651", "110652"), column.expression.type === QUERY_AST_NODE.STAR))))))))) {
        if (stryMutAct_9fa48("110653")) {
          {}
        } else {
          stryCov_9fa48("110653");
          return null;
        }
      }
      const projected = new Set();
      for (const column of ast.columns) {
        if (stryMutAct_9fa48("110654")) {
          {}
        } else {
          stryCov_9fa48("110654");
          const expr = stryMutAct_9fa48("110657") ? column.expression && column : stryMutAct_9fa48("110656") ? false : stryMutAct_9fa48("110655") ? true : (stryCov_9fa48("110655", "110656", "110657"), column.expression || column);
          this.collectProjectedColumns(expr, tableAlias, projected);
        }
      }
      for (const join of stryMutAct_9fa48("110660") ? ast.joins && [] : stryMutAct_9fa48("110659") ? false : stryMutAct_9fa48("110658") ? true : (stryCov_9fa48("110658", "110659", "110660"), ast.joins || (stryMutAct_9fa48("110661") ? ["Stryker was here"] : (stryCov_9fa48("110661"), [])))) {
        if (stryMutAct_9fa48("110662")) {
          {}
        } else {
          stryCov_9fa48("110662");
          this.collectProjectedColumns(join.condition, tableAlias, projected);
        }
      }
      if (stryMutAct_9fa48("110665") ? projected.size !== NUM.ZERO : stryMutAct_9fa48("110664") ? false : stryMutAct_9fa48("110663") ? true : (stryCov_9fa48("110663", "110664", "110665"), projected.size === NUM.ZERO)) {
        if (stryMutAct_9fa48("110666")) {
          {}
        } else {
          stryCov_9fa48("110666");
          return null;
        }
      }
      return Array.from(projected.values());
    }
  }

  /**
   * Collect column refs for a table alias from an expression.
   * @param {Object} expr - Expression AST.
   * @param {string} tableAlias - Table alias.
   * @param {Set<string>} out - Output column set.
   */
  collectProjectedColumns(expr, tableAlias, out) {
    if (stryMutAct_9fa48("110667")) {
      {}
    } else {
      stryCov_9fa48("110667");
      if (stryMutAct_9fa48("110670") ? !expr && typeof expr !== TYPEOF.OBJECT : stryMutAct_9fa48("110669") ? false : stryMutAct_9fa48("110668") ? true : (stryCov_9fa48("110668", "110669", "110670"), (stryMutAct_9fa48("110671") ? expr : (stryCov_9fa48("110671"), !expr)) || (stryMutAct_9fa48("110673") ? typeof expr === TYPEOF.OBJECT : stryMutAct_9fa48("110672") ? false : (stryCov_9fa48("110672", "110673"), typeof expr !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("110674")) {
          {}
        } else {
          stryCov_9fa48("110674");
          return;
        }
      }
      if (stryMutAct_9fa48("110677") ? expr.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("110676") ? false : stryMutAct_9fa48("110675") ? true : (stryCov_9fa48("110675", "110676", "110677"), expr.type === QUERY_AST_NODE.COLUMN_REF)) {
        if (stryMutAct_9fa48("110678")) {
          {}
        } else {
          stryCov_9fa48("110678");
          if (stryMutAct_9fa48("110681") ? !expr.table && String(expr.table).toLowerCase() === String(tableAlias).toLowerCase() : stryMutAct_9fa48("110680") ? false : stryMutAct_9fa48("110679") ? true : (stryCov_9fa48("110679", "110680", "110681"), (stryMutAct_9fa48("110682") ? expr.table : (stryCov_9fa48("110682"), !expr.table)) || (stryMutAct_9fa48("110684") ? String(expr.table).toLowerCase() !== String(tableAlias).toLowerCase() : stryMutAct_9fa48("110683") ? false : (stryCov_9fa48("110683", "110684"), (stryMutAct_9fa48("110685") ? String(expr.table).toUpperCase() : (stryCov_9fa48("110685"), String(expr.table).toLowerCase())) === (stryMutAct_9fa48("110686") ? String(tableAlias).toUpperCase() : (stryCov_9fa48("110686"), String(tableAlias).toLowerCase())))))) {
            if (stryMutAct_9fa48("110687")) {
              {}
            } else {
              stryCov_9fa48("110687");
              if (stryMutAct_9fa48("110689") ? false : stryMutAct_9fa48("110688") ? true : (stryCov_9fa48("110688", "110689"), expr.column)) {
                if (stryMutAct_9fa48("110690")) {
                  {}
                } else {
                  stryCov_9fa48("110690");
                  out.add(expr.column);
                }
              }
            }
          }
          return;
        }
      }
      if (stryMutAct_9fa48("110693") ? expr.type !== QUERY_AST_NODE.BINARY : stryMutAct_9fa48("110692") ? false : stryMutAct_9fa48("110691") ? true : (stryCov_9fa48("110691", "110692", "110693"), expr.type === QUERY_AST_NODE.BINARY)) {
        if (stryMutAct_9fa48("110694")) {
          {}
        } else {
          stryCov_9fa48("110694");
          this.collectProjectedColumns(expr.left, tableAlias, out);
          this.collectProjectedColumns(expr.right, tableAlias, out);
          return;
        }
      }
      if (stryMutAct_9fa48("110697") ? expr.type !== QUERY_AST_NODE.UNARY : stryMutAct_9fa48("110696") ? false : stryMutAct_9fa48("110695") ? true : (stryCov_9fa48("110695", "110696", "110697"), expr.type === QUERY_AST_NODE.UNARY)) {
        if (stryMutAct_9fa48("110698")) {
          {}
        } else {
          stryCov_9fa48("110698");
          this.collectProjectedColumns(expr.operand, tableAlias, out);
          return;
        }
      }
      if (stryMutAct_9fa48("110701") ? expr.type !== QUERY_AST_NODE.IN : stryMutAct_9fa48("110700") ? false : stryMutAct_9fa48("110699") ? true : (stryCov_9fa48("110699", "110700", "110701"), expr.type === QUERY_AST_NODE.IN)) {
        if (stryMutAct_9fa48("110702")) {
          {}
        } else {
          stryCov_9fa48("110702");
          this.collectProjectedColumns(expr.expression, tableAlias, out);
          for (const valueExpr of stryMutAct_9fa48("110705") ? expr.values && [] : stryMutAct_9fa48("110704") ? false : stryMutAct_9fa48("110703") ? true : (stryCov_9fa48("110703", "110704", "110705"), expr.values || (stryMutAct_9fa48("110706") ? ["Stryker was here"] : (stryCov_9fa48("110706"), [])))) {
            if (stryMutAct_9fa48("110707")) {
              {}
            } else {
              stryCov_9fa48("110707");
              this.collectProjectedColumns(valueExpr, tableAlias, out);
            }
          }
          return;
        }
      }
      if (stryMutAct_9fa48("110710") ? expr.type !== QUERY_AST_NODE.BETWEEN : stryMutAct_9fa48("110709") ? false : stryMutAct_9fa48("110708") ? true : (stryCov_9fa48("110708", "110709", "110710"), expr.type === QUERY_AST_NODE.BETWEEN)) {
        if (stryMutAct_9fa48("110711")) {
          {}
        } else {
          stryCov_9fa48("110711");
          this.collectProjectedColumns(expr.expression, tableAlias, out);
          this.collectProjectedColumns(expr.low, tableAlias, out);
          this.collectProjectedColumns(expr.high, tableAlias, out);
          return;
        }
      }
      if (stryMutAct_9fa48("110714") ? expr.type !== QUERY_AST_NODE.AGGREGATE : stryMutAct_9fa48("110713") ? false : stryMutAct_9fa48("110712") ? true : (stryCov_9fa48("110712", "110713", "110714"), expr.type === QUERY_AST_NODE.AGGREGATE)) {
        if (stryMutAct_9fa48("110715")) {
          {}
        } else {
          stryCov_9fa48("110715");
          this.collectProjectedColumns(expr.argument, tableAlias, out);
        }
      }
    }
  }

  /**
   * Build pushdown fragment SQL for one table access plan.
   * @param {Object} tablePlan - Table access plan.
   * @return {string} Fragment SQL.
   * @private
   */
  buildFragmentSql(tablePlan) {
    if (stryMutAct_9fa48("110716")) {
      {}
    } else {
      stryCov_9fa48("110716");
      const projection = (stryMutAct_9fa48("110719") ? Array.isArray(tablePlan.projectedColumns) || tablePlan.projectedColumns.length > NUM.ZERO : stryMutAct_9fa48("110718") ? false : stryMutAct_9fa48("110717") ? true : (stryCov_9fa48("110717", "110718", "110719"), Array.isArray(tablePlan.projectedColumns) && (stryMutAct_9fa48("110722") ? tablePlan.projectedColumns.length <= NUM.ZERO : stryMutAct_9fa48("110721") ? tablePlan.projectedColumns.length >= NUM.ZERO : stryMutAct_9fa48("110720") ? true : (stryCov_9fa48("110720", "110721", "110722"), tablePlan.projectedColumns.length > NUM.ZERO)))) ? tablePlan.projectedColumns.join(stryMutAct_9fa48("110723") ? "" : (stryCov_9fa48("110723"), ', ')) : stryMutAct_9fa48("110724") ? "" : (stryCov_9fa48("110724"), '*');
      const aliasSuffix = (stryMutAct_9fa48("110727") ? tablePlan.tableAlias || tablePlan.tableAlias !== tablePlan.tableName : stryMutAct_9fa48("110726") ? false : stryMutAct_9fa48("110725") ? true : (stryCov_9fa48("110725", "110726", "110727"), tablePlan.tableAlias && (stryMutAct_9fa48("110729") ? tablePlan.tableAlias === tablePlan.tableName : stryMutAct_9fa48("110728") ? true : (stryCov_9fa48("110728", "110729"), tablePlan.tableAlias !== tablePlan.tableName)))) ? stryMutAct_9fa48("110730") ? `` : (stryCov_9fa48("110730"), ` AS ${tablePlan.tableAlias}`) : stryMutAct_9fa48("110731") ? "Stryker was here!" : (stryCov_9fa48("110731"), '');
      let sql = stryMutAct_9fa48("110732") ? `` : (stryCov_9fa48("110732"), `SELECT ${projection} FROM ${tablePlan.tableName}${aliasSuffix}`);
      if (stryMutAct_9fa48("110734") ? false : stryMutAct_9fa48("110733") ? true : (stryCov_9fa48("110733", "110734"), tablePlan.localPredicate)) {
        if (stryMutAct_9fa48("110735")) {
          {}
        } else {
          stryCov_9fa48("110735");
          sql += stryMutAct_9fa48("110736") ? `` : (stryCov_9fa48("110736"), ` WHERE ${this.renderExpression(tablePlan.localPredicate)}`);
        }
      }
      return sql;
    }
  }

  /**
   * Render a planner expression to SQL for fragment diagnostics.
   * @param {Object} expr - Expression AST.
   * @return {string} SQL expression.
   * @private
   */
  renderExpression(expr) {
    if (stryMutAct_9fa48("110737")) {
      {}
    } else {
      stryCov_9fa48("110737");
      if (stryMutAct_9fa48("110740") ? !expr && typeof expr !== TYPEOF.OBJECT : stryMutAct_9fa48("110739") ? false : stryMutAct_9fa48("110738") ? true : (stryCov_9fa48("110738", "110739", "110740"), (stryMutAct_9fa48("110741") ? expr : (stryCov_9fa48("110741"), !expr)) || (stryMutAct_9fa48("110743") ? typeof expr === TYPEOF.OBJECT : stryMutAct_9fa48("110742") ? false : (stryCov_9fa48("110742", "110743"), typeof expr !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("110744")) {
          {}
        } else {
          stryCov_9fa48("110744");
          return stryMutAct_9fa48("110745") ? "Stryker was here!" : (stryCov_9fa48("110745"), '');
        }
      }
      if (stryMutAct_9fa48("110748") ? expr.type !== QUERY_AST_NODE.LITERAL : stryMutAct_9fa48("110747") ? false : stryMutAct_9fa48("110746") ? true : (stryCov_9fa48("110746", "110747", "110748"), expr.type === QUERY_AST_NODE.LITERAL)) {
        if (stryMutAct_9fa48("110749")) {
          {}
        } else {
          stryCov_9fa48("110749");
          if (stryMutAct_9fa48("110752") ? expr.value !== null : stryMutAct_9fa48("110751") ? false : stryMutAct_9fa48("110750") ? true : (stryCov_9fa48("110750", "110751", "110752"), expr.value === null)) {
            if (stryMutAct_9fa48("110753")) {
              {}
            } else {
              stryCov_9fa48("110753");
              return stryMutAct_9fa48("110754") ? "" : (stryCov_9fa48("110754"), 'NULL');
            }
          }
          if (stryMutAct_9fa48("110757") ? typeof expr.value !== TYPEOF.STRING : stryMutAct_9fa48("110756") ? false : stryMutAct_9fa48("110755") ? true : (stryCov_9fa48("110755", "110756", "110757"), typeof expr.value === TYPEOF.STRING)) {
            if (stryMutAct_9fa48("110758")) {
              {}
            } else {
              stryCov_9fa48("110758");
              return stryMutAct_9fa48("110759") ? `` : (stryCov_9fa48("110759"), `'${expr.value.replace(/'/g, stryMutAct_9fa48("110760") ? "" : (stryCov_9fa48("110760"), '\'\''))}'`);
            }
          }
          return String(expr.value);
        }
      }
      if (stryMutAct_9fa48("110763") ? expr.type !== QUERY_AST_NODE.PARAMETER : stryMutAct_9fa48("110762") ? false : stryMutAct_9fa48("110761") ? true : (stryCov_9fa48("110761", "110762", "110763"), expr.type === QUERY_AST_NODE.PARAMETER)) {
        if (stryMutAct_9fa48("110764")) {
          {}
        } else {
          stryCov_9fa48("110764");
          return stryMutAct_9fa48("110765") ? "" : (stryCov_9fa48("110765"), '?');
        }
      }
      if (stryMutAct_9fa48("110768") ? expr.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("110767") ? false : stryMutAct_9fa48("110766") ? true : (stryCov_9fa48("110766", "110767", "110768"), expr.type === QUERY_AST_NODE.COLUMN_REF)) {
        if (stryMutAct_9fa48("110769")) {
          {}
        } else {
          stryCov_9fa48("110769");
          if (stryMutAct_9fa48("110771") ? false : stryMutAct_9fa48("110770") ? true : (stryCov_9fa48("110770", "110771"), expr.table)) {
            if (stryMutAct_9fa48("110772")) {
              {}
            } else {
              stryCov_9fa48("110772");
              return stryMutAct_9fa48("110773") ? `` : (stryCov_9fa48("110773"), `${expr.table}.${expr.column}`);
            }
          }
          return expr.column;
        }
      }
      if (stryMutAct_9fa48("110776") ? expr.type !== QUERY_AST_NODE.UNARY : stryMutAct_9fa48("110775") ? false : stryMutAct_9fa48("110774") ? true : (stryCov_9fa48("110774", "110775", "110776"), expr.type === QUERY_AST_NODE.UNARY)) {
        if (stryMutAct_9fa48("110777")) {
          {}
        } else {
          stryCov_9fa48("110777");
          return stryMutAct_9fa48("110778") ? `` : (stryCov_9fa48("110778"), `${expr.operator} ${this.renderExpression(expr.operand)}`);
        }
      }
      if (stryMutAct_9fa48("110781") ? expr.type !== QUERY_AST_NODE.BINARY : stryMutAct_9fa48("110780") ? false : stryMutAct_9fa48("110779") ? true : (stryCov_9fa48("110779", "110780", "110781"), expr.type === QUERY_AST_NODE.BINARY)) {
        if (stryMutAct_9fa48("110782")) {
          {}
        } else {
          stryCov_9fa48("110782");
          return (stryMutAct_9fa48("110783") ? `` : (stryCov_9fa48("110783"), `${this.renderExpression(expr.left)} `)) + (stryMutAct_9fa48("110784") ? `` : (stryCov_9fa48("110784"), `${expr.operator} `)) + (stryMutAct_9fa48("110785") ? `` : (stryCov_9fa48("110785"), `${this.renderExpression(expr.right)}`));
        }
      }
      if (stryMutAct_9fa48("110788") ? expr.type !== QUERY_AST_NODE.IN : stryMutAct_9fa48("110787") ? false : stryMutAct_9fa48("110786") ? true : (stryCov_9fa48("110786", "110787", "110788"), expr.type === QUERY_AST_NODE.IN)) {
        if (stryMutAct_9fa48("110789")) {
          {}
        } else {
          stryCov_9fa48("110789");
          const values = (stryMutAct_9fa48("110792") ? expr.values && [] : stryMutAct_9fa48("110791") ? false : stryMutAct_9fa48("110790") ? true : (stryCov_9fa48("110790", "110791", "110792"), expr.values || (stryMutAct_9fa48("110793") ? ["Stryker was here"] : (stryCov_9fa48("110793"), [])))).map(stryMutAct_9fa48("110794") ? () => undefined : (stryCov_9fa48("110794"), valueExpr => this.renderExpression(valueExpr))).join(stryMutAct_9fa48("110795") ? "" : (stryCov_9fa48("110795"), ', '));
          return stryMutAct_9fa48("110796") ? `` : (stryCov_9fa48("110796"), `${this.renderExpression(expr.expression)} IN (${values})`);
        }
      }
      if (stryMutAct_9fa48("110799") ? expr.type !== QUERY_AST_NODE.BETWEEN : stryMutAct_9fa48("110798") ? false : stryMutAct_9fa48("110797") ? true : (stryCov_9fa48("110797", "110798", "110799"), expr.type === QUERY_AST_NODE.BETWEEN)) {
        if (stryMutAct_9fa48("110800")) {
          {}
        } else {
          stryCov_9fa48("110800");
          return (stryMutAct_9fa48("110801") ? `` : (stryCov_9fa48("110801"), `${this.renderExpression(expr.expression)} BETWEEN `)) + (stryMutAct_9fa48("110802") ? `` : (stryCov_9fa48("110802"), `${this.renderExpression(expr.low)} AND `)) + (stryMutAct_9fa48("110803") ? `` : (stryCov_9fa48("110803"), `${this.renderExpression(expr.high)}`));
        }
      }
      if (stryMutAct_9fa48("110806") ? expr.type !== QUERY_AST_NODE.LIKE : stryMutAct_9fa48("110805") ? false : stryMutAct_9fa48("110804") ? true : (stryCov_9fa48("110804", "110805", "110806"), expr.type === QUERY_AST_NODE.LIKE)) {
        if (stryMutAct_9fa48("110807")) {
          {}
        } else {
          stryCov_9fa48("110807");
          return (stryMutAct_9fa48("110808") ? `` : (stryCov_9fa48("110808"), `${this.renderExpression(expr.expression)} LIKE `)) + (stryMutAct_9fa48("110809") ? `` : (stryCov_9fa48("110809"), `${this.renderExpression(expr.pattern)}`));
        }
      }
      return stryMutAct_9fa48("110810") ? "Stryker was here!" : (stryCov_9fa48("110810"), '');
    }
  }
}
export { DistributedQueryPlanner };