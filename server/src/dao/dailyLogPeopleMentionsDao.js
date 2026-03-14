// server/src/dao/dailyLogPeopleMentionsDao.js
import { pool } from "../db/pool.js";

/**
 * 日記1件分の people mentions を削除
 */
export async function deletePeopleMentionsByDailyLogId(dailyLogId) {
  if (!dailyLogId) {
    throw new Error("deletePeopleMentionsByDailyLogId: dailyLogId is required");
  }

  await pool.query(
    `
    DELETE FROM daily_log_people_mentions
    WHERE daily_log_id = $1
    `,
    [dailyLogId],
  );
}

/**
 * 日記1件分の people mentions を一括保存
 */
export async function insertPeopleMentions(params) {
  const { daily_log_id, user_id, log_date, people } = params;

  if (!daily_log_id || !user_id || !log_date) {
    throw new Error(
      "insertPeopleMentions: daily_log_id, user_id, log_date are required",
    );
  }

  if (!Array.isArray(people) || people.length === 0) {
    return [];
  }

  const values = [];
  const bindValues = [];

  people.forEach((person, index) => {
    const base = index * 5;

    values.push(
      `(gen_random_uuid(), $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, now(), null, false, 1)`,
    );

    bindValues.push(
      daily_log_id,
      user_id,
      log_date,
      person.person_name,
      person.confidence ?? null,
    );
  });

  const result = await pool.query(
    `
    INSERT INTO daily_log_people_mentions (
      id,
      daily_log_id,
      user_id,
      log_date,
      person_name,
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
 * 月指定で people mentions を取得
 */
export async function findPeopleMentionsByUserAndMonth(
  userId,
  monthStartDate,
  monthEndDate,
) {
  if (!userId || !monthStartDate || !monthEndDate) {
    throw new Error(
      "findPeopleMentionsByUserAndMonth: userId, monthStartDate, monthEndDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT *
    FROM daily_log_people_mentions
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
 * 月指定で people mentions をユニーク人物名で取得
 */
export async function findUniquePeopleMentionsByUserAndMonth(
  userId,
  monthStartDate,
  monthEndDate,
) {
  if (!userId || !monthStartDate || !monthEndDate) {
    throw new Error(
      "findUniquePeopleMentionsByUserAndMonth: userId, monthStartDate, monthEndDate are required",
    );
  }

  const result = await pool.query(
    `
    SELECT DISTINCT ON (person_name)
      id,
      person_name,
      log_date AS first_log_date
    FROM daily_log_people_mentions
    WHERE user_id = $1
      AND log_date >= $2
      AND log_date <= $3
      AND is_deleted = false
    ORDER BY person_name ASC, log_date ASC, created_at ASC
    `,
    [userId, monthStartDate, monthEndDate],
  );

  return result.rows.sort((a, b) => {
    if (a.first_log_date < b.first_log_date) return -1;
    if (a.first_log_date > b.first_log_date) return 1;
    return a.person_name.localeCompare(b.person_name, "ja");
  });
}
