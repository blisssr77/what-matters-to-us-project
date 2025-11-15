import OpenAI from "openai";

const allowedOrigins = [
  "http://localhost:5173",
  "https://what-matters-to-us-project-ov13.vercel.app",
];

function getCorsHeaders(origin) {
  const safeOrigin = allowedOrigins.includes(origin)
    ? origin
    : "https://what-matters-to-us-project-ov13.vercel.app";

  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const corsHeaders = getCorsHeaders(origin);

  // Always set CORS headers
  res.setHeader("Access-Control-Allow-Origin", corsHeaders["Access-Control-Allow-Origin"]);
  res.setHeader("Access-Control-Allow-Methods", corsHeaders["Access-Control-Allow-Methods"]);
  res.setHeader("Access-Control-Allow-Headers", corsHeaders["Access-Control-Allow-Headers"]);

  // 1) Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 2) Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { text, type } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'text'" });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const systemMessage =
      type === "private"
        ? "Summarize this private note in 3-6 short bullet points."
        : "Summarize this public note in 2-3 concise sentences.";

    const result = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text },
      ],
      temperature: 0.4,
      max_tokens: 256,
    });

    const summary = result.choices[0]?.message?.content?.trim() || "";

    return res.status(200).json({ summary });
  } catch (err) {
    console.error("AI summarize error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
