// server/src/dao/dailyLogsDao.js
import { pool } from "../db/pool.js";

/**
 * daily_logs DAO
 * payload 一本化設計
 */

export async function insertDailyLog({ user_id, log_date, payload }) {
  if (!user_id || !log_date || !payload) {
    throw new Error("insertDailyLog: user_id, log_date, payload are required");
  }

  const result = await pool.query(
    `
    INSERT INTO daily_logs (
      user_id,
      log_date,
      payload
    )
    VALUES ($1,$2,$3)
    RETURNING *
    `,
    [user_id, log_date, JSON.stringify(payload)],
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

export async function findTodayLogs(user_id, log_date) {
  const result = await pool.query(
    `
    SELECT *
    FROM daily_logs
    WHERE user_id = $1
      AND log_date = $2
      AND is_deleted = false
    ORDER BY created_at DESC
    `,
    [user_id, log_date],
  );

  return result.rows;
}
