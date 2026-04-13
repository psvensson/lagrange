// @ts-nocheck
import {test} from '../../../src/test-helpers/tap.js';
import {ComponentRegistry} from '../../../src/cli/core/component-registry.js';

test('ComponentRegistry - register and get singleton', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('service', () => ({name: 'TestService'}));
  await registry.initialize();

  const instance = registry.get('service');
  t.equal(instance.name, 'TestService');

  // Singleton should return same instance
  const instance2 = registry.get('service');
  t.equal(instance, instance2);
});

test('ComponentRegistry - factory lifecycle creates new instances', async (t) => {
  const registry = new ComponentRegistry();
  let counter = 0;

  registry.register('factory', () => ({id: ++counter}), {lifecycle: 'factory'});
  await registry.initialize();

  const instance1 = registry.get('factory');
  const instance2 = registry.get('factory');

  t.not(instance1.id, instance2.id);
});

test('ComponentRegistry - resolves dependencies', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('dep', () => ({value: 42}));
  registry.register('service', (dep) => ({dep}), {dependencies: ['dep']});

  await registry.initialize();

  const service = registry.get('service');
  t.equal(service.dep.value, 42);
});

test('ComponentRegistry - initializes in dependency order', async (t) => {
  const registry = new ComponentRegistry();
  const order = [];

  registry.register('a', () => {
    order.push('a');
    return {name: 'a'};
  });

  registry.register('b', (a) => {
    order.push('b');
    return {name: 'b', a};
  }, {dependencies: ['a']});

  registry.register('c', (b) => {
    order.push('c');
    return {name: 'c', b};
  }, {dependencies: ['b']});

  await registry.initialize();

  t.same(order, ['a', 'b', 'c']);
});

test('ComponentRegistry - detects circular dependencies', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('a', (b) => ({b}), {dependencies: ['b']});
  registry.register('b', (c) => ({c}), {dependencies: ['c']});
  registry.register('c', (a) => ({a}), {dependencies: ['a']});

  await t.rejects(
    registry.initialize(),
    /Circular dependency detected/,
  );
});

test('ComponentRegistry - detects self-referencing dependency', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('a', (a) => ({a}), {dependencies: ['a']});

  await t.rejects(
    registry.initialize(),
    /Circular dependency detected/,
  );
});

test('ComponentRegistry - registerMock overrides component', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('service', () => ({real: true}));
  registry.registerMock('service', {mock: true});

  await registry.initialize();

  const instance = registry.get('service');
  t.equal(instance.mock, true);
  t.equal(instance.real, undefined);
});

test('ComponentRegistry - clearMocks removes mocks', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('service', () => ({real: true}));
  registry.registerMock('service', {mock: true});
  registry.clearMocks();

  await registry.initialize();

  const instance = registry.get('service');
  t.equal(instance.real, true);
});

test('ComponentRegistry - has() checks registration', async (t) => {
  const registry = new ComponentRegistry();

  t.equal(registry.has('service'), false);

  registry.register('service', () => ({}));
  t.equal(registry.has('service'), true);
});

test('ComponentRegistry - getComponentNames returns all names', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('a', () => ({}));
  registry.register('b', () => ({}));

  const names = registry.getComponentNames();
  t.same(names.sort(), ['a', 'b']);
});

test('ComponentRegistry - getDependencyGraph returns graph', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('a', () => ({}));
  registry.register('b', (_a) => ({}), {dependencies: ['a']});

  const graph = registry.getDependencyGraph();

  t.same(graph.a.dependencies, []);
  t.same(graph.b.dependencies, ['a']);
});

test('ComponentRegistry - reset clears everything', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('service', () => ({}));
  await registry.initialize();

  registry.reset();

  t.equal(registry.has('service'), false);
  t.equal(registry.initialized, false);
});

test('ComponentRegistry - cannot register after initialization', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('a', () => ({}));
  await registry.initialize();

  t.throws(() => {
    registry.register('b', () => ({}));
  }, /Cannot register components after initialization/);
});

test('ComponentRegistry - dispose calls dispose on instances', async (t) => {
  const registry = new ComponentRegistry();
  let disposed = false;

  registry.register('service', () => ({
    dispose: () => {
      disposed = true;
    },
  }));

  await registry.initialize();
  await registry.dispose();

  t.equal(disposed, true);
});

test('ComponentRegistry - getInitializationOrder returns correct order', async (t) => {
  const registry = new ComponentRegistry();

  registry.register('c', (_a, _b) => ({}), {dependencies: ['a', 'b']});
  registry.register('a', () => ({}));
  registry.register('b', (_a) => ({}), {dependencies: ['a']});

  const order = registry.getInitializationOrder();

  // 'a' must come before 'b' and 'c'
  // 'b' must come before 'c'
  const aIndex = order.indexOf('a');
  const bIndex = order.indexOf('b');
  const cIndex = order.indexOf('c');

  t.ok(aIndex < bIndex);
  t.ok(bIndex < cIndex);
});
