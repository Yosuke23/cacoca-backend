// server/src/dao/digestPlacesDao.js
import { pool } from "../db/pool.js";

/**
 * =====================================================
 * digest places dao
 * =====================================================
 * 役割：
 * - digest_places テーブル操作
 * =====================================================
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
 * 旧: digest期間重なりベース取得
 * ※ 今は後方互換のため残す
 */
export async function findDigestPlacesByUserAndDateRange(
  userId,
  startDate,
  endDate,
) {
  if (!userId || !startDate || !endDate) {
    throw new Error(
      "findDigestPlacesByUserAndDateRange: userId, startDate and endDate are required",
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

/**
 * 新: log_date ベース取得
 * weekly / monthly の exact 集計用
 */
export async function findDigestPlacesByUserAndLogDateRange(
  userId,
  startDate,
  endDate,
) {
  if (!userId || !startDate || !endDate) {
    throw new Error(
      "findDigestPlacesByUserAndLogDateRange: userId, startDate and endDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM digest_places
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

export async function deleteDigestPlacesByUserAndPeriod(
  userId,
  digestStartDate,
  digestEndDate,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "deleteDigestPlacesByUserAndPeriod: userId, digestStartDate and digestEndDate are required",
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

export async function insertDigestPlaces(
  userId,
  digestStartDate,
  digestEndDate,
  places,
  sourceLogCount,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "insertDigestPlaces: userId, digestStartDate and digestEndDate are required",
    );
  }

  if (!Array.isArray(places) || places.length === 0) {
    return [];
  }

  const values = [];
  const params = [];

  places.forEach((place, index) => {
    const base = index * 8;

    values.push(
      `(
        $${base + 1},
        $${base + 2},
        $${base + 3},
        $${base + 4},
        $${base + 5},
        $${base + 6},
        $${base + 7},
        NOW()
      )`,
    );

    params.push(
      userId,
      digestStartDate,
      digestEndDate,
      place.log_date ?? null,
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
      log_date,
      place_name,
      confidence,
      source_log_count,
      created_at
    )
    VALUES ${values.join(",")}
    RETURNING *
    `,
    params,
  );

  return result.rows;
}
