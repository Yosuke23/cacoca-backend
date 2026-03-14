// server/src/dao/digestPeopleDao.js
import { pool } from "../db/pool.js";

/**
 * ユーザーの最新 digest_people を取得
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
 * 期間一致の digest_people を削除
 * 再実行時に同一区間を入れ直せるようにする
 */
export async function deleteDigestPeopleByUserAndPeriod(
  userId,
  digestStartDate,
  digestEndDate,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "deleteDigestPeopleByUserAndPeriod: userId, digestStartDate, digestEndDate are required",
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

/**
 * digest_people 一括INSERT
 *
 * @param {string} userId
 * @param {string} digestStartDate
 * @param {string} digestEndDate
 * @param {Array<{ person_name: string, confidence?: number | null }>} people
 * @param {number} sourceLogCount
 * @returns {Promise<object[]>}
 */
export async function insertDigestPeople(
  userId,
  digestStartDate,
  digestEndDate,
  people,
  sourceLogCount,
) {
  if (!userId || !digestStartDate || !digestEndDate) {
    throw new Error(
      "insertDigestPeople: userId, digestStartDate, digestEndDate are required",
    );
  }

  if (!Array.isArray(people)) {
    throw new Error("insertDigestPeople: people must be an array");
  }

  if (people.length === 0) {
    return [];
  }

  const values = [];
  const params = [];

  people.forEach((person, index) => {
    const base = index * 6;

    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
    );

    params.push(
      userId,
      digestStartDate,
      digestEndDate,
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
      person_name,
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
 * 指定期間に重なる digest_people を取得
 */
export async function findDigestPeopleByUserAndDateRange(
  userId,
  startDate,
  endDate,
) {
  if (!userId || !startDate || !endDate) {
    throw new Error(
      "findDigestPeopleByUserAndDateRange: userId, startDate, endDate are required",
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
 * 指定日を含む digest_people の最新期間を取得
 */
export async function findDigestPeoplePeriodByUserAndTargetDate(
  userId,
  targetDate,
) {
  if (!userId || !targetDate) {
    throw new Error(
      "findDigestPeoplePeriodByUserAndTargetDate: userId and targetDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM digest_people
    WHERE user_id = $1
      AND digest_start_date <= $2
      AND digest_end_date >= $2
      AND is_deleted = false
    ORDER BY digest_end_date DESC, created_at DESC
    LIMIT 1
    `,
    [userId, targetDate],
  );

  return result.rows[0] ?? null;
}
