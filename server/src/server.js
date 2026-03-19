// server/src/server.js

// ★ 必ず一番上・他の import より前
import "dotenv/config";
import express from "express";
// import summarizeRoute from "./routes/summarize.js";
import cors from "cors";
// import ipFilter from "./middleware/ipFilter.js";
import { checkDbConnection } from "./db/pool.js";
import dailyLogsRouter from "./routes/dailyLogs.js";
import warmupRouter from "./routes/warmup.js";
import testUsersRouter from "./routes/testUsers.js"; // 商用向け改修時外す
import usersRouter from "./routes/users.js";
import myPageRouter from "./routes/myPage.js";
import myPageRecentEntitiesRouter from "./routes/myPageRecentEntities.js";
import myPageWeeklyRouter from "./routes/myPageWeekly.js";
import myPageMonthlyRouter from "./routes/myPageMonthly.js";
import myPageMonthlySummaryEntitiesRouter from "./routes/myPageMonthlySummaryEntities.js";
import myPageCurrentMonthEntitiesRouter from "./routes/myPageCurrentMonthEntities.js";

const app = express();
const allowedOrigins = [
  "https://cacoca-frontend-28zzh95hc-yosuke23s-projects.vercel.app",
  "http://localhost:3000",
];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

// === クライアントIP確認ログ（ipFilterの動作確認のためのログ） ===
app.use((req, res, next) => {
  console.log("X-Forwarded-For:", req.headers["x-forwarded-for"]);
  console.log("RemoteAddress:", req.socket.remoteAddress);
  next();
});

// Warm up for render free plan※Warm up だけは IPフィルタの前に置く（=除外される）
app.use("/warmup", warmupRouter);
// ★ IPフィルタをすべてのAPIに適用
// app.use(ipFilter);

// 商用向け改修時外す
app.use("/test-users", testUsersRouter);

// API routes
app.use("/daily-logs", dailyLogsRouter);
app.use("/mypage", myPageRouter);
app.use("/mypage/recent-entities", myPageRecentEntitiesRouter);
app.use("/mypage/weekly", myPageWeeklyRouter);
app.use("/mypage/monthly", myPageMonthlyRouter);
app.use("/mypage/monthly-summary-entities", myPageMonthlySummaryEntitiesRouter);
app.use("/mypage/current-month-entities", myPageCurrentMonthEntitiesRouter);

// ユーザーステータス取得
app.use("/users", usersRouter);

// Health check（Render が使用）
app.get("/", (req, res) => {
  res.json({ message: "DailyLog API is running" });
});

const port = process.env.PORT || 8080;
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  await checkDbConnection();
});
