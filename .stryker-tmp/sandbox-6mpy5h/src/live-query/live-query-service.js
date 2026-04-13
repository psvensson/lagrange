/**
 * Live Query Service - Core service for real-time streaming queries.
 * Parses LIVE SELECT statements, extracts partition keys, and compiles predicates.
 * Requirements: 33.1, 33.4, 33.16
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
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { TABLES } from '../constants/index.js';
import { LIVE_QUERY_AST_TYPE, LIVE_QUERY_CONFIG_KEY, LIVE_QUERY_CURSOR, LIVE_QUERY_DEFAULTS, LIVE_QUERY_DEFAULT_VALUE, LIVE_QUERY_ERROR_MSG, LIVE_QUERY_EVENT, LIVE_QUERY_LOG_MSG, LIVE_QUERY_OPERATOR, LIVE_QUERY_REGEX, LIVE_QUERY_REGEX_FLAG, LIVE_QUERY_REGEX_REPLACE, LIVE_QUERY_SQL, LIVE_QUERY_SUBSYSTEM, TYPEOF } from './live-query-constants.js';

/**
 * Live query event types sent to clients.
 */
const LiveQueryEventType = LIVE_QUERY_EVENT;

/**
 * Compiles a WHERE clause AST into an efficient evaluation function.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @return {Function} Predicate function that takes a row and returns boolean.
 */
function compilePredicate(whereClause) {
  if (stryMutAct_9fa48("82465")) {
    {}
  } else {
    stryCov_9fa48("82465");
    if (stryMutAct_9fa48("82468") ? false : stryMutAct_9fa48("82467") ? true : stryMutAct_9fa48("82466") ? whereClause : (stryCov_9fa48("82466", "82467", "82468"), !whereClause)) {
      if (stryMutAct_9fa48("82469")) {
        {}
      } else {
        stryCov_9fa48("82469");
        // No WHERE clause - match all rows
        return stryMutAct_9fa48("82470") ? () => undefined : (stryCov_9fa48("82470"), () => stryMutAct_9fa48("82471") ? false : (stryCov_9fa48("82471"), true));
      }
    }
    return stryMutAct_9fa48("82472") ? () => undefined : (stryCov_9fa48("82472"), row => evaluateExpression(whereClause, row));
  }
}

/**
 * Evaluate an expression against a row.
 * @param {Object} expr - Expression AST node.
 * @param {Object} row - Row data to evaluate against.
 * @return {*} Evaluation result.
 */
function evaluateExpression(expr, row) {
  if (stryMutAct_9fa48("82473")) {
    {}
  } else {
    stryCov_9fa48("82473");
    if (stryMutAct_9fa48("82476") ? false : stryMutAct_9fa48("82475") ? true : stryMutAct_9fa48("82474") ? expr : (stryCov_9fa48("82474", "82475", "82476"), !expr)) return stryMutAct_9fa48("82477") ? false : (stryCov_9fa48("82477"), true);
    switch (expr.type) {
      case LIVE_QUERY_AST_TYPE.BINARY:
        if (stryMutAct_9fa48("82478")) {} else {
          stryCov_9fa48("82478");
          return evaluateBinaryExpression(expr, row);
        }
      case LIVE_QUERY_AST_TYPE.UNARY:
        if (stryMutAct_9fa48("82479")) {} else {
          stryCov_9fa48("82479");
          return evaluateUnaryExpression(expr, row);
        }
      case LIVE_QUERY_AST_TYPE.LITERAL:
        if (stryMutAct_9fa48("82480")) {} else {
          stryCov_9fa48("82480");
          return expr.value;
        }
      case LIVE_QUERY_AST_TYPE.COLUMN_REF:
        if (stryMutAct_9fa48("82481")) {} else {
          stryCov_9fa48("82481");
          return getColumnValue(expr, row);
        }
      case LIVE_QUERY_AST_TYPE.IN:
        if (stryMutAct_9fa48("82482")) {} else {
          stryCov_9fa48("82482");
          return evaluateInExpression(expr, row);
        }
      case LIVE_QUERY_AST_TYPE.BETWEEN:
        if (stryMutAct_9fa48("82483")) {} else {
          stryCov_9fa48("82483");
          return evaluateBetweenExpression(expr, row);
        }
      case LIVE_QUERY_AST_TYPE.LIKE:
        if (stryMutAct_9fa48("82484")) {} else {
          stryCov_9fa48("82484");
          return evaluateLikeExpression(expr, row);
        }
      default:
        if (stryMutAct_9fa48("82485")) {} else {
          stryCov_9fa48("82485");
          return stryMutAct_9fa48("82486") ? false : (stryCov_9fa48("82486"), true);
        }
    }
  }
}

/**
 * Evaluate a binary expression.
 * @param {Object} expr - Binary expression AST.
 * @param {Object} row - Row data.
 * @return {*} Evaluation result.
 */
function evaluateBinaryExpression(expr, row) {
  if (stryMutAct_9fa48("82487")) {
    {}
  } else {
    stryCov_9fa48("82487");
    const {
      operator,
      left,
      right
    } = expr;
    switch (operator) {
      case LIVE_QUERY_OPERATOR.AND:
        if (stryMutAct_9fa48("82488")) {} else {
          stryCov_9fa48("82488");
          return stryMutAct_9fa48("82491") ? evaluateExpression(left, row) || evaluateExpression(right, row) : stryMutAct_9fa48("82490") ? false : stryMutAct_9fa48("82489") ? true : (stryCov_9fa48("82489", "82490", "82491"), evaluateExpression(left, row) && evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.OR:
        if (stryMutAct_9fa48("82492")) {} else {
          stryCov_9fa48("82492");
          return stryMutAct_9fa48("82495") ? evaluateExpression(left, row) && evaluateExpression(right, row) : stryMutAct_9fa48("82494") ? false : stryMutAct_9fa48("82493") ? true : (stryCov_9fa48("82493", "82494", "82495"), evaluateExpression(left, row) || evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.EQUALS:
        if (stryMutAct_9fa48("82496")) {} else {
          stryCov_9fa48("82496");
          return stryMutAct_9fa48("82499") ? evaluateExpression(left, row) !== evaluateExpression(right, row) : stryMutAct_9fa48("82498") ? false : stryMutAct_9fa48("82497") ? true : (stryCov_9fa48("82497", "82498", "82499"), evaluateExpression(left, row) === evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.NOT_EQUALS:
      case LIVE_QUERY_OPERATOR.NOT_EQUALS_ALT:
        if (stryMutAct_9fa48("82500")) {} else {
          stryCov_9fa48("82500");
          return stryMutAct_9fa48("82503") ? evaluateExpression(left, row) === evaluateExpression(right, row) : stryMutAct_9fa48("82502") ? false : stryMutAct_9fa48("82501") ? true : (stryCov_9fa48("82501", "82502", "82503"), evaluateExpression(left, row) !== evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.LESS_THAN:
        if (stryMutAct_9fa48("82504")) {} else {
          stryCov_9fa48("82504");
          return stryMutAct_9fa48("82508") ? evaluateExpression(left, row) >= evaluateExpression(right, row) : stryMutAct_9fa48("82507") ? evaluateExpression(left, row) <= evaluateExpression(right, row) : stryMutAct_9fa48("82506") ? false : stryMutAct_9fa48("82505") ? true : (stryCov_9fa48("82505", "82506", "82507", "82508"), evaluateExpression(left, row) < evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.LESS_THAN_OR_EQUAL:
        if (stryMutAct_9fa48("82509")) {} else {
          stryCov_9fa48("82509");
          return stryMutAct_9fa48("82513") ? evaluateExpression(left, row) > evaluateExpression(right, row) : stryMutAct_9fa48("82512") ? evaluateExpression(left, row) < evaluateExpression(right, row) : stryMutAct_9fa48("82511") ? false : stryMutAct_9fa48("82510") ? true : (stryCov_9fa48("82510", "82511", "82512", "82513"), evaluateExpression(left, row) <= evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.GREATER_THAN:
        if (stryMutAct_9fa48("82514")) {} else {
          stryCov_9fa48("82514");
          return stryMutAct_9fa48("82518") ? evaluateExpression(left, row) <= evaluateExpression(right, row) : stryMutAct_9fa48("82517") ? evaluateExpression(left, row) >= evaluateExpression(right, row) : stryMutAct_9fa48("82516") ? false : stryMutAct_9fa48("82515") ? true : (stryCov_9fa48("82515", "82516", "82517", "82518"), evaluateExpression(left, row) > evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.GREATER_THAN_OR_EQUAL:
        if (stryMutAct_9fa48("82519")) {} else {
          stryCov_9fa48("82519");
          return stryMutAct_9fa48("82523") ? evaluateExpression(left, row) < evaluateExpression(right, row) : stryMutAct_9fa48("82522") ? evaluateExpression(left, row) > evaluateExpression(right, row) : stryMutAct_9fa48("82521") ? false : stryMutAct_9fa48("82520") ? true : (stryCov_9fa48("82520", "82521", "82522", "82523"), evaluateExpression(left, row) >= evaluateExpression(right, row));
        }
      case LIVE_QUERY_OPERATOR.IS_NULL:
        if (stryMutAct_9fa48("82524")) {} else {
          stryCov_9fa48("82524");
          return stryMutAct_9fa48("82527") ? evaluateExpression(left, row) !== null : stryMutAct_9fa48("82526") ? false : stryMutAct_9fa48("82525") ? true : (stryCov_9fa48("82525", "82526", "82527"), evaluateExpression(left, row) === null);
        }
      case LIVE_QUERY_OPERATOR.IS_NOT_NULL:
        if (stryMutAct_9fa48("82528")) {} else {
          stryCov_9fa48("82528");
          return stryMutAct_9fa48("82531") ? evaluateExpression(left, row) === null : stryMutAct_9fa48("82530") ? false : stryMutAct_9fa48("82529") ? true : (stryCov_9fa48("82529", "82530", "82531"), evaluateExpression(left, row) !== null);
        }
      default:
        if (stryMutAct_9fa48("82532")) {} else {
          stryCov_9fa48("82532");
          return stryMutAct_9fa48("82533") ? false : (stryCov_9fa48("82533"), true);
        }
    }
  }
}

/**
 * Evaluate a unary expression.
 * @param {Object} expr - Unary expression AST.
 * @param {Object} row - Row data.
 * @return {*} Evaluation result.
 */
function evaluateUnaryExpression(expr, row) {
  if (stryMutAct_9fa48("82534")) {
    {}
  } else {
    stryCov_9fa48("82534");
    const {
      operator,
      operand
    } = expr;
    switch (operator) {
      case LIVE_QUERY_OPERATOR.NOT:
        if (stryMutAct_9fa48("82535")) {} else {
          stryCov_9fa48("82535");
          return stryMutAct_9fa48("82536") ? evaluateExpression(operand, row) : (stryCov_9fa48("82536"), !evaluateExpression(operand, row));
        }
      default:
        if (stryMutAct_9fa48("82537")) {} else {
          stryCov_9fa48("82537");
          return stryMutAct_9fa48("82538") ? false : (stryCov_9fa48("82538"), true);
        }
    }
  }
}

/**
 * Get column value from row.
 * @param {Object} expr - Column reference expression.
 * @param {Object} row - Row data.
 * @return {*} Column value.
 */
function getColumnValue(expr, row) {
  if (stryMutAct_9fa48("82539")) {
    {}
  } else {
    stryCov_9fa48("82539");
    const column = stryMutAct_9fa48("82542") ? expr.column && expr.name : stryMutAct_9fa48("82541") ? false : stryMutAct_9fa48("82540") ? true : (stryCov_9fa48("82540", "82541", "82542"), expr.column || expr.name);
    if (stryMutAct_9fa48("82545") ? false : stryMutAct_9fa48("82544") ? true : stryMutAct_9fa48("82543") ? column : (stryCov_9fa48("82543", "82544", "82545"), !column)) return undefined;

    // Handle qualified column names (table.column)
    if (stryMutAct_9fa48("82548") ? expr.table || row[expr.table] : stryMutAct_9fa48("82547") ? false : stryMutAct_9fa48("82546") ? true : (stryCov_9fa48("82546", "82547", "82548"), expr.table && row[expr.table])) {
      if (stryMutAct_9fa48("82549")) {
        {}
      } else {
        stryCov_9fa48("82549");
        return row[expr.table][column];
      }
    }
    return row[column];
  }
}

/**
 * Evaluate IN expression.
 * @param {Object} expr - IN expression AST.
 * @param {Object} row - Row data.
 * @return {boolean} True if value is in list.
 */
function evaluateInExpression(expr, row) {
  if (stryMutAct_9fa48("82550")) {
    {}
  } else {
    stryCov_9fa48("82550");
    const value = evaluateExpression(expr.expression, row);
    const values = expr.values.map(stryMutAct_9fa48("82551") ? () => undefined : (stryCov_9fa48("82551"), v => evaluateExpression(v, row)));
    return values.includes(value);
  }
}

/**
 * Evaluate BETWEEN expression.
 * @param {Object} expr - BETWEEN expression AST.
 * @param {Object} row - Row data.
 * @return {boolean} True if value is between low and high.
 */
function evaluateBetweenExpression(expr, row) {
  if (stryMutAct_9fa48("82552")) {
    {}
  } else {
    stryCov_9fa48("82552");
    const value = evaluateExpression(expr.expression, row);
    const low = evaluateExpression(expr.low, row);
    const high = evaluateExpression(expr.high, row);
    return stryMutAct_9fa48("82555") ? value >= low || value <= high : stryMutAct_9fa48("82554") ? false : stryMutAct_9fa48("82553") ? true : (stryCov_9fa48("82553", "82554", "82555"), (stryMutAct_9fa48("82558") ? value < low : stryMutAct_9fa48("82557") ? value > low : stryMutAct_9fa48("82556") ? true : (stryCov_9fa48("82556", "82557", "82558"), value >= low)) && (stryMutAct_9fa48("82561") ? value > high : stryMutAct_9fa48("82560") ? value < high : stryMutAct_9fa48("82559") ? true : (stryCov_9fa48("82559", "82560", "82561"), value <= high)));
  }
}

/**
 * Evaluate LIKE expression.
 * @param {Object} expr - LIKE expression AST.
 * @param {Object} row - Row data.
 * @return {boolean} True if value matches pattern.
 */
function evaluateLikeExpression(expr, row) {
  if (stryMutAct_9fa48("82562")) {
    {}
  } else {
    stryCov_9fa48("82562");
    const value = evaluateExpression(expr.expression, row);
    const pattern = evaluateExpression(expr.pattern, row);
    if (stryMutAct_9fa48("82565") ? typeof value !== TYPEOF.STRING && typeof pattern !== TYPEOF.STRING : stryMutAct_9fa48("82564") ? false : stryMutAct_9fa48("82563") ? true : (stryCov_9fa48("82563", "82564", "82565"), (stryMutAct_9fa48("82567") ? typeof value === TYPEOF.STRING : stryMutAct_9fa48("82566") ? false : (stryCov_9fa48("82566", "82567"), typeof value !== TYPEOF.STRING)) || (stryMutAct_9fa48("82569") ? typeof pattern === TYPEOF.STRING : stryMutAct_9fa48("82568") ? false : (stryCov_9fa48("82568", "82569"), typeof pattern !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("82570")) {
        {}
      } else {
        stryCov_9fa48("82570");
        return stryMutAct_9fa48("82571") ? true : (stryCov_9fa48("82571"), false);
      }
    }

    // Convert SQL LIKE pattern to regex
    const regexPattern = pattern.replace(LIVE_QUERY_REGEX.REGEX_SPECIAL, LIVE_QUERY_REGEX_REPLACE.ESCAPE).replace(LIVE_QUERY_REGEX.PERCENT, LIVE_QUERY_REGEX_REPLACE.WILDCARD).replace(LIVE_QUERY_REGEX.UNDERSCORE, LIVE_QUERY_REGEX_REPLACE.SINGLE_CHAR);
    const regex = new RegExp(stryMutAct_9fa48("82572") ? `` : (stryCov_9fa48("82572"), `^${regexPattern}$`), LIVE_QUERY_REGEX_FLAG.CASE_INSENSITIVE);
    return regex.test(value);
  }
}

/**
 * Extract partition key value from WHERE clause.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @param {string} partitionKeyColumn - Name of the partition key column.
 * @return {*} Partition key value or null if not found.
 */
function extractPartitionKeyValue(whereClause, partitionKeyColumn) {
  if (stryMutAct_9fa48("82573")) {
    {}
  } else {
    stryCov_9fa48("82573");
    if (stryMutAct_9fa48("82576") ? !whereClause && !partitionKeyColumn : stryMutAct_9fa48("82575") ? false : stryMutAct_9fa48("82574") ? true : (stryCov_9fa48("82574", "82575", "82576"), (stryMutAct_9fa48("82577") ? whereClause : (stryCov_9fa48("82577"), !whereClause)) || (stryMutAct_9fa48("82578") ? partitionKeyColumn : (stryCov_9fa48("82578"), !partitionKeyColumn)))) {
      if (stryMutAct_9fa48("82579")) {
        {}
      } else {
        stryCov_9fa48("82579");
        return null;
      }
    }
    return findPartitionKeyValue(whereClause, stryMutAct_9fa48("82580") ? partitionKeyColumn.toUpperCase() : (stryCov_9fa48("82580"), partitionKeyColumn.toLowerCase()));
  }
}

/**
 * Recursively find partition key equality value in expression.
 * @param {Object} expr - Expression AST.
 * @param {string} keyColumn - Partition key column name (lowercase).
 * @return {*} Key value or null.
 */
function findPartitionKeyValue(expr, keyColumn) {
  if (stryMutAct_9fa48("82581")) {
    {}
  } else {
    stryCov_9fa48("82581");
    if (stryMutAct_9fa48("82584") ? false : stryMutAct_9fa48("82583") ? true : stryMutAct_9fa48("82582") ? expr : (stryCov_9fa48("82582", "82583", "82584"), !expr)) return null;
    switch (expr.type) {
      case LIVE_QUERY_AST_TYPE.BINARY:
        if (stryMutAct_9fa48("82585")) {} else {
          stryCov_9fa48("82585");
          {
            if (stryMutAct_9fa48("82586")) {
              {}
            } else {
              stryCov_9fa48("82586");
              const {
                operator,
                left,
                right
              } = expr;

              // Handle AND - check both sides
              if (stryMutAct_9fa48("82589") ? operator !== LIVE_QUERY_OPERATOR.AND : stryMutAct_9fa48("82588") ? false : stryMutAct_9fa48("82587") ? true : (stryCov_9fa48("82587", "82588", "82589"), operator === LIVE_QUERY_OPERATOR.AND)) {
                if (stryMutAct_9fa48("82590")) {
                  {}
                } else {
                  stryCov_9fa48("82590");
                  const leftValue = findPartitionKeyValue(left, keyColumn);
                  if (stryMutAct_9fa48("82593") ? leftValue === null : stryMutAct_9fa48("82592") ? false : stryMutAct_9fa48("82591") ? true : (stryCov_9fa48("82591", "82592", "82593"), leftValue !== null)) return leftValue;
                  return findPartitionKeyValue(right, keyColumn);
                }
              }

              // Handle equality on partition key
              if (stryMutAct_9fa48("82596") ? operator !== LIVE_QUERY_OPERATOR.EQUALS : stryMutAct_9fa48("82595") ? false : stryMutAct_9fa48("82594") ? true : (stryCov_9fa48("82594", "82595", "82596"), operator === LIVE_QUERY_OPERATOR.EQUALS)) {
                if (stryMutAct_9fa48("82597")) {
                  {}
                } else {
                  stryCov_9fa48("82597");
                  if (stryMutAct_9fa48("82600") ? isPartitionKeyColumn(left, keyColumn) || right.type === LIVE_QUERY_AST_TYPE.LITERAL : stryMutAct_9fa48("82599") ? false : stryMutAct_9fa48("82598") ? true : (stryCov_9fa48("82598", "82599", "82600"), isPartitionKeyColumn(left, keyColumn) && (stryMutAct_9fa48("82602") ? right.type !== LIVE_QUERY_AST_TYPE.LITERAL : stryMutAct_9fa48("82601") ? true : (stryCov_9fa48("82601", "82602"), right.type === LIVE_QUERY_AST_TYPE.LITERAL)))) {
                    if (stryMutAct_9fa48("82603")) {
                      {}
                    } else {
                      stryCov_9fa48("82603");
                      return right.value;
                    }
                  }
                  if (stryMutAct_9fa48("82606") ? isPartitionKeyColumn(right, keyColumn) || left.type === LIVE_QUERY_AST_TYPE.LITERAL : stryMutAct_9fa48("82605") ? false : stryMutAct_9fa48("82604") ? true : (stryCov_9fa48("82604", "82605", "82606"), isPartitionKeyColumn(right, keyColumn) && (stryMutAct_9fa48("82608") ? left.type !== LIVE_QUERY_AST_TYPE.LITERAL : stryMutAct_9fa48("82607") ? true : (stryCov_9fa48("82607", "82608"), left.type === LIVE_QUERY_AST_TYPE.LITERAL)))) {
                    if (stryMutAct_9fa48("82609")) {
                      {}
                    } else {
                      stryCov_9fa48("82609");
                      return left.value;
                    }
                  }
                }
              }
              break;
            }
          }
        }
      case LIVE_QUERY_AST_TYPE.IN:
        if (stryMutAct_9fa48("82610")) {} else {
          stryCov_9fa48("82610");
          {
            if (stryMutAct_9fa48("82611")) {
              {}
            } else {
              stryCov_9fa48("82611");
              // For IN clause, return array of values
              if (stryMutAct_9fa48("82613") ? false : stryMutAct_9fa48("82612") ? true : (stryCov_9fa48("82612", "82613"), isPartitionKeyColumn(expr.expression, keyColumn))) {
                if (stryMutAct_9fa48("82614")) {
                  {}
                } else {
                  stryCov_9fa48("82614");
                  return stryMutAct_9fa48("82615") ? expr.values.map(v => v.value) : (stryCov_9fa48("82615"), expr.values.filter(stryMutAct_9fa48("82616") ? () => undefined : (stryCov_9fa48("82616"), v => stryMutAct_9fa48("82619") ? v.type !== LIVE_QUERY_AST_TYPE.LITERAL : stryMutAct_9fa48("82618") ? false : stryMutAct_9fa48("82617") ? true : (stryCov_9fa48("82617", "82618", "82619"), v.type === LIVE_QUERY_AST_TYPE.LITERAL))).map(stryMutAct_9fa48("82620") ? () => undefined : (stryCov_9fa48("82620"), v => v.value)));
                }
              }
              break;
            }
          }
        }
    }
    return null;
  }
}

/**
 * Check if expression is a reference to the partition key column.
 * @param {Object} expr - Expression AST.
 * @param {string} keyColumn - Partition key column name (lowercase).
 * @return {boolean} True if partition key column.
 */
function isPartitionKeyColumn(expr, keyColumn) {
  if (stryMutAct_9fa48("82621")) {
    {}
  } else {
    stryCov_9fa48("82621");
    if (stryMutAct_9fa48("82624") ? !expr && expr.type !== LIVE_QUERY_AST_TYPE.COLUMN_REF : stryMutAct_9fa48("82623") ? false : stryMutAct_9fa48("82622") ? true : (stryCov_9fa48("82622", "82623", "82624"), (stryMutAct_9fa48("82625") ? expr : (stryCov_9fa48("82625"), !expr)) || (stryMutAct_9fa48("82627") ? expr.type === LIVE_QUERY_AST_TYPE.COLUMN_REF : stryMutAct_9fa48("82626") ? false : (stryCov_9fa48("82626", "82627"), expr.type !== LIVE_QUERY_AST_TYPE.COLUMN_REF)))) return stryMutAct_9fa48("82628") ? true : (stryCov_9fa48("82628"), false);
    const column = stryMutAct_9fa48("82629") ? (expr.column || expr.name || '').toUpperCase() : (stryCov_9fa48("82629"), (stryMutAct_9fa48("82632") ? (expr.column || expr.name) && '' : stryMutAct_9fa48("82631") ? false : stryMutAct_9fa48("82630") ? true : (stryCov_9fa48("82630", "82631", "82632"), (stryMutAct_9fa48("82634") ? expr.column && expr.name : stryMutAct_9fa48("82633") ? false : (stryCov_9fa48("82633", "82634"), expr.column || expr.name)) || (stryMutAct_9fa48("82635") ? "Stryker was here!" : (stryCov_9fa48("82635"), '')))).toLowerCase());
    return stryMutAct_9fa48("82638") ? column !== keyColumn : stryMutAct_9fa48("82637") ? false : stryMutAct_9fa48("82636") ? true : (stryCov_9fa48("82636", "82637", "82638"), column === keyColumn);
  }
}

/**
 * Canonicalize a predicate for grouping identical queries.
 * @param {Object} whereClause - Parsed WHERE clause AST.
 * @return {string} Canonical string representation.
 */
function canonicalizePredicate(whereClause) {
  if (stryMutAct_9fa48("82639")) {
    {}
  } else {
    stryCov_9fa48("82639");
    if (stryMutAct_9fa48("82642") ? false : stryMutAct_9fa48("82641") ? true : stryMutAct_9fa48("82640") ? whereClause : (stryCov_9fa48("82640", "82641", "82642"), !whereClause)) return LIVE_QUERY_DEFAULT_VALUE.EMPTY_WHERE;
    return JSON.stringify(sortObject(whereClause));
  }
}

/**
 * Sort object keys recursively for consistent serialization.
 * @param {*} obj - Object to sort.
 * @return {*} Sorted object.
 */
function sortObject(obj) {
  if (stryMutAct_9fa48("82643")) {
    {}
  } else {
    stryCov_9fa48("82643");
    if (stryMutAct_9fa48("82646") ? obj === null && typeof obj !== 'object' : stryMutAct_9fa48("82645") ? false : stryMutAct_9fa48("82644") ? true : (stryCov_9fa48("82644", "82645", "82646"), (stryMutAct_9fa48("82648") ? obj !== null : stryMutAct_9fa48("82647") ? false : (stryCov_9fa48("82647", "82648"), obj === null)) || (stryMutAct_9fa48("82650") ? typeof obj === 'object' : stryMutAct_9fa48("82649") ? false : (stryCov_9fa48("82649", "82650"), typeof obj !== (stryMutAct_9fa48("82651") ? "" : (stryCov_9fa48("82651"), 'object')))))) {
      if (stryMutAct_9fa48("82652")) {
        {}
      } else {
        stryCov_9fa48("82652");
        return obj;
      }
    }
    if (stryMutAct_9fa48("82654") ? false : stryMutAct_9fa48("82653") ? true : (stryCov_9fa48("82653", "82654"), Array.isArray(obj))) {
      if (stryMutAct_9fa48("82655")) {
        {}
      } else {
        stryCov_9fa48("82655");
        return obj.map(sortObject);
      }
    }
    const sorted = {};
    const keys = stryMutAct_9fa48("82656") ? Object.keys(obj) : (stryCov_9fa48("82656"), Object.keys(obj).sort());
    for (const key of keys) {
      if (stryMutAct_9fa48("82657")) {
        {}
      } else {
        stryCov_9fa48("82657");
        sorted[key] = sortObject(obj[key]);
      }
    }
    return sorted;
  }
}

/**
 * Parse a LIVE SELECT statement.
 * @param {string} sql - SQL string starting with LIVE SELECT.
 * @return {Object} Parsed query with isLive flag.
 */
function parseLiveSelect(sql) {
  if (stryMutAct_9fa48("82658")) {
    {}
  } else {
    stryCov_9fa48("82658");
    if (stryMutAct_9fa48("82661") ? !sql && typeof sql !== TYPEOF.STRING : stryMutAct_9fa48("82660") ? false : stryMutAct_9fa48("82659") ? true : (stryCov_9fa48("82659", "82660", "82661"), (stryMutAct_9fa48("82662") ? sql : (stryCov_9fa48("82662"), !sql)) || (stryMutAct_9fa48("82664") ? typeof sql === TYPEOF.STRING : stryMutAct_9fa48("82663") ? false : (stryCov_9fa48("82663", "82664"), typeof sql !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("82665")) {
        {}
      } else {
        stryCov_9fa48("82665");
        throw new Error(LIVE_QUERY_ERROR_MSG.INVALID_SQL);
      }
    }
    const trimmed = stryMutAct_9fa48("82666") ? sql : (stryCov_9fa48("82666"), sql.trim());
    const upperSql = stryMutAct_9fa48("82667") ? trimmed.toLowerCase() : (stryCov_9fa48("82667"), trimmed.toUpperCase());

    // Check for LIVE prefix
    if (stryMutAct_9fa48("82670") ? false : stryMutAct_9fa48("82669") ? true : stryMutAct_9fa48("82668") ? upperSql.startsWith(LIVE_QUERY_SQL.LIVE_PREFIX) : (stryCov_9fa48("82668", "82669", "82670"), !(stryMutAct_9fa48("82671") ? upperSql.endsWith(LIVE_QUERY_SQL.LIVE_PREFIX) : (stryCov_9fa48("82671"), upperSql.startsWith(LIVE_QUERY_SQL.LIVE_PREFIX))))) {
      if (stryMutAct_9fa48("82672")) {
        {}
      } else {
        stryCov_9fa48("82672");
        return stryMutAct_9fa48("82673") ? {} : (stryCov_9fa48("82673"), {
          isLive: stryMutAct_9fa48("82674") ? true : (stryCov_9fa48("82674"), false),
          sql: trimmed
        });
      }
    }

    // Remove LIVE prefix and return the SELECT statement
    const selectSql = stryMutAct_9fa48("82676") ? trimmed.trim() : stryMutAct_9fa48("82675") ? trimmed.substring(LIVE_QUERY_SQL.LIVE_PREFIX.length) : (stryCov_9fa48("82675", "82676"), trimmed.substring(LIVE_QUERY_SQL.LIVE_PREFIX.length).trim());
    if (stryMutAct_9fa48("82679") ? false : stryMutAct_9fa48("82678") ? true : stryMutAct_9fa48("82677") ? selectSql.toUpperCase().startsWith(LIVE_QUERY_SQL.SELECT_PREFIX) : (stryCov_9fa48("82677", "82678", "82679"), !(stryMutAct_9fa48("82681") ? selectSql.toLowerCase().startsWith(LIVE_QUERY_SQL.SELECT_PREFIX) : stryMutAct_9fa48("82680") ? selectSql.toUpperCase().endsWith(LIVE_QUERY_SQL.SELECT_PREFIX) : (stryCov_9fa48("82680", "82681"), selectSql.toUpperCase().startsWith(LIVE_QUERY_SQL.SELECT_PREFIX))))) {
      if (stryMutAct_9fa48("82682")) {
        {}
      } else {
        stryCov_9fa48("82682");
        throw new Error(LIVE_QUERY_ERROR_MSG.LIVE_REQUIRES_SELECT);
      }
    }
    return stryMutAct_9fa48("82683") ? {} : (stryCov_9fa48("82683"), {
      isLive: stryMutAct_9fa48("82684") ? false : (stryCov_9fa48("82684"), true),
      sql: selectSql
    });
  }
}

/**
 * LiveQueryService manages a single live query subscription.
 */
class LiveQueryService {
  /**
   * Create a new LiveQueryService.
   * @param {Object} options - Configuration options.
   * @param {Object} options.parsedQuery - Parsed SELECT query AST.
   * @param {Object} options.client - Client connection.
   * @param {Object} options.systemCache - System table cache.
   * @param {string} options.nodeId - Node ID.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("82685")) {
      {}
    } else {
      stryCov_9fa48("82685");
      this.queryId = uuidv4();
      this.parsedQuery = stryMutAct_9fa48("82688") ? options.parsedQuery && null : stryMutAct_9fa48("82687") ? false : stryMutAct_9fa48("82686") ? true : (stryCov_9fa48("82686", "82687", "82688"), options.parsedQuery || null);
      this.client = stryMutAct_9fa48("82691") ? options.client && null : stryMutAct_9fa48("82690") ? false : stryMutAct_9fa48("82689") ? true : (stryCov_9fa48("82689", "82690", "82691"), options.client || null);
      this.systemCache = stryMutAct_9fa48("82694") ? options.systemCache && null : stryMutAct_9fa48("82693") ? false : stryMutAct_9fa48("82692") ? true : (stryCov_9fa48("82692", "82693", "82694"), options.systemCache || null);
      this.nodeId = stryMutAct_9fa48("82697") ? options.nodeId && LIVE_QUERY_DEFAULT_VALUE.UNKNOWN : stryMutAct_9fa48("82696") ? false : stryMutAct_9fa48("82695") ? true : (stryCov_9fa48("82695", "82696", "82697"), options.nodeId || LIVE_QUERY_DEFAULT_VALUE.UNKNOWN);

      // Extract table name from query
      this.table = stryMutAct_9fa48("82700") ? this.parsedQuery?.from?.name && null : stryMutAct_9fa48("82699") ? false : stryMutAct_9fa48("82698") ? true : (stryCov_9fa48("82698", "82699", "82700"), (stryMutAct_9fa48("82702") ? this.parsedQuery.from?.name : stryMutAct_9fa48("82701") ? this.parsedQuery?.from.name : (stryCov_9fa48("82701", "82702"), this.parsedQuery?.from?.name)) || null);

      // Compile predicate from WHERE clause
      this.predicate = compilePredicate(stryMutAct_9fa48("82703") ? this.parsedQuery.where : (stryCov_9fa48("82703"), this.parsedQuery?.where));

      // Store original WHERE clause for partition key extraction
      this.whereClause = stryMutAct_9fa48("82706") ? this.parsedQuery?.where && null : stryMutAct_9fa48("82705") ? false : stryMutAct_9fa48("82704") ? true : (stryCov_9fa48("82704", "82705", "82706"), (stryMutAct_9fa48("82707") ? this.parsedQuery.where : (stryCov_9fa48("82707"), this.parsedQuery?.where)) || null);

      // Partition key value (extracted lazily)
      this.partitionKeyValue = null;
      this.partitionKeyColumn = null;

      // Subscribed partitions
      this.subscribedPartitions = new Set();

      // Lifecycle management
      this.config = ConfigurationManager.getInstance();
      this.ttlMs = stryMutAct_9fa48("82710") ? this.config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) && LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS : stryMutAct_9fa48("82709") ? false : stryMutAct_9fa48("82708") ? true : (stryCov_9fa48("82708", "82709", "82710"), this.config.get(LIVE_QUERY_CONFIG_KEY.DEFAULT_TTL_MS) || LIVE_QUERY_DEFAULTS.DEFAULT_TTL_MS);
      this.lastRenewal = Date.now();
      this.lastSeenHLC = null;
      this.createdAt = Date.now();

      // Status
      this.active = stryMutAct_9fa48("82711") ? true : (stryCov_9fa48("82711"), false);
      this.cleanedUp = stryMutAct_9fa48("82712") ? true : (stryCov_9fa48("82712"), false);

      // Logging
      this.logger = this.initLogger();
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("82713")) {
      {}
    } else {
      stryCov_9fa48("82713");
      try {
        if (stryMutAct_9fa48("82714")) {
          {}
        } else {
          stryCov_9fa48("82714");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("82716") ? false : stryMutAct_9fa48("82715") ? true : (stryCov_9fa48("82715", "82716"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("82717")) {
              {}
            } else {
              stryCov_9fa48("82717");
              return loggingService.forSubsystem(LIVE_QUERY_SUBSYSTEM.LIVE_QUERY_SERVICE);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Get the partition key column for the table.
   * @return {string|null} Partition key column name.
   */
  getPartitionKeyColumn() {
    if (stryMutAct_9fa48("82718")) {
      {}
    } else {
      stryCov_9fa48("82718");
      if (stryMutAct_9fa48("82720") ? false : stryMutAct_9fa48("82719") ? true : (stryCov_9fa48("82719", "82720"), this.partitionKeyColumn)) {
        if (stryMutAct_9fa48("82721")) {
          {}
        } else {
          stryCov_9fa48("82721");
          return this.partitionKeyColumn;
        }
      }
      if (stryMutAct_9fa48("82724") ? !this.systemCache && !this.table : stryMutAct_9fa48("82723") ? false : stryMutAct_9fa48("82722") ? true : (stryCov_9fa48("82722", "82723", "82724"), (stryMutAct_9fa48("82725") ? this.systemCache : (stryCov_9fa48("82725"), !this.systemCache)) || (stryMutAct_9fa48("82726") ? this.table : (stryCov_9fa48("82726"), !this.table)))) {
        if (stryMutAct_9fa48("82727")) {
          {}
        } else {
          stryCov_9fa48("82727");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("82728")) {
          {}
        } else {
          stryCov_9fa48("82728");
          const tableInfo = stryMutAct_9fa48("82731") ? this.systemCache.get(TABLES.TABLES, this.table) && this.systemCache.find(TABLES.TABLES, t => t.table_name === this.table || t.tableName === this.table) : stryMutAct_9fa48("82730") ? false : stryMutAct_9fa48("82729") ? true : (stryCov_9fa48("82729", "82730", "82731"), this.systemCache.get(TABLES.TABLES, this.table) || this.systemCache.find(TABLES.TABLES, stryMutAct_9fa48("82732") ? () => undefined : (stryCov_9fa48("82732"), t => stryMutAct_9fa48("82735") ? t.table_name === this.table && t.tableName === this.table : stryMutAct_9fa48("82734") ? false : stryMutAct_9fa48("82733") ? true : (stryCov_9fa48("82733", "82734", "82735"), (stryMutAct_9fa48("82737") ? t.table_name !== this.table : stryMutAct_9fa48("82736") ? false : (stryCov_9fa48("82736", "82737"), t.table_name === this.table)) || (stryMutAct_9fa48("82739") ? t.tableName !== this.table : stryMutAct_9fa48("82738") ? false : (stryCov_9fa48("82738", "82739"), t.tableName === this.table))))));
          if (stryMutAct_9fa48("82741") ? false : stryMutAct_9fa48("82740") ? true : (stryCov_9fa48("82740", "82741"), tableInfo)) {
            if (stryMutAct_9fa48("82742")) {
              {}
            } else {
              stryCov_9fa48("82742");
              this.partitionKeyColumn = stryMutAct_9fa48("82745") ? (tableInfo.primary_key || tableInfo.primaryKey) && LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK : stryMutAct_9fa48("82744") ? false : stryMutAct_9fa48("82743") ? true : (stryCov_9fa48("82743", "82744", "82745"), (stryMutAct_9fa48("82747") ? tableInfo.primary_key && tableInfo.primaryKey : stryMutAct_9fa48("82746") ? false : (stryCov_9fa48("82746", "82747"), tableInfo.primary_key || tableInfo.primaryKey)) || LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK);
              return this.partitionKeyColumn;
            }
          }
        }
      } catch {
        // Cache not available
      }
      return LIVE_QUERY_DEFAULT_VALUE.PRIMARY_KEY_FALLBACK;
    }
  }

  /**
   * Extract partition key value from WHERE clause.
   * @return {*} Partition key value or null.
   */
  extractPartitionKeyValue() {
    if (stryMutAct_9fa48("82748")) {
      {}
    } else {
      stryCov_9fa48("82748");
      if (stryMutAct_9fa48("82751") ? this.partitionKeyValue === null : stryMutAct_9fa48("82750") ? false : stryMutAct_9fa48("82749") ? true : (stryCov_9fa48("82749", "82750", "82751"), this.partitionKeyValue !== null)) {
        if (stryMutAct_9fa48("82752")) {
          {}
        } else {
          stryCov_9fa48("82752");
          return this.partitionKeyValue;
        }
      }
      const keyColumn = this.getPartitionKeyColumn();
      this.partitionKeyValue = extractPartitionKeyValue(this.whereClause, keyColumn);
      return this.partitionKeyValue;
    }
  }

  /**
   * Evaluate if a row matches the predicate.
   * @param {Object} row - Row data.
   * @return {boolean} True if row matches.
   */
  evaluatePredicate(row) {
    if (stryMutAct_9fa48("82753")) {
      {}
    } else {
      stryCov_9fa48("82753");
      return this.predicate(row);
    }
  }

  /**
   * Renew the subscription lease.
   * @param {string} cursor - Last seen HLC timestamp.
   * @return {Object} Renewal result with new expiry.
   */
  renew(cursor) {
    if (stryMutAct_9fa48("82754")) {
      {}
    } else {
      stryCov_9fa48("82754");
      this.lastRenewal = Date.now();
      if (stryMutAct_9fa48("82756") ? false : stryMutAct_9fa48("82755") ? true : (stryCov_9fa48("82755", "82756"), cursor)) {
        if (stryMutAct_9fa48("82757")) {
          {}
        } else {
          stryCov_9fa48("82757");
          this.lastSeenHLC = cursor;
        }
      }
      this.logger.debug(LIVE_QUERY_LOG_MSG.RENEWED, stryMutAct_9fa48("82758") ? {} : (stryCov_9fa48("82758"), {
        queryId: this.queryId,
        cursor
      }));
      return stryMutAct_9fa48("82759") ? {} : (stryCov_9fa48("82759"), {
        queryId: this.queryId,
        expiresAt: stryMutAct_9fa48("82760") ? this.lastRenewal - this.ttlMs : (stryCov_9fa48("82760"), this.lastRenewal + this.ttlMs),
        renewBefore: stryMutAct_9fa48("82761") ? this.lastRenewal - Math.floor(this.ttlMs * 0.7) : (stryCov_9fa48("82761"), this.lastRenewal + Math.floor(stryMutAct_9fa48("82762") ? this.ttlMs / 0.7 : (stryCov_9fa48("82762"), this.ttlMs * 0.7)))
      });
    }
  }

  /**
   * Check if the subscription has expired.
   * @return {boolean} True if expired.
   */
  isExpired() {
    if (stryMutAct_9fa48("82763")) {
      {}
    } else {
      stryCov_9fa48("82763");
      return stryMutAct_9fa48("82767") ? Date.now() <= this.lastRenewal + this.ttlMs : stryMutAct_9fa48("82766") ? Date.now() >= this.lastRenewal + this.ttlMs : stryMutAct_9fa48("82765") ? false : stryMutAct_9fa48("82764") ? true : (stryCov_9fa48("82764", "82765", "82766", "82767"), Date.now() > (stryMutAct_9fa48("82768") ? this.lastRenewal - this.ttlMs : (stryCov_9fa48("82768"), this.lastRenewal + this.ttlMs)));
    }
  }

  /**
   * Get query metadata for monitoring.
   * @return {Object} Query metadata.
   */
  getMetadata() {
    if (stryMutAct_9fa48("82769")) {
      {}
    } else {
      stryCov_9fa48("82769");
      return stryMutAct_9fa48("82770") ? {} : (stryCov_9fa48("82770"), {
        queryId: this.queryId,
        table: this.table,
        partitionKeyValue: this.partitionKeyValue,
        subscribedPartitions: Array.from(this.subscribedPartitions),
        ttlMs: this.ttlMs,
        lastRenewal: this.lastRenewal,
        lastSeenHLC: this.lastSeenHLC,
        createdAt: this.createdAt,
        active: this.active
      });
    }
  }

  /**
   * Get canonical query signature for grouping.
   * @return {string} Query signature.
   */
  getQuerySignature() {
    if (stryMutAct_9fa48("82771")) {
      {}
    } else {
      stryCov_9fa48("82771");
      return (stryMutAct_9fa48("82772") ? `` : (stryCov_9fa48("82772"), `${this.table}${LIVE_QUERY_CURSOR.SEPARATOR}`)) + (stryMutAct_9fa48("82773") ? `` : (stryCov_9fa48("82773"), `${canonicalizePredicate(this.whereClause)}`));
    }
  }

  /**
   * Mark the query as active.
   */
  activate() {
    if (stryMutAct_9fa48("82774")) {
      {}
    } else {
      stryCov_9fa48("82774");
      this.active = stryMutAct_9fa48("82775") ? false : (stryCov_9fa48("82775"), true);
    }
  }

  /**
   * Mark the query as inactive and clean up.
   */
  deactivate() {
    if (stryMutAct_9fa48("82776")) {
      {}
    } else {
      stryCov_9fa48("82776");
      this.active = stryMutAct_9fa48("82777") ? true : (stryCov_9fa48("82777"), false);
    }
  }

  /**
   * Clean up resources.
   */
  cleanup() {
    if (stryMutAct_9fa48("82778")) {
      {}
    } else {
      stryCov_9fa48("82778");
      if (stryMutAct_9fa48("82780") ? false : stryMutAct_9fa48("82779") ? true : (stryCov_9fa48("82779", "82780"), this.cleanedUp)) return;
      this.cleanedUp = stryMutAct_9fa48("82781") ? false : (stryCov_9fa48("82781"), true);
      this.active = stryMutAct_9fa48("82782") ? true : (stryCov_9fa48("82782"), false);
      this.subscribedPartitions.clear();
      this.logger.debug(LIVE_QUERY_LOG_MSG.CLEANED_UP, stryMutAct_9fa48("82783") ? {} : (stryCov_9fa48("82783"), {
        queryId: this.queryId,
        table: this.table
      }));
    }
  }
}
export { LiveQueryService, LiveQueryEventType, compilePredicate, extractPartitionKeyValue, canonicalizePredicate, parseLiveSelect, evaluateExpression };