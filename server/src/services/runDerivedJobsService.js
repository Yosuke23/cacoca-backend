// server/src/services/runDerivedJobsService.js
import { runDigestPeoplePlacesIfNeeded } from "./digestPeoplePlacesRunnerService.js";
import { runPremiumDigestsIfNeeded } from "./premiumDigestRunnerService.js";

/**
 * =====================================================
 * run derived jobs service
 * =====================================================
 * 役割：
 * - 全ユーザー共通の people / places 集約処理
 * - 有料ユーザー限定の weekly / monthly 集約処理
 * を必要時のみまとめて実行する
 * =====================================================
 */

/**
 * 派生ジョブを必要時のみ実行
 *
 * @param {string} userId
 * @param {string} triggerDate - YYYY-MM-DD
 * @returns {Promise<{
 *   people_places: {
 *     ran: boolean,
 *     reason: "seven_days" | "first_log_of_month" | null,
 *     digest_start_date: string | null,
 *     digest_end_date: string | null,
 *     source_log_count: number,
 *     people_count: number,
 *     places_count: number
 *   } | null,
 *   premium: {
 *     enabled: boolean,
 *     weekly: object | null,
 *     monthly: object | null
 *   } | null
 * }>}
 */
export async function runDerivedJobsIfNeeded(userId, triggerDate) {
  if (!userId || !triggerDate) {
    throw new Error(
      "runDerivedJobsIfNeeded: userId and triggerDate are required",
    );
  }

  const peoplePlaces = await runDigestPeoplePlacesIfNeeded(
    userId,
    triggerDate,
  ).catch((error) => {
    console.error("runDigestPeoplePlacesIfNeeded error:", error);

    return {
      ran: false,
      reason: null,
      digest_start_date: null,
      digest_end_date: null,
      source_log_count: 0,
      people_count: 0,
      places_count: 0,
      error: true,
    };
  });

  const premium = await runPremiumDigestsIfNeeded(userId, triggerDate).catch(
    (error) => {
      console.error("runPremiumDigestsIfNeeded error:", error);

      return {
        enabled: false,
        weekly: null,
        monthly: null,
        error: true,
      };
    },
  );

  return {
    people_places: peoplePlaces,
    premium,
  };
}
