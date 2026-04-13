/**
 * Query Optimizer - Uses indices for query optimization.
 * Analyzes queries and determines which indices can be used.
 * Requirements: 12.4
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
import { LoggingService } from '../logging/logging-service.js';
import { INDEX_COST, INDEX_HINT, INDEX_LOG_MSG, INDEX_PRIORITY, INDEX_SUBSYSTEM, INDEX_USAGE } from './index-constants.js';
import { QUERY_AST_NODE, QUERY_AST_TYPE } from '../query/query-constants.js';

/**
 * QueryOptimizer analyzes queries and determines optimal index usage.
 * It examines WHERE clauses and JOIN conditions to identify
 * which indices can be used to speed up query execution.
 */
class QueryOptimizer {
  /**
   * Create a new QueryOptimizer.
   * @param {Object} options - Configuration options.
   * @param {Object} options.indexService - Index service for index metadata.
   * @param {Object} options.systemTableCache - System table cache for table metadata.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("80388")) {
      {}
    } else {
      stryCov_9fa48("80388");
      this.indexService = stryMutAct_9fa48("80391") ? options.indexService && null : stryMutAct_9fa48("80390") ? false : stryMutAct_9fa48("80389") ? true : (stryCov_9fa48("80389", "80390", "80391"), options.indexService || null);
      this.systemTableCache = stryMutAct_9fa48("80394") ? options.systemTableCache && null : stryMutAct_9fa48("80393") ? false : stryMutAct_9fa48("80392") ? true : (stryCov_9fa48("80392", "80393", "80394"), options.systemTableCache || null);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(INDEX_SUBSYSTEM.QUERY_OPTIMIZER) : console;
    }
  }

  /**
   * Analyze a query AST and return optimization hints.
   * Requirements: 12.4
   * @param {Object} ast - Parsed query AST.
   * @param {string} tableId - Table ID being queried.
   * @return {Object} Optimization hints.
   */
  analyzeQuery(ast, tableId) {
    if (stryMutAct_9fa48("80395")) {
      {}
    } else {
      stryCov_9fa48("80395");
      if (stryMutAct_9fa48("80398") ? !ast && !tableId : stryMutAct_9fa48("80397") ? false : stryMutAct_9fa48("80396") ? true : (stryCov_9fa48("80396", "80397", "80398"), (stryMutAct_9fa48("80399") ? ast : (stryCov_9fa48("80399"), !ast)) || (stryMutAct_9fa48("80400") ? tableId : (stryCov_9fa48("80400"), !tableId)))) {
        if (stryMutAct_9fa48("80401")) {
          {}
        } else {
          stryCov_9fa48("80401");
          return stryMutAct_9fa48("80402") ? {} : (stryCov_9fa48("80402"), {
            usableIndices: stryMutAct_9fa48("80403") ? ["Stryker was here"] : (stryCov_9fa48("80403"), []),
            hints: stryMutAct_9fa48("80404") ? ["Stryker was here"] : (stryCov_9fa48("80404"), [])
          });
        }
      }
      const result = stryMutAct_9fa48("80405") ? {} : (stryCov_9fa48("80405"), {
        usableIndices: stryMutAct_9fa48("80406") ? ["Stryker was here"] : (stryCov_9fa48("80406"), []),
        hints: stryMutAct_9fa48("80407") ? ["Stryker was here"] : (stryCov_9fa48("80407"), []),
        estimatedCost: INDEX_COST.FULL_SCAN
      });

      // Get available indices for the table
      const indices = this.getIndicesForTable(tableId);

      // Analyze based on query type
      switch (ast.type) {
        case QUERY_AST_TYPE.SELECT:
          if (stryMutAct_9fa48("80408")) {} else {
            stryCov_9fa48("80408");
            this.analyzeSelectQuery(ast, indices, result);
            break;
          }
        case QUERY_AST_TYPE.UPDATE:
          if (stryMutAct_9fa48("80409")) {} else {
            stryCov_9fa48("80409");
            this.analyzeUpdateQuery(ast, indices, result);
            break;
          }
        case QUERY_AST_TYPE.DELETE:
          if (stryMutAct_9fa48("80410")) {} else {
            stryCov_9fa48("80410");
            this.analyzeDeleteQuery(ast, indices, result);
            break;
          }
        default:
          if (stryMutAct_9fa48("80411")) {} else {
            stryCov_9fa48("80411");
            // INSERT doesn't benefit from index optimization for reads
            break;
          }
      }
      return result;
    }
  }

  /**
   * Analyze a SELECT query for index usage.
   * @param {Object} ast - SELECT AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeSelectQuery(ast, indices, result) {
    if (stryMutAct_9fa48("80412")) {
      {}
    } else {
      stryCov_9fa48("80412");
      // Extract columns from WHERE clause
      const whereColumns = this.extractWhereColumns(ast.where);

      // Extract columns from ORDER BY clause
      const orderByColumns = this.extractOrderByColumns(ast.orderBy);

      // Extract columns from JOIN conditions
      const joinColumns = this.extractJoinColumns(ast.joins);

      // Find usable indices for WHERE clause
      for (const index of indices) {
        if (stryMutAct_9fa48("80413")) {
          {}
        } else {
          stryCov_9fa48("80413");
          const indexColumns = index.columnNames;

          // Check if index can be used for WHERE clause
          const whereMatch = this.checkIndexMatch(indexColumns, whereColumns);
          if (stryMutAct_9fa48("80415") ? false : stryMutAct_9fa48("80414") ? true : (stryCov_9fa48("80414", "80415"), whereMatch.usable)) {
            if (stryMutAct_9fa48("80416")) {
              {}
            } else {
              stryCov_9fa48("80416");
              result.usableIndices.push(stryMutAct_9fa48("80417") ? {} : (stryCov_9fa48("80417"), {
                indexName: index.indexName,
                usage: INDEX_USAGE.WHERE,
                matchedColumns: whereMatch.matchedColumns,
                coveringIndex: whereMatch.covering
              }));
              result.estimatedCost = INDEX_COST.INDEX_SCAN;
            }
          }

          // Check if index can be used for ORDER BY
          const orderMatch = this.checkIndexMatch(indexColumns, orderByColumns);
          if (stryMutAct_9fa48("80419") ? false : stryMutAct_9fa48("80418") ? true : (stryCov_9fa48("80418", "80419"), orderMatch.usable)) {
            if (stryMutAct_9fa48("80420")) {
              {}
            } else {
              stryCov_9fa48("80420");
              result.usableIndices.push(stryMutAct_9fa48("80421") ? {} : (stryCov_9fa48("80421"), {
                indexName: index.indexName,
                usage: INDEX_USAGE.ORDER_BY,
                matchedColumns: orderMatch.matchedColumns
              }));
            }
          }

          // Check if index can be used for JOIN
          const joinMatch = this.checkIndexMatch(indexColumns, joinColumns);
          if (stryMutAct_9fa48("80423") ? false : stryMutAct_9fa48("80422") ? true : (stryCov_9fa48("80422", "80423"), joinMatch.usable)) {
            if (stryMutAct_9fa48("80424")) {
              {}
            } else {
              stryCov_9fa48("80424");
              result.usableIndices.push(stryMutAct_9fa48("80425") ? {} : (stryCov_9fa48("80425"), {
                indexName: index.indexName,
                usage: INDEX_USAGE.JOIN,
                matchedColumns: joinMatch.matchedColumns
              }));
            }
          }
        }
      }

      // Generate hints
      if (stryMutAct_9fa48("80428") ? result.usableIndices.length === 0 || whereColumns.length > 0 : stryMutAct_9fa48("80427") ? false : stryMutAct_9fa48("80426") ? true : (stryCov_9fa48("80426", "80427", "80428"), (stryMutAct_9fa48("80430") ? result.usableIndices.length !== 0 : stryMutAct_9fa48("80429") ? true : (stryCov_9fa48("80429", "80430"), result.usableIndices.length === 0)) && (stryMutAct_9fa48("80433") ? whereColumns.length <= 0 : stryMutAct_9fa48("80432") ? whereColumns.length >= 0 : stryMutAct_9fa48("80431") ? true : (stryCov_9fa48("80431", "80432", "80433"), whereColumns.length > 0)))) {
        if (stryMutAct_9fa48("80434")) {
          {}
        } else {
          stryCov_9fa48("80434");
          result.hints.push(stryMutAct_9fa48("80435") ? `` : (stryCov_9fa48("80435"), `${INDEX_HINT.WHERE_GENERIC_PREFIX}${whereColumns.join(stryMutAct_9fa48("80436") ? "" : (stryCov_9fa48("80436"), ', '))}`));
        }
      }
      if (stryMutAct_9fa48("80439") ? orderByColumns.length > 0 || !result.usableIndices.some(i => i.usage === 'order_by') : stryMutAct_9fa48("80438") ? false : stryMutAct_9fa48("80437") ? true : (stryCov_9fa48("80437", "80438", "80439"), (stryMutAct_9fa48("80442") ? orderByColumns.length <= 0 : stryMutAct_9fa48("80441") ? orderByColumns.length >= 0 : stryMutAct_9fa48("80440") ? true : (stryCov_9fa48("80440", "80441", "80442"), orderByColumns.length > 0)) && (stryMutAct_9fa48("80443") ? result.usableIndices.some(i => i.usage === 'order_by') : (stryCov_9fa48("80443"), !(stryMutAct_9fa48("80444") ? result.usableIndices.every(i => i.usage === 'order_by') : (stryCov_9fa48("80444"), result.usableIndices.some(stryMutAct_9fa48("80445") ? () => undefined : (stryCov_9fa48("80445"), i => stryMutAct_9fa48("80448") ? i.usage !== 'order_by' : stryMutAct_9fa48("80447") ? false : stryMutAct_9fa48("80446") ? true : (stryCov_9fa48("80446", "80447", "80448"), i.usage === (stryMutAct_9fa48("80449") ? "" : (stryCov_9fa48("80449"), 'order_by'))))))))))) {
        if (stryMutAct_9fa48("80450")) {
          {}
        } else {
          stryCov_9fa48("80450");
          result.hints.push(stryMutAct_9fa48("80451") ? `` : (stryCov_9fa48("80451"), `${INDEX_HINT.ORDER_BY_PREFIX}${orderByColumns.join(stryMutAct_9fa48("80452") ? "" : (stryCov_9fa48("80452"), ', '))}`));
        }
      }
    }
  }

  /**
   * Analyze an UPDATE query for index usage.
   * @param {Object} ast - UPDATE AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeUpdateQuery(ast, indices, result) {
    if (stryMutAct_9fa48("80453")) {
      {}
    } else {
      stryCov_9fa48("80453");
      const whereColumns = this.extractWhereColumns(ast.where);
      for (const index of indices) {
        if (stryMutAct_9fa48("80454")) {
          {}
        } else {
          stryCov_9fa48("80454");
          const whereMatch = this.checkIndexMatch(index.columnNames, whereColumns);
          if (stryMutAct_9fa48("80456") ? false : stryMutAct_9fa48("80455") ? true : (stryCov_9fa48("80455", "80456"), whereMatch.usable)) {
            if (stryMutAct_9fa48("80457")) {
              {}
            } else {
              stryCov_9fa48("80457");
              result.usableIndices.push(stryMutAct_9fa48("80458") ? {} : (stryCov_9fa48("80458"), {
                indexName: index.indexName,
                usage: INDEX_USAGE.WHERE,
                matchedColumns: whereMatch.matchedColumns
              }));
              result.estimatedCost = INDEX_COST.INDEX_SCAN;
            }
          }
        }
      }
      if (stryMutAct_9fa48("80461") ? result.usableIndices.length === 0 || whereColumns.length > 0 : stryMutAct_9fa48("80460") ? false : stryMutAct_9fa48("80459") ? true : (stryCov_9fa48("80459", "80460", "80461"), (stryMutAct_9fa48("80463") ? result.usableIndices.length !== 0 : stryMutAct_9fa48("80462") ? true : (stryCov_9fa48("80462", "80463"), result.usableIndices.length === 0)) && (stryMutAct_9fa48("80466") ? whereColumns.length <= 0 : stryMutAct_9fa48("80465") ? whereColumns.length >= 0 : stryMutAct_9fa48("80464") ? true : (stryCov_9fa48("80464", "80465", "80466"), whereColumns.length > 0)))) {
        if (stryMutAct_9fa48("80467")) {
          {}
        } else {
          stryCov_9fa48("80467");
          result.hints.push(stryMutAct_9fa48("80468") ? `` : (stryCov_9fa48("80468"), `${INDEX_HINT.WHERE_PREFIX}${whereColumns.join(stryMutAct_9fa48("80469") ? "" : (stryCov_9fa48("80469"), ', '))}`));
        }
      }
    }
  }

  /**
   * Analyze a DELETE query for index usage.
   * @param {Object} ast - DELETE AST.
   * @param {Array} indices - Available indices.
   * @param {Object} result - Result object to populate.
   * @private
   */
  analyzeDeleteQuery(ast, indices, result) {
    if (stryMutAct_9fa48("80470")) {
      {}
    } else {
      stryCov_9fa48("80470");
      const whereColumns = this.extractWhereColumns(ast.where);
      for (const index of indices) {
        if (stryMutAct_9fa48("80471")) {
          {}
        } else {
          stryCov_9fa48("80471");
          const whereMatch = this.checkIndexMatch(index.columnNames, whereColumns);
          if (stryMutAct_9fa48("80473") ? false : stryMutAct_9fa48("80472") ? true : (stryCov_9fa48("80472", "80473"), whereMatch.usable)) {
            if (stryMutAct_9fa48("80474")) {
              {}
            } else {
              stryCov_9fa48("80474");
              result.usableIndices.push(stryMutAct_9fa48("80475") ? {} : (stryCov_9fa48("80475"), {
                indexName: index.indexName,
                usage: INDEX_USAGE.WHERE,
                matchedColumns: whereMatch.matchedColumns
              }));
              result.estimatedCost = INDEX_COST.INDEX_SCAN;
            }
          }
        }
      }
      if (stryMutAct_9fa48("80478") ? result.usableIndices.length === 0 || whereColumns.length > 0 : stryMutAct_9fa48("80477") ? false : stryMutAct_9fa48("80476") ? true : (stryCov_9fa48("80476", "80477", "80478"), (stryMutAct_9fa48("80480") ? result.usableIndices.length !== 0 : stryMutAct_9fa48("80479") ? true : (stryCov_9fa48("80479", "80480"), result.usableIndices.length === 0)) && (stryMutAct_9fa48("80483") ? whereColumns.length <= 0 : stryMutAct_9fa48("80482") ? whereColumns.length >= 0 : stryMutAct_9fa48("80481") ? true : (stryCov_9fa48("80481", "80482", "80483"), whereColumns.length > 0)))) {
        if (stryMutAct_9fa48("80484")) {
          {}
        } else {
          stryCov_9fa48("80484");
          result.hints.push(stryMutAct_9fa48("80485") ? `` : (stryCov_9fa48("80485"), `${INDEX_HINT.WHERE_PREFIX}${whereColumns.join(stryMutAct_9fa48("80486") ? "" : (stryCov_9fa48("80486"), ', '))}`));
        }
      }
    }
  }

  /**
   * Extract column names from a WHERE clause.
   * @param {Object} where - WHERE clause AST.
   * @return {Array<string>} Column names.
   * @private
   */
  extractWhereColumns(where) {
    if (stryMutAct_9fa48("80487")) {
      {}
    } else {
      stryCov_9fa48("80487");
      const columns = stryMutAct_9fa48("80488") ? ["Stryker was here"] : (stryCov_9fa48("80488"), []);
      if (stryMutAct_9fa48("80491") ? false : stryMutAct_9fa48("80490") ? true : stryMutAct_9fa48("80489") ? where : (stryCov_9fa48("80489", "80490", "80491"), !where)) {
        if (stryMutAct_9fa48("80492")) {
          {}
        } else {
          stryCov_9fa48("80492");
          return columns;
        }
      }
      this.traverseExpression(where, node => {
        if (stryMutAct_9fa48("80493")) {
          {}
        } else {
          stryCov_9fa48("80493");
          if (stryMutAct_9fa48("80496") ? node.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("80495") ? false : stryMutAct_9fa48("80494") ? true : (stryCov_9fa48("80494", "80495", "80496"), node.type === QUERY_AST_NODE.COLUMN_REF)) {
            if (stryMutAct_9fa48("80497")) {
              {}
            } else {
              stryCov_9fa48("80497");
              columns.push(node.column);
            }
          }
        }
      });
      return stryMutAct_9fa48("80498") ? [] : (stryCov_9fa48("80498"), [...new Set(columns)]); // Remove duplicates
    }
  }

  /**
   * Extract column names from ORDER BY clause.
   * @param {Array} orderBy - ORDER BY clause AST.
   * @return {Array<string>} Column names.
   * @private
   */
  extractOrderByColumns(orderBy) {
    if (stryMutAct_9fa48("80499")) {
      {}
    } else {
      stryCov_9fa48("80499");
      if (stryMutAct_9fa48("80502") ? !orderBy && !Array.isArray(orderBy) : stryMutAct_9fa48("80501") ? false : stryMutAct_9fa48("80500") ? true : (stryCov_9fa48("80500", "80501", "80502"), (stryMutAct_9fa48("80503") ? orderBy : (stryCov_9fa48("80503"), !orderBy)) || (stryMutAct_9fa48("80504") ? Array.isArray(orderBy) : (stryCov_9fa48("80504"), !Array.isArray(orderBy))))) {
        if (stryMutAct_9fa48("80505")) {
          {}
        } else {
          stryCov_9fa48("80505");
          return stryMutAct_9fa48("80506") ? ["Stryker was here"] : (stryCov_9fa48("80506"), []);
        }
      }
      return stryMutAct_9fa48("80507") ? orderBy.map(item => {
        if (item.expression?.type === QUERY_AST_NODE.COLUMN_REF) {
          return item.expression.column;
        }
        return item.column;
      }) : (stryCov_9fa48("80507"), orderBy.map(item => {
        if (stryMutAct_9fa48("80508")) {
          {}
        } else {
          stryCov_9fa48("80508");
          if (stryMutAct_9fa48("80511") ? item.expression?.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("80510") ? false : stryMutAct_9fa48("80509") ? true : (stryCov_9fa48("80509", "80510", "80511"), (stryMutAct_9fa48("80512") ? item.expression.type : (stryCov_9fa48("80512"), item.expression?.type)) === QUERY_AST_NODE.COLUMN_REF)) {
            if (stryMutAct_9fa48("80513")) {
              {}
            } else {
              stryCov_9fa48("80513");
              return item.expression.column;
            }
          }
          return item.column;
        }
      }).filter(Boolean));
    }
  }

  /**
   * Extract column names from JOIN conditions.
   * @param {Array} joins - JOIN clauses AST.
   * @return {Array<string>} Column names.
   * @private
   */
  extractJoinColumns(joins) {
    if (stryMutAct_9fa48("80514")) {
      {}
    } else {
      stryCov_9fa48("80514");
      const columns = stryMutAct_9fa48("80515") ? ["Stryker was here"] : (stryCov_9fa48("80515"), []);
      if (stryMutAct_9fa48("80518") ? !joins && !Array.isArray(joins) : stryMutAct_9fa48("80517") ? false : stryMutAct_9fa48("80516") ? true : (stryCov_9fa48("80516", "80517", "80518"), (stryMutAct_9fa48("80519") ? joins : (stryCov_9fa48("80519"), !joins)) || (stryMutAct_9fa48("80520") ? Array.isArray(joins) : (stryCov_9fa48("80520"), !Array.isArray(joins))))) {
        if (stryMutAct_9fa48("80521")) {
          {}
        } else {
          stryCov_9fa48("80521");
          return columns;
        }
      }
      for (const join of joins) {
        if (stryMutAct_9fa48("80522")) {
          {}
        } else {
          stryCov_9fa48("80522");
          if (stryMutAct_9fa48("80524") ? false : stryMutAct_9fa48("80523") ? true : (stryCov_9fa48("80523", "80524"), join.condition)) {
            if (stryMutAct_9fa48("80525")) {
              {}
            } else {
              stryCov_9fa48("80525");
              this.traverseExpression(join.condition, node => {
                if (stryMutAct_9fa48("80526")) {
                  {}
                } else {
                  stryCov_9fa48("80526");
                  if (stryMutAct_9fa48("80529") ? node.type !== QUERY_AST_NODE.COLUMN_REF : stryMutAct_9fa48("80528") ? false : stryMutAct_9fa48("80527") ? true : (stryCov_9fa48("80527", "80528", "80529"), node.type === QUERY_AST_NODE.COLUMN_REF)) {
                    if (stryMutAct_9fa48("80530")) {
                      {}
                    } else {
                      stryCov_9fa48("80530");
                      columns.push(node.column);
                    }
                  }
                }
              });
            }
          }
        }
      }
      return stryMutAct_9fa48("80531") ? [] : (stryCov_9fa48("80531"), [...new Set(columns)]);
    }
  }

  /**
   * Traverse an expression AST and call callback for each node.
   * @param {Object} node - AST node.
   * @param {Function} callback - Callback function.
   * @private
   */
  traverseExpression(node, callback) {
    if (stryMutAct_9fa48("80532")) {
      {}
    } else {
      stryCov_9fa48("80532");
      if (stryMutAct_9fa48("80535") ? false : stryMutAct_9fa48("80534") ? true : stryMutAct_9fa48("80533") ? node : (stryCov_9fa48("80533", "80534", "80535"), !node)) return;
      callback(node);
      if (stryMutAct_9fa48("80537") ? false : stryMutAct_9fa48("80536") ? true : (stryCov_9fa48("80536", "80537"), node.left)) this.traverseExpression(node.left, callback);
      if (stryMutAct_9fa48("80539") ? false : stryMutAct_9fa48("80538") ? true : (stryCov_9fa48("80538", "80539"), node.right)) this.traverseExpression(node.right, callback);
      if (stryMutAct_9fa48("80541") ? false : stryMutAct_9fa48("80540") ? true : (stryCov_9fa48("80540", "80541"), node.operand)) this.traverseExpression(node.operand, callback);
      if (stryMutAct_9fa48("80543") ? false : stryMutAct_9fa48("80542") ? true : (stryCov_9fa48("80542", "80543"), node.expression)) this.traverseExpression(node.expression, callback);
      if (stryMutAct_9fa48("80546") ? node.values || Array.isArray(node.values) : stryMutAct_9fa48("80545") ? false : stryMutAct_9fa48("80544") ? true : (stryCov_9fa48("80544", "80545", "80546"), node.values && Array.isArray(node.values))) {
        if (stryMutAct_9fa48("80547")) {
          {}
        } else {
          stryCov_9fa48("80547");
          for (const v of node.values) {
            if (stryMutAct_9fa48("80548")) {
              {}
            } else {
              stryCov_9fa48("80548");
              this.traverseExpression(v, callback);
            }
          }
        }
      }
    }
  }

  /**
   * Check if an index can be used for a set of columns.
   * @param {Array<string>} indexColumns - Index column names.
   * @param {Array<string>} queryColumns - Query column names.
   * @return {Object} Match result.
   * @private
   */
  checkIndexMatch(indexColumns, queryColumns) {
    if (stryMutAct_9fa48("80549")) {
      {}
    } else {
      stryCov_9fa48("80549");
      if (stryMutAct_9fa48("80552") ? (!indexColumns || !queryColumns) && queryColumns.length === 0 : stryMutAct_9fa48("80551") ? false : stryMutAct_9fa48("80550") ? true : (stryCov_9fa48("80550", "80551", "80552"), (stryMutAct_9fa48("80554") ? !indexColumns && !queryColumns : stryMutAct_9fa48("80553") ? false : (stryCov_9fa48("80553", "80554"), (stryMutAct_9fa48("80555") ? indexColumns : (stryCov_9fa48("80555"), !indexColumns)) || (stryMutAct_9fa48("80556") ? queryColumns : (stryCov_9fa48("80556"), !queryColumns)))) || (stryMutAct_9fa48("80558") ? queryColumns.length !== 0 : stryMutAct_9fa48("80557") ? false : (stryCov_9fa48("80557", "80558"), queryColumns.length === 0)))) {
        if (stryMutAct_9fa48("80559")) {
          {}
        } else {
          stryCov_9fa48("80559");
          return stryMutAct_9fa48("80560") ? {} : (stryCov_9fa48("80560"), {
            usable: stryMutAct_9fa48("80561") ? true : (stryCov_9fa48("80561"), false),
            matchedColumns: stryMutAct_9fa48("80562") ? ["Stryker was here"] : (stryCov_9fa48("80562"), []),
            covering: stryMutAct_9fa48("80563") ? true : (stryCov_9fa48("80563"), false)
          });
        }
      }
      const matchedColumns = stryMutAct_9fa48("80564") ? ["Stryker was here"] : (stryCov_9fa48("80564"), []);

      // Check if index prefix matches query columns
      // An index on (a, b, c) can be used for queries on (a), (a, b), or (a, b, c)
      for (let i = 0; stryMutAct_9fa48("80566") ? i < indexColumns.length || i < queryColumns.length : stryMutAct_9fa48("80565") ? false : (stryCov_9fa48("80565", "80566"), (stryMutAct_9fa48("80569") ? i >= indexColumns.length : stryMutAct_9fa48("80568") ? i <= indexColumns.length : stryMutAct_9fa48("80567") ? true : (stryCov_9fa48("80567", "80568", "80569"), i < indexColumns.length)) && (stryMutAct_9fa48("80572") ? i >= queryColumns.length : stryMutAct_9fa48("80571") ? i <= queryColumns.length : stryMutAct_9fa48("80570") ? true : (stryCov_9fa48("80570", "80571", "80572"), i < queryColumns.length))); stryMutAct_9fa48("80573") ? i-- : (stryCov_9fa48("80573"), i++)) {
        if (stryMutAct_9fa48("80574")) {
          {}
        } else {
          stryCov_9fa48("80574");
          if (stryMutAct_9fa48("80576") ? false : stryMutAct_9fa48("80575") ? true : (stryCov_9fa48("80575", "80576"), queryColumns.includes(indexColumns[i]))) {
            if (stryMutAct_9fa48("80577")) {
              {}
            } else {
              stryCov_9fa48("80577");
              matchedColumns.push(indexColumns[i]);
            }
          } else {
            if (stryMutAct_9fa48("80578")) {
              {}
            } else {
              stryCov_9fa48("80578");
              break; // Index prefix must match
            }
          }
        }
      }

      // Also check if any query column matches any index column (less optimal but still useful)
      if (stryMutAct_9fa48("80581") ? matchedColumns.length !== 0 : stryMutAct_9fa48("80580") ? false : stryMutAct_9fa48("80579") ? true : (stryCov_9fa48("80579", "80580", "80581"), matchedColumns.length === 0)) {
        if (stryMutAct_9fa48("80582")) {
          {}
        } else {
          stryCov_9fa48("80582");
          for (const queryCol of queryColumns) {
            if (stryMutAct_9fa48("80583")) {
              {}
            } else {
              stryCov_9fa48("80583");
              if (stryMutAct_9fa48("80585") ? false : stryMutAct_9fa48("80584") ? true : (stryCov_9fa48("80584", "80585"), indexColumns.includes(queryCol))) {
                if (stryMutAct_9fa48("80586")) {
                  {}
                } else {
                  stryCov_9fa48("80586");
                  matchedColumns.push(queryCol);
                }
              }
            }
          }
        }
      }
      const usable = stryMutAct_9fa48("80590") ? matchedColumns.length <= 0 : stryMutAct_9fa48("80589") ? matchedColumns.length >= 0 : stryMutAct_9fa48("80588") ? false : stryMutAct_9fa48("80587") ? true : (stryCov_9fa48("80587", "80588", "80589", "80590"), matchedColumns.length > 0);
      const covering = stryMutAct_9fa48("80593") ? usable || queryColumns.every(col => indexColumns.includes(col)) : stryMutAct_9fa48("80592") ? false : stryMutAct_9fa48("80591") ? true : (stryCov_9fa48("80591", "80592", "80593"), usable && (stryMutAct_9fa48("80594") ? queryColumns.some(col => indexColumns.includes(col)) : (stryCov_9fa48("80594"), queryColumns.every(stryMutAct_9fa48("80595") ? () => undefined : (stryCov_9fa48("80595"), col => indexColumns.includes(col))))));
      return stryMutAct_9fa48("80596") ? {} : (stryCov_9fa48("80596"), {
        usable,
        matchedColumns,
        covering
      });
    }
  }

  /**
   * Get indices for a table.
   * @param {string} tableId - Table ID.
   * @return {Array} Array of index metadata.
   * @private
   */
  getIndicesForTable(tableId) {
    if (stryMutAct_9fa48("80597")) {
      {}
    } else {
      stryCov_9fa48("80597");
      if (stryMutAct_9fa48("80599") ? false : stryMutAct_9fa48("80598") ? true : (stryCov_9fa48("80598", "80599"), this.indexService)) {
        if (stryMutAct_9fa48("80600")) {
          {}
        } else {
          stryCov_9fa48("80600");
          return this.indexService.getIndicesForTable(tableId);
        }
      }
      return stryMutAct_9fa48("80601") ? ["Stryker was here"] : (stryCov_9fa48("80601"), []);
    }
  }

  /**
   * Suggest indices for a query.
   * Requirements: 12.4
   * @param {Object} ast - Parsed query AST.
   * @param {string} tableId - Table ID.
   * @return {Array<Object>} Suggested indices.
   */
  suggestIndices(ast, tableId) {
    if (stryMutAct_9fa48("80602")) {
      {}
    } else {
      stryCov_9fa48("80602");
      const suggestions = stryMutAct_9fa48("80603") ? ["Stryker was here"] : (stryCov_9fa48("80603"), []);
      if (stryMutAct_9fa48("80606") ? false : stryMutAct_9fa48("80605") ? true : stryMutAct_9fa48("80604") ? ast : (stryCov_9fa48("80604", "80605", "80606"), !ast)) {
        if (stryMutAct_9fa48("80607")) {
          {}
        } else {
          stryCov_9fa48("80607");
          return suggestions;
        }
      }

      // Extract all columns used in the query
      const whereColumns = this.extractWhereColumns(ast.where);
      const orderByColumns = this.extractOrderByColumns(ast.orderBy);
      const joinColumns = this.extractJoinColumns(ast.joins);

      // Get existing indices
      const existingIndices = this.getIndicesForTable(tableId);
      const existingIndexColumns = new Set();
      for (const idx of existingIndices) {
        if (stryMutAct_9fa48("80608")) {
          {}
        } else {
          stryCov_9fa48("80608");
          existingIndexColumns.add(idx.columnNames.join(stryMutAct_9fa48("80609") ? "" : (stryCov_9fa48("80609"), ',')));
        }
      }

      // Suggest index for WHERE clause columns
      if (stryMutAct_9fa48("80613") ? whereColumns.length <= 0 : stryMutAct_9fa48("80612") ? whereColumns.length >= 0 : stryMutAct_9fa48("80611") ? false : stryMutAct_9fa48("80610") ? true : (stryCov_9fa48("80610", "80611", "80612", "80613"), whereColumns.length > 0)) {
        if (stryMutAct_9fa48("80614")) {
          {}
        } else {
          stryCov_9fa48("80614");
          const whereKey = stryMutAct_9fa48("80615") ? whereColumns.join(',') : (stryCov_9fa48("80615"), whereColumns.sort().join(stryMutAct_9fa48("80616") ? "" : (stryCov_9fa48("80616"), ',')));
          if (stryMutAct_9fa48("80619") ? false : stryMutAct_9fa48("80618") ? true : stryMutAct_9fa48("80617") ? existingIndexColumns.has(whereKey) : (stryCov_9fa48("80617", "80618", "80619"), !existingIndexColumns.has(whereKey))) {
            if (stryMutAct_9fa48("80620")) {
              {}
            } else {
              stryCov_9fa48("80620");
              suggestions.push(stryMutAct_9fa48("80621") ? {} : (stryCov_9fa48("80621"), {
                columns: whereColumns,
                reason: stryMutAct_9fa48("80622") ? INDEX_HINT.WHERE_PREFIX : (stryCov_9fa48("80622"), INDEX_HINT.WHERE_PREFIX.trim()),
                priority: INDEX_PRIORITY.HIGH
              }));
            }
          }
        }
      }

      // Suggest index for ORDER BY columns
      if (stryMutAct_9fa48("80626") ? orderByColumns.length <= 0 : stryMutAct_9fa48("80625") ? orderByColumns.length >= 0 : stryMutAct_9fa48("80624") ? false : stryMutAct_9fa48("80623") ? true : (stryCov_9fa48("80623", "80624", "80625", "80626"), orderByColumns.length > 0)) {
        if (stryMutAct_9fa48("80627")) {
          {}
        } else {
          stryCov_9fa48("80627");
          const orderKey = orderByColumns.join(stryMutAct_9fa48("80628") ? "" : (stryCov_9fa48("80628"), ','));
          if (stryMutAct_9fa48("80631") ? false : stryMutAct_9fa48("80630") ? true : stryMutAct_9fa48("80629") ? existingIndexColumns.has(orderKey) : (stryCov_9fa48("80629", "80630", "80631"), !existingIndexColumns.has(orderKey))) {
            if (stryMutAct_9fa48("80632")) {
              {}
            } else {
              stryCov_9fa48("80632");
              suggestions.push(stryMutAct_9fa48("80633") ? {} : (stryCov_9fa48("80633"), {
                columns: orderByColumns,
                reason: stryMutAct_9fa48("80634") ? INDEX_HINT.ORDER_BY_PREFIX : (stryCov_9fa48("80634"), INDEX_HINT.ORDER_BY_PREFIX.trim()),
                priority: INDEX_PRIORITY.MEDIUM
              }));
            }
          }
        }
      }

      // Suggest index for JOIN columns
      if (stryMutAct_9fa48("80638") ? joinColumns.length <= 0 : stryMutAct_9fa48("80637") ? joinColumns.length >= 0 : stryMutAct_9fa48("80636") ? false : stryMutAct_9fa48("80635") ? true : (stryCov_9fa48("80635", "80636", "80637", "80638"), joinColumns.length > 0)) {
        if (stryMutAct_9fa48("80639")) {
          {}
        } else {
          stryCov_9fa48("80639");
          for (const col of joinColumns) {
            if (stryMutAct_9fa48("80640")) {
              {}
            } else {
              stryCov_9fa48("80640");
              const hasIndex = stryMutAct_9fa48("80641") ? existingIndices.every(idx => idx.columnNames[0] === col) : (stryCov_9fa48("80641"), existingIndices.some(stryMutAct_9fa48("80642") ? () => undefined : (stryCov_9fa48("80642"), idx => stryMutAct_9fa48("80645") ? idx.columnNames[0] !== col : stryMutAct_9fa48("80644") ? false : stryMutAct_9fa48("80643") ? true : (stryCov_9fa48("80643", "80644", "80645"), idx.columnNames[0] === col))));
              if (stryMutAct_9fa48("80648") ? false : stryMutAct_9fa48("80647") ? true : stryMutAct_9fa48("80646") ? hasIndex : (stryCov_9fa48("80646", "80647", "80648"), !hasIndex)) {
                if (stryMutAct_9fa48("80649")) {
                  {}
                } else {
                  stryCov_9fa48("80649");
                  suggestions.push(stryMutAct_9fa48("80650") ? {} : (stryCov_9fa48("80650"), {
                    columns: stryMutAct_9fa48("80651") ? [] : (stryCov_9fa48("80651"), [col]),
                    reason: stryMutAct_9fa48("80652") ? INDEX_HINT.JOIN_PREFIX : (stryCov_9fa48("80652"), INDEX_HINT.JOIN_PREFIX.trim()),
                    priority: INDEX_PRIORITY.HIGH
                  }));
                }
              }
            }
          }
        }
      }
      return suggestions;
    }
  }

  /**
   * Get query execution plan with index information.
   * Requirements: 12.4
   * @param {Object} ast - Parsed query AST.
   * @param {string} tableId - Table ID.
   * @return {Object} Execution plan.
   */
  getExecutionPlan(ast, tableId) {
    if (stryMutAct_9fa48("80653")) {
      {}
    } else {
      stryCov_9fa48("80653");
      const analysis = this.analyzeQuery(ast, tableId);
      const plan = stryMutAct_9fa48("80654") ? {} : (stryCov_9fa48("80654"), {
        queryType: ast.type,
        tableId,
        estimatedCost: analysis.estimatedCost,
        usedIndices: stryMutAct_9fa48("80655") ? analysis.usableIndices : (stryCov_9fa48("80655"), analysis.usableIndices.filter(stryMutAct_9fa48("80656") ? () => undefined : (stryCov_9fa48("80656"), i => stryMutAct_9fa48("80659") ? i.usage !== INDEX_USAGE.WHERE : stryMutAct_9fa48("80658") ? false : stryMutAct_9fa48("80657") ? true : (stryCov_9fa48("80657", "80658", "80659"), i.usage === INDEX_USAGE.WHERE)))),
        orderByIndex: analysis.usableIndices.find(stryMutAct_9fa48("80660") ? () => undefined : (stryCov_9fa48("80660"), i => stryMutAct_9fa48("80663") ? i.usage !== INDEX_USAGE.ORDER_BY : stryMutAct_9fa48("80662") ? false : stryMutAct_9fa48("80661") ? true : (stryCov_9fa48("80661", "80662", "80663"), i.usage === INDEX_USAGE.ORDER_BY))),
        joinIndices: stryMutAct_9fa48("80664") ? analysis.usableIndices : (stryCov_9fa48("80664"), analysis.usableIndices.filter(stryMutAct_9fa48("80665") ? () => undefined : (stryCov_9fa48("80665"), i => stryMutAct_9fa48("80668") ? i.usage !== INDEX_USAGE.JOIN : stryMutAct_9fa48("80667") ? false : stryMutAct_9fa48("80666") ? true : (stryCov_9fa48("80666", "80667", "80668"), i.usage === INDEX_USAGE.JOIN)))),
        hints: analysis.hints,
        suggestions: this.suggestIndices(ast, tableId)
      });
      this.logger.debug(INDEX_LOG_MSG.EXECUTION_PLAN_GENERATED, stryMutAct_9fa48("80669") ? {} : (stryCov_9fa48("80669"), {
        tableId,
        queryType: ast.type,
        usedIndexCount: plan.usedIndices.length
      }));
      return plan;
    }
  }

  /**
   * Set the index service.
   * @param {Object} service - Index service.
   */
  setIndexService(service) {
    if (stryMutAct_9fa48("80670")) {
      {}
    } else {
      stryCov_9fa48("80670");
      this.indexService = service;
    }
  }

  /**
   * Set the system table cache.
   * @param {Object} cache - System table cache.
   */
  setSystemTableCache(cache) {
    if (stryMutAct_9fa48("80671")) {
      {}
    } else {
      stryCov_9fa48("80671");
      this.systemTableCache = cache;
    }
  }
}
export { QueryOptimizer };