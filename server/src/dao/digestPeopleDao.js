// server/src/dao/digestPeopleDao.js
import { pool } from "../db/pool.js";

/**
 * =====================================================
 * digest people dao
 * =====================================================
 * 役割：
 * - digest_people テーブル操作
 * =====================================================
 */

export async function findLatestDigestPeopleByUserId(userId) {
  if (!userId) {
    throw new Error("findLatestDigestPeopleByUserId: userId is required");
  }

  const result = await pool.query(
    `
    SELECT *
    FROM digest_people
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
export async function findDigestPeopleByUserAndDateRange(
  userId,
  startDate,
  endDate,
) {
  if (!userId || !startDate || !endDate) {
    throw new Error(
      "findDigestPeopleByUserAndDateRange: userId, startDate and endDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM digest_people
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
export async function findDigestPeopleByUserAndLogDateRange(
  userId,
  startDate,
  endDate,
) {
  if (!userId || !startDate || !endDate) {
    throw new Error(
      "findDigestPeopleByUserAndLogDateRange: userId, startDate and endDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM digest_people
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

export async function deleteDigestPeopleByUserAndPeriod(
  userId,
  digestStartDate,
  digestEndDate,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "deleteDigestPeopleByUserAndPeriod: userId, digestStartDate and digestEndDate are required",
    );
  }

  await pool.query(
    `
    DELETE FROM digest_people
    WHERE user_id = $1
      AND digest_start_date = $2
      AND digest_end_date = $3
    `,
    [userId, digestStartDate, digestEndDate],
  );
}

export async function insertDigestPeople(
  userId,
  digestStartDate,
  digestEndDate,
  people,
  sourceLogCount,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "insertDigestPeople: userId, digestStartDate and digestEndDate are required",
    );
  }

  if (!Array.isArray(people) || people.length === 0) {
    return [];
  }

  const values = [];
  const params = [];

  people.forEach((person, index) => {
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
      person.log_date ?? null,
      person.person_name,
      person.confidence ?? null,
      sourceLogCount,
    );
  });

  const result = await pool.query(
    `
    INSERT INTO digest_people (
      user_id,
      digest_start_date,
      digest_end_date,
      log_date,
      person_name,
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
