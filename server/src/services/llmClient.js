// server/src/services/llmClient.js

import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * =====================================================
 * LLM Client
 * =====================================================
 * 役割：
 * - LLM（Gemma）との通信のみを担当
 * - プロンプトの意味や用途は一切知らない
 * - 要約・編集・小説化などの責務は持たない
 *
 * このファイルは「薄く」「静か」に保つ
 * =====================================================
 */

// =========================
// 初期化
// =========================

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set");
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * 使用モデル
 * - 無料枠
 * - 日本語安定
 * - 編集用途に十分
 */
const model = genAI.getGenerativeModel({
  model: "gemma-3-27b-it",
});

// =========================
// 公開API
// =========================

/**
 * generateText
 *
 * @param {string} prompt - 完全に組み立て済みのプロンプト
 * @returns {Promise<string>} 生成されたテキスト
 *
 * この関数は：
 * - 要約しない
 * - 編集方針を持たない
 * - 成功 or throw のみ
 */
export async function generateText(prompt) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt must be a non-empty string");
  }

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;

    const text = response.text();

    if (!text || typeof text !== "string") {
      throw new Error("LLM returned empty text");
    }

    return text;
  } catch (error) {
    console.error("LLM generateText error:", error);
    throw error;
  }
}
