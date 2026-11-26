// First two committed steps of two operations in the 72d seed deadline census.
// Source: bench-review-72d-three-1733-deadline-census.ndjson, first sample.
export const retainedDispatchOperations = [
  {
    "partitionId": "node_endpoints-p1",
    "operationId": "pl-node_endpoints-p1-719-0",
    "replicaId": "replace-replica-cca79399454850c1b177075e126e5bfc",
    "sourceNodeId": "00000000-0000-4000-8000-000000000001",
    "targetNodeId": "00000000-0000-4000-8000-000000000002",
    "type": "ADD",
    "steps": [
      {
        "step": "PENDING",
        "timestamp": 1795714839072,
        "placementAdmission": {
          "entryId": "placement-owner:00000000-0000-4000-8000-000000000001:admit:node_endpoints-p1:c440e1c8-42e7-4c54-bbe2-7e2e65c5b4fb",
          "transitionKind": "PLACEMENT",
          "placementClass": "SYSTEM",
          "repair": false,
          "formationLatchEpoch": 3,
          "foundingIntentId": null
        },
        "replicaIds": [
          "node_endpoints-p1-r1",
          "replace-replica-cca79399454850c1b177075e126e5bfc"
        ],
        "peerAddresses": [
          "00000000-0000-4000-8000-000000000001/partition/node_endpoints-p1-r1",
          "00000000-0000-4000-8000-000000000002/partition/replace-replica-cca79399454850c1b177075e126e5bfc"
        ],
        "bootstrapMembership": {
          "kind": "committed",
          "voters": [
            "2595729379512068893"
          ],
          "votersOutgoing": [],
          "learners": [],
          "learnersNext": [],
          "appliedIndex": 8,
          "configurationKey": "[[\"2595729379512068893\"],[],[],[],false]",
          "membershipGenerationIndex": 0,
          "commitIndex": 8,
          "term": 1,
          "leaderId": "node_endpoints-p1-r1",
          "gateOpen": true,
          "identities": {
            "2595729379512068893": "node_endpoints-p1-r1"
          },
          "nodeIds": {
            "2595729379512068893": "00000000-0000-4000-8000-000000000001"
          }
        }
      },
      {
        "step": "SENDING",
        "timestamp": 1795714839338,
        "previousStep": "PENDING",
        "reason": "dispatch_sending",
        "ownerKey": "pl-node_endpoints-p1-719-0",
        "readinessSnapshot": {
          "nodeId": "00000000-0000-4000-8000-000000000002",
          "dimensions": {
            "processAlive": true,
            "clusterMemberHealthy": true,
            "routingReady": true,
            "loadReady": true,
            "placementEligible": true,
            "provisioningEligible": true,
            "controlPlaneWritable": true,
            "controlPlanePublished": true,
            "controlPlaneRecoveryEligible": true,
            "metadataPublicationHealthy": true,
            "repairEligible": true,
            "serveEligible": true
          },
          "reasonCodes": [],
          "lifecycleState": "active",
          "observedAt": "2026-11-26T17:40:39.328Z",
          "decisionDimension": "controlPlaneRecoveryEligible",
          "runtimeAuthority": {
            "state": "confirmed",
            "authorityAvailable": true,
            "ready": true,
            "processAlive": true,
            "clusterMemberHealthy": true,
            "routingReady": true,
            "writeEligible": true,
            "recoveryEligible": true,
            "repairEligible": true,
            "publication": {
              "state": "healthy",
              "healthy": true,
              "mode": "repair_only",
              "reason": null
            },
            "visibility": {
              "state": "confirmed",
              "published": true,
              "observedAt": null
            },
            "repair": {
              "state": "not_attempted",
              "applied": false,
              "observedAt": null
            },
            "provisioning": {
              "state": "steady",
              "eligible": true
            },
            "failure": {
              "state": "none",
              "reason": null
            },
            "reasonCodes": []
          },
          "projectionReadinessContract": {
            "state": "serve_ready",
            "ready": true,
            "recoveryOpen": false,
            "publication": {
              "ready": true,
              "boundaryOutcome": {
                "state": "ready",
                "publicationState": "published",
                "ackState": "satisfied",
                "freshnessState": "fresh",
                "recoveryGateState": "ready",
                "ready": true,
                "active": false,
                "publicationObservationState": "authoritative",
                "reasonCodes": [],
                "pendingAckCount": 0,
                "missingPublishedCount": 0,
                "publicationEpoch": 3,
                "publicationStatus": "PUBLISHED"
              }
            },
            "readiness": {
              "serveEligible": true,
              "repairEligible": true,
              "recoveryEligible": true
            },
            "priorityRecovery": {
              "active": false,
              "reasonCodes": []
            },
            "reasonCodes": []
          }
        }
      }
    ]
  },
  {
    "partitionId": "package_registry_overrides-p1",
    "operationId": "pl-package_registry_overrides-p1-1001-0",
    "replicaId": "replace-replica-3cad616d78da857f8553a8a6abf76d7e",
    "sourceNodeId": "00000000-0000-4000-8000-000000000001",
    "targetNodeId": "00000000-0000-4000-8000-000000000001",
    "type": "GROWTH_PROMOTE",
    "steps": [
      {
        "step": "PENDING",
        "timestamp": 1795714897896,
        "placementAdmission": {
          "entryId": "placement-owner:00000000-0000-4000-8000-000000000001:admit:package_registry_overrides-p1:2700e062-bf6c-4520-8c6a-70b4e95977ce",
          "transitionKind": "PLACEMENT",
          "placementClass": "SYSTEM",
          "repair": false,
          "formationLatchEpoch": 3,
          "foundingIntentId": null
        },
        "promoteReplicaIds": [
          "replace-replica-3cad616d78da857f8553a8a6abf76d7e",
          "replace-replica-120766701a1bec780b4eb406db0eec6b"
        ]
      },
      {
        "step": "SENDING",
        "timestamp": 1795714897991,
        "previousStep": "PENDING",
        "reason": "dispatch_sending",
        "ownerKey": "pl-package_registry_overrides-p1-1001-0",
        "readinessSnapshot": {
          "nodeId": "00000000-0000-4000-8000-000000000001",
          "dimensions": {
            "processAlive": true,
            "clusterMemberHealthy": true,
            "routingReady": true,
            "loadReady": true,
            "placementEligible": true,
            "provisioningEligible": true,
            "controlPlaneWritable": true,
            "controlPlanePublished": true,
            "controlPlaneRecoveryEligible": true,
            "metadataPublicationHealthy": true,
            "repairEligible": true,
            "serveEligible": true
          },
          "reasonCodes": [],
          "lifecycleState": "active",
          "observedAt": "2026-11-26T17:41:37.669Z",
          "decisionDimension": "controlPlaneRecoveryEligible",
          "runtimeAuthority": {
            "state": "confirmed",
            "authorityAvailable": true,
            "ready": true,
            "processAlive": true,
            "clusterMemberHealthy": true,
            "routingReady": true,
            "writeEligible": true,
            "recoveryEligible": true,
            "repairEligible": true,
            "publication": {
              "state": "healthy",
              "healthy": true,
              "mode": "repair_only",
              "reason": null
            },
            "visibility": {
              "state": "confirmed",
              "published": true,
              "observedAt": null
            },
            "repair": {
              "state": "not_attempted",
              "applied": false,
              "observedAt": null
            },
            "provisioning": {
              "state": "steady",
              "eligible": true
            },
            "failure": {
              "state": "none",
              "reason": null
            },
            "reasonCodes": []
          },
          "projectionReadinessContract": {
            "state": "serve_ready",
            "ready": true,
            "recoveryOpen": false,
            "publication": {
              "ready": true,
              "boundaryOutcome": {
                "state": "ready",
                "publicationState": "published",
                "ackState": "satisfied",
                "freshnessState": "fresh",
                "recoveryGateState": "ready",
                "ready": true,
                "active": false,
                "publicationObservationState": "authoritative",
                "reasonCodes": [],
                "pendingAckCount": 0,
                "missingPublishedCount": 0,
                "publicationEpoch": 3,
                "publicationStatus": "PUBLISHED"
              }
            },
            "readiness": {
              "serveEligible": true,
              "repairEligible": true,
              "recoveryEligible": true
            },
            "priorityRecovery": {
              "active": false,
              "reasonCodes": []
            },
            "reasonCodes": []
          }
        }
      }
    ]
  }
];
