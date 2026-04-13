import {test} from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {RouterMessageHandler} from '../../src/transport/router-message-handler.js';

test('MessageRouter preserves retired late-response classification and delivery source',
  async (t) => {
    let nowMs = 1000;
    const router = new MessageRouter({
      nodeId: 'retired-service-response-test',
      nowFn: () => nowMs,
      unmatchedServiceResponseWarnIntervalMs: 5000,
    });
    await router.initialize({startServer: false});

    const debugs = [];
    router.logger = {
      info() {},
      error() {},
      warn() {},
      debug(message, context) {
        debugs.push({message, context});
      },
    };

    router.registerPendingResponse('retired-response-1', 'node-remote', {
      deliverySource: 'query:insert:sql_write_operations',
    });
    router.cancelPendingResponse('retired-response-1', {
      ignoreLateResponse: true,
    });

    nowMs = 1500;
    router.handleServiceResponse({
      messageId: 'retired-response-1',
      result: {ok: true},
    });

    t.ok(
      debugs.some((entry) =>
        entry.context?.ignoredRetiredPending === true &&
        entry.context?.unmatchedClassification === 'late_after_cancelled' &&
        entry.context?.deliverySource ===
          'query:insert:sql_write_operations'),
      'late cancelled responses should be absorbed with the original delivery source',
    );
    t.same(
      router.getServiceResponseDispositionCounts(),
      {
        late_after_cancelled: 1,
      },
      'retired late responses should be counted by their classified disposition',
    );

    await router.shutdown();
  });

test('MessageRouter classifies timed-out late responses by retirement cause',
  async (t) => {
    let nowMs = 1000;
    const router = new MessageRouter({
      nodeId: 'retired-service-response-timeout-test',
      nowFn: () => nowMs,
      unmatchedServiceResponseWarnIntervalMs: 5000,
    });
    await router.initialize({startServer: false});

    const debugs = [];
    router.logger = {
      info() {},
      error() {},
      warn() {},
      debug(message, context) {
        debugs.push({message, context});
      },
    };

    const responsePromise = router.registerPendingResponse(
      'retired-timeout-response',
      'node-remote',
      {
        deliverySource: 'message:node-state-update',
      },
    );
    responsePromise.catch(() => {});
    router.armPendingResponseTimeout('retired-timeout-response', 5);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    nowMs = 1015;

    router.handleServiceResponse({
      messageId: 'retired-timeout-response',
      result: {ok: true},
    });

    t.ok(
      debugs.some((entry) =>
        entry.context?.ignoredRetiredPending === true &&
        entry.context?.unmatchedClassification === 'late_after_timeout' &&
        entry.context?.deliverySource === 'message:node-state-update'),
      'late timed-out responses should be absorbed and classified by timeout cause',
    );
    t.same(
      router.getServiceResponseDispositionCounts(),
      {
        late_after_timeout: 1,
      },
      'timed-out late responses should increment the timeout disposition counter',
    );

    await router.shutdown();
  });

test('MessageRouter tracks settled, absorbed, and orphaned service-response dispositions',
  async (t) => {
    const router = new MessageRouter({
      nodeId: 'service-response-disposition-count-test',
      nowFn: () => 1000,
      unmatchedServiceResponseWarnIntervalMs: 5000,
    });
    await router.initialize({startServer: false});

    router.logger = {
      info() {},
      error() {},
      warn() {},
      debug() {},
    };

    const pending = router.registerPendingResponse(
      'matched-response-1',
      'node-remote',
    );
    pending.catch(() => {});
    router.handleServiceResponse({
      messageId: 'matched-response-1',
      result: {ok: true},
    });
    router.registerPendingResponse('retired-response-2', 'node-remote');
    router.cancelPendingResponse('retired-response-2', {
      ignoreLateResponse: true,
    });
    router.handleServiceResponse({
      messageId: 'retired-response-2',
      result: {ok: true},
    });
    router.handleServiceResponse({
      messageId: 'orphan-response-1',
      result: {ok: true},
    });

    t.same(
      router.getServiceResponseDispositionCounts(),
      {
        late_after_cancelled: 1,
        orphaned: 1,
        settled: 1,
      },
      'the router should expose one canonical count map for matched and unmatched response dispositions',
    );

    await router.shutdown();
  });

test('RouterMessageHandler treats service responses as delegated adapter traffic',
  async (t) => {
    const debugs = [];
    const warns = [];
    const messageHandler = new RouterMessageHandler({
      logger: {
        debug(message, context) {
          debugs.push({message, context});
        },
        warn(message, context) {
          warns.push({message, context});
        },
        error() {},
      },
      handlers: new Map(),
      pendingMessages: new Map(),
      pendingPings: new Map(),
      nodeConnections: new Map(),
      nodeId: 'router-message-handler-test',
      sendRaw() {},
      emit() {},
    });

    messageHandler.handleServiceResponse({
      messageId: 'adapter-response-1',
      result: {ok: true},
    });

    t.equal(
      warns.length,
      0,
      'the adapter should not emit warning-level orphan semantics on its own',
    );
    t.ok(
      debugs.some((entry) =>
        entry.context?.messageId === 'adapter-response-1' &&
        entry.context?.delegatedResponseHandler === false),
      'the adapter should only note the missing owner callback at debug level',
    );
  });
