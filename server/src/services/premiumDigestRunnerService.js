// server/src/services/premiumDigestRunnerService.js
import { generateText } from "./llmClient.js";
import { isUserPro } from "../dao/subscriptionsDao.js";
import {
  findWeeklyDigestByUserAndWeekStartDate,
  deleteWeeklyDigestByUserAndWeekStartDate,
  insertWeeklyDigest,
} from "../dao/weeklyDigestsDao.js";
import {
  findMonthlyDigestByUserAndYearMonth,
  deleteMonthlyDigestByUserAndYearMonth,
  insertMonthlyDigest,
} from "../dao/monthlyDigestsDao.js";
import { findDailyLogsByUserAndDateRange } from "../dao/dailyLogsDao.js";
import { findLightAnalysisByUserAndDateRange } from "../dao/dailyLogLightAnalysisDao.js";
import { findDigestPeopleByUserAndDateRange } from "../dao/digestPeopleDao.js";
import { findDigestPlacesByUserAndDateRange } from "../dao/digestPlacesDao.js";

/**
 * =====================================================
 * premium digest runner service
 * =====================================================
 * 役割：
 * - 有料ユーザー向けの週次 / 月次集約を必要時のみ生成する
 * - weekly_digests / monthly_digests に保存する
 * =====================================================
 */

function parseYmdToDate(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateToYmd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(ymd, days) {
  const date = parseYmdToDate(ymd);
  date.setDate(date.getDate() + days);
  return formatDateToYmd(date);
}

function getWeekStartMonday(ymd) {
  const date = parseYmdToDate(ymd);
  const day = date.getDay(); // Sun=0 ... Sat=6
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatDateToYmd(date);
}

function getWeekEndSunday(weekStartYmd) {
  return addDays(weekStartYmd, 6);
}

function getPreviousWeekRange(triggerDate) {
  const currentWeekStart = getWeekStartMonday(triggerDate);
  const previousWeekEnd = addDays(currentWeekStart, -1);
  const previousWeekStart = addDays(previousWeekEnd, -6);

  return {
    week_start_date: previousWeekStart,
    week_end_date: previousWeekEnd,
  };
}

function getCurrentMonthStart(triggerDate) {
  const date = parseYmdToDate(triggerDate);
  date.setDate(1);
  return formatDateToYmd(date);
}

function getPreviousMonthRange(triggerDate) {
  const currentMonthStart = getCurrentMonthStart(triggerDate);
  const previousMonthEnd = addDays(currentMonthStart, -1);
  const previousMonthStartDate = parseYmdToDate(previousMonthEnd);
  previousMonthStartDate.setDate(1);

  return {
    target_year_month: `${previousMonthStartDate.getFullYear()}-${`${previousMonthStartDate.getMonth() + 1}`.padStart(2, "0")}`,
    month_start_date: formatDateToYmd(previousMonthStartDate),
    month_end_date: previousMonthEnd,
  };
}

function uniqueStrings(values) {
  return [...new Set(values)];
}

function buildPeopleSummary(peopleRows) {
  const names = uniqueStrings(
    peopleRows.map((row) => row.person_name).filter(Boolean),
  );
  return names.length > 0 ? names.join("、") : null;
}

function buildPlacesSummary(placeRows) {
  const names = uniqueStrings(
    placeRows.map((row) => row.place_name).filter(Boolean),
  );
  return names.length > 0 ? names.join("、") : null;
}

function buildSummaryPrompt({
  rangeLabel,
  searchTexts,
  oneLineSummaries,
  peopleSummary,
  placesSummary,
}) {
  const searchTextBlock =
    searchTexts.length > 0 ? searchTexts.join("\n\n") : "（なし）";
  const summaryBlock =
    oneLineSummaries.length > 0 ? oneLineSummaries.join("\n") : "（なし）";
  const peopleBlock = peopleSummary ?? "（なし）";
  const placesBlock = placesSummary ?? "（なし）";

  return `
あなたは日記の振り返り要約を作るアシスタントです。
以下の素材をもとに、自然な日本語で要約を作成してください。

ルール:
- 誇張しない
- 読みやすく簡潔にまとめる
- 断定しすぎない
- 余計な見出しは出さない
- 要約本文のみを出力する

[対象期間]
${rangeLabel}

[日記本文素材]
${searchTextBlock}

[日次要約素材]
${summaryBlock}

[登場人物素材]
${peopleBlock}

[場所素材]
${placesBlock}
  `.trim();
}

async function generateWeeklySummaryText(params) {
  const prompt = buildSummaryPrompt(params);
  const text = await generateText(prompt);
  return text.trim() || null;
}

async function generateMonthlySummaryText(params) {
  const prompt = buildSummaryPrompt(params);
  const text = await generateText(prompt);
  return text.trim() || null;
}

async function collectDigestSourceMaterials(userId, startDate, endDate) {
  const [logs, lightAnalysisRows, peopleRows, placeRows] = await Promise.all([
    findDailyLogsByUserAndDateRange(userId, startDate, endDate),
    findLightAnalysisByUserAndDateRange(userId, startDate, endDate),
    findDigestPeopleByUserAndDateRange(userId, startDate, endDate),
    findDigestPlacesByUserAndDateRange(userId, startDate, endDate),
  ]);

  return {
    logs,
    lightAnalysisRows,
    peopleRows,
    placeRows,
  };
}

/**
 * 前週 weekly digest を必要時のみ生成
 */
async function runWeeklyDigestIfNeeded(userId, triggerDate) {
  const { week_start_date, week_end_date } = getPreviousWeekRange(triggerDate);

  const existing = await findWeeklyDigestByUserAndWeekStartDate(
    userId,
    week_start_date,
  );

  if (existing) {
    return {
      ran: false,
      target_week_start: week_start_date,
      target_week_end: week_end_date,
      source_log_count: existing.source_log_count ?? 0,
    };
  }

  const materials = await collectDigestSourceMaterials(
    userId,
    week_start_date,
    week_end_date,
  );

  if (materials.logs.length === 0) {
    return {
      ran: false,
      target_week_start: week_start_date,
      target_week_end: week_end_date,
      source_log_count: 0,
    };
  }

  const didSummary = await generateWeeklySummaryText({
    rangeLabel: `${week_start_date} 〜 ${week_end_date}`,
    searchTexts: materials.logs.map((log) => log.search_text).filter(Boolean),
    oneLineSummaries: materials.lightAnalysisRows
      .map((row) => row.one_line_summary)
      .filter(Boolean),
    peopleSummary: buildPeopleSummary(materials.peopleRows),
    placesSummary: buildPlacesSummary(materials.placeRows),
  });

  await deleteWeeklyDigestByUserAndWeekStartDate(userId, week_start_date);

  await insertWeeklyDigest({
    user_id: userId,
    week_start_date,
    week_end_date,
    did_summary: didSummary,
    people_summary: buildPeopleSummary(materials.peopleRows),
    places_summary: buildPlacesSummary(materials.placeRows),
    free_note_summary: null,
    source_log_count: materials.logs.length,
  });

  return {
    ran: true,
    target_week_start: week_start_date,
    target_week_end: week_end_date,
    source_log_count: materials.logs.length,
  };
}

/**
 * 前月 monthly digest を必要時のみ生成
 */
async function runMonthlyDigestIfNeeded(userId, triggerDate) {
  const { target_year_month, month_start_date, month_end_date } =
    getPreviousMonthRange(triggerDate);

  const existing = await findMonthlyDigestByUserAndYearMonth(
    userId,
    target_year_month,
  );

  if (existing) {
    return {
      ran: false,
      target_year_month,
      month_start_date,
      month_end_date,
      source_log_count: existing.source_log_count ?? 0,
    };
  }

  const materials = await collectDigestSourceMaterials(
    userId,
    month_start_date,
    month_end_date,
  );

  if (materials.logs.length === 0) {
    return {
      ran: false,
      target_year_month,
      month_start_date,
      month_end_date,
      source_log_count: 0,
    };
  }

  const summaryText = await generateMonthlySummaryText({
    rangeLabel: `${month_start_date} 〜 ${month_end_date}`,
    searchTexts: materials.logs.map((log) => log.search_text).filter(Boolean),
    oneLineSummaries: materials.lightAnalysisRows
      .map((row) => row.one_line_summary)
      .filter(Boolean),
    peopleSummary: buildPeopleSummary(materials.peopleRows),
    placesSummary: buildPlacesSummary(materials.placeRows),
  });

  await deleteMonthlyDigestByUserAndYearMonth(userId, target_year_month);

  await insertMonthlyDigest({
    user_id: userId,
    target_year_month,
    month_start_date,
    month_end_date,
    summary_text: summaryText,
    people_summary: buildPeopleSummary(materials.peopleRows),
    places_summary: buildPlacesSummary(materials.placeRows),
    source_log_count: materials.logs.length,
  });

  return {
    ran: true,
    target_year_month,
    month_start_date,
    month_end_date,
    source_log_count: materials.logs.length,
  };
}

/**
 * 有料ユーザー向け週次 / 月次集約を必要時のみ実行
 *
 * @param {string} userId
 * @param {string} triggerDate - YYYY-MM-DD
 */
export async function runPremiumDigestsIfNeeded(userId, triggerDate) {
  if (!userId || !triggerDate) {
    throw new Error(
      "runPremiumDigestsIfNeeded: userId and triggerDate are required",
    );
  }

  const pro = await isUserPro(userId);

  if (!pro) {
    return {
      enabled: false,
      weekly: null,
      monthly: null,
    };
  }

  const [weekly, monthly] = await Promise.all([
    runWeeklyDigestIfNeeded(userId, triggerDate).catch((error) => {
      console.error("runWeeklyDigestIfNeeded error:", error);
      return {
        ran: false,
        error: true,
      };
    }),
    runMonthlyDigestIfNeeded(userId, triggerDate).catch((error) => {
      console.error("runMonthlyDigestIfNeeded error:", error);
      return {
        ran: false,
        error: true,
      };
    }),
  ]);

  return {
    enabled: true,
    weekly,
    monthly,
  };
}
