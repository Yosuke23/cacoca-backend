// server/src/dao/weeklyDigestsDao.js
import { pool } from "../db/pool.js";

/**
 * 指定週の weekly_digests を取得
 */
export async function findWeeklyDigestByUserAndWeekStartDate(
  userId,
  weekStartDate,
) {
  if (!userId || !weekStartDate) {
    throw new Error(
      "findWeeklyDigestByUserAndWeekStartDate: userId and weekStartDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM weekly_digests
    WHERE user_id = $1
      AND week_start_date = $2
      AND is_deleted = false
    LIMIT 1
    `,
    [userId, weekStartDate],
  );

  return result.rows[0] ?? null;
}

/**
 * 指定週の weekly_digests を削除
 */
export async function deleteWeeklyDigestByUserAndWeekStartDate(
  userId,
  weekStartDate,
) {
  if (!userId || !weekStartDate) {
    throw new Error(
      "deleteWeeklyDigestByUserAndWeekStartDate: userId and weekStartDate are required",
    );
  }

  await pool.query(
    `
    DELETE FROM weekly_digests
    WHERE user_id = $1
      AND week_start_date = $2
    `,
    [userId, weekStartDate],
  );
}

/**
 * weekly_digests 保存
 */
export async function insertWeeklyDigest(params) {
  const {
    user_id,
    week_start_date,
    week_end_date,
    did_summary = null,
    people_summary = null,
    places_summary = null,
    free_note_summary = null,
    source_log_count = 0,
  } = params;

  if (!user_id || !week_start_date || !week_end_date) {
    throw new Error(
      "insertWeeklyDigest: user_id, week_start_date, week_end_date are required",
    );
  }

  const result = await pool.query(
    `
    INSERT INTO weekly_digests (
      user_id,
      week_start_date,
      week_end_date,
      did_summary,
      people_summary,
      places_summary,
      free_note_summary,
      source_log_count,
      generated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    RETURNING *
    `,
    [
      user_id,
      week_start_date,
      week_end_date,
      did_summary,
      people_summary,
      places_summary,
      free_note_summary,
      source_log_count,
    ],
  );

  return result.rows[0];
}

export async function findLatestWeeklyDigestByUserId(userId) {
  if (!userId) {
    throw new Error("findLatestWeeklyDigestByUserId: userId is required");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM weekly_digests
    WHERE user_id = $1
      AND is_deleted = false
    ORDER BY week_start_date DESC, created_at DESC
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}
