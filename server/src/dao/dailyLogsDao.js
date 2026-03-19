// server/src/dao/dailyLogsDao.js
import { pool } from "../db/pool.js";
import { payloadToSearchText } from "../utils/dailyLogPayload.js";

/**
 * 日記一覧取得
 */
export async function findDailyLogsByUser(user_id) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      log_date,
      payload,
      title,
      generated_text,
      created_at,
      updated_at
    FROM daily_logs
    WHERE user_id = $1
      AND is_deleted = false
    ORDER BY log_date DESC
    `,
    [user_id],
  );

  return result.rows;
}

/**
 * daily_logs DAO
 * payload 一本化設計
 */

export async function insertDailyLog({ user_id, log_date, payload }) {
  if (!user_id || !log_date || !payload) {
    throw new Error("insertDailyLog: user_id, log_date, payload are required");
  }

  const searchText = payloadToSearchText(payload);

  const result = await pool.query(
    `
    INSERT INTO daily_logs (
      user_id,
      log_date,
      payload,
      search_text,
      search_text_updated_at
    )
    VALUES ($1, $2, $3::jsonb, $4, now())
    RETURNING *
    `,
    [user_id, log_date, JSON.stringify(payload), searchText],
  );

  return result.rows[0];
}

export async function findDailyLogByIdAndUser(id, user_id) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      log_date,
      payload,
      title,
      generated_text,
      created_at,
      updated_at
    FROM daily_logs
    WHERE id = $1
      AND user_id = $2
      AND is_deleted = false
    LIMIT 1
    `,
    [id, user_id],
  );

  return result.rows[0] ?? null;
}

export async function findTodayLogs(user_id, log_date) {
  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      log_date,
      payload,
      title,
      generated_text,
      created_at,
      updated_at
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

/**
 * 日記更新
 */
export async function updateDailyLogByIdAndUser(
  id,
  user_id,
  payload,
  title = null,
) {
  const searchText = payloadToSearchText(payload);

  const result = await pool.query(
    `
    UPDATE daily_logs
    SET
      payload = $3::jsonb,
      title = $4,
      search_text = $5,
      search_text_updated_at = now(),
      updated_at = now(),
      version_number = version_number + 1
    WHERE id = $1
      AND user_id = $2
      AND is_deleted = false
    RETURNING *
    `,
    [id, user_id, JSON.stringify(payload), title, searchText],
  );

  return result.rows[0] ?? null;
}

// ユーザーのカウントを返す
export async function countLogsByUserAndDate(userId, logDate) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM daily_logs
    WHERE user_id = $1
      AND log_date = $2
      AND is_deleted = false
    `,
    [userId, logDate],
  );

  return result.rows[0].count;
}

/**
 * ユーザーの最初の日記日を取得
 */
export async function findFirstLogDateByUser(userId) {
  if (!userId) {
    throw new Error("findFirstLogDateByUser: userId is required");
  }

  const result = await pool.query(
    `
    SELECT log_date
    FROM daily_logs
    WHERE user_id = $1
      AND is_deleted = false
    ORDER BY log_date ASC
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0]?.log_date ?? null;
}

/**
 * 指定期間の日記を取得
 */
export async function findDailyLogsByUserAndDateRange(
  userId,
  startDate,
  endDate,
) {
  if (!userId || !startDate || !endDate) {
    throw new Error(
      "findDailyLogsByUserAndDateRange: userId, startDate, endDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT
      id,
      user_id,
      log_date,
      payload,
      title,
      generated_text,
      created_at,
      updated_at,
      search_text
    FROM daily_logs
    WHERE user_id = $1
      AND log_date >= $2
      AND log_date <= $3
      AND is_deleted = false
    ORDER BY log_date ASC, created_at ASC
    `,
    [userId, startDate, endDate],
  );

  return result.rows;
}

/**
 * 指定月に、そのユーザーの日記が存在するか
 *
 * monthStartDate: YYYY-MM-01
 * nextMonthStartDate: 翌月1日
 */
export async function countDailyLogsByUserAndMonthRange(
  userId,
  monthStartDate,
  nextMonthStartDate,
) {
  if (!userId || !monthStartDate || !nextMonthStartDate) {
    throw new Error(
      "countDailyLogsByUserAndMonthRange: userId, monthStartDate, nextMonthStartDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM daily_logs
    WHERE user_id = $1
      AND log_date >= $2
      AND log_date < $3
      AND is_deleted = false
    `,
    [userId, monthStartDate, nextMonthStartDate],
  );

  return result.rows[0].count;
}
