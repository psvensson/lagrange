import {ADMIN_WEBSOCKET_API_SHARED} from './admin-websocket-api-shared.js';

const {
  ADMIN_CONTENT_TYPE,
  ADMIN_LOG_MSG,
  ADMIN_TEST_DEFAULT,
  ADMIN_TEST_ERROR_MSG,
  ADMIN_TEST_STREAM_EVENT,
  EMPTY_STRING,
  HTTP_HEADER,
  HTTP_HEADER_VALUE,
  HTTP_STATUS,
  SSE_FRAME_PREFIX,
  SSE_FRAME_SUFFIX,
  TRANSPORT_EVENT,
} = ADMIN_WEBSOCKET_API_SHARED;

const ADMIN_WEBSOCKET_TEST_RUN_ROUTE_METHODS = {
  /**
   * Serve dashboard landing page.
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleDashboardPage(reply) {
    try {
      const page = await this.testRunService.readDashboardPage();
      reply
        .code(HTTP_STATUS.OK)
        .header(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_STORE)
        .type(ADMIN_CONTENT_TYPE.HTML)
        .send(page);
    } catch (error) {
      reply.code(HTTP_STATUS.NOT_FOUND).send({
        error: ADMIN_TEST_ERROR_MSG.DASHBOARD_NOT_FOUND,
        details: error.message,
      });
    }
  },

  /**
   * List distributed tests and configs.
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleListTests(reply) {
    try {
      const [tests, configs] = await Promise.all([
        this.testRunService.listAvailableTests(),
        this.testRunService.listAvailableConfigs(),
      ]);
      reply.code(HTTP_STATUS.OK).send({
        tests,
        configs,
        defaultConfig: ADMIN_TEST_DEFAULT.CONFIG_FILE,
      });
    } catch (error) {
      reply
        .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .send({error: error.message});
    }
  },

  /**
   * List saved and active test runs.
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleListRuns(reply) {
    try {
      const runs = await this.testRunService.listSavedRuns();
      reply.code(HTTP_STATUS.OK).send({runs});
    } catch (error) {
      reply
        .code(HTTP_STATUS.INTERNAL_SERVER_ERROR)
        .send({error: error.message});
    }
  },

  /**
   * Get one test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleGetRun(request, reply) {
    const runId = request.params.runId;
    const run = await this.testRunService.getRun(runId);
    if (!run) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({error: ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND});
      return;
    }
    reply.code(HTTP_STATUS.OK).send({run});
  },

  /**
   * Start a distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleStartRun(request, reply) {
    try {
      const run = await this.testRunService.startRun(request.body || {});
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_STARTED, {
        runId: run.runId,
        scenario: run.scenario,
        gitHash: run.gitHash,
      });
      reply.code(HTTP_STATUS.OK).send({run});
    } catch (error) {
      reply
        .code(this.resolveTestApiErrorStatus(error))
        .send({error: error.message});
    }
  },

  /**
   * Stop a distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleStopRun(request, reply) {
    try {
      const run = await this.testRunService.stopRun(request.params.runId);
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_STOP_REQUESTED, {
        runId: run.runId,
        scenario: run.scenario,
      });
      reply.code(HTTP_STATUS.OK).send({run});
    } catch (error) {
      reply
        .code(this.resolveTestApiErrorStatus(error))
        .send({error: error.message});
    }
  },

  /**
   * Delete a completed distributed test run.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleDeleteRun(request, reply) {
    try {
      const result = await this.testRunService.deleteRun(request.params.runId);
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_DELETED, {
        runId: result.runId,
      });
      reply.code(HTTP_STATUS.OK).send(result);
    } catch (error) {
      reply
        .code(this.resolveTestApiErrorStatus(error))
        .send({error: error.message});
    }
  },

  /**
   * Stream live run events using SSE.
   * @param {Object} request
   * @param {Object} reply
   * @return {Promise<void>}
   */
  async handleRunStream(request, reply) {
    const runId = request.params.runId;
    const existingRun = await this.testRunService.getRun(runId);
    if (!existingRun) {
      reply
        .code(HTTP_STATUS.NOT_FOUND)
        .send({error: ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND});
      return;
    }

    let subscription = null;
    let closed = false;

    const sendEvent = (eventPayload) => {
      if (closed) {
        return;
      }
      try {
        const frame = `${SSE_FRAME_PREFIX}${JSON.stringify(eventPayload)}${SSE_FRAME_SUFFIX}`;
        reply.raw.write(frame);
      } catch (_streamErr) {
        // Stream errors are handled by close listener cleanup.
      }
    };

    subscription = this.testRunService.subscribeToRun(runId, sendEvent);
    if (!subscription) {
      reply.hijack();
      reply.raw.statusCode = HTTP_STATUS.OK;
      reply.raw.setHeader(
        HTTP_HEADER.CACHE_CONTROL,
        HTTP_HEADER_VALUE.NO_CACHE,
      );
      reply.raw.setHeader(HTTP_HEADER.CONNECTION, HTTP_HEADER_VALUE.KEEP_ALIVE);
      reply.raw.setHeader(
        HTTP_HEADER.CONTENT_TYPE,
        ADMIN_CONTENT_TYPE.EVENT_STREAM,
      );
      sendEvent({
        type: ADMIN_TEST_STREAM_EVENT.STATUS,
        data: existingRun,
      });
      for (const entry of existingRun.logs || []) {
        sendEvent({
          type: ADMIN_TEST_STREAM_EVENT.LOG,
          data: entry,
        });
      }
      reply.raw.end();
      return;
    }

    reply.hijack();
    reply.raw.statusCode = HTTP_STATUS.OK;
    reply.raw.setHeader(HTTP_HEADER.CACHE_CONTROL, HTTP_HEADER_VALUE.NO_CACHE);
    reply.raw.setHeader(HTTP_HEADER.CONNECTION, HTTP_HEADER_VALUE.KEEP_ALIVE);
    reply.raw.setHeader(
      HTTP_HEADER.CONTENT_TYPE,
      ADMIN_CONTENT_TYPE.EVENT_STREAM,
    );

    this.logger.info(ADMIN_LOG_MSG.TEST_RUN_LOG_STREAM_SUBSCRIBED, {
      runId,
    });

    sendEvent({
      type: ADMIN_TEST_STREAM_EVENT.STATUS,
      data: subscription.run,
    });
    for (const entry of subscription.backlog) {
      sendEvent({
        type: ADMIN_TEST_STREAM_EVENT.LOG,
        data: entry,
      });
    }

    request.raw.on(TRANSPORT_EVENT.CLOSE, () => {
      if (closed) {
        return;
      }
      closed = true;
      subscription.unsubscribe();
      this.logger.info(ADMIN_LOG_MSG.TEST_RUN_LOG_STREAM_UNSUBSCRIBED, {
        runId,
      });
      reply.raw.end();
    });
  },

  /**
   * Resolve status code for admin test API errors.
   * @param {Error} error
   * @return {number}
   */
  resolveTestApiErrorStatus(error) {
    const message = error?.message || EMPTY_STRING;
    if (
      message === ADMIN_TEST_ERROR_MSG.SCENARIO_REQUIRED ||
      message === ADMIN_TEST_ERROR_MSG.RUN_NOT_ACTIVE ||
      message === ADMIN_TEST_ERROR_MSG.RUN_DELETE_ACTIVE ||
      message.startsWith(`${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `)
    ) {
      return HTTP_STATUS.BAD_REQUEST;
    }
    if (
      message === ADMIN_TEST_ERROR_MSG.RUN_NOT_FOUND ||
      message === ADMIN_TEST_ERROR_MSG.SCENARIO_NOT_FOUND ||
      message === ADMIN_TEST_ERROR_MSG.CONFIG_NOT_FOUND
    ) {
      return HTTP_STATUS.NOT_FOUND;
    }
    return HTTP_STATUS.INTERNAL_SERVER_ERROR;
  },
};

export {ADMIN_WEBSOCKET_TEST_RUN_ROUTE_METHODS};
