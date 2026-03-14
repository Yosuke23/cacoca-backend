// server/src/services/dailyLogEditSyncService.js
import { analyzeDigestPeopleAndPlaces } from "./digestPeoplePlacesService.js";
import {
  findDigestPeoplePeriodByUserAndTargetDate,
  deleteDigestPeopleByUserAndPeriod,
  insertDigestPeople,
} from "../dao/digestPeopleDao.js";
import {
  findDigestPlacesPeriodByUserAndTargetDate,
  deleteDigestPlacesByUserAndPeriod,
  insertDigestPlaces,
} from "../dao/digestPlacesDao.js";
import {
  regenerateWeeklyDigestForTargetDateIfPro,
  regenerateMonthlyDigestForTargetDateIfPro,
} from "./premiumDigestRunnerService.js";

function parseYmdToDate(ymd) {
  if (ymd instanceof Date) {
    return new Date(ymd.getFullYear(), ymd.getMonth(), ymd.getDate());
  }

  const [year, month, day] = String(ymd).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * 編集した日付が含まれる people / places 集約期間を再生成し、
 * 該当週・該当月の要約も即再生成する
 */
export async function syncDerivedDataAfterEdit(userId, logDate) {
  if (!userId || !logDate) {
    throw new Error(
      "syncDerivedDataAfterEdit: userId and logDate are required",
    );
  }

  const normalizedLogDate =
    logDate instanceof Date
      ? `${logDate.getFullYear()}-${`${logDate.getMonth() + 1}`.padStart(2, "0")}-${`${logDate.getDate()}`.padStart(2, "0")}`
      : String(logDate);

  const [peoplePeriod, placesPeriod] = await Promise.all([
    findDigestPeoplePeriodByUserAndTargetDate(userId, normalizedLogDate),
    findDigestPlacesPeriodByUserAndTargetDate(userId, normalizedLogDate),
  ]);

  const ranges = new Map();

  if (peoplePeriod?.digest_start_date && peoplePeriod?.digest_end_date) {
    ranges.set(
      `${peoplePeriod.digest_start_date}_${peoplePeriod.digest_end_date}`,
      {
        start: peoplePeriod.digest_start_date,
        end: peoplePeriod.digest_end_date,
      },
    );
  }

  if (placesPeriod?.digest_start_date && placesPeriod?.digest_end_date) {
    ranges.set(
      `${placesPeriod.digest_start_date}_${placesPeriod.digest_end_date}`,
      {
        start: placesPeriod.digest_start_date,
        end: placesPeriod.digest_end_date,
      },
    );
  }

  for (const range of ranges.values()) {
    const digestResult = await analyzeDigestPeopleAndPlaces(
      userId,
      range.start,
      range.end,
    );

    await deleteDigestPeopleByUserAndPeriod(userId, range.start, range.end);
    await deleteDigestPlacesByUserAndPeriod(userId, range.start, range.end);

    if (digestResult.people.length > 0) {
      await insertDigestPeople(
        userId,
        range.start,
        range.end,
        digestResult.people,
        digestResult.source_log_count,
      );
    }

    if (digestResult.places.length > 0) {
      await insertDigestPlaces(
        userId,
        range.start,
        range.end,
        digestResult.places,
        digestResult.source_log_count,
      );
    }
  }

  const [weeklyResult, monthlyResult] = await Promise.all([
    regenerateWeeklyDigestForTargetDateIfPro(userId, normalizedLogDate).catch(
      (error) => {
        console.error(
          "syncDerivedDataAfterEdit regenerateWeeklyDigestForTargetDateIfPro error:",
          error,
        );
        return {
          enabled: false,
          ran: false,
          error: true,
        };
      },
    ),
    regenerateMonthlyDigestForTargetDateIfPro(userId, normalizedLogDate).catch(
      (error) => {
        console.error(
          "syncDerivedDataAfterEdit regenerateMonthlyDigestForTargetDateIfPro error:",
          error,
        );
        return {
          enabled: false,
          ran: false,
          error: true,
        };
      },
    ),
  ]);

  return {
    people_places_reranged: [...ranges.values()],
    weekly: weeklyResult,
    monthly: monthlyResult,
  };
}
