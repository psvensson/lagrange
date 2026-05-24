const LOCAL_STR_CONSTRUCTOR = 'constructor';

function createMigrationCoordinatorStageMethods(deps = {}) {
  const {
    LOCAL_NUM_ONE,
    LOCAL_NUM_ZERO,
    LOCAL_STR_15T8X,
    LOCAL_STR_16VMA,
    LOCAL_STR_16VZX,
    LOCAL_STR_18RRO,
    LOCAL_STR_1A9V5,
    LOCAL_STR_1D25J,
    LOCAL_STR_1H4U6,
    LOCAL_STR_1S5V1,
    LOCAL_STR_1UZWJ,
    LOCAL_STR_9U4IH,
    LOCAL_STR_BEGIN,
    LOCAL_STR_COMMIT,
    LOCAL_STR_EMPTY,
    LOCAL_STR_NUMBER,
    LOCAL_STR_ROLLBACK,
    MIGRATION_COLUMN,
    MIGRATION_DEFAULT,
    MIGRATION_ERROR_MSG,
    MIGRATION_LOG_MSG,
    MIGRATION_PARTITION_OPERATION,
    MIGRATION_SQL,
    MIGRATION_STAGE_REASON,
    MIGRATION_STATUS,
    MIGRATION_TERMINAL_STATUSES,
    MIGRATION_TYPE,
    formatBackfillCursor,
    mapStageIndex,
    normalizeInteger,
    parseBackfillCursor,
    parseJsonSafe,
    quoteIdentifier,
    resolveDefaultLiteral,
    sleep,
  } = deps;

  class MigrationCoordinatorStageMethods {
    async executeDualWriteStage(migrationRow, timeoutBudget) {
      if (!migrationRow) {
        return;
      }

      const migrationId = String(migrationRow.migration_id || '');
      if (!migrationId) {
        return;
      }

      const currentStatus = String(
        migrationRow[MIGRATION_COLUMN.STATUS] ||
        migrationRow[MIGRATION_COLUMN.CURRENT_STAGE] ||
        '',
      );
      if (currentStatus === MIGRATION_STATUS.PENDING) {
        await this.transitionMigrationStage(
          migrationId,
          MIGRATION_STATUS.DUAL_WRITE,
          MIGRATION_STAGE_REASON.DUAL_WRITE_START,
        );
      }

      const activeMigrationRow = await this.getMigrationById(migrationId);
      const alterSpec = this.resolveAlterSpecFromMigration(activeMigrationRow);
      const alterSql = String(alterSpec?.sql || '').trim();
      if (!alterSql) {
        throw new Error(LOCAL_STR_18RRO);
      }

      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      for (const partitionRow of partitionRows) {
        const partitionId = String(partitionRow.partition_id || '');
        if (!partitionId) {
          continue;
        }

        const partitionStatus = String(partitionRow.status || '');
        const partitionStageIndex = mapStageIndex(partitionStatus);
        const dualWriteStageIndex = mapStageIndex(MIGRATION_STATUS.DUAL_WRITE);
        if (partitionStageIndex >= dualWriteStageIndex) {
          continue;
        }

        await this.runPartitionOperationWithRetry({
          migrationId,
          partitionId,
          statusOnFailure: MIGRATION_STATUS.DUAL_WRITE,
          timeoutBudget,
          operation: async (_childTimeoutBudget) => {
            const result = await this.executePartitionSql(
              partitionId,
              alterSql,
              [],
              {
                forRead: false,
                executionOptions: {
                  migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
                  migrationId,
                },
              },
            );
            if (result?.success !== true) {
              throw new Error(result?.error || LOCAL_STR_1S5V1);
            }
            await this.updatePartitionMigration(migrationId, partitionId, {
              status: MIGRATION_STATUS.DUAL_WRITE,
              error_message: null,
              retry_count: normalizeInteger(partitionRow.retry_count, LOCAL_NUM_ZERO),
            });
            return result;
          },
        });
      }

      const refreshedPartitionRows = await this.getPartitionMigrationRows(migrationId);
      const allInDualWrite = refreshedPartitionRows.every((row) => {
        const status = String(row.status || '');
        if (MIGRATION_TERMINAL_STATUSES.has(status)) {
          return true;
        }
        return mapStageIndex(status) >= mapStageIndex(MIGRATION_STATUS.DUAL_WRITE);
      });
      if (allInDualWrite) {
        await this.transitionMigrationStage(
          migrationId,
          MIGRATION_STATUS.DUAL_WRITE_COMPLETE,
          MIGRATION_STAGE_REASON.DUAL_WRITE_COMPLETE,
        );
      }
    }

    async executeBackfillStage(migrationRow, timeoutBudget) {
      if (!migrationRow) {
        return;
      }
      const migrationId = String(migrationRow.migration_id || '');
      if (!migrationId) {
        return;
      }

      if (String(migrationRow.status || LOCAL_STR_EMPTY) === MIGRATION_STATUS.DUAL_WRITE_COMPLETE) {
        await this.transitionMigrationStage(
          migrationId,
          MIGRATION_STATUS.BACKFILL,
          MIGRATION_STAGE_REASON.BACKFILL_START,
        );
      }

      const refreshedMigrationRow = await this.getMigrationById(migrationId);
      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      const backfillCompleteStageIndex =
        mapStageIndex(MIGRATION_STATUS.BACKFILL_COMPLETE);

      for (const partitionRow of partitionRows) {
        const partitionId = String(partitionRow.partition_id || '');
        if (!partitionId) {
          continue;
        }

        const partitionStageIndex = mapStageIndex(String(partitionRow.status || ''));
        if (partitionStageIndex >= backfillCompleteStageIndex) {
          continue;
        }

        await this.runPartitionOperationWithRetry({
          migrationId,
          partitionId,
          statusOnFailure: MIGRATION_STATUS.BACKFILL,
          timeoutBudget,
          operation: async (_childTimeoutBudget) => {
            return this.runBackfillPartitionLoop(
              refreshedMigrationRow,
              partitionRow,
              timeoutBudget,
            );
          },
        });
      }

      const finalPartitionRows = await this.getPartitionMigrationRows(migrationId);
      const allBackfilled = finalPartitionRows.every((row) => {
        const status = String(row.status || '');
        if (MIGRATION_TERMINAL_STATUSES.has(status)) {
          return true;
        }
        return mapStageIndex(status) >= backfillCompleteStageIndex;
      });
      if (allBackfilled) {
        await this.transitionMigrationStage(
          migrationId,
          MIGRATION_STATUS.BACKFILL_COMPLETE,
          MIGRATION_STAGE_REASON.BACKFILL_COMPLETE,
        );
      }
    }

    async executeCutoverStage(migrationRow, _timeoutBudget) {
      if (!migrationRow) {
        return;
      }

      const migrationId = String(migrationRow.migration_id || '');
      if (!migrationId) {
        return;
      }

      if (String(migrationRow.status || LOCAL_STR_EMPTY) === MIGRATION_STATUS.BACKFILL_COMPLETE) {
        await this.transitionMigrationStage(
          migrationId,
          MIGRATION_STATUS.CUTOVER_PENDING,
          MIGRATION_STAGE_REASON.CUTOVER_PENDING,
        );
      }

      const refreshedMigrationRow = await this.getMigrationById(migrationId);
      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      let lastError = null;
      for (let attempt = LOCAL_NUM_ZERO; attempt <= MIGRATION_DEFAULT.MAX_RETRY_COUNT; attempt++) {
        try {
          await this.executeCutoverTransaction(refreshedMigrationRow, partitionRows);
          await this.transitionMigrationStage(
            migrationId,
            MIGRATION_STATUS.COMPLETED,
            MIGRATION_STAGE_REASON.CUTOVER_COMPLETE,
            {
              completedAt: this.now(),
              errorMessage: null,
            },
          );
          return;
        } catch (error) {
          lastError = error;
          if (attempt >= MIGRATION_DEFAULT.MAX_RETRY_COUNT) {
            break;
          }
          const delayMs = this.buildExponentialBackoffDelay(attempt);
          this.logger.info(MIGRATION_LOG_MSG.CUTOVER_RETRY, {
            migration_id: migrationId,
            retry_count: attempt + LOCAL_NUM_ONE,
            delay_ms: delayMs,
            error: error?.message || null,
          });
          await sleep(delayMs);
        }
      }

      await this.transitionMigrationStage(
        migrationId,
        MIGRATION_STATUS.FAILED,
        MIGRATION_STAGE_REASON.FAILURE,
        {
          errorMessage: lastError?.message || MIGRATION_ERROR_MSG.RETRY_EXHAUSTED,
        },
      );
    }

    async rollbackMigration(migrationRow) {
      const migrationId = String(migrationRow?.migration_id || '');
      if (!migrationId) {
        throw new Error(LOCAL_STR_1A9V5);
      }

      const rollbackSql = this.resolveRollbackSql(migrationRow);
      if (!rollbackSql) {
        return {
          success: true,
          migrationId,
          skipped: true,
        };
      }

      const partitionRows = await this.getPartitionMigrationRows(migrationId);
      for (const partitionRow of partitionRows) {
        const partitionId = String(partitionRow.partition_id || '');
        if (!partitionId) {
          continue;
        }
        await this.runPartitionOperationWithRetry({
          migrationId,
          partitionId,
          statusOnFailure: MIGRATION_STATUS.CANCELLING,
          timeoutBudget: null,
          operation: async () => {
            const result = await this.executePartitionSql(
              partitionId,
              rollbackSql,
              [],
              {
                forRead: false,
                executionOptions: {
                  migrationOperation: MIGRATION_PARTITION_OPERATION.ALTER_TABLE,
                  migrationId,
                },
              },
            );
            if (result?.success !== true) {
              throw new Error(result?.error || LOCAL_STR_1H4U6);
            }
            await this.updatePartitionMigration(migrationId, partitionId, {
              status: MIGRATION_STATUS.CANCELLED,
              error_message: null,
            });
            return result;
          },
        });
      }

      return {
        success: true,
        migrationId,
        rollbackSql,
        partitionCount: partitionRows.length,
      };
    }

    async runPartitionOperationWithRetry(options = {}) {
      const migrationId = String(options.migrationId || '');
      const partitionId = String(options.partitionId || '');
      const statusOnFailure = options.statusOnFailure || MIGRATION_STATUS.FAILED;
      const operation = typeof options.operation === 'function' ?
        options.operation :
        null;
      if (!migrationId || !partitionId || !operation) {
        throw new Error(LOCAL_STR_1D25J);
      }

      let lastError = null;
      for (let attempt = LOCAL_NUM_ZERO; attempt <= MIGRATION_DEFAULT.MAX_RETRY_COUNT; attempt++) {
        const childBudget = this.migrationTimeoutPolicy.allocateOrThrow({
          timeoutBudget: options.timeoutBudget || null,
          nestedOperation: `partition_${partitionId}_attempt_${attempt}`,
        });
        try {
          return await operation(childBudget);
        } catch (error) {
          lastError = error;
          const retryCount = attempt + 1;
          await this.updatePartitionMigration(migrationId, partitionId, {
            status: statusOnFailure,
            retry_count: retryCount,
            error_message: error?.message || null,
          });
          if (attempt >= MIGRATION_DEFAULT.MAX_RETRY_COUNT) {
            break;
          }
          const delayMs = this.buildExponentialBackoffDelay(attempt);
          this.logger.info(MIGRATION_LOG_MSG.PARTITION_RETRY, {
            migration_id: migrationId,
            partition_id: partitionId,
            retry_count: retryCount,
            delay_ms: delayMs,
            error: error?.message || null,
          });
          await sleep(delayMs);
        }
      }

      throw lastError || new Error(MIGRATION_ERROR_MSG.RETRY_EXHAUSTED);
    }

    async runBackfillPartitionLoop(migrationRow, partitionRow, timeoutBudget) {
      const migrationId = String(migrationRow?.migration_id || '');
      const partitionId = String(partitionRow?.partition_id || '');
      const tableName = String(migrationRow?.table_name || '');
      if (!migrationId || !partitionId || !tableName) {
        throw new Error(LOCAL_STR_1UZWJ);
      }

      let cursor = parseBackfillCursor(partitionRow?.backfill_cursor);
      const quotedTableName = quoteIdentifier(tableName);
      const selectSql = `SELECT rowid AS row_id FROM ${quotedTableName} ` +
        'WHERE rowid > ? ORDER BY rowid LIMIT ?';
      const backfillUpdateSqlContext = this.resolveBackfillUpdateSql(migrationRow);

      while (true) {
        if (this.shouldStopForCancellation(migrationId)) {
          return {
            cancelled: true,
            partitionId,
            cursor,
          };
        }

        const readBudget = this.migrationTimeoutPolicy.allocateOrThrow({
          timeoutBudget,
          nestedOperation: `backfill_scan_${partitionId}`,
        });
        const scanResult = await this.executePartitionSql(
          partitionId,
          selectSql,
          [cursor, MIGRATION_DEFAULT.BACKFILL_BATCH_SIZE],
          {
            forRead: true,
            executionOptions: {timeoutBudget: readBudget},
          },
        );
        if (scanResult?.success !== true) {
          throw new Error(scanResult?.error || LOCAL_STR_16VMA);
        }

        const rows = Array.isArray(scanResult.rows) ? scanResult.rows : [];
        if (rows.length === LOCAL_NUM_ZERO) {
          await this.updatePartitionMigration(migrationId, partitionId, {
            status: MIGRATION_STATUS.BACKFILL_COMPLETE,
            backfill_cursor: formatBackfillCursor(cursor),
            error_message: null,
          });
          return {
            completed: true,
            partitionId,
            cursor,
          };
        }

        const lastRow = rows[rows.length - 1];
        const lastRowId = normalizeInteger(lastRow?.row_id, cursor);

        if (backfillUpdateSqlContext) {
          const updateBudget = this.migrationTimeoutPolicy.allocateOrThrow({
            timeoutBudget,
            nestedOperation: `backfill_update_${partitionId}`,
          });
          const updateParams = [
            ...backfillUpdateSqlContext.params,
            cursor,
            lastRowId,
          ];
          const updateResult = await this.executePartitionSql(
            partitionId,
            backfillUpdateSqlContext.sql,
            updateParams,
            {
              forRead: false,
              executionOptions: {timeoutBudget: updateBudget},
            },
          );
          if (updateResult?.success !== true) {
            throw new Error(updateResult?.error || LOCAL_STR_9U4IH);
          }
        }

        cursor = lastRowId;
        await this.updatePartitionMigration(migrationId, partitionId, {
          status: MIGRATION_STATUS.BACKFILL,
          backfill_cursor: formatBackfillCursor(cursor),
          error_message: null,
        });
      }
    }

    async executeCutoverTransaction(migrationRow, partitionRows) {
      const migrationId = String(migrationRow?.migration_id || '');
      if (!migrationId) {
        throw new Error(LOCAL_STR_16VZX);
      }
      const sessionId = `schema-migration-cutover-${migrationId}`;
      const updatedAt = this.now();

      const targetPayload = parseJsonSafe(migrationRow?.target_schema, {});
      const targetSchema = targetPayload?.schema || targetPayload || {};

      try {
        await this.executeSql(LOCAL_STR_BEGIN, [], {sessionId});
        await this.executeSql(
          MIGRATION_SQL.UPDATE_TABLE_SCHEMA_BY_ID,
          [
            JSON.stringify(targetSchema),
            updatedAt,
            migrationRow.table_id,
          ],
          {sessionId},
        );

        for (const row of partitionRows || []) {
          await this.executeSql(
            MIGRATION_SQL.UPDATE_PARTITION_MIGRATION_BY_PK,
            [
              MIGRATION_STATUS.COMPLETED,
              row?.backfill_cursor || null,
              normalizeInteger(row?.retry_count, LOCAL_NUM_ZERO),
              null,
              updatedAt,
              migrationId,
              row?.partition_id,
            ],
            {sessionId},
          );
        }

        await this.executeSql(LOCAL_STR_COMMIT, [], {sessionId});
      } catch (error) {
        try {
          await this.executeSql(LOCAL_STR_ROLLBACK, [], {sessionId}, true);
        } catch (_rollbackError) {
          // Rollback errors are secondary to the original cutover failure.
        }
        throw error;
      }
    }

    resolveRollbackSql(migrationRow) {
      const alterSpec = this.resolveAlterSpecFromMigration(migrationRow);
      const tableName = quoteIdentifier(migrationRow?.table_name || '');
      const sourceSchema = parseJsonSafe(migrationRow?.source_schema, {});

      if (alterSpec?.migrationType === MIGRATION_TYPE.ADD_COLUMN) {
        const columnName = quoteIdentifier(alterSpec?.columnName || '');
        return `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
      }

      if (alterSpec?.migrationType === MIGRATION_TYPE.RENAME_COLUMN) {
        const fromColumn = quoteIdentifier(alterSpec?.newColumnName || '');
        const toColumn = quoteIdentifier(alterSpec?.columnName || '');
        return `ALTER TABLE ${tableName} RENAME COLUMN ${fromColumn} TO ${toColumn}`;
      }

      if (alterSpec?.migrationType === MIGRATION_TYPE.ALTER_COLUMN_TYPE) {
        const sourceColumn = Array.isArray(sourceSchema?.columns) ?
          sourceSchema.columns.find((column) => column.name === alterSpec.columnName) :
          null;
        if (!sourceColumn || !sourceColumn.type) {
          return null;
        }
        const columnName = quoteIdentifier(alterSpec?.columnName || '');
        return `ALTER TABLE ${tableName} ALTER COLUMN ${columnName} TYPE ${sourceColumn.type}`;
      }

      if (alterSpec?.migrationType === MIGRATION_TYPE.DROP_COLUMN) {
        const sourceColumn = Array.isArray(sourceSchema?.columns) ?
          sourceSchema.columns.find((column) => column.name === alterSpec.columnName) :
          null;
        if (!sourceColumn || !sourceColumn.type) {
          return null;
        }
        const columnName = quoteIdentifier(sourceColumn.name);
        const dataType = String(sourceColumn.type);
        let sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${dataType}`;
        if (sourceColumn.default !== undefined && sourceColumn.default !== null) {
          const defaultLiteral = resolveDefaultLiteral(sourceColumn.default);
          if (typeof defaultLiteral === LOCAL_STR_NUMBER) {
            sql += ` DEFAULT ${defaultLiteral}`;
          } else {
            const escaped = String(defaultLiteral).replaceAll('\'', '\'\'');
            sql += ` DEFAULT '${escaped}'`;
          }
        }
        return sql;
      }

      return null;
    }

    resolveBackfillUpdateSql(migrationRow) {
      const alterSpec = this.resolveAlterSpecFromMigration(migrationRow);
      if (alterSpec?.migrationType !== MIGRATION_TYPE.ADD_COLUMN) {
        return null;
      }

      const tableName = quoteIdentifier(migrationRow?.table_name || '');
      const columnName = quoteIdentifier(alterSpec?.columnName || '');
      const params = [];
      const defaultValue = resolveDefaultLiteral(alterSpec?.defaultValue);
      if (defaultValue !== null && defaultValue !== undefined) {
        params.push(defaultValue);
        return {
          sql:
            `UPDATE ${tableName} ` +
            `SET ${columnName} = COALESCE(${columnName}, ?) ` +
            LOCAL_STR_15T8X,
          params,
        };
      }

      return {
        sql:
          `UPDATE ${tableName} ` +
          `SET ${columnName} = NULL ` +
          `WHERE ${columnName} IS NULL AND rowid > ? AND rowid <= ?`,
        params,
      };
    }
  }

  return Object.fromEntries(
    Object.getOwnPropertyNames(MigrationCoordinatorStageMethods.prototype)
      .filter((methodName) => methodName !== LOCAL_STR_CONSTRUCTOR)
      .map((methodName) => [
        methodName,
        MigrationCoordinatorStageMethods.prototype[methodName],
      ]),
  );
}

export {createMigrationCoordinatorStageMethods};
