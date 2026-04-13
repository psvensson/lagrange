/** @type {import('dependency-cruiser').IConfiguration} */
// @ts-nocheck

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Disallow circular dependencies.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-orphans',
      comment: 'Warn on modules not reachable from configured entry points.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)src/index\\.js$',
          '(^|/)src/cli/bin/ddb-admin\\.js$',
          '^test/',
          '^scripts/',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    includeOnly: '^src|^test|^scripts',
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
      },
    },
  },
};
