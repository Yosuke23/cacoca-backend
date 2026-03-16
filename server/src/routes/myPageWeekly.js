// server/src/routes/myPageWeekly.js
import express from "express";
import { runDerivedJobsIfNeeded } from "../services/runDerivedJobsService.js";
import { isUserPro } from "../dao/subscriptionsDao.js";
import { findWeeklyDigestByUserAndWeekStartDate } from "../dao/weeklyDigestsDao.js";

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

function addDays(ymd, days) {
  const date = parseYmdToDate(ymd);
  date.setDate(date.getDate() + days);
  return formatDateToYmd(date);
}

function getWeekStartMonday(ymd) {
  const date = parseYmdToDate(ymd);
  const day = date.getDay();
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

/**
 * GET /mypage/weekly?user_id=xxx
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

    const pro = await isUserPro(user_id);

    if (!pro) {
      return res.json({
        message: "weekly fetched",
        data: null,
      });
    }

    const triggerDate = formatTodayJst();

    try {
      await runDerivedJobsIfNeeded(user_id, triggerDate);
    } catch (derivedJobsError) {
      console.error("GET /mypage/weekly derived jobs error:", derivedJobsError);
    }

    const previousWeek = getPreviousWeekRange(triggerDate);
    const weeklyDigest = await findWeeklyDigestByUserAndWeekStartDate(
      user_id,
      previousWeek.week_start_date,
    );

    return res.json({
      message: "weekly fetched",
      data: weeklyDigest
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
    });
  } catch (error) {
    console.error("GET /mypage/weekly error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch weekly",
    });
  }
});

export default router;
