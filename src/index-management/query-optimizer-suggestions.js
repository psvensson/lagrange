import {
  INDEX_HINT,
  INDEX_LOG_MSG,
  INDEX_PRIORITY,
  INDEX_USAGE,
} from './index-constants.js';

const LOCAL_STR_COMMA = ',';

const queryOptimizerSuggestions = {
  suggestIndices(ast, tableId) {
    const suggestions = [];
    if (!ast) return suggestions;

    const whereColumns = this.extractWhereColumns(ast.where);
    const orderByColumns = this.extractOrderByColumns(ast.orderBy);
    const joinColumns = this.extractJoinColumns(ast.joins);

    const existingIndices = this.getIndicesForTable(tableId);
    const existingIndexColumns = new Set();
    for (const idx of existingIndices) {
      existingIndexColumns.add(idx.columnNames.join(LOCAL_STR_COMMA));
    }

    if (whereColumns.length > 0) {
      const whereKey = whereColumns.sort().join(',');
      if (!existingIndexColumns.has(whereKey)) {
        suggestions.push({
          columns: whereColumns,
          reason: INDEX_HINT.WHERE_PREFIX.trim(),
          priority: INDEX_PRIORITY.HIGH,
        });
      }
    }

    if (orderByColumns.length > 0) {
      const orderKey = orderByColumns.join(',');
      if (!existingIndexColumns.has(orderKey)) {
        suggestions.push({
          columns: orderByColumns,
          reason: INDEX_HINT.ORDER_BY_PREFIX.trim(),
          priority: INDEX_PRIORITY.MEDIUM,
        });
      }
    }

    if (joinColumns.length > 0) {
      for (const col of joinColumns) {
        const hasIndex = existingIndices.some((idx) =>
          idx.columnNames[0] === col,
        );
        if (!hasIndex) {
          suggestions.push({
            columns: [col],
            reason: INDEX_HINT.JOIN_PREFIX.trim(),
            priority: INDEX_PRIORITY.HIGH,
          });
        }
      }
    }

    return suggestions;
  },

  getExecutionPlan(ast, tableId) {
    const analysis = this.analyzeQuery(ast, tableId);

    const plan = {
      queryType: ast.type,
      tableId,
      estimatedCost: analysis.estimatedCost,
      selectedIndex: analysis.selectedIndex,
      rejectedIndexes: analysis.rejectedIndexes,
      usedIndices: analysis.usableIndices.filter((i) => i.usage === INDEX_USAGE.WHERE),
      orderByIndex: analysis.usableIndices.find((i) => i.usage === INDEX_USAGE.ORDER_BY),
      joinIndices: analysis.usableIndices.filter((i) => i.usage === INDEX_USAGE.JOIN),
      hints: analysis.hints,
      suggestions: this.suggestIndices(ast, tableId),
    };

    this.logger.debug(INDEX_LOG_MSG.EXECUTION_PLAN_GENERATED, {
      tableId,
      queryType: ast.type,
      usedIndexCount: plan.usedIndices.length,
    });

    return plan;
  },

  setIndexService(service) {
    this.indexService = service;
  },

  setSystemTableCache(cache) {
    this.systemTableCache = cache;
  },
};

export {queryOptimizerSuggestions};
