const DEPENDENCY_RULE = Object.freeze({
  NO_CIRCULAR: 'no-circular',
  NO_ORPHANS: 'no-orphans',
});
const DEPENDENCY_RULE_COMMENT = Object.freeze({
  NO_CIRCULAR: 'Disallow circular dependencies.',
  NO_ORPHANS: 'Warn on modules not reachable from configured entry points.',
});
const DEPENDENCY_RULE_SEVERITY = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
});
const DEPENDENCY_PATH = Object.freeze({
  ADMIN_CLI_ENTRY: '(^|/)src/cli/bin/lagrange-admin\\.js$',
  INCLUDE_ONLY: '^src|^test|^scripts',
  INDEX_ENTRY: '(^|/)src/index\\.js$',
  NODE_MODULE_PACKAGE: 'node_modules/[^/]+',
  NODE_MODULES: 'node_modules',
  REQUEST_CELL_WORKER_ENTRY:
    '(^|/)src/runtime/wasi-component-cell-worker\\.js$',
  SCRIPTS: '^scripts/',
  TEST: '^test/',
});

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: DEPENDENCY_RULE.NO_CIRCULAR,
      comment: DEPENDENCY_RULE_COMMENT.NO_CIRCULAR,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: DEPENDENCY_RULE.NO_ORPHANS,
      comment: DEPENDENCY_RULE_COMMENT.NO_ORPHANS,
      severity: DEPENDENCY_RULE_SEVERITY.WARN,
      from: {
        orphan: true,
        pathNot: [
          DEPENDENCY_PATH.INDEX_ENTRY,
          DEPENDENCY_PATH.ADMIN_CLI_ENTRY,
          DEPENDENCY_PATH.REQUEST_CELL_WORKER_ENTRY,
          DEPENDENCY_PATH.TEST,
          DEPENDENCY_PATH.SCRIPTS,
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: DEPENDENCY_PATH.NODE_MODULES,
    },
    includeOnly: DEPENDENCY_PATH.INCLUDE_ONLY,
    reporterOptions: {
      dot: {
        collapsePattern: DEPENDENCY_PATH.NODE_MODULE_PACKAGE,
      },
    },
  },
};
