// server/src/routes/myPageMonthlyEntities.js
import express from "express";
import { findUniquePeopleMentionsByUserAndMonth } from "../dao/dailyLogPeopleMentionsDao.js";
import { findUniquePlaceMentionsByUserAndMonth } from "../dao/dailyLogPlaceMentionsDao.js";

const router = express.Router();

function parseYearMonth(yearMonth) {
  const matched = /^(\d{4})-(\d{2})$/.exec(yearMonth);

  if (!matched) {
    throw new Error("year_month must be YYYY-MM format");
  }

  const year = Number(matched[1]);
  const month = Number(matched[2]);

  if (month < 1 || month > 12) {
    throw new Error("year_month month must be between 01 and 12");
  }

  return { year, month };
}

function formatDateToYmd(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthRange(yearMonth) {
  const { year, month } = parseYearMonth(yearMonth);

  const monthStartDate = new Date(year, month - 1, 1);
  const nextMonthStartDate = new Date(year, month, 1);
  const monthEndDate = new Date(
    nextMonthStartDate.getTime() - 24 * 60 * 60 * 1000,
  );

  return {
    month_start_date: formatDateToYmd(monthStartDate),
    month_end_date: formatDateToYmd(monthEndDate),
  };
}

/**
 * GET /mypage/monthly-entities?user_id=xxx&year_month=2026-03
 *
 * 役割：
 * - 指定月に出現した人物 / 場所を返す
 * - daily_log_people_mentions / daily_log_place_mentions を元にする
 */
router.get("/", async (req, res) => {
  try {
    const { user_id, year_month } = req.query;

    if (!user_id) {
      return res.status(400).json({
        error: true,
        message: "user_id is required",
      });
    }

    if (!year_month) {
      return res.status(400).json({
        error: true,
        message: "year_month is required",
      });
    }

    const { month_start_date, month_end_date } = getMonthRange(
      String(year_month),
    );

    const [peopleRows, placeRows] = await Promise.all([
      findUniquePeopleMentionsByUserAndMonth(
        String(user_id),
        month_start_date,
        month_end_date,
      ),
      findUniquePlaceMentionsByUserAndMonth(
        String(user_id),
        month_start_date,
        month_end_date,
      ),
    ]);

    return res.json({
      message: "monthly entities fetched",
      data: {
        year_month: String(year_month),
        month_start_date,
        month_end_date,
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
    console.error("GET /mypage/monthly-entities error:", error);

    return res.status(500).json({
      error: true,
      message: "failed to fetch monthly entities",
    });
  }
});

export default router;
