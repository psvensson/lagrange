const DEPENDENCY_RULE = Object.freeze({
  NO_CIRCULAR: 'no-circular',
  NO_ORPHANS: 'no-orphans',
  NOT_TO_UNRESOLVABLE: 'not-to-unresolvable',
});
const DEPENDENCY_RULE_COMMENT = Object.freeze({
  NO_CIRCULAR: 'Disallow circular dependencies.',
  NO_ORPHANS: 'Warn on modules not reachable from configured entry points.',
  NOT_TO_UNRESOLVABLE: 'A relative import must resolve to a file: a module ' +
    'deleted while something still imports it fails only when that importer ' +
    'loads, which a selected proof may never do.',
});
const DEPENDENCY_RULE_SEVERITY = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
});
const DEPENDENCY_PATH = Object.freeze({
  ADMIN_CLI_ENTRY: '(^|/)src/cli/bin/lagrange-admin\\.js$',
  // Relative specifiers are admitted so an unresolved one (which keeps its
  // raw `./` or `../` path) reaches the not-to-unresolvable rule; resolved
  // modules all carry their src/test/scripts path.
  INCLUDE_ONLY: '^src|^test|^scripts|^\\.',
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
      name: DEPENDENCY_RULE.NOT_TO_UNRESOLVABLE,
      comment: DEPENDENCY_RULE_COMMENT.NOT_TO_UNRESOLVABLE,
      severity: DEPENDENCY_RULE_SEVERITY.ERROR,
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
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
    // A worktree whose node_modules is a symlink reaches packages through
    // `../` paths, which the relative admission above would otherwise keep.
    exclude: {
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
