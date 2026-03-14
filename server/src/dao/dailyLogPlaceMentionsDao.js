// server/src/dao/dailyLogPlaceMentionsDao.js
import { pool } from "../db/pool.js";

/**
 * 日記1件分の place mentions を削除
 */
export async function deletePlaceMentionsByDailyLogId(dailyLogId) {
  if (!dailyLogId) {
    throw new Error("deletePlaceMentionsByDailyLogId: dailyLogId is required");
  }

  await pool.query(
    `
    DELETE FROM daily_log_place_mentions
    WHERE daily_log_id = $1
    `,
    [dailyLogId],
  );
}

/**
 * 日記1件分の place mentions を一括保存
 */
export async function insertPlaceMentions(params) {
  const { daily_log_id, user_id, log_date, places } = params;

  if (!daily_log_id || !user_id || !log_date) {
    throw new Error(
      "insertPlaceMentions: daily_log_id, user_id, log_date are required",
    );
  }

  if (!Array.isArray(places) || places.length === 0) {
    return [];
  }

  const values = [];
  const bindValues = [];

  places.forEach((place, index) => {
    const base = index * 5;

    values.push(
      `(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, now(), null, false, 1)`,
    );

    bindValues.push(
      daily_log_id,
      user_id,
      log_date,
      place.place_name,
      place.confidence ?? null,
    );
  });

  const result = await pool.query(
    `
    INSERT INTO daily_log_place_mentions (
      id,
      daily_log_id,
      user_id,
      log_date,
      place_name,
      confidence,
      created_at,
      updated_at,
      is_deleted,
      version_number
    )
    VALUES ${values.join(", ")}
    RETURNING *
    `,
    bindValues,
  );

  return result.rows;
}

/**
 * 月指定で place mentions を取得
 */
export async function findPlaceMentionsByUserAndMonth(
  userId,
  monthStartDate,
  monthEndDate,
) {
  if (!userId || !monthStartDate || !monthEndDate) {
    throw new Error(
      "findPlaceMentionsByUserAndMonth: userId, monthStartDate, monthEndDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM daily_log_place_mentions
    WHERE user_id = $1
      AND log_date >= $2
      AND log_date <= $3
      AND is_deleted = false
    ORDER BY log_date ASC, created_at ASC
    `,
    [userId, monthStartDate, monthEndDate],
  );

  return result.rows;
}

/**
 * 月指定で place mentions をユニーク場所名で取得
 */
export async function findUniquePlaceMentionsByUserAndMonth(
  userId,
  monthStartDate,
  monthEndDate,
) {
  if (!userId || !monthStartDate || !monthEndDate) {
    throw new Error(
      "findUniquePlaceMentionsByUserAndMonth: userId, monthStartDate, monthEndDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT
      MIN(id) AS id,
      place_name,
      MIN(log_date) AS first_log_date
    FROM daily_log_place_mentions
    WHERE user_id = $1
      AND log_date >= $2
      AND log_date <= $3
      AND is_deleted = false
    GROUP BY place_name
    ORDER BY first_log_date ASC, place_name ASC
    `,
    [userId, monthStartDate, monthEndDate],
  );

  return result.rows;
}
