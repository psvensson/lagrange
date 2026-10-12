import Database from '/mnt/data/peter/projects/lagrange/node_modules/better-sqlite3/lib/index.js';
import {createHash} from 'node:crypto';
for (const file of process.argv.slice(2)) {
  const db = new Database(file, {readonly: true});
  const row = db.prepare('SELECT * FROM _partition_write_generation WHERE singleton = 1').get();
  const control = row.participant_release_control_text ? JSON.parse(row.participant_release_control_text) : null;
  const auth = row.participant_release_authorization_text ? JSON.parse(row.participant_release_authorization_text) : null;
  const targets = auth ? JSON.parse(auth.targetEntriesText) : null;
  const self = file.match(/(sql_transactions-p1-r\d)/)?.[1];
  const retiredTarget = targets?.find((t) => t.replicaIdentity === self) ?? null;
  const retirementId = auth && retiredTarget ? createHash('sha256').update(JSON.stringify([auth.controlAuthorizationId, retiredTarget])).digest('hex') : null;
  console.log(JSON.stringify({file: file.split('/').slice(-2).join('/'),
    pauseGeneration: row.participant_pause_generation, pauseEntryId: row.participant_pause_entry_id?.slice(0, 40),
    controlRevision: row.participant_release_control_revision,
    control: control && {state: control.state, authorizationId: control.authorizationId?.slice(0, 10), authorizationRevision: control.authorizationRevision, retirementId: control.retirementId?.slice(0, 10), retiredReplicaIdentity: control.retiredReplicaIdentity, retirementIndex: control.retirementIndex, dependentRelease: JSON.parse(control.dependentReleaseText ?? 'null')?.partitionId ?? null, confirmationIndex: control.confirmationIndex, controlIndex: control.controlIndex, dispatchIndex: control.dispatchIndex, reservationIndex: control.reservationIndex, memberClaims: control.memberClaims?.map((c) => `${c.target.replicaIdentity.slice(-2)}:${c.claimState}:ag${c.target.admissionGeneration}`), targetReceipts: control.targetReceipts?.map((r) => `${r.receipt.replicaIdentity.slice(-2)}:${r.receiptState}:ag${r.receipt.admissionGeneration}`)},
    authorization: auth && {controlAuthorizationId: auth.controlAuthorizationId?.slice(0, 10), controlAuthorizationRevision: auth.controlAuthorizationRevision, dependentRelease: JSON.parse(auth.dependentReleaseText)?.partitionId, authorizationIndex: row.participant_release_authorization_index, authorizationTerm: row.participant_release_authorization_term, expectedPauseGeneration: auth.expectedPauseGeneration, targets: targets?.map((t) => `${t.replicaIdentity.slice(-2)}:ag${t.admissionGeneration}:cg${t.connectionGeneration}`)},
    selfRetiredTarget: retiredTarget && {admissionGeneration: retiredTarget.admissionGeneration},
    reconstructedRetirementId: retirementId?.slice(0, 10),
    originIndex: row.origin_index, originTerm: row.origin_term}, null, 0));
  db.close();
}
