// server/src/dao/monthlyDigestsDao.js
import { pool } from "../db/pool.js";

/**
 * 指定月の monthly_digests を取得
 */
export async function findMonthlyDigestByUserAndYearMonth(
  userId,
  targetYearMonth,
) {
  if (!userId || !targetYearMonth) {
    throw new Error(
      "findMonthlyDigestByUserAndYearMonth: userId and targetYearMonth are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM monthly_digests
    WHERE user_id = $1
      AND target_year_month = $2
      AND is_deleted = false
    LIMIT 1
    `,
    [userId, targetYearMonth],
  );

  return result.rows[0] ?? null;
}

/**
 * 指定月の monthly_digests を削除
 */
export async function deleteMonthlyDigestByUserAndYearMonth(
  userId,
  targetYearMonth,
) {
  if (!userId || !targetYearMonth) {
    throw new Error(
      "deleteMonthlyDigestByUserAndYearMonth: userId and targetYearMonth are required",
    );
  }

  await pool.query(
    `
    DELETE FROM monthly_digests
    WHERE user_id = $1
      AND target_year_month = $2
    `,
    [userId, targetYearMonth],
  );
}

/**
 * monthly_digests 保存
 */
export async function insertMonthlyDigest(params) {
  const {
    user_id,
    target_year_month,
    month_start_date,
    month_end_date,
    summary_text = null,
    people_summary = null,
    places_summary = null,
    source_log_count = 0,
  } = params;

  if (!user_id || !target_year_month || !month_start_date || !month_end_date) {
    throw new Error(
      "insertMonthlyDigest: user_id, target_year_month, month_start_date, month_end_date are required",
    );
  }

  const result = await pool.query(
    `
    INSERT INTO monthly_digests (
      user_id,
      target_year_month,
      month_start_date,
      month_end_date,
      summary_text,
      people_summary,
      places_summary,
      source_log_count,
      generated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    RETURNING *
    `,
    [
      user_id,
      target_year_month,
      month_start_date,
      month_end_date,
      summary_text,
      people_summary,
      places_summary,
      source_log_count,
    ],
  );

  return result.rows[0];
}

export async function findLatestMonthlyDigestByUserId(userId) {
  if (!userId) {
    throw new Error("findLatestMonthlyDigestByUserId: userId is required");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM monthly_digests
    WHERE user_id = $1
      AND is_deleted = false
    ORDER BY target_year_month DESC, created_at DESC
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}
