"use client";

import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const SESSION_KEY = "find-the-landmark.lobby.v1";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const realtimeClient = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

type GameStatus = "waiting" | "registering" | "running" | "verifying" | "finished" | "error";

type Session = {
  code: string;
  displayName: string;
  playerId: string;
  playerToken: string;
};

type LeaderboardEntry = {
  rank: number;
  id: string;
  displayName: string;
  score: number;
  isHost: boolean;
  isYou: boolean;
};

type RoundState = {
  id: string;
  position: number;
  status: string;
  kind: "identify" | "quiz";
  question: string;
  options: string[];
  image: string | null;
  credit: string | null;
  creditUrl: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  startedAt: string;
  endsAt: string;
  selectedIndex: number | null;
};

type GameState = {
  code: string;
  realtimeGameId: string;
  status: GameStatus;
  isHost: boolean;
  maxPlayers: number;
  playerCount: number;
  roundCount: number;
  currentRoundIndex: number;
  settledRounds: number;
  pendingRounds: number;
  currentRound: RoundState | null;
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
  error: string | null;
  contractAddress: string;
};

type GameResponse = GameState & { playerToken?: string; error?: string };
type AnswerResponse = { accepted: true; roundId: string; selectedIndex: number; error?: string };

class GameRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function storedSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Partial<Session> | null;
    if (
      value
      && typeof value.code === "string"
      && typeof value.displayName === "string"
      && typeof value.playerId === "string"
      && typeof value.playerToken === "string"
    ) return value as Session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
  return null;
}

async function gameRequest<T extends { error?: string } = GameResponse>(
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal,
  });
  const data = await response.json().catch(() => ({ error: "Bad game response." })) as T;
  if (!response.ok) throw new GameRequestError(data.error || "Game unavailable.", response.status);
  return data;
}

function saveSession(session: Session | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function playerId() {
  return `player-${crypto.randomUUID()}`;
}

function Board({ entries, full = false }: { entries: LeaderboardEntry[]; full?: boolean }) {
  return (
    <section className={`scoreboard ${full ? "scoreboard-full" : ""}`} aria-label="Game leaderboard">
      <header><span>GAME BOARD</span><b>XP</b></header>
      <ol>
        {entries.map((entry) => (
          <li key={entry.id} className={entry.isYou ? "is-you" : ""}>
            <span>{String(entry.rank).padStart(2, "0")}</span>
            <strong>{entry.displayName}{entry.isYou ? " · YOU" : ""}</strong>
            <b>{entry.score}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GameHeader({ code, onExit }: { code: string; onExit: () => void }) {
  return (
    <header className="game-header">
      <button type="button" onClick={onExit} aria-label="Leave game">×</button>
      <a href="#top" className="game-mark" aria-label="Find the Landmark">
        <Image className="brand-symbol" src="/favicon.svg" alt="" width={42} height={42} priority />
        <span>FIND THE LANDMARK</span>
      </a>
      <span className="header-code">ROOM {code}</span>
    </header>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"create" | "join" | "results">("create");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [session, setSession] = useState<Session | null>(storedSession);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(0);
  const [viewedResultsCode, setViewedResultsCode] = useState("");

  const leaveGame = useCallback(() => {
    saveSession(null);
    setSession(null);
    setGame(null);
    setError("");
    setBusy(false);
    setViewedResultsCode("");
  }, []);

  const refresh = useCallback(async (activeSession: Session, signal?: AbortSignal) => {
    try {
      const next = await gameRequest({
        action: "state",
        code: activeSession.code,
        playerId: activeSession.playerId,
        playerToken: activeSession.playerToken,
      }, signal);
      setGame(next);
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (caught instanceof GameRequestError && caught.status === 401) {
        leaveGame();
        return;
      }
      setError(caught instanceof Error ? caught.message : "Game unavailable.");
    }
  }, [leaveGame]);

  const refreshResults = useCallback(async (code: string, signal?: AbortSignal) => {
    try {
      const next = await gameRequest({ action: "results", code }, signal);
      setGame(next);
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Results unavailable.");
    }
  }, []);

  useEffect(() => {
    if (!session || game) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(session, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [game, refresh, session]);

  const gameStatus = game?.status;
  useEffect(() => {
    if (!session || !gameStatus || gameStatus === "finished" || gameStatus === "error") return;
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      await refresh(session, controller.signal);
      const interval = game?.isHost ? (gameStatus === "waiting" ? 10_000 : 4_000) : 18_000;
      if (active) timer = window.setTimeout(poll, interval + Math.floor(Math.random() * 1_500));
    };
    timer = window.setTimeout(poll, game?.isHost ? 2_000 : 12_000 + Math.floor(Math.random() * 2_000));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
    };
  }, [game?.isHost, gameStatus, refresh, session]);

  useEffect(() => {
    if (!realtimeClient || !game?.realtimeGameId || game.status === "finished" || game.status === "error") return;
    const channel = realtimeClient
      .channel(`landmark-game-${game.realtimeGameId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "landmark_game_events",
          filter: `game_id=eq.${game.realtimeGameId}`,
        },
        () => {
          if (session) void refresh(session);
          else if (viewedResultsCode) void refreshResults(viewedResultsCode);
        },
      )
      .subscribe();
    return () => { void realtimeClient.removeChannel(channel); };
  }, [game?.realtimeGameId, game?.status, refresh, refreshResults, session, viewedResultsCode]);

  useEffect(() => {
    if (!session || !game?.isHost || game.status !== "running" || !game.currentRound?.endsAt) return;
    const delay = Math.max(250, Date.parse(game.currentRound.endsAt) - Date.now() + 350);
    const timer = window.setTimeout(() => void refresh(session), delay);
    return () => window.clearTimeout(timer);
  }, [game?.currentRound?.endsAt, game?.isHost, game?.status, refresh, session]);

  useEffect(() => {
    if (game?.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [game?.status]);

  const secondsLeft = useMemo(() => {
    if (!game?.currentRound?.endsAt) return 0;
    return Math.max(0, Math.ceil((Date.parse(game.currentRound.endsAt) - now) / 1_000));
  }, [game?.currentRound?.endsAt, now]);

  const enterLobby = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "results") {
      const code = joinCode.trim().toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(code)) {
        setError("Enter a game code.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const response = await gameRequest({ action: "results", code });
        setViewedResultsCode(code);
        setGame(response);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Results unavailable.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const name = displayName.replace(/\s+/g, " ").trim();
    if (!name) {
      setError("Enter a player name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = playerId();
      const response = await gameRequest({
        action: mode,
        playerId: id,
        displayName: name,
        ...(mode === "join" ? { code: joinCode } : {}),
      });
      if (!response.playerToken) throw new Error("Lobby token missing.");
      const nextSession = {
        code: response.code,
        displayName: name,
        playerId: id,
        playerToken: response.playerToken,
      };
      saveSession(nextSession);
      setSession(nextSession);
      setGame(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not enter lobby.");
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await gameRequest({ action: "start", ...session });
      setGame(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  };

  const answer = async (choiceIndex: number) => {
    if (!session || !game?.currentRound || game.currentRound.selectedIndex !== null || answering !== null) return;
    setAnswering(choiceIndex);
    setError("");
    try {
      await gameRequest<AnswerResponse>({ action: "answer", ...session, choiceIndex });
      setGame((current) => current?.currentRound
        ? { ...current, currentRound: { ...current.currentRound, selectedIndex: choiceIndex } }
        : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Answer not saved.");
    } finally {
      setAnswering(null);
    }
  };

  const copyCode = async () => {
    if (!game) return;
    await navigator.clipboard.writeText(game.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  if (!game) {
    return (
      <main className="home-shell" id="top">
        <header className="home-header">
          <span className="home-mark">
            <Image className="brand-symbol" src="/favicon.svg" alt="Find the Landmark" width={48} height={48} priority />
          </span>
          <span className="brand-name">FIND THE LANDMARK</span>
          <i>GENLAYER</i>
        </header>

        <section className="home-title">
          <p>LOBBY GAME · 50 MAX</p>
          <h1>TEST<br />YOUR<br /><em>METTLE.</em></h1>
          <div className="home-stats" aria-label="Game format">
            <span><b>50</b> PLAYERS</span>
            <span><b>12</b> ROUNDS</span>
            <span><b>00</b> START XP</span>
          </div>
        </section>

        <section className="entry-panel">
          <div className="mode-switch" role="tablist" aria-label="Lobby action">
            <button type="button" className={mode === "create" ? "active" : ""} onClick={() => { setMode("create"); setError(""); }} role="tab" aria-selected={mode === "create"}>CREATE</button>
            <button type="button" className={mode === "join" ? "active" : ""} onClick={() => { setMode("join"); setError(""); }} role="tab" aria-selected={mode === "join"}>JOIN</button>
            <button type="button" className={mode === "results" ? "active" : ""} onClick={() => { setMode("results"); setError(""); }} role="tab" aria-selected={mode === "results"}>RESULTS</button>
          </div>
          <form onSubmit={enterLobby}>
            {mode !== "results" && (
              <label>
                <span>PLAYER NAME</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={24} placeholder="Atlas Ace" autoComplete="nickname" />
              </label>
            )}
            {mode !== "create" && (
              <label>
                <span>{mode === "results" ? "GAME CODE" : "ROOM CODE"}</span>
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} maxLength={6} placeholder="MAP123" autoCapitalize="characters" autoComplete="off" />
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-action" type="submit" disabled={busy}>{busy ? "WAIT…" : mode === "create" ? "MAKE LOBBY" : mode === "join" ? "ENTER ROOM" : "VIEW RESULTS"}<i>↗</i></button>
          </form>
          <footer><span>PICTURE PICKS</span><span>ATLAS</span><span>GENLAYER DOCS</span></footer>
        </section>
      </main>
    );
  }

  if (game.status === "waiting") {
    return (
      <main className="game-shell waiting-shell" id="top">
        <GameHeader code={game.code} onExit={leaveGame} />
        <div className="waiting-grid">
          <section className="code-panel">
            <span>ROOM CODE</span>
            <button type="button" className="room-code" onClick={copyCode}>{game.code}</button>
            <p>{copied ? "COPIED" : "TAP TO COPY"}</p>
            <b>{game.playerCount}/{game.maxPlayers} IN</b>
            {game.isHost ? (
              <button type="button" className="primary-action start-action" onClick={startGame} disabled={busy || game.playerCount < 2}>{busy ? "STARTING…" : game.playerCount < 2 ? "NEED 2 PLAYERS" : "START GAME"}<i>→</i></button>
            ) : <strong className="waiting-note">WAITING FOR HOST</strong>}
            {error && <p className="form-error" role="alert">{error}</p>}
          </section>
          <section className="roster-panel">
            <header><span>PLAYERS</span><b>{game.playerCount}</b></header>
            <ol>
              {game.leaderboard.map((entry, index) => (
                <li key={entry.id} className={entry.isYou ? "is-you" : ""}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>{entry.displayName}</b>
                  <i>{entry.isHost ? "HOST" : entry.isYou ? "YOU" : "READY"}</i>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    );
  }

  if (game.status === "registering" || game.status === "verifying") {
    const sealing = game.status === "verifying";
    return (
      <main className="game-shell status-shell" id="top">
        <GameHeader code={game.code} onExit={leaveGame} />
        <section className="status-poster">
          <span>{sealing ? `${game.settledRounds}/${game.roundCount}` : `00/${String(game.roundCount).padStart(2, "0")}`}</span>
          <h1>{sealing ? "SEALING\nSCORES" : "MAKING\nTHE BOARD"}</h1>
          <div className="status-loader"><i /></div>
        </section>
        <Board entries={game.leaderboard} />
        {error && <p className="floating-error" role="alert">{error}</p>}
      </main>
    );
  }

  if (game.status === "error") {
    return (
      <main className="game-shell result-shell result-error" id="top">
        <GameHeader code={game.code} onExit={leaveGame} />
        <section className="result-copy">
          <span>NO SCORE</span>
          <h1>GAME<br />STOPPED.</h1>
          <p>{game.error || "Try a new room."}</p>
          <button type="button" className="primary-action" onClick={leaveGame}>NEW LOBBY<i>↗</i></button>
        </section>
      </main>
    );
  }

  if (game.status === "finished") {
    return (
      <main className="game-shell result-shell" id="top">
        <GameHeader code={game.code} onExit={leaveGame} />
        <section className="winner-panel">
          <span>WINNER</span>
          <h1>{game.winner?.displayName || "TIE GAME"}</h1>
          <strong>{game.winner?.score ?? 0} XP</strong>
          <button type="button" className="primary-action" onClick={leaveGame}>NEW LOBBY<i>↗</i></button>
        </section>
        <Board entries={game.leaderboard} full />
      </main>
    );
  }

  const round = game.currentRound;
  const you = game.leaderboard.find((entry) => entry.isYou);
  const duration = round ? Math.max(1, Date.parse(round.endsAt) - Date.parse(round.startedAt)) : 1;
  const timerPercent = round ? Math.max(0, Math.min(100, ((Date.parse(round.endsAt) - now) / duration) * 100)) : 0;

  return (
    <main className="game-shell round-shell" id="top">
      <GameHeader code={game.code} onExit={leaveGame} />
      <div className="round-strip">
        <span>ROUND {String(game.currentRoundIndex + 1).padStart(2, "0")}/{String(game.roundCount).padStart(2, "0")}</span>
        <b>{round?.sourceUrl ? "GENLAYER DOCS" : round?.kind === "quiz" ? "ATLAS QUIZ" : "QUICK PICK"}</b>
        <strong>{you?.score ?? 0} XP</strong>
      </div>
      <div className="round-layout">
        <section className={`challenge-panel ${round?.kind === "quiz" ? "quiz-panel" : ""}`}>
          {round?.image ? (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={round.image} alt="Landmark to identify" />
              {round.creditUrl && <figcaption><a href={round.creditUrl} target="_blank" rel="noreferrer">{round.credit}</a></figcaption>}
            </figure>
          ) : (
            <div className="quiz-mark" aria-hidden="true">?</div>
          )}
          <div className="challenge-copy">
            {round?.sourceUrl && (
              <a className="round-source" href={round.sourceUrl} target="_blank" rel="noreferrer">
                SOURCE · {round.sourceLabel ?? "GENLAYER DOCS"} ↗
              </a>
            )}
            <h1>{round?.question}</h1>
          </div>
        </section>
        <section className="answer-panel">
          <div className="timer-row">
            <span>TIME</span><b>{String(secondsLeft).padStart(2, "0")}</b>
            <i><em style={{ width: `${timerPercent}%` }} /></i>
          </div>
          <div className="answers">
            {round?.options.map((option, index) => {
              const selected = round.selectedIndex === index || answering === index;
              return (
                <button key={option} type="button" className={selected ? "selected" : ""} disabled={round.selectedIndex !== null || answering !== null || secondsLeft === 0} onClick={() => answer(index)}>
                  <span>{String.fromCharCode(65 + index)}</span><b>{option}</b><i>{selected ? "LOCKED" : "→"}</i>
                </button>
              );
            })}
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
        <Board entries={game.leaderboard.slice(0, 8)} />
      </div>
    </main>
  );
}
