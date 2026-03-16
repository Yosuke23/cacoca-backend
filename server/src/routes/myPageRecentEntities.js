// server/src/routes/myPageRecentEntities.js
import express from "express";
import { runDerivedJobsIfNeeded } from "../services/runDerivedJobsService.js";
import { findDigestPeopleByUserAndDateRange } from "../dao/digestPeopleDao.js";
import { findDigestPlacesByUserAndDateRange } from "../dao/digestPlacesDao.js";

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

/**
 * GET /mypage/recent-entities?user_id=xxx
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
      console.error(
        "GET /mypage/recent-entities derived jobs error:",
        derivedJobsError,
      );
    }

    const currentMonth = getCurrentMonthRange(triggerDate);

    const [peopleRows, placeRows] = await Promise.all([
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
    ]);

    return res.json({
      message: "recent entities fetched",
      data: {
        label: "recent",
        month_start_date: currentMonth.month_start_date,
        month_end_date: currentMonth.month_end_date,
        people: peopleRows.map((row) => ({
          id: row.id,
          person_name: row.person_name,
        })),
        places: placeRows.map((row) => ({
          id: row.id,
          place_name: row.place_name,
        })),
      },
    });
  } catch (error) {
    console.error("GET /mypage/recent-entities error:", error);
    return res.status(500).json({
      error: true,
      message: "failed to fetch recent entities",
    });
  }
});

export default router;
