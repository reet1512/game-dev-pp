import { NextResponse } from "next/server"

type GameSymbol = {
  name: string
  point_value: number
}

type GameConfig = {
  theme: string
  background: string
  symbols: GameSymbol[]
  rtp: string
  volatility: string
  bonusFeatures: string[]
  coreMechanic: string
}

const fallbackSymbols: GameSymbol[] = [
  { name: "Crown", point_value: 100 },
  { name: "Gem", point_value: 60 },
  { name: "Star", point_value: 40 },
  { name: "Coin", point_value: 30 },
  { name: "Key", point_value: 20 },
  { name: "Bell", point_value: 10 },
]

function fallbackGame(prompt: string): GameConfig {
  const theme = prompt.trim() || "Classic Forge"

  return {
    theme,
    background: "Minimal black-and-white slot game interface",
    symbols: fallbackSymbols,
    rtp: "96%",
    volatility: "Medium",
    bonusFeatures: ["Three matching reels award the jackpot"],
    coreMechanic: "Match adjacent symbols for wins and all three symbols for a jackpot.",
  }
}

function toPositiveNumber(value: unknown, fallback = 10) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeGame(raw: unknown, prompt: string): GameConfig {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const fallback = fallbackGame(prompt)
  const rawSymbols = Array.isArray(source.symbols) ? source.symbols : fallback.symbols
  const symbols = rawSymbols
    .map((item, index) => {
      const symbol = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
      const name =
        typeof symbol.name === "string" && symbol.name.trim()
          ? symbol.name.trim()
          : fallback.symbols[index % fallback.symbols.length].name

      return {
        name,
        point_value: toPositiveNumber(symbol.point_value, fallback.symbols[index % fallback.symbols.length].point_value),
      }
    })
    .slice(0, 8)

  return {
    theme: typeof source.theme === "string" && source.theme.trim() ? source.theme.trim() : fallback.theme,
    background:
      typeof source.background === "string" && source.background.trim()
        ? source.background.trim()
        : fallback.background,
    symbols: symbols.length >= 3 ? symbols : fallback.symbols,
    rtp: typeof source.rtp === "string" && source.rtp.trim() ? source.rtp.trim() : fallback.rtp,
    volatility:
      typeof source.volatility === "string" && source.volatility.trim()
        ? source.volatility.trim()
        : fallback.volatility,
    bonusFeatures: Array.isArray(source.bonusFeatures)
      ? source.bonusFeatures
          .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
          .slice(0, 3)
      : typeof source.bonus === "string" && source.bonus.trim()
        ? [source.bonus.trim()]
        : fallback.bonusFeatures,
    coreMechanic:
      typeof source.coreMechanic === "string" && source.coreMechanic.trim()
        ? source.coreMechanic.trim()
        : fallback.coreMechanic,
  }
}

function parseModelContent(content: string, prompt: string) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")

  try {
    return normalizeGame(JSON.parse(cleaned), prompt)
  } catch {
    return fallbackGame(prompt)
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.GROQ_API_KEY) {
      const body = await req.json().catch(() => ({}))
      return NextResponse.json({ game: fallbackGame(String(body?.prompt || "")) })
    }

    const body = await req.json()
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },

        body: JSON.stringify({
          model: "llama-3.1-8b-instant",

          messages: [
            {
              role: "system",

              content: `
You are an AI casino game generator.

Always respond ONLY in valid JSON.

Format:

{
  "theme": "",
  "background": "",
  "symbols": [{ "name": "", "point_value": 10 }],
  "rtp": "",
  "volatility": "",
  "bonusFeatures": [],
  "coreMechanic": ""
}
`,
            },

            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
        }),
      }
    )

    if (!response.ok) {
      return NextResponse.json({ game: fallbackGame(prompt), warning: "AI provider unavailable" })
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    const game = typeof content === "string" ? parseModelContent(content, prompt) : fallbackGame(prompt)

    return NextResponse.json({ game })
  } catch (error) {
    return NextResponse.json({
      error: "Failed to generate game",
    })
  }
}
