const LOCAL_STR_CONSTRUCTOR = 'constructor';

function createMigrationCoordinatorLifecycleMethods(deps = {}) {
  const {
    LOCAL_NUM_ZERO,
    LOCAL_STR_EMPTY,
    MIGRATION_CANCELLABLE_STAGES,
    MIGRATION_ERROR_MSG,
    MIGRATION_LOG_MSG,
    MIGRATION_SQL,
    MIGRATION_STAGE_REASON,
    MIGRATION_STATUS,
    MIGRATION_TERMINAL_STATUSES,
    TABLES,
    resolvePartitionIdList,
  } = deps;

  class MigrationCoordinatorLifecycleMethods {
    async initiateMigration(tableId, alterSpec) {
      const normalizedTableId = String(tableId || '').trim();
      if (!normalizedTableId) {
        throw new Error('Migration tableId is required');
      }

      const activeMigration = await this.findActiveMigrationByTableId(
        normalizedTableId,
      );
      if (activeMigration) {
        throw new Error(
          `${MIGRATION_ERROR_MSG.ACTIVE_MIGRATION_CONFLICT_PREFIX}` +
          `${activeMigration.migration_id}`,
        );
      }

      const tableMetadata = await this.resolveTableMetadata(normalizedTableId);
      if (!tableMetadata) {
        throw new Error(`Table not found for migration: ${normalizedTableId}`);
      }

      const sourceSchema = String(tableMetadata.schema_definition || '{}');
      const targetPayload = this.buildTargetSchema(sourceSchema, alterSpec);
      const migrationId = this.generateMigrationId();
      const createdAt = this.now();

      await this.executeSql(
        MIGRATION_SQL.INSERT_MIGRATION,
        [
          migrationId,
          tableMetadata.table_id,
          tableMetadata.table_name,
          alterSpec.migrationType,
          sourceSchema,
          JSON.stringify(targetPayload),
          MIGRATION_STATUS.PENDING,
          MIGRATION_STATUS.PENDING,
          null,
          createdAt,
          createdAt,
          null,
        ],
      );

      const partitionRowsFromCache =
        typeof this.systemTableCache.filter === 'function' ?
          this.systemTableCache.filter(TABLES.PARTITIONS, (row) =>
            String(row?.table_id || '') === String(tableMetadata.table_id || ''),
          ) :
          [];
      let partitionIds = resolvePartitionIdList(partitionRowsFromCache);
      if (partitionIds.length === LOCAL_NUM_ZERO) {
        const partitionQueryResult = await this.executeSql(
          MIGRATION_SQL.SELECT_PARTITIONS_BY_TABLE,
          [tableMetadata.table_id],
        );
        partitionIds = resolvePartitionIdList(partitionQueryResult.rows);
      }

      for (const partitionId of partitionIds) {
        await this.executeSql(
          MIGRATION_SQL.INSERT_PARTITION_MIGRATION,
          [
            migrationId,
            partitionId,
            MIGRATION_STATUS.PENDING,
            null,
            LOCAL_NUM_ZERO,
            null,
            createdAt,
          ],
        );
      }

      await this.workflowCoordinator.registerWorkflow({
        workflowId: migrationId,
        ownerKey: migrationId,
        step: MIGRATION_STATUS.PENDING,
        status: MIGRATION_STATUS.PENDING,
        tableId: tableMetadata.table_id,
        tableName: tableMetadata.table_name,
        metadata: {
          migrationType: alterSpec.migrationType,
        },
        createdAt,
        updatedAt: createdAt,
        transitionHistory: [],
      });

      this.logger.info(MIGRATION_LOG_MSG.MIGRATION_INITIATED, {
        migration_id: migrationId,
        table_id: tableMetadata.table_id,
        table_name: tableMetadata.table_name,
        migration_type: alterSpec.migrationType,
        partition_count: partitionIds.length,
      });

      return migrationId;
    }

    async advanceMigration(migrationId, options = {}) {
      const normalizedMigrationId = String(migrationId || '').trim();
      if (!normalizedMigrationId) {
        throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`);
      }

      if (this.inflightByMigrationId.has(normalizedMigrationId)) {
        return this.inflightByMigrationId.get(normalizedMigrationId);
      }

      const executionPromise = (async () => {
        const migrationRow = await this.getMigrationById(normalizedMigrationId);
        if (!migrationRow) {
          throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`);
        }
        await this.ensureWorkflowRegistered(migrationRow);

        return this.workflowStepRunner.runStep({
          workflowId: normalizedMigrationId,
          ownerKey: normalizedMigrationId,
          stepName: 'advance_migration',
          timeoutBudget: options.timeoutBudget || null,
          execute: async ({timeoutBudget}) => {
            let activeMigration = await this.getMigrationById(normalizedMigrationId);
            if (!activeMigration) {
              throw new Error(
                `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`,
              );
            }

            if (MIGRATION_TERMINAL_STATUSES.has(String(activeMigration.status || ''))) {
              return {
                result: {
                  migrationId: normalizedMigrationId,
                  status: activeMigration.status,
                },
              };
            }
            if (String(activeMigration.status || '') === MIGRATION_STATUS.CANCELLING) {
              return {
                result: {
                  migrationId: normalizedMigrationId,
                  status: activeMigration.status,
                },
              };
            }

            try {
              if (activeMigration.status === MIGRATION_STATUS.PENDING ||
                  activeMigration.status === MIGRATION_STATUS.DUAL_WRITE) {
                await this.executeDualWriteStage(activeMigration, timeoutBudget);
                activeMigration = await this.getMigrationById(normalizedMigrationId);
              }

              if (activeMigration?.status === MIGRATION_STATUS.DUAL_WRITE_COMPLETE ||
                  activeMigration?.status === MIGRATION_STATUS.BACKFILL) {
                await this.executeBackfillStage(activeMigration, timeoutBudget);
                activeMigration = await this.getMigrationById(normalizedMigrationId);
              }

              if (activeMigration?.status === MIGRATION_STATUS.BACKFILL_COMPLETE ||
                  activeMigration?.status === MIGRATION_STATUS.CUTOVER_PENDING) {
                await this.executeCutoverStage(activeMigration, timeoutBudget);
                activeMigration = await this.getMigrationById(normalizedMigrationId);
              }
            } catch (error) {
              const latestMigration = await this.getMigrationById(normalizedMigrationId);
              if (latestMigration &&
                  String(latestMigration.status || '') !== MIGRATION_STATUS.CANCELLING &&
                  !MIGRATION_TERMINAL_STATUSES.has(String(latestMigration.status || ''))) {
                await this.transitionMigrationStage(
                  normalizedMigrationId,
                  MIGRATION_STATUS.FAILED,
                  MIGRATION_STAGE_REASON.FAILURE,
                  {
                    errorMessage: error?.message || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED,
                  },
                );
              }
              activeMigration = await this.getMigrationById(normalizedMigrationId);
            }

            return {
              result: {
                migrationId: normalizedMigrationId,
                status: activeMigration?.status || null,
              },
            };
          },
        });
      })()
        .finally(() => {
          this.inflightByMigrationId.delete(normalizedMigrationId);
        });

      this.inflightByMigrationId.set(normalizedMigrationId, executionPromise);
      return executionPromise;
    }

    async cancelMigration(migrationId) {
      const normalizedMigrationId = String(migrationId || '').trim();
      if (!normalizedMigrationId) {
        throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${migrationId}`);
      }

      const migrationRow = await this.getMigrationById(normalizedMigrationId);
      if (!migrationRow) {
        throw new Error(`${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`);
      }
      const currentStage = String(
        migrationRow.current_stage ||
        migrationRow.status ||
        '',
      );
      if (!MIGRATION_CANCELLABLE_STAGES.has(currentStage)) {
        throw new Error(`${MIGRATION_ERROR_MSG.NOT_CANCELLABLE_PREFIX}${currentStage}`);
      }

      this.cancellationRequestedByMigrationId.add(normalizedMigrationId);
      try {
        await this.transitionMigrationStage(
          normalizedMigrationId,
          MIGRATION_STATUS.CANCELLING,
          MIGRATION_STAGE_REASON.CANCELLING,
        );

        if (this.inflightByMigrationId.has(normalizedMigrationId)) {
          await this.inflightByMigrationId.get(normalizedMigrationId);
        }

        const latestMigrationRow = await this.getMigrationById(normalizedMigrationId);
        if (!latestMigrationRow) {
          throw new Error(
            `${MIGRATION_ERROR_MSG.MIGRATION_NOT_FOUND}: ${normalizedMigrationId}`,
          );
        }
        await this.rollbackMigration(latestMigrationRow);
        await this.transitionMigrationStage(
          normalizedMigrationId,
          MIGRATION_STATUS.CANCELLED,
          MIGRATION_STAGE_REASON.CANCELLED,
          {
            errorMessage: null,
            completedAt: this.now(),
          },
        );
        this.logger.info(MIGRATION_LOG_MSG.MIGRATION_CANCELLED, {
          migration_id: normalizedMigrationId,
        });
        return {
          success: true,
          migrationId: normalizedMigrationId,
          status: MIGRATION_STATUS.CANCELLED,
        };
      } finally {
        this.cancellationRequestedByMigrationId.delete(normalizedMigrationId);
      }
    }

    async recoverMigrations() {
      const result = await this.executeSql(
        MIGRATION_SQL.SELECT_NON_TERMINAL_MIGRATIONS,
        [
          MIGRATION_STATUS.COMPLETED,
          MIGRATION_STATUS.CANCELLED,
          MIGRATION_STATUS.FAILED,
        ],
        {},
        true,
      );
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const recoveredMigrationIds = [];

      for (const row of rows) {
        const migrationId = String(row.migration_id || LOCAL_STR_EMPTY);
        if (!migrationId) {
          continue;
        }
        await this.ensureWorkflowRegistered(row);
        this.logger.info(MIGRATION_LOG_MSG.MIGRATION_RECOVERED, {
          migration_id: migrationId,
          stage: row.current_stage || row.status,
        });
        await this.advanceMigration(migrationId);
        recoveredMigrationIds.push(migrationId);
      }

      return {
        success: true,
        recovered: recoveredMigrationIds.length,
        migrationIds: recoveredMigrationIds,
      };
    }
  }

  return Object.fromEntries(
    Object.getOwnPropertyNames(MigrationCoordinatorLifecycleMethods.prototype)
      .filter((methodName) => methodName !== LOCAL_STR_CONSTRUCTOR)
      .map((methodName) => [
        methodName,
        MigrationCoordinatorLifecycleMethods.prototype[methodName],
      ]),
  );
}

export {createMigrationCoordinatorLifecycleMethods};
