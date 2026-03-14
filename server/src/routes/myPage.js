// server/src/routes/myPage.js
import express from "express";
import { runDerivedJobsIfNeeded } from "../services/runDerivedJobsService.js";
import { findLatestDigestPeopleRowsByUserId } from "../dao/digestPeopleDao.js";
import { findLatestDigestPlacesRowsByUserId } from "../dao/digestPlacesDao.js";
import { findWeeklyDigestByUserAndWeekStartDate } from "../dao/weeklyDigestsDao.js";
import { findMonthlyDigestByUserAndYearMonth } from "../dao/monthlyDigestsDao.js";
import { isUserPro } from "../dao/subscriptionsDao.js";

const router = express.Router();

function formatTodayJst() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

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

function getCurrentMonthRange(triggerDate) {
  const date = parseYmdToDate(triggerDate);

  const monthStartDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const nextMonthStartDate = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    1,
  );
  const monthEndDate = new Date(
    nextMonthStartDate.getTime() - 24 * 60 * 60 * 1000,
  );

  return {
    month_start_date: formatDateToYmd(monthStartDate),
    month_end_date: formatDateToYmd(monthEndDate),
  };
}

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

function getPreviousWeekRange(triggerDate) {
  const currentWeekStart = getWeekStartMonday(triggerDate);
  const previousWeekEnd = addDays(currentWeekStart, -1);
  const previousWeekStart = addDays(previousWeekEnd, -6);

  return {
    week_start_date: previousWeekStart,
    week_end_date: previousWeekEnd,
  };
}

function getPreviousMonthYearMonth(triggerDate) {
  const date = parseYmdToDate(triggerDate);
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);

  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

/**
 * GET /mypage?user_id=xxx
 *
 * 役割：
 * - マイページ表示用データ取得
 * - 呼び出し時に runDerivedJobsIfNeeded(...) を実行
 * - 必要なら people / places / weekly / monthly を補完生成
 */
router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    const triggerDate = formatTodayJst();

    try {
      await runDerivedJobsIfNeeded(user_id, triggerDate);
    } catch (derivedJobsError) {
      console.error("GET /mypage derived jobs error:", derivedJobsError);
    }

    const pro = await isUserPro(user_id);

    const previousWeek = getPreviousWeekRange(triggerDate);
    const previousYearMonth = getPreviousMonthYearMonth(triggerDate);
    const currentMonth = getCurrentMonthRange(triggerDate);

    const [peopleRows, placeRows, weeklyDigest, monthlyDigest] =
      await Promise.all([
        findDigestPeopleByUserAndDateRange(
          user_id,
          currentMonth.month_start_date,
          currentMonth.month_end_date,
        ),
        findDigestPlacesByUserAndDateRange(
          user_id,
          currentMonth.month_start_date,
          currentMonth.month_end_date,
        ),
        pro
          ? findWeeklyDigestByUserAndWeekStartDate(
              user_id,
              previousWeek.week_start_date,
            )
          : Promise.resolve(null),
        pro
          ? findMonthlyDigestByUserAndYearMonth(user_id, previousYearMonth)
          : Promise.resolve(null),
      ]);

    return res.json({
      message: "mypage data fetched",
      data: {
        is_pro: pro,
        people: peopleRows.map((row) => ({
          id: row.id,
          digest_start_date: currentMonth.month_start_date,
          digest_end_date: currentMonth.month_end_date,
          person_name: row.person_name,
        })),
        places: placeRows.map((row) => ({
          id: row.id,
          digest_start_date: currentMonth.month_start_date,
          digest_end_date: currentMonth.month_end_date,
          place_name: row.place_name,
        })),
        weekly_digest: weeklyDigest
          ? {
              id: weeklyDigest.id,
              week_start_date: weeklyDigest.week_start_date,
              week_end_date: weeklyDigest.week_end_date,
              did_summary: weeklyDigest.did_summary,
              people_summary: weeklyDigest.people_summary,
              places_summary: weeklyDigest.places_summary,
              free_note_summary: weeklyDigest.free_note_summary,
              source_log_count: weeklyDigest.source_log_count,
              generated_at: weeklyDigest.generated_at,
            }
          : null,
        monthly_digest: monthlyDigest
          ? {
              id: monthlyDigest.id,
              target_year_month: monthlyDigest.target_year_month,
              month_start_date: monthlyDigest.month_start_date,
              month_end_date: monthlyDigest.month_end_date,
              summary_text: monthlyDigest.summary_text,
              people_summary: monthlyDigest.people_summary,
              places_summary: monthlyDigest.places_summary,
              source_log_count: monthlyDigest.source_log_count,
              generated_at: monthlyDigest.generated_at,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("GET /mypage error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch mypage data",
    });
  }
});

export default router;
