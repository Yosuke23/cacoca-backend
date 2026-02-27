import { pool } from "../db/pool.js";

/**
 * daily_logs DAO（events 前提）
 *
 * 方針：
 * - 1日 = events 配列が唯一の真実
 * - 旧カラムは一切触らない
 */

export async function insertDailyLog(payload) {
  const {
    user_id,
    log_date,
    events,
    message_to_tomorrow = null,
    free_memo_raw = null,
  } = payload;

  if (!user_id || !log_date) {
    throw new Error("insertDailyLog: user_id and log_date are required");
  }

  if (!Array.isArray(events)) {
    throw new Error("insertDailyLog: events must be an array");
  }

  const result = await pool.query(
    `
    INSERT INTO daily_logs (
      user_id,
      log_date,
      events,
      message_to_tomorrow,
      free_memo_raw
    )
    VALUES ($1,$2,$3,$4,$5)
    RETURNING *
    `,
    [
      user_id,
      log_date,
      JSON.stringify(events),
      message_to_tomorrow,
      free_memo_raw,
    ],
  );

  return result.rows[0];
}

export async function findDailyLogById(id) {
  if (!id) throw new Error("findDailyLogById: id is required");

  const result = await pool.query(
    `
    SELECT *
    FROM daily_logs
    WHERE id = $1
      AND is_deleted = false
    `,
    [id],
  );

  return result.rows[0] ?? null;
}
