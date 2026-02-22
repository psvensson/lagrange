import {test} from '../../src/test-helpers/tap.js';
import {
  WORK_CLASS,
  WorkClassScheduler,
} from '../../src/runtime/work-class-scheduler.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

test('WorkClassScheduler - reserves capacity for class A under class B/C load',
  async (t) => {
    const scheduler = new WorkClassScheduler({
      maxConcurrent: 2,
      reservedClassASlots: 1,
      maxClassCQueueSize: 8,
    });

    const blocking = createDeferred();
    let classAStarted = false;
    let classCStarted = false;

    const classBPromise = scheduler.enqueue(WORK_CLASS.B, async () => {
      await blocking.promise;
      return 'class-b-complete';
    });
    await Promise.resolve();

    const classCPromise = scheduler.enqueue(WORK_CLASS.C, async () => {
      classCStarted = true;
      return 'class-c-complete';
    });

    const classAPromise = scheduler.enqueue(WORK_CLASS.A, async () => {
      classAStarted = true;
      return 'class-a-complete';
    });

    await classAPromise;
    t.equal(classAStarted, true,
      'class A should start while class B consumes non-reserved capacity');
    t.equal(classCStarted, false,
      'class C should remain queued while non-reserved capacity is full');

    blocking.resolve();
    await classBPromise;
    await classCPromise;
  });

test('WorkClassScheduler - enforces fairness between class B and class C',
  async (t) => {
    const scheduler = new WorkClassScheduler({
      maxConcurrent: 1,
      reservedClassASlots: 0,
      maxClassCQueueSize: 8,
    });

    const executionOrder = [];
    const enqueueTask = (workClass, label) => scheduler.enqueue(workClass, async () => {
      executionOrder.push(label);
      return label;
    });

    await Promise.all([
      enqueueTask(WORK_CLASS.B, 'b-1'),
      enqueueTask(WORK_CLASS.C, 'c-1'),
      enqueueTask(WORK_CLASS.B, 'b-2'),
      enqueueTask(WORK_CLASS.C, 'c-2'),
    ]);

    t.same(executionOrder, ['b-1', 'c-1', 'b-2', 'c-2'],
      'class B/C queues should be drained fairly without starving class C');
  });

test('WorkClassScheduler - sheds class C when queue is saturated',
  async (t) => {
    const scheduler = new WorkClassScheduler({
      maxConcurrent: 1,
      reservedClassASlots: 0,
      maxClassCQueueSize: 1,
    });

    const blocking = createDeferred();
    const classBPromise = scheduler.enqueue(WORK_CLASS.B, async () => {
      await blocking.promise;
      return 'done';
    });
    await Promise.resolve();

    const classCQueued = scheduler.enqueue(WORK_CLASS.C, async () => 'c-1');
    await Promise.resolve();

    await t.rejects(
      scheduler.enqueue(WORK_CLASS.C, async () => 'c-2'),
      /WORK_CLASS_C_SHED/,
      'class C should be shed once its queue is saturated',
    );

    const stats = scheduler.getStats();
    t.equal(stats.classC.shedCount, 1, 'scheduler should track class C shed count');

    blocking.resolve();
    await classBPromise;
    await classCQueued;
  });
