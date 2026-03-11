// // server/src/dao/dailyLogPlacesDao.js
// import { pool } from "../db/pool.js";

// /**
//  * places を日記単位で削除
//  */
// export async function deletePlacesByDailyLogId(dailyLogId) {
//   if (!dailyLogId) {
//     throw new Error("deletePlacesByDailyLogId: dailyLogId is required");
//   }

//   await pool.query(
//     `
//     DELETE FROM daily_log_places
//     WHERE daily_log_id = $1
//     `,
//     [dailyLogId],
//   );
// }

// /**
//  * places 一括INSERT
//  *
//  * @param {string} dailyLogId
//  * @param {Array<{ place_name: string, normalized_name: string, confidence?: number | null }>} places
//  * @returns {Promise<object[]>}
//  */
// export async function insertPlaces(dailyLogId, places) {
//   if (!dailyLogId) {
//     throw new Error("insertPlaces: dailyLogId is required");
//   }

//   if (!Array.isArray(places)) {
//     throw new Error("insertPlaces: places must be an array");
//   }

//   if (places.length === 0) {
//     return [];
//   }

//   const values = [];
//   const params = [];

//   places.forEach((place, index) => {
//     const base = index * 4;

//     values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);

//     params.push(
//       dailyLogId,
//       place.place_name,
//       place.normalized_name,
//       place.confidence ?? null,
//     );
//   });

//   const result = await pool.query(
//     `
//     INSERT INTO daily_log_places (
//       daily_log_id,
//       place_name,
//       normalized_name,
//       confidence
//     )
//     VALUES ${values.join(", ")}
//     RETURNING *
//     `,
//     params,
//   );

//   return result.rows;
// }

// export async function findPlacesByDailyLogId(dailyLogId) {
//   if (!dailyLogId) {
//     throw new Error("findPlacesByDailyLogId: dailyLogId is required");
//   }

//   const result = await pool.query(
//     `
//     SELECT *
//     FROM daily_log_places
//     WHERE daily_log_id = $1
//       AND is_deleted = false
//     ORDER BY created_at ASC
//     `,
//     [dailyLogId],
//   );

//   return result.rows;
// }
