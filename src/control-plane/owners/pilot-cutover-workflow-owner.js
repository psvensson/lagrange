import {
  CUTOVER_DECISION_VERDICT,
  CUTOVER_ERROR_CODE,
  CUTOVER_RECEIPT_STEP,
  CUTOVER_SQL,
  CUTOVER_TABLES,
  CUTOVER_WORKFLOW_STATE,
  PilotCutoverError,
  assertLegalCutoverTransition,
  buildDmlForChangeRecord,
  deriveActiveSlicesFromReceipts,
  diffRangeRows,
  ensureCutoverWorkflowTables,
  findLatestParityReceipt,
  invokeSwitchWithLimit,
  normalizePostWriteRow,
  normalizeReceiptRow,
  queryRangeRows,
  runSql,
  sha256Hex,
  validateChangeFeedRecord,
  validateMigrationPlan,
} from './pilot-cutover-workflow-contract.js';

const KEY_SEP = ':';
const DEFAULT_ACTOR = 'pilot-operator';
const DEFAULT_MAX_OUTAGE_ATTEMPTS = 3;
const DEFAULT_SWITCH_LIMIT_MS = 5000;
const OP_INSERT = 'INSERT';
const DEFAULT_ROLLBACK_NOTE = 'operator_rollback';

const OWNER_MESSAGE = Object.freeze({
  PLAN_NOT_FOUND: 'Migration plan was not found in durable storage',
  PLAN_IMMUTABLE: 'Migration plan is sealed and immutable once any receipt exists',
  LOAD_INCOMPLETE: 'Initial bulk load outcome must have verified reconciliation',
  LOAD_SCHEMA_DRIFT: 'Initial load schemaDigest does not match migration plan table schemaDigest',
  FEED_SCHEMA_DRIFT: 'Change-feed record schemaDigest or table does not match migration plan',
  POSITION_REGRESSION: 'Change-feed sourcePosition regressed at or below durable position',
  OUT_OF_ORDER: 'Change-feed record arrived out of order beyond maxReorderWindow',
  TARGET_OUTAGE: 'Target write failed after exhausting bounded outage attempts',
  PARITY_MISMATCH: 'Parity divergence count exceeds plan cutoverCriteria.maxDivergence',
  PARITY_RECEIPT_REQUIRED: 'Traffic cutover requires a passing durable parity receipt',
  UNKNOWN_SLICE: 'Requested traffic slice is not declared in migration plan',
  CUTOVER_TIMED_OUT: 'Traffic switch timed out and reverted to cutover_pending',
  RECEIPT_DURABILITY_DISABLED:
    'Cutover workflow refuses to proceed when receipt durability is disabled',
  PARITY_CHECKS_DISABLED: 'Cutover workflow refuses to proceed when parity checks are disabled',
  DIVERGENCE_ACCOUNTING_DISABLED:
    'Cutover workflow refuses to proceed when divergence accounting is disabled',
});

function extractInitialLoadPositionAndDigest(loadOutcome, fallbackDigest) {
  const initialPos = loadOutcome.sourcePosition ??
    loadOutcome.highWaterOffset?.recordIndex ??
    loadOutcome.rowsApplied ??
    0;
  const digest = loadOutcome.reconciliation.overallDigest ||
    loadOutcome.sourceDigest ||
    fallbackDigest;
  return {initialPos, digest};
}

function resolveChangeRecordViolation(
  record,
  tableSpec,
  snapshotPosition,
  maxSeenPosition,
  maxWindow,
) {
  if (!tableSpec || (record.schemaDigest && record.schemaDigest !== tableSpec.schemaDigest)) {
    return {
      code: CUTOVER_ERROR_CODE.SCHEMA_DRIFT,
      message: OWNER_MESSAGE.FEED_SCHEMA_DRIFT,
      extra: {},
    };
  }
  if (record.sourcePosition <= snapshotPosition) {
    return {
      code: CUTOVER_ERROR_CODE.POSITION_REGRESSION,
      message: OWNER_MESSAGE.POSITION_REGRESSION,
      extra: {rejectedPosition: record.sourcePosition},
    };
  }
  const reorderGap = maxSeenPosition > record.sourcePosition ?
    maxSeenPosition - record.sourcePosition :
    0;
  if (record.outOfOrder || reorderGap > maxWindow) {
    return {
      code: CUTOVER_ERROR_CODE.OUT_OF_ORDER_CHANGE,
      message: OWNER_MESSAGE.OUT_OF_ORDER,
      extra: {reorderGap, maxReorderWindow: maxWindow},
    };
  }
  return null;
}

class PilotCutoverWorkflowOwner {
  constructor(options = {}) {
    this.sqlClient = options.sqlClient || null;
    this.maxOutageAttempts = options.maxTargetOutageAttempts ?? DEFAULT_MAX_OUTAGE_ATTEMPTS;
    this.disableReceiptDurability = Boolean(options.disableReceiptDurability);
    this.disableParityChecks = Boolean(options.disableParityChecks);
    this.disableDivergenceAccounting = Boolean(options.disableDivergenceAccounting);
  }

  assertReceiptDurabilityEnabled() {
    if (this.disableReceiptDurability) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.RECEIPT_DURABILITY_REQUIRED,
        OWNER_MESSAGE.RECEIPT_DURABILITY_DISABLED,
      );
    }
  }

  assertParityChecksEnabled() {
    if (this.disableParityChecks) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.PARITY_RECEIPT_REQUIRED,
        OWNER_MESSAGE.PARITY_CHECKS_DISABLED,
      );
    }
  }

  assertDivergenceAccountingEnabled() {
    if (this.disableDivergenceAccounting) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.DIVERGENCE_ACCOUNTING_REQUIRED,
        OWNER_MESSAGE.DIVERGENCE_ACCOUNTING_DISABLED,
      );
    }
  }

  async appendReceipt({
    planId,
    receiptSeq,
    step,
    workflowState,
    sourcePosition,
    targetStateDigest,
    outstandingDivergence = {count: 0, sampleRefs: []},
    decision,
    detail = {},
    actor = DEFAULT_ACTOR,
    timestamp = new Date().toISOString(),
  }) {
    this.assertReceiptDurabilityEnabled();
    const receiptId = `${planId}${KEY_SEP}${receiptSeq}`;
    const sampleRefs = Array.isArray(outstandingDivergence.sampleRefs) ?
      outstandingDivergence.sampleRefs :
      [];
    const count = Number(outstandingDivergence.count ?? sampleRefs.length);
    const samplesJson = JSON.stringify(sampleRefs);
    const detailJson = JSON.stringify(detail);
    await runSql(
      this.sqlClient,
      CUTOVER_SQL.INSERT_RECEIPT,
      [
        receiptId,
        planId,
        receiptSeq,
        step,
        workflowState,
        sourcePosition,
        targetStateDigest,
        count,
        samplesJson,
        decision,
        detailJson,
        actor,
        timestamp,
      ],
      {idempotencyKey: receiptId},
    );
    return normalizeReceiptRow({
      receipt_id: receiptId,
      plan_id: planId,
      receipt_seq: receiptSeq,
      step,
      workflow_state: workflowState,
      source_position: sourcePosition,
      target_state_digest: targetStateDigest,
      divergence_count: count,
      divergence_samples_json: samplesJson,
      decision,
      detail_json: detailJson,
      actor,
      created_at: timestamp,
    });
  }

  async recoverPlanStatus(planId) {
    await ensureCutoverWorkflowTables(this.sqlClient);
    const planRes = await runSql(this.sqlClient, CUTOVER_SQL.SELECT_PLAN, [planId]);
    if (planRes.rows.length === 0) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.PLAN_NOT_FOUND,
        `${OWNER_MESSAGE.PLAN_NOT_FOUND}: ${String(planId)}`,
        {planId},
      );
    }
    const plan = JSON.parse(String(planRes.rows[0].plan_json));
    const receiptRes = await runSql(this.sqlClient, CUTOVER_SQL.SELECT_RECEIPTS, [planId]);
    const receipts = receiptRes.rows
      .map((row) => normalizeReceiptRow(row))
      .sort((left, right) => left.receiptSeq - right.receiptSeq);
    const postWriteRes = await runSql(this.sqlClient, CUTOVER_SQL.SELECT_POST_WRITES, [planId]);
    const postCutoverWrites = postWriteRes.rows
      .map((row) => normalizePostWriteRow(row))
      .sort((left, right) => left.writeSeq - right.writeSeq);

    const latestReceipt = receipts[receipts.length - 1];
    return Object.freeze({
      planId: plan.planId,
      plan,
      workflowState: latestReceipt.workflowState,
      sourcePosition: latestReceipt.sourcePosition,
      targetStateDigest: latestReceipt.targetStateDigest,
      activeSlices: deriveActiveSlicesFromReceipts(receipts),
      latestParityReceipt: findLatestParityReceipt(receipts),
      latestReceipt,
      receipts: Object.freeze(receipts),
      postCutoverWrites: Object.freeze(postCutoverWrites),
    });
  }

  async sealMigrationPlan(plan, context = {}) {
    this.assertReceiptDurabilityEnabled();
    const normalizedPlan = validateMigrationPlan(plan);
    await ensureCutoverWorkflowTables(this.sqlClient);

    const existing = await runSql(this.sqlClient, CUTOVER_SQL.SELECT_PLAN, [normalizedPlan.planId]);
    if (existing.rows.length > 0) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.PLAN_IMMUTABLE,
        OWNER_MESSAGE.PLAN_IMMUTABLE,
        {planId: normalizedPlan.planId},
      );
    }

    const timestamp = context.timestamp || new Date().toISOString();
    const planJson = JSON.stringify(normalizedPlan);
    await runSql(
      this.sqlClient,
      CUTOVER_SQL.INSERT_PLAN,
      [normalizedPlan.planId, normalizedPlan.planVersion, planJson, timestamp],
      {idempotencyKey: `plan:${normalizedPlan.planId}`},
    );

    const receipt = await this.appendReceipt({
      planId: normalizedPlan.planId,
      receiptSeq: 0,
      step: CUTOVER_RECEIPT_STEP.PLAN_SEALED,
      workflowState: CUTOVER_WORKFLOW_STATE.DRAFT,
      sourcePosition: 0,
      targetStateDigest: sha256Hex(planJson),
      decision: CUTOVER_DECISION_VERDICT.SEALED,
      detail: {activeSlices: []},
      actor: context.actor || DEFAULT_ACTOR,
      timestamp,
    });

    return Object.freeze({
      plan: normalizedPlan,
      workflowState: CUTOVER_WORKFLOW_STATE.DRAFT,
      receipt,
    });
  }

  async emitFailureHaltReceipt(snapshot, errorCode, context = {}, extra = {}) {
    return this.appendReceipt({
      planId: snapshot.planId,
      receiptSeq: snapshot.receipts.length,
      step: CUTOVER_RECEIPT_STEP.HALT,
      workflowState: CUTOVER_WORKFLOW_STATE.HALTED,
      sourcePosition: extra.sourcePosition ?? snapshot.sourcePosition,
      targetStateDigest: snapshot.targetStateDigest,
      decision: CUTOVER_DECISION_VERDICT.HALTED,
      detail: {
        activeSlices: snapshot.activeSlices,
        haltCode: errorCode,
        ...extra,
      },
      actor: context.actor || DEFAULT_ACTOR,
      timestamp: context.timestamp || new Date().toISOString(),
    });
  }

  async assertInitialLoadSchemaMatchesPlan(snapshot, loadOutcome, context) {
    const tableSpec = snapshot.plan.tables.find((entry) =>
      entry.tableName === loadOutcome?.tableName) || snapshot.plan.tables[0];
    if (loadOutcome?.schemaDigest && loadOutcome.schemaDigest !== tableSpec.schemaDigest) {
      const receipt = await this.emitFailureHaltReceipt(
        snapshot,
        CUTOVER_ERROR_CODE.SCHEMA_DRIFT,
        context,
      );
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.SCHEMA_DRIFT,
        OWNER_MESSAGE.LOAD_SCHEMA_DRIFT,
        {receipt},
      );
    }
  }

  async completeInitialLoad(planId, loadOutcome, context = {}) {
    this.assertReceiptDurabilityEnabled();
    const snapshot = await this.recoverPlanStatus(planId);
    assertLegalCutoverTransition(snapshot.workflowState, CUTOVER_WORKFLOW_STATE.LOADING);
    assertLegalCutoverTransition(CUTOVER_WORKFLOW_STATE.LOADING, CUTOVER_WORKFLOW_STATE.SYNCING);
    await this.assertInitialLoadSchemaMatchesPlan(snapshot, loadOutcome, context);

    if (!loadOutcome || loadOutcome.reconciliation?.verified !== true) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.INITIAL_LOAD_INCOMPLETE,
        OWNER_MESSAGE.LOAD_INCOMPLETE,
        {planId},
      );
    }

    const {initialPos, digest} = extractInitialLoadPositionAndDigest(
      loadOutcome,
      snapshot.targetStateDigest,
    );

    const receipt = await this.appendReceipt({
      planId,
      receiptSeq: snapshot.receipts.length,
      step: CUTOVER_RECEIPT_STEP.INITIAL_LOAD,
      workflowState: CUTOVER_WORKFLOW_STATE.SYNCING,
      sourcePosition: initialPos,
      targetStateDigest: digest,
      decision: CUTOVER_DECISION_VERDICT.LOAD_COMPLETED,
      detail: {
        loadId: loadOutcome.loadId,
        rowsApplied: loadOutcome.rowsApplied,
        activeSlices: snapshot.activeSlices,
      },
      actor: context.actor || DEFAULT_ACTOR,
      timestamp: context.timestamp || new Date().toISOString(),
    });

    return Object.freeze({
      workflowState: CUTOVER_WORKFLOW_STATE.SYNCING,
      sourcePosition: initialPos,
      receipt,
    });
  }

  async applyChangeWithBoundedAttempts(tableSpec, record, context) {
    const dml = buildDmlForChangeRecord(tableSpec, record);
    let lastErr = null;
    for (let attemptIndex = 0; attemptIndex < this.maxOutageAttempts; attemptIndex += 1) {
      try {
        if (typeof context.targetWriteHook === 'function') {
          await context.targetWriteHook({
            record,
            attemptIndex,
            maxAttempts: this.maxOutageAttempts,
          });
        }
        await runSql(this.sqlClient, dml.sql, dml.params, {
          idempotencyKey: `change:${record.changeId}`,
        });
        return {applied: true, attempts: attemptIndex + 1};
      } catch (err) {
        lastErr = err;
      }
    }
    return {
      applied: false,
      attempts: this.maxOutageAttempts,
      errorMessage: lastErr?.message || OWNER_MESSAGE.TARGET_OUTAGE,
    };
  }

  async validateAndPrepareFeedBatch(snapshot, records, appliedSet, context) {
    const maxWindow = context.maxReorderWindow ?? snapshot.plan.maxReorderWindow ?? 0;
    const tableByName = new Map(snapshot.plan.tables.map((t) => [t.tableName, t]));
    const toApply = [];
    let duplicateCount = 0;
    let maxSeenPosition = snapshot.sourcePosition;

    for (const rawRecord of records) {
      const record = validateChangeFeedRecord(rawRecord);
      if (appliedSet.has(record.changeId)) {
        duplicateCount += 1;
        continue;
      }
      const tableSpec = tableByName.get(record.table);
      const violation = resolveChangeRecordViolation(
        record,
        tableSpec,
        snapshot.sourcePosition,
        maxSeenPosition,
        maxWindow,
      );
      if (violation) {
        const receipt = await this.emitFailureHaltReceipt(
          snapshot,
          violation.code,
          context,
          violation.extra,
        );
        throw new PilotCutoverError(violation.code, violation.message, {receipt});
      }
      if (record.sourcePosition > maxSeenPosition) {
        maxSeenPosition = record.sourcePosition;
      }
      appliedSet.add(record.changeId);
      toApply.push({record, tableSpec});
    }

    toApply.sort((left, right) => left.record.sourcePosition - right.record.sourcePosition);
    return {toApply, duplicateCount};
  }

  async assertValidReconnectPosition(snapshot, context) {
    if (context.reconnectFromPosition !== undefined &&
        context.reconnectFromPosition < snapshot.sourcePosition) {
      const receipt = await this.emitFailureHaltReceipt(
        snapshot,
        CUTOVER_ERROR_CODE.POSITION_REGRESSION,
        context,
        {reconnectFromPosition: context.reconnectFromPosition},
      );
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.POSITION_REGRESSION,
        OWNER_MESSAGE.POSITION_REGRESSION,
        {receipt},
      );
    }
  }

  async executePreparedFeedItems(planId, snapshot, toApply, context) {
    let currentPosition = snapshot.sourcePosition;
    let appliedCount = 0;

    for (const item of toApply) {
      const writeAttempt = await this.applyChangeWithBoundedAttempts(
        item.tableSpec,
        item.record,
        context,
      );
      if (!writeAttempt.applied) {
        const stallReceipt = await this.appendReceipt({
          planId,
          receiptSeq: snapshot.receipts.length,
          step: CUTOVER_RECEIPT_STEP.CHANGE_FEED,
          workflowState: CUTOVER_WORKFLOW_STATE.SYNCING,
          sourcePosition: currentPosition,
          targetStateDigest: snapshot.targetStateDigest,
          decision: CUTOVER_DECISION_VERDICT.HALTED,
          detail: {
            stallCode: CUTOVER_ERROR_CODE.TARGET_OUTAGE,
            attempts: writeAttempt.attempts,
            stalledChangeId: item.record.changeId,
            activeSlices: snapshot.activeSlices,
          },
          actor: context.actor || DEFAULT_ACTOR,
          timestamp: context.timestamp || new Date().toISOString(),
        });
        throw new PilotCutoverError(
          CUTOVER_ERROR_CODE.TARGET_OUTAGE,
          OWNER_MESSAGE.TARGET_OUTAGE,
          {receipt: stallReceipt, attempts: writeAttempt.attempts},
        );
      }

      const dedupId = `${planId}${KEY_SEP}${item.record.changeId}`;
      await runSql(
        this.sqlClient,
        CUTOVER_SQL.INSERT_APPLIED_CHANGE,
        [dedupId, planId, item.record.changeId, item.record.sourcePosition],
        {idempotencyKey: dedupId},
      );
      currentPosition = item.record.sourcePosition;
      appliedCount += 1;
    }
    return {currentPosition, appliedCount};
  }

  async ingestChangeFeedBatch(planId, records, context = {}) {
    this.assertReceiptDurabilityEnabled();
    const snapshot = await this.recoverPlanStatus(planId);
    assertLegalCutoverTransition(snapshot.workflowState, CUTOVER_WORKFLOW_STATE.SYNCING);
    await this.assertValidReconnectPosition(snapshot, context);

    const appliedRes = await runSql(this.sqlClient, CUTOVER_SQL.SELECT_APPLIED_CHANGES, [planId]);
    const appliedSet = new Set(appliedRes.rows.map((r) => String(r.change_id)));
    const {toApply, duplicateCount} = await this.validateAndPrepareFeedBatch(
      snapshot,
      records,
      appliedSet,
      context,
    );
    const {currentPosition, appliedCount} = await this.executePreparedFeedItems(
      planId,
      snapshot,
      toApply,
      context,
    );

    const reachedHighWater = currentPosition >= snapshot.plan.cutoverCriteria.highWaterMark;
    const nextWorkflowState = reachedHighWater ?
      CUTOVER_WORKFLOW_STATE.PARITY :
      CUTOVER_WORKFLOW_STATE.SYNCING;
    const verdict = reachedHighWater ?
      CUTOVER_DECISION_VERDICT.HIGH_WATER_REACHED :
      CUTOVER_DECISION_VERDICT.SYNC_PROGRESS;

    const receipt = await this.appendReceipt({
      planId,
      receiptSeq: snapshot.receipts.length,
      step: CUTOVER_RECEIPT_STEP.CHANGE_FEED,
      workflowState: nextWorkflowState,
      sourcePosition: currentPosition,
      targetStateDigest: sha256Hex(`${snapshot.targetStateDigest}:${currentPosition}:${appliedCount}`),
      decision: verdict,
      detail: {
        appliedCount,
        duplicateCount,
        highWaterMark: snapshot.plan.cutoverCriteria.highWaterMark,
        activeSlices: snapshot.activeSlices,
      },
      actor: context.actor || DEFAULT_ACTOR,
      timestamp: context.timestamp || new Date().toISOString(),
    });

    return Object.freeze({
      workflowState: nextWorkflowState,
      sourcePosition: currentPosition,
      appliedCount,
      duplicateCount,
      receipt,
    });
  }

  async runParityVerification(planId, options = {}) {
    this.assertReceiptDurabilityEnabled();
    this.assertParityChecksEnabled();
    this.assertDivergenceAccountingEnabled();

    const snapshot = await this.recoverPlanStatus(planId);
    assertLegalCutoverTransition(snapshot.workflowState, CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING);

    const sourceClient = options.sourceClient || this.sqlClient;
    const targetClient = options.targetClient || this.sqlClient;
    const sampleRefs = [];
    const rangeDigests = [];

    for (const tableSpec of snapshot.plan.tables) {
      for (const range of snapshot.plan.paritySpec.keyRanges) {
        const sourceRows = await queryRangeRows(sourceClient, tableSpec, range);
        const targetRows = await queryRangeRows(targetClient, tableSpec, range);
        const diff = diffRangeRows(tableSpec, range, sourceRows, targetRows);
        sampleRefs.push(...diff.divergences);
        rangeDigests.push(diff.targetRangeDigest);
      }
    }

    const divergenceCount = sampleRefs.length;
    const passed = divergenceCount <= snapshot.plan.cutoverCriteria.maxDivergence;
    const nextWorkflowState = passed ?
      CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING :
      CUTOVER_WORKFLOW_STATE.PARITY;
    const verdict = passed ?
      CUTOVER_DECISION_VERDICT.PARITY_PASSED :
      CUTOVER_DECISION_VERDICT.PARITY_FAILED;
    const outstandingDivergence = Object.freeze({
      count: divergenceCount,
      sampleRefs: Object.freeze(sampleRefs),
    });

    const receipt = await this.appendReceipt({
      planId,
      receiptSeq: snapshot.receipts.length,
      step: CUTOVER_RECEIPT_STEP.PARITY,
      workflowState: nextWorkflowState,
      sourcePosition: snapshot.sourcePosition,
      targetStateDigest: sha256Hex(JSON.stringify(rangeDigests)),
      outstandingDivergence,
      decision: verdict,
      detail: {
        maxDivergence: snapshot.plan.cutoverCriteria.maxDivergence,
        activeSlices: snapshot.activeSlices,
      },
      actor: options.actor || DEFAULT_ACTOR,
      timestamp: options.timestamp || new Date().toISOString(),
    });

    if (!passed) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.PARITY_MISMATCH,
        OWNER_MESSAGE.PARITY_MISMATCH,
        {receipt, outstandingDivergence},
      );
    }

    return Object.freeze({
      workflowState: nextWorkflowState,
      passed: true,
      outstandingDivergence,
      receipt,
    });
  }

  assertPassingParityReceipt(snapshot) {
    const parityReceipt = snapshot.latestParityReceipt;
    if (!parityReceipt ||
        parityReceipt.decision !== CUTOVER_DECISION_VERDICT.PARITY_PASSED ||
        parityReceipt.outstandingDivergence.count > snapshot.plan.cutoverCriteria.maxDivergence) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.PARITY_RECEIPT_REQUIRED,
        OWNER_MESSAGE.PARITY_RECEIPT_REQUIRED,
        {planId: snapshot.planId},
      );
    }
  }

  async executeTrafficCutover(planId, options = {}) {
    this.assertReceiptDurabilityEnabled();
    this.assertParityChecksEnabled();

    const snapshot = await this.recoverPlanStatus(planId);
    assertLegalCutoverTransition(snapshot.workflowState, CUTOVER_WORKFLOW_STATE.CUTOVER);
    this.assertPassingParityReceipt(snapshot);

    const declaredSliceIds = snapshot.plan.trafficSlices.map((s) => s.sliceId);
    if (!declaredSliceIds.includes(options.sliceId)) {
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.UNKNOWN_TRAFFIC_SLICE,
        OWNER_MESSAGE.UNKNOWN_SLICE,
        {sliceId: options.sliceId},
      );
    }

    const limitMs = options.timeoutMs ?? DEFAULT_SWITCH_LIMIT_MS;
    const switchResult = await invokeSwitchWithLimit(
      options.switchTraffic,
      {planId, sliceId: options.sliceId, limitMs},
      limitMs,
    );

    if (switchResult.timedOut) {
      const timeoutReceipt = await this.appendReceipt({
        planId,
        receiptSeq: snapshot.receipts.length,
        step: CUTOVER_RECEIPT_STEP.CUTOVER,
        workflowState: CUTOVER_WORKFLOW_STATE.CUTOVER_PENDING,
        sourcePosition: snapshot.sourcePosition,
        targetStateDigest: snapshot.targetStateDigest,
        decision: CUTOVER_DECISION_VERDICT.CUTOVER_TIMED_OUT,
        detail: {
          sliceId: options.sliceId,
          activeSlices: snapshot.activeSlices,
          timedOut: true,
        },
        actor: options.actor || DEFAULT_ACTOR,
        timestamp: options.timestamp || new Date().toISOString(),
      });
      throw new PilotCutoverError(
        CUTOVER_ERROR_CODE.CUTOVER_TIMEOUT,
        OWNER_MESSAGE.CUTOVER_TIMED_OUT,
        {receipt: timeoutReceipt, activeSlices: snapshot.activeSlices},
      );
    }

    const updatedSlices = [...new Set([...snapshot.activeSlices, options.sliceId])];
    const allSwitched = declaredSliceIds.every((id) => updatedSlices.includes(id));
    const nextWorkflowState = allSwitched ?
      CUTOVER_WORKFLOW_STATE.COMPLETE :
      CUTOVER_WORKFLOW_STATE.CUTOVER;
    const verdict = allSwitched ?
      CUTOVER_DECISION_VERDICT.CUTOVER_COMPLETED :
      CUTOVER_DECISION_VERDICT.SLICE_SWITCHED;

    const receipt = await this.appendReceipt({
      planId,
      receiptSeq: snapshot.receipts.length,
      step: CUTOVER_RECEIPT_STEP.CUTOVER,
      workflowState: nextWorkflowState,
      sourcePosition: snapshot.sourcePosition,
      targetStateDigest: snapshot.targetStateDigest,
      decision: verdict,
      detail: {sliceId: options.sliceId, activeSlices: updatedSlices},
      actor: options.actor || DEFAULT_ACTOR,
      timestamp: options.timestamp || new Date().toISOString(),
    });

    return Object.freeze({
      workflowState: nextWorkflowState,
      activeSlices: Object.freeze(updatedSlices),
      receipt,
    });
  }

  async recordPostCutoverTargetWrite(planId, writeEntry) {
    this.assertReceiptDurabilityEnabled();
    const snapshot = await this.recoverPlanStatus(planId);
    const writeSeq = snapshot.postCutoverWrites.length;
    const writeId = writeEntry.writeId || `${planId}${KEY_SEP}postwrite${KEY_SEP}${writeSeq}`;
    const tableName = String(writeEntry.table || writeEntry.tableName);
    const pkVal = String(writeEntry.primaryKeyValue);
    const operation = String(writeEntry.operation || OP_INSERT).toUpperCase();
    const rowObj = writeEntry.row || {};
    const recordedAt = writeEntry.recordedAt || new Date().toISOString();

    if (writeEntry.applyToTarget === true) {
      const tableSpec = snapshot.plan.tables.find((t) => t.tableName === tableName);
      if (tableSpec) {
        const dml = buildDmlForChangeRecord(tableSpec, {operation, row: rowObj});
        await runSql(this.sqlClient, dml.sql, dml.params, {idempotencyKey: writeId});
      }
    }

    await runSql(
      this.sqlClient,
      CUTOVER_SQL.INSERT_POST_WRITE,
      [writeId, planId, writeSeq, tableName, pkVal, operation, JSON.stringify(rowObj), recordedAt],
      {idempotencyKey: writeId},
    );

    return normalizePostWriteRow({
      write_id: writeId,
      plan_id: planId,
      write_seq: writeSeq,
      table_name: tableName,
      primary_key_value: pkVal,
      operation,
      row_json: JSON.stringify(rowObj),
      recorded_at: recordedAt,
    });
  }

  async executeRollback(planId, options = {}) {
    this.assertReceiptDurabilityEnabled();
    this.assertDivergenceAccountingEnabled();

    const snapshot = await this.recoverPlanStatus(planId);
    assertLegalCutoverTransition(snapshot.workflowState, CUTOVER_WORKFLOW_STATE.ROLLED_BACK);

    if (typeof options.reverseTraffic === 'function') {
      await options.reverseTraffic({planId, reversedSlices: snapshot.activeSlices});
    }

    const divergenceRefs = snapshot.postCutoverWrites.map((entry) =>
      Object.freeze({
        writeId: entry.writeId,
        table: entry.tableName,
        key: entry.primaryKeyValue,
        operation: entry.operation,
      }));
    const outstandingDivergence = Object.freeze({
      count: divergenceRefs.length,
      sampleRefs: Object.freeze(divergenceRefs),
    });

    const receipt = await this.appendReceipt({
      planId,
      receiptSeq: snapshot.receipts.length,
      step: CUTOVER_RECEIPT_STEP.ROLLBACK,
      workflowState: CUTOVER_WORKFLOW_STATE.ROLLED_BACK,
      sourcePosition: snapshot.sourcePosition,
      targetStateDigest: snapshot.targetStateDigest,
      outstandingDivergence,
      decision: CUTOVER_DECISION_VERDICT.ROLLED_BACK,
      detail: {
        rollbackNote: options.reason || DEFAULT_ROLLBACK_NOTE,
        reversedSlices: snapshot.activeSlices,
        activeSlices: [],
      },
      actor: options.actor || DEFAULT_ACTOR,
      timestamp: options.timestamp || new Date().toISOString(),
    });

    return Object.freeze({
      workflowState: CUTOVER_WORKFLOW_STATE.ROLLED_BACK,
      activeSlices: Object.freeze([]),
      outstandingDivergence,
      receipt,
    });
  }
}

function createPilotCutoverWorkflowOwner(options = {}) {
  return new PilotCutoverWorkflowOwner(options);
}

export {
  CUTOVER_TABLES,
  PilotCutoverWorkflowOwner,
  createPilotCutoverWorkflowOwner,
  ensureCutoverWorkflowTables,
};
