// server/src/db/pool.js
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Transaction Pooling 前提なので最小設定
  ssl: {
    rejectUnauthorized: false,
  },
});

// 起動時に接続確認（失敗したら即わかる）
export async function checkDbConnection() {
  try {
    const res = await pool.query("SELECT 1");
    console.log("✅ DB connected:", res.rows[0]);
  } catch (err) {
    console.error("❌ DB connection failed:", err);
    throw err;
  }
}
