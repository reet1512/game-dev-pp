"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

type SlotSymbol = {
  name: string
  point_value: number
}

type GameConfig = {
  theme: string
  background?: string
  symbols: SlotSymbol[]
  rtp?: string
  volatility?: string
  bonusFeatures?: string[]
  coreMechanic?: string
}

const SPIN_COST = 50
const SPIN_DURATION = 1400

const defaultSymbols: SlotSymbol[] = [
  { name: "Crown", point_value: 100 },
  { name: "Gem", point_value: 60 },
  { name: "Star", point_value: 40 },
  { name: "Coin", point_value: 30 },
  { name: "Key", point_value: 20 },
  { name: "Bell", point_value: 10 },
]

function toPositiveNumber(value: unknown, fallback = 10) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeSymbols(symbols: unknown): SlotSymbol[] {
  if (!Array.isArray(symbols)) {
    return defaultSymbols
  }

  const normalized = symbols
    .map((item, index) => {
      const source = item && typeof item === "object" ? (item as Record<string, unknown>) : {}
      const fallback = defaultSymbols[index % defaultSymbols.length]
      const name = typeof source.name === "string" && source.name.trim() ? source.name.trim() : fallback.name

      return {
        name,
        point_value: toPositiveNumber(source.point_value, fallback.point_value),
      }
    })
    .filter((symbol) => symbol.name)
    .slice(0, 8)

  return normalized.length >= 3 ? normalized : defaultSymbols
}

function normalizeGame(raw: unknown, prompt: string): GameConfig {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const bonusFeatures = Array.isArray(source.bonusFeatures)
    ? source.bonusFeatures
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .slice(0, 3)
    : typeof source.bonus === "string" && source.bonus.trim()
      ? [source.bonus.trim()]
      : []

  return {
    theme:
      typeof source.theme === "string" && source.theme.trim()
        ? source.theme.trim()
        : prompt.trim() || "Untitled Slot",
    background: typeof source.background === "string" ? source.background : "",
    symbols: normalizeSymbols(source.symbols),
    rtp: typeof source.rtp === "string" ? source.rtp : "96%",
    volatility: typeof source.volatility === "string" ? source.volatility : "Medium",
    bonusFeatures,
    coreMechanic:
      typeof source.coreMechanic === "string" && source.coreMechanic.trim()
        ? source.coreMechanic.trim()
        : "Match adjacent symbols for a small win. Match all three reels for a jackpot.",
  }
}

function parseLegacyChoice(payload: unknown, prompt: string) {
  const source = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const choices = Array.isArray(source.choices) ? source.choices : []
  const firstChoice = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {}
  const message = firstChoice.message && typeof firstChoice.message === "object" ? firstChoice.message as Record<string, unknown> : {}
  const content = typeof message.content === "string" ? message.content.trim() : ""

  if (!content) {
    return null
  }

  try {
    return normalizeGame(JSON.parse(content), prompt)
  } catch {
    return null
  }
}

function symbolLabel(name: string) {
  return name.length > 6 ? name.slice(0, 6) : name
}

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [gameData, setGameData] = useState<GameConfig | null>(null)
  const [credits, setCredits] = useState(1000)
  const [spinning, setSpinning] = useState(false)
  const [spinRun, setSpinRun] = useState(0)
  const [reelValues, setReelValues] = useState([0, 1, 2])
  const [winnings, setWinnings] = useState(0)
  const [isJackpot, setIsJackpot] = useState(false)
  const [activity, setActivity] = useState<string[]>([])
  const [error, setError] = useState("")
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const symbols = useMemo(() => normalizeSymbols(gameData?.symbols), [gameData])
  const canGenerate = Boolean(prompt.trim()) && !loading && !spinning
  const canSpin = Boolean(gameData) && !loading && !spinning && credits >= SPIN_COST

  useEffect(() => {
    return () => {
      if (spinTimerRef.current) {
        clearTimeout(spinTimerRef.current)
      }
    }
  }, [])

  const addActivity = (message: string) => {
    setActivity((previous) => [message, ...previous].slice(0, 5))
  }

  async function generateGame() {
    const trimmedPrompt = prompt.trim()

    if (!trimmedPrompt || loading || spinning) {
      return
    }

    setLoading(true)
    setError("")
    setGameData(null)
    setCredits(1000)
    setWinnings(0)
    setIsJackpot(false)
    setReelValues([0, 1, 2])
    setActivity(["Starting game generation"])

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error || "Generation failed")
            : "Generation failed"
        )
      }

      const source = payload && typeof payload === "object" && "game" in payload
        ? (payload as { game?: unknown }).game
        : parseLegacyChoice(payload, trimmedPrompt)

      const nextGame = normalizeGame(source, trimmedPrompt)
      setGameData(nextGame)
      setReelValues([0, 1, 2].map((index) => index % nextGame.symbols.length))
      addActivity("Game configuration ready")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed"
      setError(message)
      addActivity(message)
    } finally {
      setLoading(false)
    }
  }

  function handleSpin() {
    if (!canSpin) {
      return
    }

    const activeSymbols = symbols.length >= 3 ? symbols : defaultSymbols

    if (spinTimerRef.current) {
      clearTimeout(spinTimerRef.current)
    }

    setSpinning(true)
    setSpinRun((run) => run + 1)
    setWinnings(0)
    setIsJackpot(false)
    setCredits((current) => Math.max(0, current - SPIN_COST))
    setError("")
    addActivity("Reels spinning")

    spinTimerRef.current = setTimeout(() => {
      const nextReelValues = [0, 1, 2].map(() => Math.floor(Math.random() * activeSymbols.length))
      const resultSymbols = nextReelValues.map((value) => activeSymbols[value] || activeSymbols[0])
      const first = resultSymbols[0]
      const second = resultSymbols[1]
      const third = resultSymbols[2]
      let winAmount = 0
      let jackpot = false

      if (first.name === second.name && second.name === third.name) {
        winAmount = toPositiveNumber(first.point_value) * 15
        jackpot = true
      } else if (first.name === second.name) {
        winAmount = toPositiveNumber(first.point_value) * 3
      } else if (second.name === third.name) {
        winAmount = toPositiveNumber(second.point_value) * 3
      }

      setReelValues(nextReelValues)
      setWinnings(winAmount)
      setIsJackpot(jackpot)
      setCredits((current) => current + winAmount)
      setSpinning(false)
      addActivity(winAmount > 0 ? `${jackpot ? "Jackpot" : "Win"}: +${winAmount} credits` : "No match")
    }, SPIN_DURATION)
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <style>{`
        @keyframes reel-roll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .reel-spin {
          animation: reel-roll ${SPIN_DURATION}ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
      `}</style>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-white/15 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-white/55">Game generator</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal sm:text-4xl">Forge AI</h1>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-left shadow-sm sm:text-right">
            <p className="text-xs uppercase tracking-[0.22em] text-white/50">Credits</p>
            <p className="mt-1 text-2xl font-semibold">{credits}</p>
          </div>
        </header>

        <section className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,280px)]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 shadow-sm">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-white/65">Game Engine</h2>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={loading || spinning}
                placeholder="Describe the slot game..."
                className="mt-4 h-28 w-full resize-none rounded-xl border border-white/15 bg-black p-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/45 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={generateGame}
                disabled={!canGenerate}
                className="mt-3 w-full rounded-xl border border-white bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/10 disabled:text-white/35"
              >
                {loading ? "Generating..." : "Generate Game"}
              </button>
              {error && <p className="mt-3 text-sm text-white/65">{error}</p>}
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 shadow-sm">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-white/65">Activity</h2>
              <div className="mt-4 space-y-2 text-sm text-white/65">
                {activity.length > 0 ? activity.map((item, index) => <p key={`${item}-${index}`}>{item}</p>) : <p>Waiting.</p>}
              </div>
            </div>
          </aside>

          <section className="relative flex items-center justify-center rounded-3xl border border-white/15 bg-white/[0.025] p-4 shadow-sm sm:p-6">
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-black/80"
                >
                  <div className="text-center">
                    <div className="mx-auto h-9 w-9 rounded-full border border-white/20 border-t-white motion-safe:animate-spin" />
                    <p className="mt-4 text-sm text-white/70">Generating game...</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="w-full max-w-2xl">
              <div className="mb-5 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-white/45">
                  {gameData ? gameData.theme : "Create a game to unlock spins"}
                </p>
                <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Slot Forge</h2>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {[0, 1, 2].map((reelNumber) => {
                  const value = reelValues[reelNumber] ?? 0
                  const safeValue = value >= 0 && value < symbols.length ? value : 0
                  const reelStrip = [...symbols, ...symbols]

                  return (
                    <div
                      key={reelNumber}
                      className={`relative h-32 overflow-hidden rounded-2xl border bg-black sm:h-40 ${
                        isJackpot ? "border-white" : "border-white/20"
                      }`}
                    >
                      <div
                        key={`${spinRun}-${reelNumber}`}
                        className={`flex flex-col ${spinning ? "reel-spin" : ""}`}
                        style={!spinning ? { transform: `translateY(-${safeValue * 100}%)` } : undefined}
                      >
                        {reelStrip.map((symbol, index) => (
                          <div
                            key={`${symbol.name}-${index}`}
                            className="flex h-32 shrink-0 flex-col items-center justify-center border-b border-white/10 px-2 text-center sm:h-40"
                          >
                            <span className="max-w-full truncate text-xl font-semibold sm:text-2xl">
                              {symbolLabel(symbol.name)}
                            </span>
                            <span className="mt-2 text-xs text-white/45">{symbol.point_value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-16 -translate-y-1/2 border-y border-white/25" />
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={handleSpin}
                disabled={!canSpin}
                className="mt-5 w-full rounded-2xl border border-white bg-white px-5 py-4 text-base font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/10 disabled:text-white/35"
              >
                {spinning
                  ? "Spinning..."
                  : !gameData
                    ? "Generate a game first"
                    : credits < SPIN_COST
                      ? "Insufficient credits"
                      : `Spin (-${SPIN_COST})`}
              </button>

              <AnimatePresence>
                {winnings > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="mt-4 rounded-2xl border border-white/20 bg-white/[0.04] p-4 text-center shadow-sm"
                  >
                    <p className="text-sm uppercase tracking-[0.22em] text-white/50">{isJackpot ? "Jackpot" : "Win"}</p>
                    <p className="mt-1 text-3xl font-semibold">+{winnings}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 shadow-sm">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-white/65">Game Specs</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/40">Theme</p>
                  <p className="mt-1 text-white/85">{gameData?.theme || "Not generated"}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/40">RTP</p>
                    <p className="mt-1 text-white/85">{gameData?.rtp || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/40">Volatility</p>
                    <p className="mt-1 text-white/85">{gameData?.volatility || "-"}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/40">Mechanic</p>
                  <p className="mt-1 text-white/70">{gameData?.coreMechanic || "Generate a game to view mechanics."}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 shadow-sm">
              <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-white/65">Symbols</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {symbols.map((symbol, index) => (
                  <div key={`${symbol.name}-${index}`} className="rounded-xl border border-white/10 p-3 text-center">
                    <p className="truncate text-sm font-medium">{symbolLabel(symbol.name)}</p>
                    <p className="mt-1 text-xs text-white/45">{symbol.point_value}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
