// server/src/server.js

// ★ 必ず一番上・他の import より前
import "dotenv/config";
import express from "express";
// import summarizeRoute from "./routes/summarize.js";
import cors from "cors";
import ipFilter from "./middleware/ipFilter.js";
import { checkDbConnection } from "./db/pool.js";
import dailyLogsRouter from "./routes/dailyLogs.js";
import warmupRouter from "./routes/warmup.js";
import testUsersRouter from "./routes/testUsers.js"; // 商用向け改修時外す
import usersRouter from "./routes/users.js";

const app = express();
app.use(cors());
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
app.use(ipFilter);

// 商用向け改修時外す
app.use("/test-users", testUsersRouter);

// API routes
app.use("/daily-logs", dailyLogsRouter);
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
