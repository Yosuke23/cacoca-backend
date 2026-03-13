// server/src/dao/digestPlacesDao.js
import { pool } from "../db/pool.js";

/**
 * ユーザーの最新 digest_places を取得
 */
export async function findLatestDigestPlacesByUserId(userId) {
  if (!userId) {
    throw new Error("findLatestDigestPlacesByUserId: userId is required");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM digest_places
    WHERE user_id = $1
      AND is_deleted = false
    ORDER BY digest_end_date DESC, created_at DESC
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

/**
 * 期間一致の digest_places を削除
 */
export async function deleteDigestPlacesByUserAndPeriod(
  userId,
  digestStartDate,
  digestEndDate,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "deleteDigestPlacesByUserAndPeriod: userId, digestStartDate, digestEndDate are required",
    );
  }

  await pool.query(
    `
    DELETE FROM digest_places
    WHERE user_id = $1
      AND digest_start_date = $2
      AND digest_end_date = $3
    `,
    [userId, digestStartDate, digestEndDate],
  );
}

/**
 * digest_places 一括INSERT
 *
 * @param {string} userId
 * @param {string} digestStartDate
 * @param {string} digestEndDate
 * @param {Array<{ place_name: string, confidence?: number | null }>} places
 * @param {number} sourceLogCount
 * @returns {Promise<object[]>}
 */
export async function insertDigestPlaces(
  userId,
  digestStartDate,
  digestEndDate,
  places,
  sourceLogCount,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "insertDigestPlaces: userId, digestStartDate, digestEndDate are required",
    );
  }

  if (!Array.isArray(places)) {
    throw new Error("insertDigestPlaces: places must be an array");
  }

  if (places.length === 0) {
    return [];
  }

  const values = [];
  const params = [];

  places.forEach((place, index) => {
    const base = index * 6;

    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
    );

    params.push(
      userId,
      digestStartDate,
      digestEndDate,
      place.place_name,
      place.confidence ?? null,
      sourceLogCount,
    );
  });

  const result = await pool.query(
    `
    INSERT INTO digest_places (
      user_id,
      digest_start_date,
      digest_end_date,
      place_name,
      confidence,
      source_log_count
    )
    VALUES ${values.join(", ")}
    RETURNING *
    `,
    params,
  );

  return result.rows;
}

/**
 * 指定期間に重なる digest_places を取得
 */
export async function findDigestPlacesByUserAndDateRange(
  userId,
  startDate,
  endDate,
) {
  if (!userId || !startDate || !endDate) {
    throw new Error(
      "findDigestPlacesByUserAndDateRange: userId, startDate, endDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM digest_places
    WHERE user_id = $1
      AND digest_end_date >= $2
      AND digest_start_date <= $3
      AND is_deleted = false
    ORDER BY digest_start_date ASC, created_at ASC
    `,
    [userId, startDate, endDate],
  );

  return result.rows;
}
