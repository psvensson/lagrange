const RUNTIME_DRIVER_START_FAILED = 'runtime driver start failed';

function createServiceRuntimeLifecycleOperationMethods(deps) {
  const {
    EndpointIntentError,
    IdempotencyCheckError,
    LIFECYCLE_EVENT,
    LIFECYCLE_OPERATION,
    LifecycleOrchestrationError,
    LOCAL_STR_17O4M,
    LOCAL_STR_NONE,
    LOCAL_STR_VUZ91,
    OperationJournalError,
    QUERY_EXECUTOR_FACTORY_EVENT,
    RUNTIME_REPLICA_STATUS,
    START_STATUS,
    WASM_OPERATION_STATE,
    getOrCreateCauseId,
    resolveRuntimeKind,
    resolveServiceId,
    validateEndpointIntent,
  } = deps;

  function resolveIssuingServiceIdentity(definition, replicaServiceId) {
    return definition.entityId ??
      definition.service_id ?? replicaServiceId;
  }

  function injectServiceQueryExecutor(
    owner, definition, serviceId, replicaContext, runtimeKind,
  ) {
    if (!owner._queryExecutorFactory) {
      return;
    }
    const queryExecutor = owner._queryExecutorFactory(
      resolveIssuingServiceIdentity(definition, serviceId),
    );
    replicaContext.queryExecutor = queryExecutor;
    if (typeof queryExecutor?.executeRequest === 'function') {
      replicaContext.sqlRequestExecutor =
        queryExecutor.executeRequest.bind(queryExecutor);
    }
    owner.emit(
      QUERY_EXECUTOR_FACTORY_EVENT.EXECUTOR_INJECTED,
      {runtimeKind, serviceId},
    );
  }

  function assertDriverStartSucceeded(
    result, runtimeKind, serviceId, operation,
  ) {
    if (result?.status === START_STATUS.FAILED) {
      throw new LifecycleOrchestrationError(
        operation,
        runtimeKind,
        serviceId,
        result.error || RUNTIME_DRIVER_START_FAILED,
      );
    }
  }

  class ServiceRuntimeLifecycleOperationMethods {
  /**
   * Prepare runtime artifacts for a service definition.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} context - Preparation context (node info, etc.).
   * @param {Object} [options] - Optional lifecycle options.
   * @param {string} [options.idempotencyKey] - Idempotency key for
   *   deduplication. When provided and a matching operation exists,
   *   returns the original operation identity (Req 11.2).
   * @return {Promise<{status: string, error?: string,
   *   operationId?: string, idempotent?: boolean}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   */
    async prepare(definition, context, options) {
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.PREPARE;
      const idempotencyKey = options?.idempotencyKey ?? null;

      if (!runtimeKind) {
        throw new LifecycleOrchestrationError(
          op, LOCAL_STR_NONE, serviceId,
          LOCAL_STR_17O4M,
        );
      }
      this._validateRuntimeDescriptor(
        definition, runtimeKind, op, serviceId,
      );

      this.emit(LIFECYCLE_EVENT.PREPARE_START, {
        runtimeKind, serviceId,
      });
      const start = Date.now();
      let operation = null;

      try {
        operation = await this._journalCreate(
          serviceId, runtimeKind, op,
          definition.tenantId, idempotencyKey,
        );

        // Idempotency hit: return existing operation identity
        if (operation && operation.idempotent) {
          const durationMs = Date.now() - start;
          const result = {
            status: operation.existing.state ??
            WASM_OPERATION_STATE.PENDING,
            operationId: operation.operationId,
            idempotent: true,
          };
          this.emit(LIFECYCLE_EVENT.PREPARE_SUCCESS, {
            runtimeKind, serviceId, durationMs, result,
          });
          return result;
        }

        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.PENDING,
          WASM_OPERATION_STATE.IN_PROGRESS,
        );

        const driver = this._resolveDriver(runtimeKind);
        // The lifecycle owner supplies its registered native_js
        // handler map unless the caller provided one explicitly, so
        // placed replicas resolve their runtime_ref through the
        // production create path.
        const prepareContext =
          context?.handlerMap ?
            context :
            {...context, handlerMap: this._nativeJsHandlerMap};
        const result = await driver.prepare(definition, prepareContext);
        const durationMs = Date.now() - start;

        await this._projectReplicaState(
          serviceId, definition, RUNTIME_REPLICA_STATUS.CREATED,
          {created_at: start},
        );

        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.IN_PROGRESS,
          WASM_OPERATION_STATE.COMPLETED,
          result,
        );

        this.emit(LIFECYCLE_EVENT.PREPARE_SUCCESS, {
          runtimeKind, serviceId, durationMs, result,
        });
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        if (operation && !(err instanceof OperationJournalError) &&
          !(err instanceof IdempotencyCheckError)) {
          await this._journalTransition(
            operation, serviceId, runtimeKind, op,
            WASM_OPERATION_STATE.IN_PROGRESS,
            WASM_OPERATION_STATE.FAILED,
            {message: err.message},
          ).catch(() => {});
        }
        await this._projectReplicaState(
          serviceId, definition, RUNTIME_REPLICA_STATUS.FAILED,
          {error_message: err.message},
        );
        this.emit(LIFECYCLE_EVENT.PREPARE_FAILURE, {
          runtimeKind, serviceId, durationMs, error: err,
        });
        if (err instanceof LifecycleOrchestrationError ||
          err instanceof OperationJournalError ||
          err instanceof IdempotencyCheckError) {
          throw err;
        }
        throw new LifecycleOrchestrationError(
          op, runtimeKind, serviceId, err.message, {cause: err},
        );
      }
    }

    /**
   * Start a service replica.
   *
   * When the driver returns an endpointIntent in its StartResult,
   * this method validates the intent and emits an
   * ENDPOINT_INTENT_RECEIVED event. The lifecycle owner is the
   * single coordinator for endpoint registration — no driver may
   * write endpoint records directly.
   *
   * If an endpointWriter is configured, the validated intent is
   * written through it (SQL/CDC path) and an ENDPOINT_REGISTERED
   * event is emitted. If the write fails, an
   * ENDPOINT_REGISTRATION_FAILED event is emitted and the error
   * is wrapped in a LifecycleOrchestrationError.
   *
   * Requirements: 8.1, 8.2, 8.3, 11.2
   *
   * @param {Object} replicaContext - Replica execution context.
   *   Must include a service definition with runtime_kind.
   * @param {Object} [options] - Optional lifecycle options.
   * @param {string} [options.idempotencyKey] - Idempotency key for
   *   deduplication (Req 11.2).
   * @return {Promise<{status: string, endpointIntent?: Object,
   *   error?: string, operationId?: string, idempotent?: boolean}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   * @throws {EndpointIntentError} On invalid endpoint intent.
   */
    async start(replicaContext, options) {
      const definition = replicaContext?.definition ?? replicaContext;
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.START;
      const idempotencyKey = options?.idempotencyKey ?? null;

      if (!runtimeKind) {
        throw new LifecycleOrchestrationError(
          op, LOCAL_STR_NONE, serviceId,
          LOCAL_STR_VUZ91,
        );
      }
      this._validateRuntimeDescriptor(
        definition, runtimeKind, op, serviceId,
      );

      this.emit(LIFECYCLE_EVENT.START_START, {
        runtimeKind, serviceId,
      });
      const start = Date.now();
      let operation = null;
      let causeId = null;

      try {
        operation = await this._journalCreate(
          serviceId, runtimeKind, op,
          definition.tenantId, idempotencyKey,
        );

        // Idempotency hit: return existing operation identity
        if (operation && operation.idempotent) {
          const durationMs = Date.now() - start;
          const result = {
            status: operation.existing.state ??
            WASM_OPERATION_STATE.PENDING,
            operationId: operation.operationId,
            idempotent: true,
          };
          this.emit(LIFECYCLE_EVENT.START_SUCCESS, {
            runtimeKind, serviceId, durationMs, result,
          });
          return result;
        }

        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.PENDING,
          WASM_OPERATION_STATE.IN_PROGRESS,
        );

        causeId = getOrCreateCauseId(operation?.operationId);

        // Inject service-scoped query executor into replica context
        // so drivers and lifecycle modules can query tables through
        // the standard SQL execution path. A placed replica has its
        // own lifecycle serviceId (`entity-rN`), but routing policy and
        // service_partition_access are owned by the canonical runtime
        // service definition. Attribute queries to that entity id.
        injectServiceQueryExecutor(
          this, definition, serviceId, replicaContext, runtimeKind,
        );

        const driver = this._resolveDriver(runtimeKind);
        const result = await driver.start(replicaContext);
        assertDriverStartSucceeded(result, runtimeKind, serviceId, op);
        const durationMs = Date.now() - start;

        // --- Endpoint intent single-write-path handling ---
        if (result && result.endpointIntent) {
          const validation = validateEndpointIntent(
            result.endpointIntent,
          );
          if (!validation.valid) {
            throw new EndpointIntentError(
              runtimeKind, serviceId, validation.reason,
            );
          }
          this.emit(LIFECYCLE_EVENT.ENDPOINT_INTENT_RECEIVED, {
            runtimeKind, serviceId, endpointIntent: result.endpointIntent,
            causeId,
          });

          if (this._endpointWriter) {
            try {
              await this._endpointWriter(
                serviceId, runtimeKind, result.endpointIntent,
                {causeId},
              );
              this.emit(LIFECYCLE_EVENT.ENDPOINT_REGISTERED, {
                runtimeKind, serviceId,
                endpointIntent: result.endpointIntent,
                causeId,
              });
            } catch (writeErr) {
              this.emit(LIFECYCLE_EVENT.ENDPOINT_REGISTRATION_FAILED, {
                runtimeKind, serviceId, error: writeErr,
                causeId,
              });
              throw new LifecycleOrchestrationError(
                op, runtimeKind, serviceId,
                `endpoint registration failed: ${writeErr.message}`,
                {cause: writeErr},
              );
            }
          }
        }

        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.IN_PROGRESS,
          WASM_OPERATION_STATE.COMPLETED,
          result,
        );

        await this._projectReplicaState(
          serviceId, definition, RUNTIME_REPLICA_STATUS.ACTIVE, null, {causeId},
        );

        this.emit(LIFECYCLE_EVENT.START_SUCCESS, {
          runtimeKind, serviceId, durationMs, result,
        });
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        if (operation && !(err instanceof OperationJournalError) &&
          !(err instanceof IdempotencyCheckError)) {
          await this._journalTransition(
            operation, serviceId, runtimeKind, op,
            WASM_OPERATION_STATE.IN_PROGRESS,
            WASM_OPERATION_STATE.FAILED,
            {message: err.message},
          ).catch(() => {});
        }
        await this._removeEndpoint(serviceId, definition);
        await this._projectReplicaState(
          serviceId, definition, RUNTIME_REPLICA_STATUS.FAILED,
          {error_message: err.message},
          {causeId: causeId || getOrCreateCauseId(operation?.operationId)},
        );
        this.emit(LIFECYCLE_EVENT.START_FAILURE, {
          runtimeKind, serviceId, durationMs, error: err,
        });
        if (err instanceof LifecycleOrchestrationError ||
          err instanceof EndpointIntentError ||
          err instanceof OperationJournalError ||
          err instanceof IdempotencyCheckError) {
          throw err;
        }
        throw new LifecycleOrchestrationError(
          op, runtimeKind, serviceId, err.message, {cause: err},
        );
      }
    }

    /**
   * Stop a service replica.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @param {Object} [options] - Optional lifecycle options.
   * @param {string} [options.idempotencyKey] - Idempotency key for
   *   deduplication (Req 11.2).
   * @return {Promise<void|{operationId: string, idempotent: true}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   */
    async stop(replicaContext, options) {
      const definition = replicaContext?.definition ?? replicaContext;
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.STOP;
      const idempotencyKey = options?.idempotencyKey ?? null;

      if (!runtimeKind) {
        throw new LifecycleOrchestrationError(
          op, LOCAL_STR_NONE, serviceId,
          LOCAL_STR_VUZ91,
        );
      }
      this._validateRuntimeDescriptor(
        definition, runtimeKind, op, serviceId,
      );

      this.emit(LIFECYCLE_EVENT.STOP_START, {
        runtimeKind, serviceId,
      });
      const start = Date.now();
      let operation = null;

      try {
        operation = await this._journalCreate(
          serviceId, runtimeKind, op,
          definition.tenantId, idempotencyKey,
        );

        // Idempotency hit: return existing operation identity
        if (operation && operation.idempotent) {
          const durationMs = Date.now() - start;
          this.emit(LIFECYCLE_EVENT.STOP_SUCCESS, {
            runtimeKind, serviceId, durationMs,
          });
          return {
            operationId: operation.operationId,
            idempotent: true,
          };
        }

        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.PENDING,
          WASM_OPERATION_STATE.IN_PROGRESS,
        );

        const driver = this._resolveDriver(runtimeKind);
        await driver.stop(replicaContext);
        const durationMs = Date.now() - start;

        await this._journalTransition(
          operation, serviceId, runtimeKind, op,
          WASM_OPERATION_STATE.IN_PROGRESS,
          WASM_OPERATION_STATE.COMPLETED,
        );

        await this._removeEndpoint(serviceId, definition);

        await this._projectReplicaState(
          serviceId, definition, RUNTIME_REPLICA_STATUS.STOPPED,
        );

        this.emit(LIFECYCLE_EVENT.STOP_SUCCESS, {
          runtimeKind, serviceId, durationMs,
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        if (operation && !(err instanceof OperationJournalError) &&
          !(err instanceof IdempotencyCheckError)) {
          await this._journalTransition(
            operation, serviceId, runtimeKind, op,
            WASM_OPERATION_STATE.IN_PROGRESS,
            WASM_OPERATION_STATE.FAILED,
            {message: err.message},
          ).catch(() => {});
        }
        await this._removeEndpoint(serviceId, definition);
        await this._projectReplicaState(
          serviceId, definition, RUNTIME_REPLICA_STATUS.FAILED,
          {error_message: err.message},
        );
        this.emit(LIFECYCLE_EVENT.STOP_FAILURE, {
          runtimeKind, serviceId, durationMs, error: err,
        });
        if (err instanceof LifecycleOrchestrationError ||
          err instanceof OperationJournalError ||
          err instanceof IdempotencyCheckError) {
          throw err;
        }
        throw new LifecycleOrchestrationError(
          op, runtimeKind, serviceId, err.message, {cause: err},
        );
      }
    }

    /**
   * Check health of a service replica.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @return {Promise<{status: string, detail?: string}>}
   * @throws {LifecycleOrchestrationError} On driver failure.
   */
    async health(replicaContext) {
      const definition = replicaContext?.definition ?? replicaContext;
      const runtimeKind = resolveRuntimeKind(definition);
      const serviceId = resolveServiceId(definition);
      const op = LIFECYCLE_OPERATION.HEALTH;

      if (!runtimeKind) {
        throw new LifecycleOrchestrationError(
          op, LOCAL_STR_NONE, serviceId,
          LOCAL_STR_VUZ91,
        );
      }
      this._validateRuntimeDescriptor(
        definition, runtimeKind, op, serviceId,
      );

      this.emit(LIFECYCLE_EVENT.HEALTH_CHECK, {
        runtimeKind, serviceId,
      });
      const start = Date.now();

      try {
        const driver = this._resolveDriver(runtimeKind);
        const result = await driver.health(replicaContext);
        const durationMs = Date.now() - start;
        this.emit(LIFECYCLE_EVENT.HEALTH_RESULT, {
          runtimeKind, serviceId, durationMs, result,
        });
        return result;
      } catch (err) {
        const durationMs = Date.now() - start;
        this.emit(LIFECYCLE_EVENT.HEALTH_RESULT, {
          runtimeKind, serviceId, durationMs, error: err,
        });
        if (err instanceof LifecycleOrchestrationError) {
          throw err;
        }
        throw new LifecycleOrchestrationError(
          op, runtimeKind, serviceId, err.message, {cause: err},
        );
      }
    }
  }

  const descriptors = Object.getOwnPropertyDescriptors(
    ServiceRuntimeLifecycleOperationMethods.prototype,
  );
  delete descriptors.constructor;
  return descriptors;
}

export {createServiceRuntimeLifecycleOperationMethods};
