const { nowIso } = require("../common.cjs");

function createSyncQueueRepo(db) {
  const enqueueStmt = db.prepare(`
    INSERT INTO sync_queue (
      entity_type, entity_id, operation, payload_json, status, retry_count, next_retry_at, last_error, created_at, updated_at
    ) VALUES (
      @entity_type, @entity_id, @operation, @payload_json, 'pending', 0, @next_retry_at, NULL, @created_at, @updated_at
    )
    ON CONFLICT(entity_type, entity_id) DO UPDATE SET
      operation = excluded.operation,
      payload_json = excluded.payload_json,
      status = 'pending',
      retry_count = 0,
      next_retry_at = excluded.next_retry_at,
      last_error = NULL,
      updated_at = excluded.updated_at
  `);
  const listDueStmt = db.prepare(`
    SELECT *
    FROM sync_queue
    WHERE status IN ('pending', 'failed')
      AND next_retry_at <= ?
    ORDER BY created_at ASC, id ASC
  `);
  const markFailureStmt = db.prepare(`
    UPDATE sync_queue
    SET status = 'failed',
        retry_count = ?,
        next_retry_at = ?,
        last_error = ?,
        updated_at = ?
    WHERE id = ?
  `);
  const deleteStmt = db.prepare("DELETE FROM sync_queue WHERE id = ?");
  const countStmt = db.prepare("SELECT COUNT(*) AS total FROM sync_queue");
  const nextRetryStmt = db.prepare(`
    SELECT next_retry_at
    FROM sync_queue
    ORDER BY next_retry_at ASC
    LIMIT 1
  `);

  return {
    countPending() {
      return countStmt.get()?.total ?? 0;
    },
    enqueueChange({ entityType, entityId, operation, payload }) {
      const now = nowIso();
      enqueueStmt.run({
        entity_type: entityType,
        entity_id: entityId,
        operation,
        payload_json: JSON.stringify(payload),
        next_retry_at: now,
        created_at: now,
        updated_at: now,
      });
    },
    getNextRetryAt() {
      return nextRetryStmt.get()?.next_retry_at || "";
    },
    listDue(referenceTime = nowIso()) {
      return listDueStmt.all(referenceTime).map((row) => ({
        ...row,
        payload: JSON.parse(row.payload_json || "{}"),
      }));
    },
    markFailure(id, retryCount, nextRetryAt, errorMessage) {
      markFailureStmt.run(retryCount, nextRetryAt, String(errorMessage || "").slice(0, 500), nowIso(), id);
    },
    markSuccess(id) {
      deleteStmt.run(id);
    },
  };
}

module.exports = {
  createSyncQueueRepo,
};
