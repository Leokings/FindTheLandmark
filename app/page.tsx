"use client";

import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  answerState,
  commitSignedAnswer,
  createGameSigner,
  hydratePendingAnswers,
  markPendingBackendSaved,
  markPendingReveal,
  pendingAnswers,
  removePendingAnswer,
  restoreGameSigner,
  revealSignedAnswer,
  savePendingAnswer,
  type GameSigner,
  type PendingAnswer,
} from "@/lib/genlayer-session";

const SESSION_KEY = "find-the-landmark.tab-session.v3";
const LEGACY_SESSION_KEY = "find-the-landmark.lobby.v2";
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
  signer: GameSigner;
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
  category: "picture" | "atlas" | "genlayer";
  startedAt: string;
  endsAt: string;
  revealFallbackAt: string;
  revealDeadline: string;
  selectedIndex: number | null;
};

type RoundRecap = {
  position: number;
  kind: "identify" | "quiz";
  question: string;
  options: string[];
  correctIndex: number | null;
  correctAnswer: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  creditUrl: string | null;
  choiceIndex: number | null;
  verdict: "right" | "wrong" | "not_counted" | "void" | null;
  awardedXp: number;
};

type GameState = {
  code: string;
  realtimeGameId: string;
  status: GameStatus;
  isHost: boolean;
  maxPlayers: number;
  pack: "mixed" | "landmarks" | "genlayer";
  playerCount: number;
  roundCount: number;
  currentRoundIndex: number;
  settledRounds: number;
  voidRounds: number;
  pendingRounds: number;
  lastResult: { position: number; verdict: "right" | "wrong" | "not_counted"; awardedXp: number } | null;
  roundRecap: RoundRecap[];
  currentRound: RoundState | null;
  leaderboard: LeaderboardEntry[];
  winner: LeaderboardEntry | null;
  error: string | null;
  contractAddress: string | null;
  contractGameId: string | null;
  contractVersion: "v3" | "v4";
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
    const stored = sessionStorage.getItem(SESSION_KEY);
    const legacy = stored ? null : localStorage.getItem(LEGACY_SESSION_KEY);
    const value = JSON.parse(stored ?? legacy ?? "null") as Partial<Session> | null;
    if (
      value
      && typeof value.code === "string"
      && typeof value.displayName === "string"
      && typeof value.playerId === "string"
      && typeof value.playerToken === "string"
    ) {
      const signer = restoreGameSigner(value.signer);
      if (signer) {
        const session = { ...value, signer } as Session;
        if (legacy) {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
          localStorage.removeItem(LEGACY_SESSION_KEY);
        }
        return session;
      }
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
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
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

function sessionPayload(session: Session) {
  return {
    code: session.code,
    playerId: session.playerId,
    playerToken: session.playerToken,
  };
}

function playerId() {
  return `player-${crypto.randomUUID()}`;
}

function pendingAnswerPayload(session: Session, answer: PendingAnswer) {
  return {
    action: "answer",
    ...sessionPayload(session),
    roundIndex: answer.roundIndex,
    choiceIndex: answer.choiceIndex,
    commitment: answer.commitment,
    revealSalt: answer.salt,
    commitTransactionHash: answer.commitTxHash,
  };
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

function LastResult({ result }: { result: NonNullable<GameState["lastResult"]> }) {
  const verdict = result.verdict === "right" ? "RIGHT" : result.verdict === "wrong" ? "WRONG" : "NOT COUNTED";
  return (
    <p className={`round-feedback ${result.verdict}`} role="status">
      ROUND {String(result.position + 1).padStart(2, "0")} · {verdict} · +{result.awardedXp} XP
    </p>
  );
}

function RoundResults({ rounds }: { rounds: RoundRecap[] }) {
  if (!rounds.length) return null;
  return (
    <details className="round-results">
      <summary>ROUND RESULTS <span>{rounds.length}</span></summary>
      <ol>
        {[...rounds].reverse().map((round) => (
          <li key={round.position}>
            <div><b>{String(round.position + 1).padStart(2, "0")}</b><strong>{round.question}</strong><span>{round.verdict === "right" ? `+${round.awardedXp} XP` : round.verdict === "wrong" ? "WRONG" : round.verdict === "not_counted" ? "NOT COUNTED" : round.verdict === "void" ? "NO VERDICT" : ""}</span></div>
            <p>{round.correctAnswer ? `ANSWER · ${round.correctAnswer}` : "VALIDATORS COULD NOT AGREE · NO XP"}</p>
            {round.sourceUrl && <a href={round.sourceUrl} target="_blank" rel="noreferrer">{round.sourceLabel ?? "CHECK SOURCE"} ↗</a>}
            {!round.sourceUrl && round.creditUrl && <a href={round.creditUrl} target="_blank" rel="noreferrer">PHOTO CREDIT ↗</a>}
          </li>
        ))}
      </ol>
    </details>
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
  const [pack, setPack] = useState<GameState["pack"]>("mixed");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [session, setSession] = useState<Session | null>(storedSession);
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [answering, setAnswering] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState("");
  const [now, setNow] = useState(0);
  const [viewedResultsCode, setViewedResultsCode] = useState("");
  const recoveringAnswers = useRef(false);

  const leaveGame = useCallback(() => {
    saveSession(null);
    if (typeof window !== "undefined" && window.location.search) window.history.replaceState({}, "", window.location.pathname);
    setSession(null);
    setGame(null);
    setError("");
    setBusy(false);
    setViewedResultsCode("");
    setManualLink("");
  }, []);

  const refresh = useCallback(async (activeSession: Session, signal?: AbortSignal) => {
    try {
      const next = await gameRequest({
        action: "state",
        ...sessionPayload(activeSession),
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
    if (session) return;
    const params = new URLSearchParams(window.location.search);
    const resultCode = params.get("results")?.trim().toUpperCase();
    const roomCode = params.get("room")?.trim().toUpperCase();
    const timer = window.setTimeout(() => {
      if (resultCode && /^[A-Z2-9]{6}$/.test(resultCode)) {
        setMode("results");
        setJoinCode(resultCode);
        setViewedResultsCode(resultCode);
        void refreshResults(resultCode);
      } else if (roomCode && /^[A-Z2-9]{6}$/.test(roomCode)) {
        setMode("join");
        setJoinCode(roomCode);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshResults, session]);

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
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0 });
      document.querySelector<HTMLElement>(".round-layout")?.scrollTo({ top: 0, left: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [game?.code, game?.currentRoundIndex, gameStatus]);

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
    let refreshTimer = 0;
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
          if (refreshTimer) return;
          refreshTimer = window.setTimeout(() => {
            refreshTimer = 0;
            if (session) void refresh(session);
            else if (viewedResultsCode) void refreshResults(viewedResultsCode);
          }, 750);
        },
      )
      .subscribe();
    return () => {
      window.clearTimeout(refreshTimer);
      void realtimeClient.removeChannel(channel);
    };
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

  useEffect(() => {
    if (!session || game?.contractVersion !== "v4" || !game.contractGameId) return;
    let active = true;
    const recover = async () => {
      if (recoveringAnswers.current) return;
      recoveringAnswers.current = true;
      try {
        const signer = restoreGameSigner(session.signer);
        if (!signer) return;
        const gameAnswers = (await hydratePendingAnswers(signer)).filter((answer) => (
          answer.contractGameId === game.contractGameId
          && answer.contractAddress.toLowerCase() === game.contractAddress?.toLowerCase()
          && answer.signerAddress.toLowerCase() === signer.address.toLowerCase()
        ));
        for (const stored of gameAnswers) {
          if (!active) return;
          let answer = stored;
          if (!answer.backendSaved) {
            try {
              await gameRequest<AnswerResponse>(pendingAnswerPayload(session, answer));
              markPendingBackendSaved(answer);
              answer = { ...answer, backendSaved: true };
              setGame((current) => current?.currentRound?.position === answer.roundIndex
                ? { ...current, currentRound: { ...current.currentRound, selectedIndex: answer.choiceIndex } }
                : current);
            } catch {
              continue;
            }
          }
          const currentTime = Date.now();
          if (currentTime > answer.revealDeadlineMs) {
            if (game.status === "finished" || game.status === "error") removePendingAnswer(answer);
            continue;
          }
          if (currentTime < answer.revealFallbackAtMs) continue;
          try {
            const state = await answerState({
              contractAddress: answer.contractAddress,
              contractGameId: answer.contractGameId,
              roundIndex: answer.roundIndex,
              playerAddress: signer.address,
            });
            if (state.revealed) {
              removePendingAnswer(answer);
              continue;
            }
            const retryReveal = !answer.revealTxHash
              || currentTime - (answer.revealSubmittedAtMs ?? 0) > 30_000;
            if (retryReveal) {
              const transactionHash = await revealSignedAnswer({ signer, answer });
              markPendingReveal(answer, String(transactionHash));
            }
          } catch {
            // The next recovery pass retries while the contract reveal window is open.
          }
        }
      } finally {
        recoveringAnswers.current = false;
      }
    };
    void recover();
    const timer = window.setInterval(() => void recover(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [game?.contractAddress, game?.contractGameId, game?.contractVersion, game?.status, session]);

  const secondsLeft = useMemo(() => {
    if (!game?.currentRound?.endsAt || !now) return 0;
    return Math.max(0, Math.ceil((Date.parse(game.currentRound.endsAt) - now) / 1_000));
  }, [game?.currentRound?.endsAt, now]);

  const createOrJoin = async (action: "create" | "join", name: string, code?: string, gamePack: GameState["pack"] = "mixed") => {
    const id = playerId();
    const signer = createGameSigner();
    const response = await gameRequest({
      action,
      playerId: id,
      displayName: name,
      signerAddress: signer.address,
      ...(action === "join" ? { code } : { pack: gamePack }),
    });
    if (!response.playerToken) throw new Error("Lobby token missing.");
    const nextSession = {
      code: response.code,
      displayName: name,
      playerId: id,
      playerToken: response.playerToken,
      signer,
    };
    saveSession(nextSession);
    setSession(nextSession);
    setGame(response);
    return response;
  };

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
      await createOrJoin(mode, name, joinCode, pack);
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
      const next = await gameRequest({ action: "start", ...sessionPayload(session) });
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
      if (
        game.contractVersion !== "v4"
        || !game.contractGameId
        || !game.contractAddress
        || !/^0x[a-fA-F0-9]{40}$/.test(game.contractAddress)
      ) throw new Error("Round unavailable.");
      const existing = (await hydratePendingAnswers(session.signer)).find((entry) => (
        entry.contractGameId === game.contractGameId
        && entry.roundIndex === game.currentRound?.position
        && entry.signerAddress.toLowerCase() === session.signer.address.toLowerCase()
      ));
      let pending: PendingAnswer;
      if (existing) {
        if (existing.choiceIndex !== choiceIndex) throw new Error("Answer already locked.");
        pending = existing;
      } else {
        const proof = await commitSignedAnswer({
          signer: session.signer,
          contractAddress: game.contractAddress as `0x${string}`,
          contractGameId: game.contractGameId,
          roundIndex: game.currentRound.position,
          choiceIndex,
        });
        pending = {
          signerAddress: session.signer.address,
          contractAddress: game.contractAddress as `0x${string}`,
          contractGameId: game.contractGameId,
          roundIndex: game.currentRound.position,
          choiceIndex,
          salt: proof.salt,
          commitment: proof.commitment,
          commitTxHash: String(proof.commitTxHash),
          revealFallbackAtMs: Date.parse(game.currentRound.revealFallbackAt),
          revealDeadlineMs: Date.parse(game.currentRound.revealDeadline),
        };
        savePendingAnswer(pending);
      }
      await gameRequest<AnswerResponse>(pendingAnswerPayload(session, pending));
      markPendingBackendSaved(pending);
      setGame((current) => current?.currentRound
        ? { ...current, currentRound: { ...current.currentRound, selectedIndex: choiceIndex } }
        : current);
    } catch (caught) {
      const locked = game.contractGameId
        ? pendingAnswers(session.signer.address).some((entry) => entry.contractGameId === game.contractGameId && entry.roundIndex === game.currentRound?.position)
        : false;
      if (locked) {
        setError("Commit sent. Checking answer receipt.");
      } else {
        setError(caught instanceof Error ? caught.message : "Answer not saved.");
      }
    } finally {
      setAnswering(null);
    }
  };

  const copyCode = async () => {
    if (!game) return;
    try {
      await navigator.clipboard.writeText(game.code);
      setManualLink("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setManualLink(game.code);
    }
  };

  const copyLink = async (type: "room" | "results") => {
    if (!game) return;
    const url = new URL(window.location.origin);
    url.searchParams.set(type, game.code);
    try {
      await navigator.clipboard.writeText(url.toString());
      setManualLink("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setManualLink(url.toString());
    }
  };

  const rematch = async () => {
    if (!game || busy) return;
    setBusy(true);
    setError("");
    try {
      await createOrJoin("create", session?.displayName ?? (displayName.trim() || "Explorer"), undefined, game.pack);
      setViewedResultsCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not make a rematch.");
    } finally {
      setBusy(false);
    }
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
          <p>LOBBY GAME · 8 MAX</p>
          <h1>TEST<br />YOUR<br /><em>METTLE.</em></h1>
          <div className="home-stats" aria-label="Game format">
            <span><b>8</b> PLAYERS</span>
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
            {mode === "create" && (
              <fieldset className="pack-picker">
                <legend>GAME PACK</legend>
                {([
                  ["mixed", "WORLD TOUR"],
                  ["landmarks", "LANDMARKS"],
                  ["genlayer", "GENLAYER LAB"],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={pack === value} className={pack === value ? "active" : ""} onClick={() => setPack(value)}>{label}</button>
                ))}
              </fieldset>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-action" type="submit" disabled={busy}>{busy ? "WAIT…" : mode === "create" ? "MAKE LOBBY" : mode === "join" ? "ENTER ROOM" : "VIEW RESULTS"}<i>↗</i></button>
            {mode !== "results" ? <p className="connection-notice">PLEASE STAY CONNECTED UNTIL THE GAME ENDS</p> : null}
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
            <button type="button" className="text-action invite-action" onClick={() => void copyLink("room")}>{copied ? "LINK COPIED" : "COPY INVITE LINK ↗"}</button>
            {manualLink && <input className="share-fallback" aria-label="Room code or invite link" readOnly value={manualLink} onFocus={(event) => event.target.select()} />}
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
          <span>{sealing ? `${game.settledRounds + game.voidRounds}/${game.roundCount}` : `00/${String(game.roundCount).padStart(2, "0")}`}</span>
          <h1>{sealing ? "CHECKING\nANSWERS" : "MAKING\nTHE BOARD"}</h1>
          <div className="status-loader"><i /></div>
          {game.lastResult && <LastResult result={game.lastResult} />}
          {sealing && <p className="status-tip">CHECKED {game.settledRounds + game.voidRounds} OF {game.roundCount} ROUNDS{game.voidRounds ? ` · ${game.voidRounds} VOID` : ""}</p>}
          {!sealing ? <p className="status-tip">TIP · PLEASE STAY CONNECTED UNTIL THE GAME ENDS</p> : null}
        </section>
        <div className="status-details"><Board entries={game.leaderboard} /><RoundResults rounds={game.roundRecap} /></div>
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
          {game.voidRounds > 0 && <p className="status-tip">{game.voidRounds} ROUND{game.voidRounds === 1 ? "" : "S"} VOID · NO XP AWARDED</p>}
          {game.lastResult && <LastResult result={game.lastResult} />}
          <div className="result-actions">
            <button type="button" className="primary-action" onClick={() => void rematch()} disabled={busy}>{busy ? "MAKING LOBBY…" : "REMATCH"}<i>↗</i></button>
            <button type="button" className="text-action" onClick={() => void copyLink("results")}>{copied ? "LINK COPIED" : "SHARE RESULTS ↗"}</button>
            {manualLink && <input className="share-fallback" aria-label="Results link" readOnly value={manualLink} onFocus={(event) => event.target.select()} />}
            <button type="button" className="text-action" onClick={leaveGame}>NEW GAME</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
        <div className="result-details"><Board entries={game.leaderboard} full /><RoundResults rounds={game.roundRecap} /></div>
      </main>
    );
  }

  const round = game.currentRound;
  const pendingChoice = session && round && game.contractGameId
    ? pendingAnswers(session.signer.address).find((entry) => entry.contractGameId === game.contractGameId && entry.roundIndex === round.position)?.choiceIndex ?? null
    : null;
  const secondsUntilStart = round && now ? Math.max(0, Math.ceil((Date.parse(round.startedAt) - now) / 1_000)) : 0;
  const you = game.leaderboard.find((entry) => entry.isYou);
  const duration = round ? Math.max(1, Date.parse(round.endsAt) - Date.parse(round.startedAt)) : 1;
  const timerPercent = round ? Math.max(0, Math.min(100, ((Date.parse(round.endsAt) - now) / duration) * 100)) : 0;
  const questionLength = round?.question.trim().length ?? 0;
  const questionSize = questionLength > 64
    ? "question-long"
    : questionLength > 46
      ? "question-medium"
      : "question-short";

  return (
    <main className="game-shell round-shell" id="top">
      <GameHeader code={game.code} onExit={leaveGame} />
      <div className="round-strip">
        <span>ROUND {String(game.currentRoundIndex + 1).padStart(2, "0")}/{String(game.roundCount).padStart(2, "0")}</span>
        <b>{round?.category === "genlayer" ? "GENLAYER DOCS" : round?.category === "atlas" ? "ATLAS QUIZ" : "QUICK PICK"}</b>
        <strong>{you?.score ?? 0} XP</strong>
      </div>
      <div className="round-layout">
        <section className={`challenge-panel ${round?.kind === "quiz" ? "quiz-panel" : ""}`}>
          {round?.image ? (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={round.image} alt="Landmark to identify" />
              {round.credit && <figcaption>{round.credit}</figcaption>}
            </figure>
          ) : (
            <div className="quiz-mark" aria-hidden="true">?</div>
          )}
          <div className="challenge-copy">
            {round?.category !== "picture" && <span className="round-source">SOURCE VERIFIED AFTER ROUND</span>}
            <h1 className={questionSize}>{round?.question}</h1>
          </div>
        </section>
        <section className="answer-panel">
          <div className="timer-row">
            <span>{secondsUntilStart ? "STARTS IN" : "TIME"}</span><b>{String(secondsUntilStart || secondsLeft).padStart(2, "0")}</b>
            <i><em style={{ width: `${timerPercent}%` }} /></i>
          </div>
          <div className="answers">
            {round?.options.map((option, index) => {
              const selected = round.selectedIndex === index || answering === index || pendingChoice === index;
              return (
                <button key={option} type="button" className={selected ? "selected" : ""} disabled={round.selectedIndex !== null || answering !== null || secondsLeft === 0 || secondsUntilStart > 0 || (pendingChoice !== null && pendingChoice !== index)} onClick={() => answer(index)}>
                  <span>{String.fromCharCode(65 + index)}</span><b>{option}</b><i>{answering === index ? "SENDING" : round.selectedIndex === index ? "RECEIVED" : pendingChoice === index ? "SYNCING" : "→"}</i>
                </button>
              );
            })}
          </div>
          {round?.selectedIndex === null && pendingChoice !== null && <p className="answer-received" role="status">ANSWER SENT · CONFIRMING RECEIPT</p>}
          {round?.selectedIndex !== null && round?.selectedIndex !== undefined && <p className="answer-received" role="status">ANSWER RECEIVED · RESULT AFTER ROUND</p>}
          {game.lastResult && <LastResult result={game.lastResult} />}
          {error && <p className="form-error" role="alert">{error}</p>}
          <RoundResults rounds={game.roundRecap} />
        </section>
        <Board entries={game.leaderboard.slice(0, 8)} />
      </div>
    </main>
  );
}
