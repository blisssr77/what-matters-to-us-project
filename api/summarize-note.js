import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { text, type } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'text'" });
    }

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
