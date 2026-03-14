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
import { deleteWeeklyDigestByUserAndWeekStartDate } from "../dao/weeklyDigestsDao.js";
import { deleteMonthlyDigestByUserAndYearMonth } from "../dao/monthlyDigestsDao.js";

function parseYmdToDate(ymd) {
  if (ymd instanceof Date) {
    return new Date(ymd.getFullYear(), ymd.getMonth(), ymd.getDate());
  }

  const [year, month, day] = String(ymd).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateToYmd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartMonday(ymd) {
  const date = parseYmdToDate(ymd);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatDateToYmd(date);
}

function getTargetYearMonth(ymd) {
  const date = parseYmdToDate(ymd);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

/**
 * 編集した日付が含まれる people / places 集約期間を再生成し、
 * 該当週・該当月の要約は削除して次回再生成待ちにする
 */
export async function syncDerivedDataAfterEdit(userId, logDate) {
  if (!userId || !logDate) {
    throw new Error(
      "syncDerivedDataAfterEdit: userId and logDate are required",
    );
  }

  const [peoplePeriod, placesPeriod] = await Promise.all([
    findDigestPeoplePeriodByUserAndTargetDate(userId, logDate),
    findDigestPlacesPeriodByUserAndTargetDate(userId, logDate),
  ]);

  const peopleDigestStartDate = peoplePeriod?.digest_start_date ?? null;
  const peopleDigestEndDate = peoplePeriod?.digest_end_date ?? null;
  const placesDigestStartDate = placesPeriod?.digest_start_date ?? null;
  const placesDigestEndDate = placesPeriod?.digest_end_date ?? null;

  const ranges = new Map();

  if (peopleDigestStartDate && peopleDigestEndDate) {
    ranges.set(`${peopleDigestStartDate}_${peopleDigestEndDate}`, {
      start: peopleDigestStartDate,
      end: peopleDigestEndDate,
    });
  }

  if (placesDigestStartDate && placesDigestEndDate) {
    ranges.set(`${placesDigestStartDate}_${placesDigestEndDate}`, {
      start: placesDigestStartDate,
      end: placesDigestEndDate,
    });
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

  const weekStartDate = getWeekStartMonday(logDate);
  const targetYearMonth = getTargetYearMonth(logDate);

  await deleteWeeklyDigestByUserAndWeekStartDate(userId, weekStartDate);
  await deleteMonthlyDigestByUserAndYearMonth(userId, targetYearMonth);

  return {
    people_places_reranged: [...ranges.values()],
    invalidated_week_start_date: weekStartDate,
    invalidated_target_year_month: targetYearMonth,
  };
}
