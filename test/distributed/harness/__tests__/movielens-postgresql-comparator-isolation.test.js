import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  digestMovielensMeasuredP0PostgresqlComparatorSource,
  resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths,
} from '../../../../scripts/checks/movielens-measured-p0-postgresql-comparator.js';
import {
  resolveBenchmarkLocalModuleSourcePaths,
} from '../../../../scripts/checks/benchmark-local-module-source-closure.js';
import {
  isSha256Digest,
} from '../benchmark-semantic-integrity.js';
import {
  pollutePrototypeProperty,
} from '../../../helpers/hostile-intrinsics.js';

const POSTGRESQL_ENVIRONMENT_PATH =
  'scripts/checks/movielens-measured-p0-postgresql-environment.js';
const POSTGRESQL_PLAN_PATH =
  'scripts/checks/movielens-measured-p0-comparator-plan.js';
const POSTGRESQL_SUPPORT_PATH =
  'scripts/checks/movielens-measured-p0-comparator-live-support.js';
const POSTGRESQL_CAPTURE_PATH =
  'scripts/checks/' +
  'run-comparative-efficiency-movielens-postgresql-comparator-live.js';
const FORBIDDEN_SOURCE_PATHS = Object.freeze([
  'scripts/checks/movielens-measured-p0-campaign-plan.js',
  'scripts/checks/movielens-measured-p0-distributed-environment.js',
  'scripts/checks/movielens-measured-p0-distributed-ingress.js',
  'scripts/checks/movielens-measured-p0-lagrange-iteration-support.js',
]);
const FORBIDDEN_LAGRANGE_DEPENDENCIES = Object.freeze([
  'createCluster',
  'buildMovielensMeasuredP0Image',
  'openMovielensMeasuredP0AuthenticatedSqlIngress',
  'createMovielensLagrangeCapacityAdapter',
  'prepareMovielensPublicRequestWorkload',
]);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringIncludes = Function.call.bind(String.prototype.includes);
const SOURCE_CLOSURE_ENTRY_PATH =
  'scripts/checks/movielens-measured-p0-postgresql-comparator.js';

test('PostgreSQL comparator capture has no Lagrange setup dependency',
  async () => {
    const source = [
      await readFile(POSTGRESQL_ENVIRONMENT_PATH, 'utf8'),
      await readFile(POSTGRESQL_PLAN_PATH, 'utf8'),
      await readFile(POSTGRESQL_SUPPORT_PATH, 'utf8'),
      await readFile(POSTGRESQL_CAPTURE_PATH, 'utf8'),
    ].join('\n');
    for (let index = 0;
      index < FORBIDDEN_LAGRANGE_DEPENDENCIES.length;
      index += 1) {
      assert.equal(
        stringIncludes(
          source,
          FORBIDDEN_LAGRANGE_DEPENDENCIES[index],
        ),
        false,
      );
    }
  },
);

test('PostgreSQL comparator source identity is content addressed',
  async () => {
    const first =
      await digestMovielensMeasuredP0PostgresqlComparatorSource();
    const second =
      await digestMovielensMeasuredP0PostgresqlComparatorSource();
    assert.equal(isSha256Digest(first), true);
    assert.equal(second, first);
    const sourcePaths =
      await resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths();
    for (let index = 0; index < FORBIDDEN_SOURCE_PATHS.length; index += 1) {
      assert.equal(
        arrayIncludes(
          sourcePaths,
          FORBIDDEN_SOURCE_PATHS[index],
        ),
        false,
      );
    }
    assert.equal(
      arrayIncludes(
        sourcePaths,
        'test/distributed/harness/benchmark-capacity-protocol-constants.js',
      ),
      true,
    );
    assert.equal(
      arrayIncludes(
        sourcePaths,
        'examples/service-data-affinity/postgres-baseline-session.js',
      ),
      true,
    );
  },
);

test('source closure resists the no-op push manifest-emptying attack',
  () => {
    const attack = `
      import {
        resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths,
      } from './scripts/checks/movielens-measured-p0-postgresql-comparator.js';
      const descriptor = Object.getOwnPropertyDescriptor(
        Array.prototype,
        'push',
      );
      Object.defineProperty(Array.prototype, 'push', {
        configurable: true,
        writable: true,
        value: () => 0,
      });
      let valid = false;
      try {
        const paths =
          await resolveMovielensMeasuredP0PostgresqlComparatorSourcePaths();
        valid = paths.length > 0 &&
          paths.includes(
            'scripts/checks/movielens-measured-p0-postgresql-comparator.js',
          );
      } finally {
        Object.defineProperty(Array.prototype, 'push', descriptor);
      }
      process.exitCode = valid ? 0 : 1;
    `;
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '--eval', attack],
      {encoding: 'utf8'},
    );
    assert.equal(result.status, 0, result.stderr);
  });

test('source closure rejects accessor and inherited path entries',
  async () => {
    let getterReads = 0;
    const accessorPaths = [];
    Object.defineProperty(accessorPaths, 0, {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        return SOURCE_CLOSURE_ENTRY_PATH;
      },
    });
    accessorPaths.length = 1;
    await assert.rejects(
      resolveBenchmarkLocalModuleSourcePaths({
        entryPaths: accessorPaths,
      }),
      /dense entry and additional paths/,
    );
    assert.equal(getterReads, 0);

    const inheritedPaths = [];
    inheritedPaths.length = 1;
    const restore = pollutePrototypeProperty(
      Array.prototype,
      0,
      SOURCE_CLOSURE_ENTRY_PATH,
    );
    try {
      await assert.rejects(
        resolveBenchmarkLocalModuleSourcePaths({
          entryPaths: inheritedPaths,
        }),
        /dense entry and additional paths/,
      );
    } finally {
      restore();
    }
  },
);
