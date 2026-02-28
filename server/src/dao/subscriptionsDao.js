// server/src/dao/subscriptionsDao.js
import { pool } from "../db/pool.js";

export async function isUserPro(user_id) {
  const result = await pool.query(
    `
    SELECT 1
    FROM subscriptions
    WHERE user_id = $1
      AND is_deleted = false
      AND started_at <= now()
      AND (ended_at IS NULL OR ended_at >= now())
    LIMIT 1
    `,
    [user_id],
  );

  return result.rowCount > 0;
}
