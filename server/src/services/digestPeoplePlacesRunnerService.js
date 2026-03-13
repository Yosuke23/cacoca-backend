// server/src/services/digestPeoplePlacesRunnerService.js
import {
  resolveDigestExecution,
  analyzeDigestPeopleAndPlaces,
} from "./digestPeoplePlacesService.js";
import {
  deleteDigestPeopleByUserAndPeriod,
  insertDigestPeople,
} from "../dao/digestPeopleDao.js";
import {
  deleteDigestPlacesByUserAndPeriod,
  insertDigestPlaces,
} from "../dao/digestPlacesDao.js";

/**
 * =====================================================
 * digest people / places runner service
 * =====================================================
 * 役割：
 * - 無料 / 有料共通で people / places 集約処理を走らせる
 * - 実行要否を判定する
 * - 必要時のみ delete -> insert する
 * =====================================================
 */

/**
 * people / places 集約処理を必要時のみ実行
 *
 * @param {string} userId
 * @param {string} triggerDate - YYYY-MM-DD
 * @returns {Promise<{
 *   ran: boolean,
 *   reason: "seven_days" | "first_log_of_month" | null,
 *   digest_start_date: string | null,
 *   digest_end_date: string | null,
 *   source_log_count: number,
 *   people_count: number,
 *   places_count: number
 * }>}
 */
export async function runDigestPeoplePlacesIfNeeded(userId, triggerDate) {
  if (!userId || !triggerDate) {
    throw new Error(
      "runDigestPeoplePlacesIfNeeded: userId and triggerDate are required",
    );
  }

  const execution = await resolveDigestExecution(userId, triggerDate);

  if (!execution.should_run) {
    return {
      ran: false,
      reason: null,
      digest_start_date: null,
      digest_end_date: null,
      source_log_count: 0,
      people_count: 0,
      places_count: 0,
    };
  }

  const digestResult = await analyzeDigestPeopleAndPlaces(
    userId,
    execution.digest_start_date,
    execution.digest_end_date,
  );

  await deleteDigestPeopleByUserAndPeriod(
    userId,
    execution.digest_start_date,
    execution.digest_end_date,
  );

  await deleteDigestPlacesByUserAndPeriod(
    userId,
    execution.digest_start_date,
    execution.digest_end_date,
  );

  if (digestResult.people.length > 0) {
    await insertDigestPeople(
      userId,
      execution.digest_start_date,
      execution.digest_end_date,
      digestResult.people,
      digestResult.source_log_count,
    );
  }

  if (digestResult.places.length > 0) {
    await insertDigestPlaces(
      userId,
      execution.digest_start_date,
      execution.digest_end_date,
      digestResult.places,
      digestResult.source_log_count,
    );
  }

  return {
    ran: true,
    reason: execution.reason,
    digest_start_date: execution.digest_start_date,
    digest_end_date: execution.digest_end_date,
    source_log_count: digestResult.source_log_count,
    people_count: digestResult.people.length,
    places_count: digestResult.places.length,
  };
}
