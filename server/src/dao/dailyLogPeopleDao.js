// // server/src/dao/dailyLogPeopleDao.js
// import { pool } from "../db/pool.js";

// /**
//  * people を日記単位で削除
//  */
// export async function deletePeopleByDailyLogId(dailyLogId) {
//   if (!dailyLogId) {
//     throw new Error("deletePeopleByDailyLogId: dailyLogId is required");
//   }

//   await pool.query(
//     `
//     DELETE FROM daily_log_people
//     WHERE daily_log_id = $1
//     `,
//     [dailyLogId],
//   );
// }

// /**
//  * people 一括INSERT
//  *
//  * @param {string} dailyLogId
//  * @param {Array<{ person_name: string, normalized_name: string, confidence?: number | null }>} people
//  * @returns {Promise<object[]>}
//  */
// export async function insertPeople(dailyLogId, people) {
//   if (!dailyLogId) {
//     throw new Error("insertPeople: dailyLogId is required");
//   }

//   if (!Array.isArray(people)) {
//     throw new Error("insertPeople: people must be an array");
//   }

//   if (people.length === 0) {
//     return [];
//   }

//   const values = [];
//   const params = [];

//   people.forEach((person, index) => {
//     const base = index * 4;

//     values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);

//     params.push(
//       dailyLogId,
//       person.person_name,
//       person.normalized_name,
//       person.confidence ?? null,
//     );
//   });

//   const result = await pool.query(
//     `
//     INSERT INTO daily_log_people (
//       daily_log_id,
//       person_name,
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

// export async function findPeopleByDailyLogId(dailyLogId) {
//   if (!dailyLogId) {
//     throw new Error("findPeopleByDailyLogId: dailyLogId is required");
//   }

//   const result = await pool.query(
//     `
//     SELECT *
//     FROM daily_log_people
//     WHERE daily_log_id = $1
//       AND is_deleted = false
//     ORDER BY created_at ASC
//     `,
//     [dailyLogId],
//   );

//   return result.rows;
// }
