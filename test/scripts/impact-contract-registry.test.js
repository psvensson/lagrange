import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  buildImpactContractRegistry,
  contractsForChangedPath,
  evaluateCoupledPairGuards,
  impactContractRegistryDigest,
  loadImpactContractRegistry,
} from '../../scripts/checks/impact-contract-registry.js';
import {
  buildManifest as buildPrimaryManifest,
} from '../../scripts/checks/test-primary-classification.js';
import {
  pollutePrototypeProperty,
  polluteWithAccessor,
  replacePrototypeProperty,
  withHostileIntrinsics,
} from '../helpers/hostile-intrinsics.js';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');

function write(root, relativePath, content = '') {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-contracts-'));
  write(root, 'src/planner-retention.js');
  write(root, 'src/admission/hold.js');
  write(root, 'test/pair-guard.test.js');
  write(
    root,
    'test/shards/primary-classes.json',
    JSON.stringify(buildPrimaryManifest(root)),
  );
  return root;
}

function manifest() {
  return {
    schemaVersion: 2,
    id: 'impact-contracts',
    contracts: {
      'planner-admission': {
        description: 'Planner retention and admission hold.',
        owners: ['src/planner-', 'src/admission/'],
        tests: ['test/pair-guard.test.js'],
      },
    },
    coupledPairs: {
      'planner-admission': {
        description: 'Planner retention must agree with admission.',
        endpoints: [
          {id: 'planner', owners: ['src/planner-']},
          {id: 'admission', owners: ['src/admission/']},
        ],
        contract: 'planner-admission',
        witnessTests: ['test/pair-guard.test.js'],
      },
    },
  };
}

function withFixture(fn) {
  const root = fixture();
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

function assertCanonicalRejection(root, source) {
  let result;
  assert.doesNotThrow(() => {
    result = buildImpactContractRegistry(root, source);
  });
  assert.equal(result.digest, null);
  assert.equal(result.registry.manifest, null);
  assert.ok(result.problems.some((problem) => problem.includes('canonical')));
}

test('schema v2 registry validates and its digest ignores object key order', () => {
  withFixture((root) => {
    const source = manifest();
    const result = buildImpactContractRegistry(root, source);
    assert.deepEqual(result.problems, []);
    assert.match(result.digest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(
      impactContractRegistryDigest({
        coupledPairs: source.coupledPairs,
        contracts: source.contracts,
        id: source.id,
        schemaVersion: source.schemaVersion,
      }),
      result.digest,
    );
  });
});

test('validation and digest consume one detached null-prototype snapshot', () => {
  withFixture((root) => {
    const source = manifest();
    const result = buildImpactContractRegistry(root, source);
    assert.deepEqual(result.problems, []);
    assert.equal(Object.getPrototypeOf(result.registry.manifest), null);
    assert.notEqual(result.registry.manifest, source);
    assert.notEqual(result.registry.manifest.contracts, source.contracts);
    assert.ok(Object.isFrozen(result.registry.manifest));
    assert.ok(Object.isFrozen(result.registry.manifest.contracts));

    source.id = 'changed-after-snapshot';
    source.contracts['planner-admission'].owners[0] = 'src/missing.js';
    assert.equal(result.registry.manifest.id, 'impact-contracts');
    assert.equal(
      result.registry.manifest.contracts['planner-admission'].owners[0],
      'src/planner-',
    );
  });
});

test('inherited registry semantics are rejected and pollution is ignored', () => {
  withFixture((root) => {
    assertCanonicalRejection(root, Object.create(manifest()));

    const source = manifest();
    delete source.contracts['planner-admission'].description;
    const restore = pollutePrototypeProperty(
      Object.prototype,
      'description',
      'inherited contract description',
    );
    const result = withHostileIntrinsics([restore], () =>
      buildImpactContractRegistry(root, source));
    assert.ok(result.problems.some((problem) =>
      problem.includes('lacks a description')));
  });
});

test('accessors are rejected without invocation before digest or validation', () => {
  withFixture((root) => {
    for (const field of ['schemaVersion', 'contracts']) {
      const source = manifest();
      let calls = 0;
      Object.defineProperty(source, field, {
        configurable: true,
        enumerable: true,
        get() {
          calls += 1;
          throw new Error('accessor must not run');
        },
      });
      assertCanonicalRejection(root, source);
      assert.equal(calls, 0);
    }
  });
});

test('toJSON cannot control the accepted digest', () => {
  withFixture((root) => {
    const source = manifest();
    let calls = 0;
    source.toJSON = () => {
      calls += 1;
      return {};
    };
    assertCanonicalRejection(root, source);
    assert.equal(calls, 0);
  });
});

test('hostile arrays are rejected through indexed own-data admission', () => {
  withFixture((root) => {
    const hostileIterator = manifest();
    let iteratorCalls = 0;
    Object.defineProperty(
      hostileIterator.contracts['planner-admission'].owners,
      Symbol.iterator,
      {
        configurable: true,
        value() {
          iteratorCalls += 1;
          return [][Symbol.iterator]();
        },
      },
    );
    assertCanonicalRejection(root, hostileIterator);
    assert.equal(iteratorCalls, 0);

    const accessor = manifest();
    let accessorCalls = 0;
    Object.defineProperty(
      accessor.contracts['planner-admission'].owners,
      '0',
      {
        configurable: true,
        enumerable: true,
        get() {
          accessorCalls += 1;
          return 'src/planner-';
        },
      },
    );
    assertCanonicalRejection(root, accessor);
    assert.equal(accessorCalls, 0);

    const sparse = manifest();
    sparse.contracts['planner-admission'].owners = new Array(2);
    sparse.contracts['planner-admission'].owners[1] = 'src/admission/';
    assertCanonicalRejection(root, sparse);

    const customPrototype = manifest();
    Object.setPrototypeOf(
      customPrototype.contracts['planner-admission'].owners,
      Object.create(Array.prototype),
    );
    assertCanonicalRejection(root, customPrototype);
  });
});

test('non-JSON values, proxies, cycles, and noncanonical numbers are typed problems', () => {
  withFixture((root) => {
    for (const value of [undefined, null, 'text', 2, Symbol('root'), () => {}, []]) {
      let result;
      assert.doesNotThrow(() => {
        result = buildImpactContractRegistry(root, value);
      });
      assert.equal(result.digest, null);
      assert.ok(result.problems.length > 0);
    }

    const invalidValues = [
      undefined,
      Symbol('invalid'),
      () => {},
      1n,
      new Date(0),
      new Map(),
      new Set(),
      Object('boxed'),
      new Proxy({}, {
        get() {
          throw new Error('proxy trap');
        },
      }),
    ];
    for (const value of invalidValues) {
      const source = manifest();
      source.extra = value;
      assertCanonicalRejection(root, source);
    }

    for (const value of [NaN, Infinity, -Infinity, -0, 2 ** 53]) {
      const source = manifest();
      source.schemaVersion = value;
      assertCanonicalRejection(root, source);
    }

    const cyclic = manifest();
    cyclic.extra = cyclic;
    assertCanonicalRejection(root, cyclic);
  });
});

test('acyclic aliases are copied and literal __proto__ data is preserved', () => {
  withFixture((root) => {
    const shared = {meaning: 'same own data'};
    const aliased = manifest();
    aliased.extraLeft = shared;
    aliased.extraRight = shared;
    const expanded = manifest();
    expanded.extraLeft = {meaning: 'same own data'};
    expanded.extraRight = {meaning: 'same own data'};
    const aliasedResult = buildImpactContractRegistry(root, aliased);
    assert.deepEqual(aliasedResult.problems, []);
    assert.equal(
      aliasedResult.digest,
      buildImpactContractRegistry(root, expanded).digest,
    );
    assert.notEqual(
      aliasedResult.registry.manifest.extraLeft,
      aliasedResult.registry.manifest.extraRight,
    );

    const literalPrototypeKey = manifest();
    Object.defineProperty(literalPrototypeKey, '__proto__', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: 'literal own data',
    });
    const literalResult = buildImpactContractRegistry(root, literalPrototypeKey);
    assert.deepEqual(literalResult.problems, []);
    assert.equal(Object.getPrototypeOf(literalResult.registry.manifest), null);
    assert.equal(literalResult.registry.manifest.__proto__, 'literal own data');
    assert.notEqual(literalResult.digest, impactContractRegistryDigest(manifest()));
  });
});

test('captured snapshot intrinsics resist post-import mutation', () => {
  const source = manifest();
  const expectedDigest = impactContractRegistryDigest(source);
  let observedDigest;
  const restores = [
    replacePrototypeProperty(Array, 'isArray', () => false),
    replacePrototypeProperty(Object, 'keys', () => []),
    replacePrototypeProperty(Object, 'getOwnPropertyDescriptor', () => {
      throw new Error('mutable descriptor intrinsic reached');
    }),
    replacePrototypeProperty(Object, 'getPrototypeOf', () => null),
    replacePrototypeProperty(JSON, 'stringify', () => 'poisoned'),
    replacePrototypeProperty(Number, 'isFinite', () => false),
    replacePrototypeProperty(Reflect, 'ownKeys', () => []),
  ];
  withHostileIntrinsics(restores, () => {
    observedDigest = impactContractRegistryDigest(source);
  });
  assert.equal(observedDigest, expectedDigest);
});

test('prototype methods and accessors cannot alter normal schema-v2 validation', () => {
  withFixture((root) => {
    const source = manifest();
    let methodCalls = 0;
    let accessorCalls = 0;
    let observed;
    const failMutableMethod = () => {
      methodCalls += 1;
      throw new Error('mutable array method reached');
    };
    const restores = [
      replacePrototypeProperty(Array.prototype, 'every', failMutableMethod),
      replacePrototypeProperty(Array.prototype, 'filter', failMutableMethod),
      replacePrototypeProperty(Array.prototype, 'map', failMutableMethod),
      replacePrototypeProperty(Array.prototype, 'some', failMutableMethod),
      polluteWithAccessor(Object.prototype, 'unexpectedRegistryField', {
        get() {
          accessorCalls += 1;
          throw new Error('prototype accessor reached');
        },
      }),
    ];
    withHostileIntrinsics(restores, () => {
      const result = buildImpactContractRegistry(root, source);
      observed = {
        contractCount: result.registry.contracts.size,
        digest: result.digest,
        problemCount: result.problems.length,
      };
    });
    assert.equal(methodCalls, 0);
    assert.equal(accessorCalls, 0);
    assert.deepEqual(observed, {
      contractCount: 1,
      digest: impactContractRegistryDigest(source),
      problemCount: 0,
    });
  });
});

test('loader fails closed on malformed JSON and unsupported schema', () => {
  withFixture((root) => {
    write(root, 'test/shards/impact-contracts.json', '{');
    assert.match(
      loadImpactContractRegistry(root).problems[0],
      /invalid JSON/u,
    );
    const source = manifest();
    source.schemaVersion = 1;
    assert.ok(buildImpactContractRegistry(root, source).problems.some((problem) =>
      problem.includes('schemaVersion')));
  });
});

test('wrong-type path entries become typed problems before filesystem access', () => {
  withFixture((root) => {
    const fields = [
      {
        label: 'owner',
        set(source, value) {
          source.contracts['planner-admission'].owners = [value];
        },
      },
      {
        label: 'test',
        set(source, value) {
          source.contracts['planner-admission'].tests = [value];
        },
      },
      {
        label: 'witness',
        set(source, value) {
          source.coupledPairs['planner-admission'].witnessTests = [value];
        },
      },
    ];
    for (const field of fields) {
      for (const value of [7, true, null, {}]) {
        const source = manifest();
        field.set(source, value);
        let result;
        assert.doesNotThrow(() => {
          result = buildImpactContractRegistry(root, source);
        }, `${field.label} ${String(value)}`);
        assert.ok(result.problems.some((problem) =>
          problem.includes('path must be a non-empty string')));
        assert.match(result.digest, /^sha256:[a-f0-9]{64}$/u);
        assert.equal(impactContractRegistryDigest(source), result.digest);
      }
    }
  });
});

test('common contract and exact witness subset are mandatory', () => {
  withFixture((root) => {
    const missingContract = manifest();
    missingContract.coupledPairs['planner-admission'].contract = 'missing';
    assert.ok(buildImpactContractRegistry(root, missingContract).problems.some((problem) =>
      problem.includes('unknown contract')));

    const missingOwnerEdge = manifest();
    missingOwnerEdge.contracts['planner-admission'].owners = ['src/planner-'];
    assert.ok(buildImpactContractRegistry(root, missingOwnerEdge).problems.some((problem) =>
      problem.includes('is not covered by contract')));

    const missingWitnessEdge = manifest();
    missingWitnessEdge.contracts['planner-admission'].tests = ['test/'];
    assert.ok(buildImpactContractRegistry(root, missingWitnessEdge).problems.some((problem) =>
      problem.includes('is not an exact test of contract')));
  });
});

test('witness must be present in the primary test classification', () => {
  withFixture((root) => {
    write(root, 'test/shards/primary-classes.json', JSON.stringify({
      schemaVersion: 1,
      classes: {},
    }));
    const problems = buildImpactContractRegistry(root, manifest()).problems;
    assert.ok(problems.some((problem) => problem.includes('digest mismatch')));
    assert.ok(problems.some((problem) => problem.includes('not primary-classified')));
  });
});

test('pair evaluation carries registry validation problems fail closed', () => {
  withFixture((root) => {
    const source = manifest();
    source.contracts['planner-admission'].owners = ['src/missing-owner.js'];
    const {registry, problems} = buildImpactContractRegistry(root, source);
    assert.ok(problems.some((problem) => problem.includes('dead path')));
    assert.ok(evaluateCoupledPairGuards(registry, [
      'src/planner-retention.js',
      'src/admission/hold.js',
    ]).problems.some((problem) => problem.includes('dead path')));
  });
});

test('overlapping endpoint owner domains are rejected', () => {
  withFixture((root) => {
    const source = manifest();
    source.contracts['planner-admission'].owners = ['src/'];
    source.coupledPairs['planner-admission'].endpoints = [
      {id: 'all-source', owners: ['src/']},
      {id: 'admission', owners: ['src/admission/']},
    ];
    assert.ok(buildImpactContractRegistry(root, source).problems.some((problem) =>
      problem.includes('overlap')));
  });
});

test('duplicate endpoint ids are excluded from direct pair evaluation', () => {
  withFixture((root) => {
    const source = manifest();
    source.coupledPairs['planner-admission'].endpoints[1].id = 'planner';
    const {registry, problems} = buildImpactContractRegistry(root, source);
    assert.ok(problems.some((problem) => problem.includes('duplicate endpoint id')));
    assert.equal(registry.coupledPairs[0].endpoints.length, 1);

    let evaluation;
    assert.doesNotThrow(() => {
      evaluation = evaluateCoupledPairGuards(registry, [
        'src/planner-retention.js',
        'src/admission/hold.js',
      ]);
    });
    assert.deepEqual(evaluation.triggeredPairs, []);
    assert.ok(evaluation.problems.some((problem) =>
      problem.includes('duplicate endpoint id')));
  });
});

test('repository-root owner specs cannot create an unmatchable live edge', () => {
  withFixture((root) => {
    for (const rootSpec of ['.', './']) {
      const source = manifest();
      source.contracts['planner-admission'].owners = [
        rootSpec,
        'src/admission/',
      ];
      source.coupledPairs['planner-admission'].endpoints = [
        {id: 'root', owners: [rootSpec]},
        {id: 'admission', owners: ['src/admission/']},
      ];
      const {registry, problems} = buildImpactContractRegistry(root, source);
      assert.ok(problems.some((problem) =>
        problem.includes('must not name the repository root')));
      const evaluation = evaluateCoupledPairGuards(registry, [
        'src/planner-retention.js',
        'src/admission/hold.js',
      ]);
      assert.equal(evaluation.triggeredPairs.length, 0);
      assert.ok(evaluation.problems.some((problem) =>
        problem.includes('must not name the repository root')));
    }
  });
});

test('stem prefixes select contracts and pair triggering requires both endpoints', () => {
  withFixture((root) => {
    const {registry, problems} = buildImpactContractRegistry(root, manifest());
    assert.deepEqual(problems, []);
    assert.deepEqual(
      contractsForChangedPath(registry, 'src/planner-retention.js'),
      ['planner-admission'],
    );
    assert.deepEqual(
      evaluateCoupledPairGuards(registry, [
        'src/planner-retention.js',
        'src/planner-second.js',
      ]).triggeredPairs,
      [],
    );
    const evaluation = evaluateCoupledPairGuards(registry, [
      'src/planner-retention.js',
      'src/admission/hold.js',
    ]);
    assert.deepEqual(evaluation.problems, []);
    assert.equal(evaluation.triggeredPairs.length, 1);
    assert.deepEqual(evaluation.triggeredPairs[0].endpointIds, [
      'planner', 'admission',
    ]);
  });
});

test('static gate wires impact contracts before shard generation checks', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.match(packageJson.scripts['audit:impact-contracts'],
    /impact-contract-registry\.js/u);
  assert.match(packageJson.scripts['test:static'], /audit:impact-contracts/u);
  const runner = fs.readFileSync(
    path.join(repositoryRoot, 'scripts/checks/run-static-audits.js'), 'utf8');
  assert.ok(runner.indexOf('\'audit:impact-contracts\'') >= 0);
  assert.ok(
    runner.indexOf('\'audit:impact-contracts\'') <
      runner.indexOf('\'audit:shards\''),
  );
});
