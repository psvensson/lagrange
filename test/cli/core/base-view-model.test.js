import {test} from '../../../src/test-helpers/tap.js';
import {BaseViewModel} from '../../../src/cli/core/base-view-model.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';

test('BaseViewModel', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const vm = new BaseViewModel();

    t.same(vm.data, []);
    t.equal(vm.computedCache.size, 0);
    t.equal(vm.computedDefinitions.size, 0);
  });

  t.test('setData stores data and invalidates cache', async (t) => {
    const vm = new BaseViewModel();
    const data = [{id: 1}, {id: 2}];

    vm.setData(data);

    t.same(vm.getData(), data);
    t.equal(vm.getCount(), 2);
  });

  t.test('defineComputed registers computed property', async (t) => {
    const vm = new BaseViewModel();

    vm.defineComputed('total', (data) => data.length);

    t.ok(vm.getComputedNames().includes('total'));
  });

  t.test('getComputed returns computed value', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{value: 10}, {value: 20}, {value: 30}]);

    vm.defineComputed('sum', (data) => {
      return data.reduce((acc, item) => acc + item.value, 0);
    });

    t.equal(vm.getComputed('sum'), 60);
  });

  t.test('getComputed caches result', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{value: 10}]);

    let computeCount = 0;
    vm.defineComputed('cached', (data) => {
      computeCount++;
      return data.length;
    });

    // First call computes
    vm.getComputed('cached');
    t.equal(computeCount, 1);

    // Second call uses cache
    vm.getComputed('cached');
    t.equal(computeCount, 1);

    // After invalidation, recomputes
    vm.invalidateCache();
    vm.getComputed('cached');
    t.equal(computeCount, 2);
  });

  t.test('isComputedCached returns correct value', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{id: 1}]);

    vm.defineComputed('test', () => 42);

    t.equal(vm.isComputedCached('test'), false);

    vm.getComputed('test');
    t.equal(vm.isComputedCached('test'), true);

    vm.invalidateCache();
    t.equal(vm.isComputedCached('test'), false);
  });

  t.test('getComputed returns undefined for unknown property', async (t) => {
    const vm = new BaseViewModel();

    t.equal(vm.getComputed('unknown'), undefined);
  });

  t.test('invalidateComputed clears specific properties', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{id: 1}]);

    vm.defineComputed('prop1', () => 1);
    vm.defineComputed('prop2', () => 2);

    vm.getComputed('prop1');
    vm.getComputed('prop2');

    t.ok(vm.isComputedCached('prop1'));
    t.ok(vm.isComputedCached('prop2'));

    vm.invalidateComputed(['prop1']);

    t.notOk(vm.isComputedCached('prop1'));
    t.ok(vm.isComputedCached('prop2'));
  });

  t.test('transform applies transformation to data', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{value: 1}, {value: 2}, {value: 3}]);

    const result = vm.transform((item) => item.value * 2);

    t.same(result, [2, 4, 6]);
  });

  t.test('filter filters data', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{value: 1}, {value: 2}, {value: 3}]);

    const result = vm.filter((item) => item.value > 1);

    t.equal(result.length, 2);
    t.same(result, [{value: 2}, {value: 3}]);
  });

  t.test('sort sorts data without mutating original', async (t) => {
    const vm = new BaseViewModel();
    const original = [{value: 3}, {value: 1}, {value: 2}];
    vm.setData(original);

    const result = vm.sort((a, b) => a.value - b.value);

    t.same(result, [{value: 1}, {value: 2}, {value: 3}]);
    t.same(vm.getData(), original); // Original unchanged
  });

  t.test('formatValue handles null and undefined', async (t) => {
    const vm = new BaseViewModel();

    t.equal(vm.formatValue(null), 'N/A');
    t.equal(vm.formatValue(undefined), 'N/A');
    t.equal(vm.formatValue('test'), 'test');
    t.equal(vm.formatValue(42), '42');
  });

  t.test('formatSize formats bytes correctly', async (t) => {
    const vm = new BaseViewModel();

    t.equal(vm.formatSize(null), 'N/A');
    t.equal(vm.formatSize(0), '0 B');
    t.equal(vm.formatSize(500), '500.0 B');
    t.equal(vm.formatSize(1024), '1.0 KB');
    t.equal(vm.formatSize(1024 * 1024), '1.0 MB');
    t.equal(vm.formatSize(1024 * 1024 * 1024), '1.0 GB');
  });

  t.test('formatPercent formats percentages', async (t) => {
    const vm = new BaseViewModel();

    t.equal(vm.formatPercent(null), 'N/A');
    t.equal(vm.formatPercent(50), '50.0%');
    t.equal(vm.formatPercent(33.333, 2), '33.33%');
  });

  t.test('formatTimestamp formats dates', async (t) => {
    const vm = new BaseViewModel();

    t.equal(vm.formatTimestamp(null), 'N/A');

    const date = new Date('2024-01-15T10:30:00Z');
    const formatted = vm.formatTimestamp(date);
    t.ok(formatted.includes('2024-01-15'));
    t.ok(formatted.includes('10:30:00'));
  });

  t.test('getSummary returns count', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{id: 1}, {id: 2}, {id: 3}]);

    const summary = vm.getSummary();
    t.equal(summary.count, 3);
  });

  t.test('validate returns valid by default', async (t) => {
    const vm = new BaseViewModel();

    const result = vm.validate({id: 1});
    t.equal(result.valid, true);
    t.same(result.errors, []);
  });

  t.test('isEmpty returns correct value', async (t) => {
    const vm = new BaseViewModel();

    t.equal(vm.isEmpty(), true);

    vm.setData([{id: 1}]);
    t.equal(vm.isEmpty(), false);
  });

  t.test('getItem returns item by index', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{id: 'a'}, {id: 'b'}, {id: 'c'}]);

    t.same(vm.getItem(0), {id: 'a'});
    t.same(vm.getItem(1), {id: 'b'});
    t.equal(vm.getItem(10), undefined);
  });

  t.test('findItem finds item by predicate', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{id: 'a', value: 1}, {id: 'b', value: 2}]);

    const found = vm.findItem((item) => item.id === 'b');
    t.same(found, {id: 'b', value: 2});

    const notFound = vm.findItem((item) => item.id === 'z');
    t.equal(notFound, undefined);
  });

  t.test('clear removes data and invalidates cache', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{id: 1}]);
    vm.defineComputed('test', () => 1);
    vm.getComputed('test');

    vm.clear();

    t.same(vm.getData(), []);
    t.equal(vm.isComputedCached('test'), false);
  });

  t.test('destroy cleans up everything', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{id: 1}]);
    vm.defineComputed('test', () => 1);

    vm.destroy();

    t.same(vm.getData(), []);
    t.equal(vm.computedCache.size, 0);
    t.equal(vm.computedDefinitions.size, 0);
  });

  t.test('emits events via event bus', async (t) => {
    const eventBus = new EventBus();
    const vm = new BaseViewModel({eventBus});

    const events = [];
    eventBus.on('viewModel:computedChanged', (data) => {
      events.push(data);
    });

    vm.defineComputed('test', () => 1);
    vm.setData([{id: 1}]);

    t.ok(events.length > 0);
    t.ok(events.some((e) => e.property === 'test'));
  });

  t.test('computed property receives viewModel as second arg', async (t) => {
    const vm = new BaseViewModel();
    vm.setData([{value: 10}]);

    let receivedVm = null;
    vm.defineComputed('withVm', (data, viewModel) => {
      receivedVm = viewModel;
      return data.length;
    });

    vm.getComputed('withVm');
    t.equal(receivedVm, vm);
  });
});
