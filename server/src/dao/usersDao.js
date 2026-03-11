// server/src/dao/usersDao.js
import { pool } from "../db/pool.js";

export async function getAiCommentEnabledByUserId(userId) {
  if (!userId) {
    throw new Error("getAiCommentEnabledByUserId: userId is required");
  }

  const result = await pool.query(
    `
    SELECT ai_comment_enabled
    FROM users
    WHERE id = $1
      AND is_deleted = false
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0]?.ai_comment_enabled ?? null;
}

export async function updateAiCommentEnabledByUserId(userId, enabled) {
  if (!userId) {
    throw new Error("updateAiCommentEnabledByUserId: userId is required");
  }

  const result = await pool.query(
    `
    UPDATE users
    SET
      ai_comment_enabled = $2,
      updated_at = now(),
      version_number = version_number + 1
    WHERE id = $1
      AND is_deleted = false
    RETURNING id, ai_comment_enabled, updated_at
    `,
    [userId, enabled],
  );

  return result.rows[0] ?? null;
}
