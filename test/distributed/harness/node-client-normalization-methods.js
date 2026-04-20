const CONTROL_PLANE_DIAGNOSTICS_FIELD = 'controlPlaneDiagnostics';
const LEGACY_APPLIED_SCHEMA_VERSION_FIELD = 'applied_schema_version';
const LEGACY_REQUIRED_SCHEMA_VERSION_FIELD = 'required_schema_version';

function createNodeClientNormalizationMethods(deps = {}) {
  const {
    DISCOVERY_FIELD_CAPTURED_AT,
    DISCOVERY_FIELD_NODE_ID,
    DISCOVERY_FIELD_REPLICA_COUNT,
    DISCOVERY_FIELD_SCHEMA_VERSION,
    DISCOVERY_FIELD_SERVICE_COUNT,
    DISCOVERY_FIELD_SERVICES,
    DISCOVERY_READINESS_FIELD_APPLIED_SCHEMA_VERSION,
    DISCOVERY_READINESS_FIELD_BENCHMARK_READY,
    DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE,
    DISCOVERY_READINESS_FIELD_REASONS,
    DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT,
    DISCOVERY_READINESS_FIELD_REQUIRED_SCHEMA_VERSION,
    DISCOVERY_READINESS_FIELD_ROUTING_READY,
    DISCOVERY_READINESS_FIELD_SCHEMA_READY,
    DISCOVERY_READINESS_FIELD_TABLE_NAME,
    DISCOVERY_READINESS_FIELD_TOPOLOGY_READY,
    DISCOVERY_READINESS_FIELD_WORKLOAD_READY,
    DISCOVERY_READINESS_REASON_FIELD_CODE,
    DISCOVERY_READINESS_REASON_FIELD_DETAIL,
    DISCOVERY_REPLICA_FIELD_ADDRESS,
    DISCOVERY_REPLICA_FIELD_ENDPOINT_ID,
    DISCOVERY_REPLICA_FIELD_HEALTH_STATUS,
    DISCOVERY_REPLICA_FIELD_METADATA,
    DISCOVERY_REPLICA_FIELD_NODE_ID,
    DISCOVERY_REPLICA_FIELD_PORT,
    DISCOVERY_REPLICA_FIELD_READINESS,
    DISCOVERY_REPLICA_FIELD_SERVICE_ID,
    DISCOVERY_REPLICA_FIELD_UPDATED_AT,
    DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME,
    DISCOVERY_SERVICE_FIELD_NODES,
    DISCOVERY_SERVICE_FIELD_PROTOCOL,
    DISCOVERY_SERVICE_FIELD_REPLICAS,
    DISCOVERY_SERVICE_FIELD_SERVICE_IDS,
    DISCOVERY_SERVICE_FIELD_SERVICE_KEY,
    NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION,
    NODE_CLIENT_PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION,
    NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION,
    PREFLIGHT_CACHE_FIELD_APPLIED_SCHEMA_VERSION,
    PREFLIGHT_CACHE_FIELD_LAST_APPLIED_AT_MS,
    PREFLIGHT_CACHE_FIELD_LAST_APPLIED_CAUSE_ID_BY_TABLE_NAME,
    PREFLIGHT_CACHE_FIELD_STALENESS_MS,
    PREFLIGHT_CDC_FIELD_BUFFER_DEPTH,
    PREFLIGHT_CDC_FIELD_LAST_ERROR_CODE,
    PREFLIGHT_CDC_FIELD_LAST_FORWARD_ATTEMPT_AT_MS,
    PREFLIGHT_CDC_FIELD_RETRY_COUNT,
    PREFLIGHT_DISCOVERY_FIELD_EXCLUDED_BY_NODE_ID,
    PREFLIGHT_DISCOVERY_FIELD_SELECTED_NODE_IDS,
    PREFLIGHT_PARTITION_FIELD_IS_LEADER_LOCAL,
    PREFLIGHT_PARTITION_FIELD_LAST_ERROR_CODE,
    PREFLIGHT_PARTITION_FIELD_LEADER_KNOWN,
    PREFLIGHT_PARTITION_FIELD_LEADER_NODE_ID,
    PREFLIGHT_PARTITION_KEYS,
    PREFLIGHT_ROW_COUNT_FIELD_NODE_ENDPOINTS_COUNT,
    PREFLIGHT_ROW_COUNT_FIELD_SERVICE_ENDPOINTS_COUNT,
    PREFLIGHT_ROW_COUNT_FIELD_SYS_POSTGRES_WIRE_SERVICE_COUNT,
    PREFLIGHT_SNAPSHOT_FIELD_ADDRESS,
    PREFLIGHT_SNAPSHOT_FIELD_CACHE_FRESHNESS,
    PREFLIGHT_SNAPSHOT_FIELD_CAPTURED_AT_MS,
    PREFLIGHT_SNAPSHOT_FIELD_CDC_HEALTH,
    PREFLIGHT_SNAPSHOT_FIELD_CONNECTED_COUNT,
    PREFLIGHT_SNAPSHOT_FIELD_CONTROL_PLANE_PARTITIONS,
    PREFLIGHT_SNAPSHOT_FIELD_DISCONNECTED_COUNT,
    PREFLIGHT_SNAPSHOT_FIELD_DISCOVERY,
    PREFLIGHT_SNAPSHOT_FIELD_RECONNECTING_COUNT,
    PREFLIGHT_SNAPSHOT_FIELD_ROUTER_CONNECTIVITY,
    PREFLIGHT_SNAPSHOT_FIELD_ROW_COUNTS,
    SNAPSHOT_FIELD_CAPTURED_AT,
    SNAPSHOT_FIELD_CDC_TELEMETRY,
    SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION,
    SNAPSHOT_FIELD_IN_FLIGHT_COUNT,
    SNAPSHOT_FIELD_LEADERS,
    SNAPSHOT_FIELD_NODE_ID,
    SNAPSHOT_FIELD_NODES,
    SNAPSHOT_FIELD_OPERATION_TIMELINE_BY_ID,
    SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT,
    SNAPSHOT_FIELD_PARTITIONS,
    SNAPSHOT_FIELD_PROJECTED_NODES,
    SNAPSHOT_FIELD_PUBLISHED_NODES,
    SNAPSHOT_FIELD_REPLICA_OPERATIONS,
    SNAPSHOT_FIELD_RESUME_TOKEN,
    SNAPSHOT_FIELD_REVISION,
    SNAPSHOT_FIELD_REVISION_GAP,
    SNAPSHOT_FIELD_REVISION_STATE,
    SNAPSHOT_FIELD_ROWS,
    SNAPSHOT_FIELD_SCHEMA_VERSION,
    SNAPSHOT_FIELD_STATUS_HISTOGRAM,
    normalizeNodeId,
    normalizeNonNegativeIntegerOrDefault,
    normalizeOptionalCauseIdByTableName,
    normalizeOptionalFiniteNumber,
    normalizeOptionalSchemaVersion,
    ZERO,
  } = deps;

  return {
    _normalizeControlSnapshot(rawResult, node) {
      const snapshot = this._extractSnapshotPayload(rawResult);
      const schemaVersion = snapshot[SNAPSHOT_FIELD_SCHEMA_VERSION];
      if (schemaVersion !== NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION) {
        throw new Error(
          SNAPSHOT_FIELD_SCHEMA_VERSION + ' mismatch for node ' +
            normalizeNodeId(node) +
            ': expected ' +
            NODE_CLIENT_CONTROL_SNAPSHOT_SCHEMA_VERSION +
            ', got ' +
            String(schemaVersion),
        );
      }
      if (typeof snapshot[SNAPSHOT_FIELD_NODE_ID] !== 'string' ||
          snapshot[SNAPSHOT_FIELD_NODE_ID].length === ZERO) {
        throw new Error(
          'snapshot missing string ' + SNAPSHOT_FIELD_NODE_ID +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Number.isFinite(snapshot[SNAPSHOT_FIELD_CAPTURED_AT])) {
        throw new Error(
          'snapshot missing numeric ' + SNAPSHOT_FIELD_CAPTURED_AT +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Array.isArray(snapshot[SNAPSHOT_FIELD_NODES])) {
        throw new Error(
          'snapshot missing array ' + SNAPSHOT_FIELD_NODES +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (snapshot[SNAPSHOT_FIELD_PUBLISHED_NODES] !== undefined &&
          !Array.isArray(snapshot[SNAPSHOT_FIELD_PUBLISHED_NODES])) {
        throw new Error(
          'snapshot invalid array ' + SNAPSHOT_FIELD_PUBLISHED_NODES +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (snapshot[SNAPSHOT_FIELD_PROJECTED_NODES] !== undefined &&
          !Array.isArray(snapshot[SNAPSHOT_FIELD_PROJECTED_NODES])) {
        throw new Error(
          'snapshot invalid array ' + SNAPSHOT_FIELD_PROJECTED_NODES +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Array.isArray(snapshot[SNAPSHOT_FIELD_PARTITIONS])) {
        throw new Error(
          'snapshot missing array ' + SNAPSHOT_FIELD_PARTITIONS +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!snapshot[SNAPSHOT_FIELD_LEADERS] ||
          typeof snapshot[SNAPSHOT_FIELD_LEADERS] !== 'object') {
        throw new Error(
          'snapshot missing object ' + SNAPSHOT_FIELD_LEADERS +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const hasSnapshotRevision = Object.prototype.hasOwnProperty.call(
        snapshot,
        SNAPSHOT_FIELD_REVISION,
      );
      if (hasSnapshotRevision &&
          (!Number.isInteger(snapshot[SNAPSHOT_FIELD_REVISION]) ||
            snapshot[SNAPSHOT_FIELD_REVISION] < ZERO)) {
        throw new Error(
          'snapshot invalid integer ' + SNAPSHOT_FIELD_REVISION +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const hasSnapshotRevisionState = Object.prototype.hasOwnProperty.call(
        snapshot,
        SNAPSHOT_FIELD_REVISION_STATE,
      );
      if (hasSnapshotRevisionState &&
          snapshot[SNAPSHOT_FIELD_REVISION_STATE] !== null &&
          (
            typeof snapshot[SNAPSHOT_FIELD_REVISION_STATE] !== 'string' ||
            snapshot[SNAPSHOT_FIELD_REVISION_STATE].length === ZERO
          )) {
        throw new Error(
          'snapshot invalid string ' + SNAPSHOT_FIELD_REVISION_STATE +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const hasExpectedMinimumRevision = Object.prototype.hasOwnProperty.call(
        snapshot,
        SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION,
      );
      if (hasExpectedMinimumRevision &&
          snapshot[SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION] !== null &&
          (
            !Number.isInteger(snapshot[SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION]) ||
            snapshot[SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION] < ZERO
          )) {
        throw new Error(
          'snapshot invalid integer ' +
            SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const hasSnapshotRevisionGap = Object.prototype.hasOwnProperty.call(
        snapshot,
        SNAPSHOT_FIELD_REVISION_GAP,
      );
      if (hasSnapshotRevisionGap &&
          snapshot[SNAPSHOT_FIELD_REVISION_GAP] !== null &&
          (
            !Number.isInteger(snapshot[SNAPSHOT_FIELD_REVISION_GAP]) ||
            snapshot[SNAPSHOT_FIELD_REVISION_GAP] < ZERO
          )) {
        throw new Error(
          'snapshot invalid integer ' + SNAPSHOT_FIELD_REVISION_GAP +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const hasSnapshotResumeToken = Object.prototype.hasOwnProperty.call(
        snapshot,
        SNAPSHOT_FIELD_RESUME_TOKEN,
      );
      if (hasSnapshotResumeToken &&
          snapshot[SNAPSHOT_FIELD_RESUME_TOKEN] !== null &&
          (
            typeof snapshot[SNAPSHOT_FIELD_RESUME_TOKEN] !== 'string' ||
            snapshot[SNAPSHOT_FIELD_RESUME_TOKEN].length === ZERO
          )) {
        throw new Error(
          'snapshot invalid string ' + SNAPSHOT_FIELD_RESUME_TOKEN +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const replicaOperations = snapshot[SNAPSHOT_FIELD_REPLICA_OPERATIONS];
      if (!replicaOperations || typeof replicaOperations !== 'object') {
        throw new Error(
          'snapshot missing object ' + SNAPSHOT_FIELD_REPLICA_OPERATIONS +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (
        !Number.isInteger(replicaOperations[SNAPSHOT_FIELD_IN_FLIGHT_COUNT]) ||
        replicaOperations[SNAPSHOT_FIELD_IN_FLIGHT_COUNT] < ZERO
      ) {
        throw new Error(
          'snapshot missing integer ' + SNAPSHOT_FIELD_IN_FLIGHT_COUNT +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (
        !replicaOperations[SNAPSHOT_FIELD_STATUS_HISTOGRAM] ||
        typeof replicaOperations[SNAPSHOT_FIELD_STATUS_HISTOGRAM] !== 'object'
      ) {
        throw new Error(
          'snapshot missing object ' + SNAPSHOT_FIELD_STATUS_HISTOGRAM +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const partitionGroupInFlight =
        replicaOperations[SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT];
      if (partitionGroupInFlight !== undefined &&
          (partitionGroupInFlight === null ||
            typeof partitionGroupInFlight !== 'object' ||
            Array.isArray(partitionGroupInFlight))) {
        throw new Error(
          'snapshot invalid object ' + SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const normalizedPartitionGroupInFlight = {};
      if (partitionGroupInFlight && typeof partitionGroupInFlight === 'object') {
        for (const [groupId, value] of Object.entries(partitionGroupInFlight)) {
          const parsedValue = Number(value);
          if (!Number.isInteger(parsedValue) || parsedValue < ZERO) {
            throw new Error(
              'snapshot invalid integer in ' +
                SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT +
                ' for node ' + normalizeNodeId(node) +
                ' group ' + String(groupId),
            );
          }
          normalizedPartitionGroupInFlight[String(groupId)] = parsedValue;
        }
      }
      const replicaOperationRows =
        replicaOperations[SNAPSHOT_FIELD_ROWS];
      const hasReplicaOperationRows = replicaOperationRows !== undefined;
      if (hasReplicaOperationRows && !Array.isArray(replicaOperationRows)) {
        throw new Error(
          'snapshot invalid array ' + SNAPSHOT_FIELD_ROWS +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const normalizedReplicaOperationRows = hasReplicaOperationRows ?
        replicaOperationRows.map((row) => {
          if (!row || typeof row !== 'object' || Array.isArray(row)) {
            throw new Error(
              'snapshot invalid object in ' + SNAPSHOT_FIELD_ROWS +
                ' for node ' + normalizeNodeId(node),
            );
          }
          return JSON.parse(JSON.stringify(row));
        }) :
        [];
      const operationTimelineById =
        replicaOperations[SNAPSHOT_FIELD_OPERATION_TIMELINE_BY_ID];
      const hasOperationTimelineById = operationTimelineById !== undefined;
      if (hasOperationTimelineById &&
          (operationTimelineById === null ||
            typeof operationTimelineById !== 'object' ||
            Array.isArray(operationTimelineById))) {
        throw new Error(
          'snapshot invalid object ' + SNAPSHOT_FIELD_OPERATION_TIMELINE_BY_ID +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const normalizedOperationTimelineById = {};
      if (hasOperationTimelineById &&
          operationTimelineById &&
          typeof operationTimelineById === 'object') {
        for (const [operationId, timeline] of Object.entries(
          operationTimelineById,
        )) {
          if (!Array.isArray(timeline)) {
            throw new Error(
              'snapshot invalid array in ' +
                SNAPSHOT_FIELD_OPERATION_TIMELINE_BY_ID +
                ' for node ' + normalizeNodeId(node) +
                ' operation ' + String(operationId),
            );
          }
          normalizedOperationTimelineById[String(operationId)] =
            timeline.map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                throw new Error(
                  'snapshot invalid timeline entry in ' +
                    SNAPSHOT_FIELD_OPERATION_TIMELINE_BY_ID +
                    ' for node ' + normalizeNodeId(node) +
                    ' operation ' + String(operationId),
                );
              }
              return JSON.parse(JSON.stringify(entry));
            });
        }
      }
      return {
        [SNAPSHOT_FIELD_SCHEMA_VERSION]: schemaVersion,
        [SNAPSHOT_FIELD_NODE_ID]: snapshot[SNAPSHOT_FIELD_NODE_ID],
        [SNAPSHOT_FIELD_CAPTURED_AT]: snapshot[SNAPSHOT_FIELD_CAPTURED_AT],
        [SNAPSHOT_FIELD_NODES]: [...snapshot[SNAPSHOT_FIELD_NODES]],
        ...(Array.isArray(snapshot[SNAPSHOT_FIELD_PUBLISHED_NODES]) ?
          {
            [SNAPSHOT_FIELD_PUBLISHED_NODES]: [
              ...snapshot[SNAPSHOT_FIELD_PUBLISHED_NODES],
            ],
          } :
          {}),
        ...(Array.isArray(snapshot[SNAPSHOT_FIELD_PROJECTED_NODES]) ?
          {
            [SNAPSHOT_FIELD_PROJECTED_NODES]: [
              ...snapshot[SNAPSHOT_FIELD_PROJECTED_NODES],
            ],
          } :
          {}),
        [SNAPSHOT_FIELD_PARTITIONS]: [...snapshot[SNAPSHOT_FIELD_PARTITIONS]],
        [SNAPSHOT_FIELD_LEADERS]: {
          ...snapshot[SNAPSHOT_FIELD_LEADERS],
        },
        ...(hasSnapshotRevision ?
          {
            [SNAPSHOT_FIELD_REVISION]:
              snapshot[SNAPSHOT_FIELD_REVISION],
          } :
          {}),
        ...(hasSnapshotRevisionState ?
          {
            [SNAPSHOT_FIELD_REVISION_STATE]:
              snapshot[SNAPSHOT_FIELD_REVISION_STATE],
          } :
          {}),
        ...(hasExpectedMinimumRevision ?
          {
            [SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION]:
              snapshot[SNAPSHOT_FIELD_EXPECTED_MINIMUM_REVISION],
          } :
          {}),
        ...(hasSnapshotRevisionGap ?
          {
            [SNAPSHOT_FIELD_REVISION_GAP]:
              snapshot[SNAPSHOT_FIELD_REVISION_GAP],
          } :
          {}),
        ...(hasSnapshotResumeToken ?
          {
            [SNAPSHOT_FIELD_RESUME_TOKEN]:
              snapshot[SNAPSHOT_FIELD_RESUME_TOKEN],
          } :
          {}),
        ...(snapshot[SNAPSHOT_FIELD_CDC_TELEMETRY] &&
          typeof snapshot[SNAPSHOT_FIELD_CDC_TELEMETRY] === 'object' &&
          !Array.isArray(snapshot[SNAPSHOT_FIELD_CDC_TELEMETRY]) ?
          {
            [SNAPSHOT_FIELD_CDC_TELEMETRY]: {
              ...snapshot[SNAPSHOT_FIELD_CDC_TELEMETRY],
            },
          } :
          {}),
        ...(snapshot[CONTROL_PLANE_DIAGNOSTICS_FIELD] &&
          typeof snapshot[CONTROL_PLANE_DIAGNOSTICS_FIELD] === 'object' &&
          !Array.isArray(snapshot[CONTROL_PLANE_DIAGNOSTICS_FIELD]) ?
          {
            [CONTROL_PLANE_DIAGNOSTICS_FIELD]: JSON.parse(
              JSON.stringify(snapshot[CONTROL_PLANE_DIAGNOSTICS_FIELD]),
            ),
          } :
          {}),
        [SNAPSHOT_FIELD_REPLICA_OPERATIONS]: {
          [SNAPSHOT_FIELD_IN_FLIGHT_COUNT]:
            replicaOperations[SNAPSHOT_FIELD_IN_FLIGHT_COUNT],
          [SNAPSHOT_FIELD_STATUS_HISTOGRAM]: {
            ...replicaOperations[SNAPSHOT_FIELD_STATUS_HISTOGRAM],
          },
          [SNAPSHOT_FIELD_PARTITION_GROUP_IN_FLIGHT]:
            normalizedPartitionGroupInFlight,
          ...(hasReplicaOperationRows ?
            {
              [SNAPSHOT_FIELD_ROWS]: normalizedReplicaOperationRows,
            } :
            {}),
          ...(hasOperationTimelineById ?
            {
              [SNAPSHOT_FIELD_OPERATION_TIMELINE_BY_ID]:
                normalizedOperationTimelineById,
            } :
            {}),
        },
      };
    },

    _normalizeServiceDiscovery(rawResult, node, context = {}) {
      const snapshot = this._extractSnapshotPayload(rawResult);
      const schemaVersion = snapshot[DISCOVERY_FIELD_SCHEMA_VERSION];
      if (schemaVersion !== NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION) {
        throw new Error(
          DISCOVERY_FIELD_SCHEMA_VERSION + ' mismatch for node ' +
            normalizeNodeId(node) +
            ': expected ' +
            NODE_CLIENT_SERVICE_DISCOVERY_SCHEMA_VERSION +
            ', got ' +
            String(schemaVersion),
        );
      }
      if (typeof snapshot[DISCOVERY_FIELD_NODE_ID] !== 'string' ||
          snapshot[DISCOVERY_FIELD_NODE_ID].length === ZERO) {
        throw new Error(
          'discovery missing string ' + DISCOVERY_FIELD_NODE_ID +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Number.isFinite(snapshot[DISCOVERY_FIELD_CAPTURED_AT])) {
        throw new Error(
          'discovery missing numeric ' + DISCOVERY_FIELD_CAPTURED_AT +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Number.isInteger(snapshot[DISCOVERY_FIELD_SERVICE_COUNT]) ||
          snapshot[DISCOVERY_FIELD_SERVICE_COUNT] < ZERO) {
        throw new Error(
          'discovery missing integer ' + DISCOVERY_FIELD_SERVICE_COUNT +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Number.isInteger(snapshot[DISCOVERY_FIELD_REPLICA_COUNT]) ||
          snapshot[DISCOVERY_FIELD_REPLICA_COUNT] < ZERO) {
        throw new Error(
          'discovery missing integer ' + DISCOVERY_FIELD_REPLICA_COUNT +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Array.isArray(snapshot[DISCOVERY_FIELD_SERVICES])) {
        throw new Error(
          'discovery missing array ' + DISCOVERY_FIELD_SERVICES +
            ' for node ' + normalizeNodeId(node),
        );
      }

      const normalizedServices = snapshot[DISCOVERY_FIELD_SERVICES]
        .map((service, index) =>
          this._normalizeServiceDiscoveryService(service, node, index, context),
        );

      return {
        ...snapshot,
        [DISCOVERY_FIELD_SCHEMA_VERSION]: schemaVersion,
        [DISCOVERY_FIELD_NODE_ID]: snapshot[DISCOVERY_FIELD_NODE_ID],
        [DISCOVERY_FIELD_CAPTURED_AT]: snapshot[DISCOVERY_FIELD_CAPTURED_AT],
        [DISCOVERY_FIELD_SERVICE_COUNT]: snapshot[DISCOVERY_FIELD_SERVICE_COUNT],
        [DISCOVERY_FIELD_REPLICA_COUNT]: snapshot[DISCOVERY_FIELD_REPLICA_COUNT],
        [DISCOVERY_FIELD_SERVICES]: normalizedServices,
      };
    },

    _normalizeServiceDiscoveryService(
      service,
      node,
      serviceIndex,
      context = {},
    ) {
      if (!service || typeof service !== 'object') {
        throw new Error(
          'discovery service entry must be object at index ' +
            String(serviceIndex) +
            ' for node ' +
            normalizeNodeId(node),
        );
      }
      if (
        typeof service[DISCOVERY_SERVICE_FIELD_SERVICE_KEY] !== 'string' ||
        service[DISCOVERY_SERVICE_FIELD_SERVICE_KEY].length === ZERO
      ) {
        throw new Error(
          'discovery service missing string ' +
            DISCOVERY_SERVICE_FIELD_SERVICE_KEY +
            ' at index ' + String(serviceIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (
        typeof service[DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME] !==
          'string' ||
        service[DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME].length === ZERO
      ) {
        throw new Error(
          'discovery service missing string ' +
            DISCOVERY_SERVICE_FIELD_LOGICAL_SERVICE_NAME +
            ' at index ' + String(serviceIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (
        typeof service[DISCOVERY_SERVICE_FIELD_PROTOCOL] !== 'string' ||
        service[DISCOVERY_SERVICE_FIELD_PROTOCOL].length === ZERO
      ) {
        throw new Error(
          'discovery service missing string ' +
            DISCOVERY_SERVICE_FIELD_PROTOCOL +
            ' at index ' + String(serviceIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Array.isArray(service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS])) {
        throw new Error(
          'discovery service missing array ' +
            DISCOVERY_SERVICE_FIELD_SERVICE_IDS +
            ' at index ' + String(serviceIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Array.isArray(service[DISCOVERY_SERVICE_FIELD_NODES])) {
        throw new Error(
          'discovery service missing array ' +
            DISCOVERY_SERVICE_FIELD_NODES +
            ' at index ' + String(serviceIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Array.isArray(service[DISCOVERY_SERVICE_FIELD_REPLICAS])) {
        throw new Error(
          'discovery service missing array ' +
            DISCOVERY_SERVICE_FIELD_REPLICAS +
            ' at index ' + String(serviceIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }

      const normalizedReplicas = service[DISCOVERY_SERVICE_FIELD_REPLICAS]
        .map((replica, replicaIndex) =>
          this._normalizeServiceDiscoveryReplica(
            replica,
            node,
            serviceIndex,
            replicaIndex,
            context,
          ),
        );

      return {
        ...service,
        [DISCOVERY_SERVICE_FIELD_SERVICE_IDS]:
          [...service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS]],
        [DISCOVERY_SERVICE_FIELD_NODES]:
          [...service[DISCOVERY_SERVICE_FIELD_NODES]],
        [DISCOVERY_SERVICE_FIELD_REPLICAS]: normalizedReplicas,
      };
    },

    _normalizeServiceDiscoveryReplica(
      replica,
      node,
      serviceIndex,
      replicaIndex,
      context = {},
    ) {
      if (!replica || typeof replica !== 'object') {
        throw new Error(
          'discovery replica entry must be object at service ' +
            String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const requiredStringFields = [
        DISCOVERY_REPLICA_FIELD_ENDPOINT_ID,
        DISCOVERY_REPLICA_FIELD_SERVICE_ID,
        DISCOVERY_REPLICA_FIELD_NODE_ID,
        DISCOVERY_REPLICA_FIELD_ADDRESS,
        DISCOVERY_REPLICA_FIELD_HEALTH_STATUS,
      ];
      for (const field of requiredStringFields) {
        if (
          typeof replica[field] !== 'string' || replica[field].length === ZERO
        ) {
          throw new Error(
            'discovery replica missing string ' +
              field +
              ' at service ' + String(serviceIndex) +
              ', replica ' + String(replicaIndex) +
              ' for node ' + normalizeNodeId(node),
          );
        }
      }
      if (!Number.isInteger(replica[DISCOVERY_REPLICA_FIELD_PORT]) ||
          replica[DISCOVERY_REPLICA_FIELD_PORT] <= ZERO) {
        throw new Error(
          'discovery replica missing integer ' +
            DISCOVERY_REPLICA_FIELD_PORT +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (!Number.isFinite(replica[DISCOVERY_REPLICA_FIELD_UPDATED_AT])) {
        throw new Error(
          'discovery replica missing numeric ' +
            DISCOVERY_REPLICA_FIELD_UPDATED_AT +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const metadata = replica[DISCOVERY_REPLICA_FIELD_METADATA];
      if (!metadata || typeof metadata !== 'object') {
        throw new Error(
          'discovery replica missing object ' +
            DISCOVERY_REPLICA_FIELD_METADATA +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      const readiness = this._normalizeServiceDiscoveryReplicaReadiness(
        replica,
        node,
        serviceIndex,
        replicaIndex,
        context,
      );

      return {
        ...replica,
        [DISCOVERY_REPLICA_FIELD_ENDPOINT_ID]:
          replica[DISCOVERY_REPLICA_FIELD_ENDPOINT_ID],
        [DISCOVERY_REPLICA_FIELD_SERVICE_ID]:
          replica[DISCOVERY_REPLICA_FIELD_SERVICE_ID],
        [DISCOVERY_REPLICA_FIELD_NODE_ID]:
          replica[DISCOVERY_REPLICA_FIELD_NODE_ID],
        [DISCOVERY_REPLICA_FIELD_ADDRESS]:
          replica[DISCOVERY_REPLICA_FIELD_ADDRESS],
        [DISCOVERY_REPLICA_FIELD_PORT]:
          replica[DISCOVERY_REPLICA_FIELD_PORT],
        [DISCOVERY_REPLICA_FIELD_HEALTH_STATUS]:
          replica[DISCOVERY_REPLICA_FIELD_HEALTH_STATUS],
        [DISCOVERY_REPLICA_FIELD_UPDATED_AT]:
          replica[DISCOVERY_REPLICA_FIELD_UPDATED_AT],
        [DISCOVERY_REPLICA_FIELD_METADATA]: {
          ...metadata,
        },
        ...(readiness ?
          {
            [DISCOVERY_REPLICA_FIELD_READINESS]: readiness,
          } :
          {}),
      };
    },

    _normalizeServiceDiscoveryReplicaReadiness(
      replica,
      node,
      serviceIndex,
      replicaIndex,
      context = {},
    ) {
      const readiness = replica[DISCOVERY_REPLICA_FIELD_READINESS];
      const requireReadiness = context.requireReadiness === true;
      if (!readiness || typeof readiness !== 'object') {
        if (!requireReadiness) {
          return null;
        }
        throw new Error(
          'discovery replica missing object ' +
            DISCOVERY_REPLICA_FIELD_READINESS +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }

      const requiredBooleanFields = [
        DISCOVERY_READINESS_FIELD_WORKLOAD_READY,
        DISCOVERY_READINESS_FIELD_ROUTING_READY,
        DISCOVERY_READINESS_FIELD_SCHEMA_READY,
        DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE,
      ];
      if (requireReadiness) {
        requiredBooleanFields.push(
          DISCOVERY_READINESS_FIELD_TOPOLOGY_READY,
          DISCOVERY_READINESS_FIELD_BENCHMARK_READY,
        );
      }
      for (const field of requiredBooleanFields) {
        if (typeof readiness[field] !== 'boolean') {
          throw new Error(
            'discovery readiness missing boolean ' + field +
              ' at service ' + String(serviceIndex) +
              ', replica ' + String(replicaIndex) +
              ' for node ' + normalizeNodeId(node),
          );
        }
      }
      if (
        !Number.isInteger(readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT]) ||
        readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT] < ZERO
      ) {
        throw new Error(
          'discovery readiness missing integer ' +
            DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }
      if (readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] !== null &&
          typeof readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] !== 'string') {
        throw new Error(
          'discovery readiness invalid ' + DISCOVERY_READINESS_FIELD_TABLE_NAME +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }

      const reasons = readiness[DISCOVERY_READINESS_FIELD_REASONS];
      if (!Array.isArray(reasons)) {
        throw new Error(
          'discovery readiness missing array ' +
            DISCOVERY_READINESS_FIELD_REASONS +
            ' at service ' + String(serviceIndex) +
            ', replica ' + String(replicaIndex) +
            ' for node ' + normalizeNodeId(node),
        );
      }

      const normalizedReasons = reasons.map((reason, reasonIndex) => {
        if (!reason || typeof reason !== 'object') {
          throw new Error(
            'discovery readiness reason must be object at service ' +
              String(serviceIndex) +
              ', replica ' + String(replicaIndex) +
              ', reason ' + String(reasonIndex) +
              ' for node ' + normalizeNodeId(node),
          );
        }
        if (
          typeof reason[DISCOVERY_READINESS_REASON_FIELD_CODE] !== 'string' ||
          reason[DISCOVERY_READINESS_REASON_FIELD_CODE].length === ZERO
        ) {
          throw new Error(
            'discovery readiness reason missing string ' +
              DISCOVERY_READINESS_REASON_FIELD_CODE +
              ' at service ' + String(serviceIndex) +
              ', replica ' + String(replicaIndex) +
              ', reason ' + String(reasonIndex) +
              ' for node ' + normalizeNodeId(node),
          );
        }
        const detail = reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL];
        if (detail !== null && typeof detail !== 'string') {
          throw new Error(
            'discovery readiness reason invalid ' +
              DISCOVERY_READINESS_REASON_FIELD_DETAIL +
              ' at service ' + String(serviceIndex) +
              ', replica ' + String(replicaIndex) +
              ', reason ' + String(reasonIndex) +
              ' for node ' + normalizeNodeId(node),
          );
        }
        return {
          [DISCOVERY_READINESS_REASON_FIELD_CODE]:
            reason[DISCOVERY_READINESS_REASON_FIELD_CODE],
          [DISCOVERY_READINESS_REASON_FIELD_DETAIL]: detail,
        };
      });

      const topologyReady =
        typeof readiness[DISCOVERY_READINESS_FIELD_TOPOLOGY_READY] ===
          'boolean' ?
          readiness[DISCOVERY_READINESS_FIELD_TOPOLOGY_READY] :
          (
            readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT] ===
              ZERO &&
            readiness[DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE] === true
          );
      const benchmarkReady =
        typeof readiness[DISCOVERY_READINESS_FIELD_BENCHMARK_READY] ===
          'boolean' ?
          readiness[DISCOVERY_READINESS_FIELD_BENCHMARK_READY] :
          (
            readiness[DISCOVERY_READINESS_FIELD_WORKLOAD_READY] === true &&
            topologyReady === true
          );
      const appliedSchemaVersion = normalizeOptionalSchemaVersion(
        readiness[DISCOVERY_READINESS_FIELD_APPLIED_SCHEMA_VERSION] ??
        readiness[LEGACY_APPLIED_SCHEMA_VERSION_FIELD],
      );
      const requiredSchemaVersion = normalizeOptionalSchemaVersion(
        readiness[DISCOVERY_READINESS_FIELD_REQUIRED_SCHEMA_VERSION] ??
        readiness[LEGACY_REQUIRED_SCHEMA_VERSION_FIELD],
      );

      return {
        [DISCOVERY_READINESS_FIELD_WORKLOAD_READY]:
          readiness[DISCOVERY_READINESS_FIELD_WORKLOAD_READY],
        [DISCOVERY_READINESS_FIELD_BENCHMARK_READY]:
          benchmarkReady,
        [DISCOVERY_READINESS_FIELD_ROUTING_READY]:
          readiness[DISCOVERY_READINESS_FIELD_ROUTING_READY],
        [DISCOVERY_READINESS_FIELD_SCHEMA_READY]:
          readiness[DISCOVERY_READINESS_FIELD_SCHEMA_READY],
        [DISCOVERY_READINESS_FIELD_TOPOLOGY_READY]:
          topologyReady,
        [DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT]:
          readiness[DISCOVERY_READINESS_FIELD_REPLICA_OPS_IN_FLIGHT],
        [DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE]:
          readiness[DISCOVERY_READINESS_FIELD_LEADERSHIP_STABLE],
        [DISCOVERY_READINESS_FIELD_TABLE_NAME]:
          readiness[DISCOVERY_READINESS_FIELD_TABLE_NAME] || null,
        [DISCOVERY_READINESS_FIELD_REASONS]: normalizedReasons,
        ...(appliedSchemaVersion ?
          {
            [DISCOVERY_READINESS_FIELD_APPLIED_SCHEMA_VERSION]:
              appliedSchemaVersion,
          } :
          {}),
        ...(requiredSchemaVersion ?
          {
            [DISCOVERY_READINESS_FIELD_REQUIRED_SCHEMA_VERSION]:
              requiredSchemaVersion,
          } :
          {}),
      };
    },

    _normalizePreflightCriticalPathSnapshot(rawResult, node) {
      const snapshot = this._extractSnapshotPayload(rawResult);
      const schemaVersion = snapshot[SNAPSHOT_FIELD_SCHEMA_VERSION];
      if (
        schemaVersion !==
        NODE_CLIENT_PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION
      ) {
        throw new Error(
          SNAPSHOT_FIELD_SCHEMA_VERSION + ' mismatch for node ' +
            normalizeNodeId(node) +
            ': expected ' +
            NODE_CLIENT_PREFLIGHT_CRITICAL_PATH_SNAPSHOT_SCHEMA_VERSION +
            ', got ' +
            String(schemaVersion),
        );
      }

      const nodeId = snapshot[SNAPSHOT_FIELD_NODE_ID];
      if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
        throw new Error(
          'preflight snapshot missing string ' + SNAPSHOT_FIELD_NODE_ID +
            ' for node ' + normalizeNodeId(node),
        );
      }

      const capturedAtMs =
        Number(snapshot[PREFLIGHT_SNAPSHOT_FIELD_CAPTURED_AT_MS]);
      if (!Number.isFinite(capturedAtMs)) {
        throw new Error(
          'preflight snapshot missing numeric ' +
            PREFLIGHT_SNAPSHOT_FIELD_CAPTURED_AT_MS +
            ' for node ' + normalizeNodeId(node),
        );
      }

      const fallbackAddress =
        typeof node?.ip === 'string' && node.ip.length > ZERO ?
          node.ip :
          normalizeNodeId(node);
      const addressRaw = snapshot[PREFLIGHT_SNAPSHOT_FIELD_ADDRESS];
      const address =
        typeof addressRaw === 'string' && addressRaw.length > ZERO ?
          addressRaw :
          fallbackAddress;

      const routerConnectivityRaw =
        snapshot[PREFLIGHT_SNAPSHOT_FIELD_ROUTER_CONNECTIVITY];
      const routerConnectivity = {
        [PREFLIGHT_SNAPSHOT_FIELD_CONNECTED_COUNT]:
          normalizeNonNegativeIntegerOrDefault(
            routerConnectivityRaw?.[PREFLIGHT_SNAPSHOT_FIELD_CONNECTED_COUNT],
            ZERO,
          ),
        [PREFLIGHT_SNAPSHOT_FIELD_RECONNECTING_COUNT]:
          normalizeNonNegativeIntegerOrDefault(
            routerConnectivityRaw?.[PREFLIGHT_SNAPSHOT_FIELD_RECONNECTING_COUNT],
            ZERO,
          ),
        [PREFLIGHT_SNAPSHOT_FIELD_DISCONNECTED_COUNT]:
          normalizeNonNegativeIntegerOrDefault(
            routerConnectivityRaw?.[PREFLIGHT_SNAPSHOT_FIELD_DISCONNECTED_COUNT],
            ZERO,
          ),
      };

      const partitionsRaw =
        snapshot[PREFLIGHT_SNAPSHOT_FIELD_CONTROL_PLANE_PARTITIONS];
      const controlPlanePartitions = {};
      for (const partitionKey of PREFLIGHT_PARTITION_KEYS) {
        const entryRaw = partitionsRaw?.[partitionKey];
        controlPlanePartitions[partitionKey] = {
          [PREFLIGHT_PARTITION_FIELD_LEADER_KNOWN]:
            entryRaw?.[PREFLIGHT_PARTITION_FIELD_LEADER_KNOWN] === true,
          [PREFLIGHT_PARTITION_FIELD_LEADER_NODE_ID]:
            typeof entryRaw?.[PREFLIGHT_PARTITION_FIELD_LEADER_NODE_ID] ===
                'string' &&
              entryRaw[PREFLIGHT_PARTITION_FIELD_LEADER_NODE_ID].length > ZERO ?
              entryRaw[PREFLIGHT_PARTITION_FIELD_LEADER_NODE_ID] :
              null,
          [PREFLIGHT_PARTITION_FIELD_IS_LEADER_LOCAL]:
            entryRaw?.[PREFLIGHT_PARTITION_FIELD_IS_LEADER_LOCAL] === true,
          [PREFLIGHT_PARTITION_FIELD_LAST_ERROR_CODE]:
            typeof entryRaw?.[PREFLIGHT_PARTITION_FIELD_LAST_ERROR_CODE] ===
                'string' &&
              entryRaw[PREFLIGHT_PARTITION_FIELD_LAST_ERROR_CODE].length > ZERO ?
              entryRaw[PREFLIGHT_PARTITION_FIELD_LAST_ERROR_CODE] :
              null,
        };
      }

      const cdcHealthRaw = snapshot[PREFLIGHT_SNAPSHOT_FIELD_CDC_HEALTH];
      const cdcHealth = {
        [PREFLIGHT_CDC_FIELD_BUFFER_DEPTH]:
          normalizeNonNegativeIntegerOrDefault(
            cdcHealthRaw?.[PREFLIGHT_CDC_FIELD_BUFFER_DEPTH],
            ZERO,
          ),
        [PREFLIGHT_CDC_FIELD_RETRY_COUNT]:
          normalizeNonNegativeIntegerOrDefault(
            cdcHealthRaw?.[PREFLIGHT_CDC_FIELD_RETRY_COUNT],
            ZERO,
          ),
        [PREFLIGHT_CDC_FIELD_LAST_ERROR_CODE]:
          typeof cdcHealthRaw?.[PREFLIGHT_CDC_FIELD_LAST_ERROR_CODE] ===
              'string' &&
            cdcHealthRaw[PREFLIGHT_CDC_FIELD_LAST_ERROR_CODE].length > ZERO ?
            cdcHealthRaw[PREFLIGHT_CDC_FIELD_LAST_ERROR_CODE] :
            null,
        [PREFLIGHT_CDC_FIELD_LAST_FORWARD_ATTEMPT_AT_MS]:
          normalizeOptionalFiniteNumber(
            cdcHealthRaw?.[PREFLIGHT_CDC_FIELD_LAST_FORWARD_ATTEMPT_AT_MS],
          ),
      };

      const cacheFreshnessRaw =
        snapshot[PREFLIGHT_SNAPSHOT_FIELD_CACHE_FRESHNESS];
      const cacheFreshness = {
        [PREFLIGHT_CACHE_FIELD_LAST_APPLIED_AT_MS]:
          normalizeOptionalFiniteNumber(
            cacheFreshnessRaw?.[PREFLIGHT_CACHE_FIELD_LAST_APPLIED_AT_MS],
          ),
        [PREFLIGHT_CACHE_FIELD_APPLIED_SCHEMA_VERSION]:
          typeof cacheFreshnessRaw?.[
            PREFLIGHT_CACHE_FIELD_APPLIED_SCHEMA_VERSION
          ] === 'string' ?
            cacheFreshnessRaw[PREFLIGHT_CACHE_FIELD_APPLIED_SCHEMA_VERSION] :
            null,
        [PREFLIGHT_CACHE_FIELD_STALENESS_MS]:
          (() => {
            const staleness = normalizeOptionalFiniteNumber(
              cacheFreshnessRaw?.[PREFLIGHT_CACHE_FIELD_STALENESS_MS],
            );
            if (staleness === null) {
              return null;
            }
            return staleness >= ZERO ? staleness : null;
          })(),
        [PREFLIGHT_CACHE_FIELD_LAST_APPLIED_CAUSE_ID_BY_TABLE_NAME]:
          normalizeOptionalCauseIdByTableName(
            cacheFreshnessRaw?.[
              PREFLIGHT_CACHE_FIELD_LAST_APPLIED_CAUSE_ID_BY_TABLE_NAME
            ],
          ),
      };

      const rowCountsRaw = snapshot[PREFLIGHT_SNAPSHOT_FIELD_ROW_COUNTS];
      const rowCounts = {
        [PREFLIGHT_ROW_COUNT_FIELD_SYS_POSTGRES_WIRE_SERVICE_COUNT]:
          normalizeNonNegativeIntegerOrDefault(
            rowCountsRaw?.[
              PREFLIGHT_ROW_COUNT_FIELD_SYS_POSTGRES_WIRE_SERVICE_COUNT
            ],
            ZERO,
          ),
        [PREFLIGHT_ROW_COUNT_FIELD_NODE_ENDPOINTS_COUNT]:
          normalizeNonNegativeIntegerOrDefault(
            rowCountsRaw?.[PREFLIGHT_ROW_COUNT_FIELD_NODE_ENDPOINTS_COUNT],
            ZERO,
          ),
        [PREFLIGHT_ROW_COUNT_FIELD_SERVICE_ENDPOINTS_COUNT]:
          normalizeNonNegativeIntegerOrDefault(
            rowCountsRaw?.[PREFLIGHT_ROW_COUNT_FIELD_SERVICE_ENDPOINTS_COUNT],
            ZERO,
          ),
      };

      const discoveryRaw = snapshot[PREFLIGHT_SNAPSHOT_FIELD_DISCOVERY];
      const selectedNodeIds = Array.isArray(
        discoveryRaw?.[PREFLIGHT_DISCOVERY_FIELD_SELECTED_NODE_IDS],
      ) ?
        discoveryRaw[PREFLIGHT_DISCOVERY_FIELD_SELECTED_NODE_IDS]
          .map((value) => String(value))
          .filter((value) => value.length > ZERO) :
        [];
      const excludedByNodeIdRaw =
        discoveryRaw?.[PREFLIGHT_DISCOVERY_FIELD_EXCLUDED_BY_NODE_ID];
      const excludedByNodeId = {};
      if (excludedByNodeIdRaw && typeof excludedByNodeIdRaw === 'object') {
        for (const [excludedNodeId, reasons] of Object.entries(
          excludedByNodeIdRaw,
        )) {
          if (!Array.isArray(reasons)) {
            continue;
          }
          excludedByNodeId[String(excludedNodeId)] = reasons
            .map((value) => String(value))
            .filter((value) => value.length > ZERO);
        }
      }
      const discovery = {
        [PREFLIGHT_DISCOVERY_FIELD_SELECTED_NODE_IDS]: selectedNodeIds,
        [PREFLIGHT_DISCOVERY_FIELD_EXCLUDED_BY_NODE_ID]: excludedByNodeId,
      };

      return {
        [SNAPSHOT_FIELD_SCHEMA_VERSION]: schemaVersion,
        [PREFLIGHT_SNAPSHOT_FIELD_CAPTURED_AT_MS]: capturedAtMs,
        [SNAPSHOT_FIELD_NODE_ID]: nodeId,
        [PREFLIGHT_SNAPSHOT_FIELD_ADDRESS]: address,
        [PREFLIGHT_SNAPSHOT_FIELD_ROUTER_CONNECTIVITY]: routerConnectivity,
        [PREFLIGHT_SNAPSHOT_FIELD_CONTROL_PLANE_PARTITIONS]:
          controlPlanePartitions,
        [PREFLIGHT_SNAPSHOT_FIELD_CDC_HEALTH]: cdcHealth,
        [PREFLIGHT_SNAPSHOT_FIELD_CACHE_FRESHNESS]: cacheFreshness,
        [PREFLIGHT_SNAPSHOT_FIELD_ROW_COUNTS]: rowCounts,
        [PREFLIGHT_SNAPSHOT_FIELD_DISCOVERY]: discovery,
      };
    },

    _extractSnapshotPayload(rawResult) {
      if (rawResult && typeof rawResult === 'object' &&
          Array.isArray(rawResult.rows) &&
          rawResult.rows.length > ZERO &&
          rawResult.rows[ZERO] &&
          typeof rawResult.rows[ZERO] === 'object') {
        return rawResult.rows[ZERO];
      }
      throw new Error('snapshot query returned no row payload');
    },
  };
}

export {createNodeClientNormalizationMethods};
