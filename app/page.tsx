"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type IdentifyRound = {
  type: "identify";
  place: string;
  city: string;
  image: string;
  credit: string;
  creditUrl: string;
  options: string[];
};

type HuntRound = {
  type: "hunt";
  huntId: "hunt-colosseum-001" | "hunt-eiffel-001";
  place: string;
  city: string;
  clue: string;
};

type Round = IdentifyRound | HuntRound;
type Screen = "home" | "playing" | "result" | "finished";
type ResultKind =
  | "correct"
  | "wrong"
  | "expired"
  | "accepted"
  | "rejected"
  | "pending"
  | "closed"
  | "unverified";

type ProofResponse = {
  status?: "accepted" | "rejected" | "pending" | "not_verified";
  rewardXp?: number;
  transactionHash?: string;
  consensusStatus?: string;
  explorerUrl?: string;
  error?: string;
};

const CONTRACT_ADDRESS = "0xE14e50069F700F4C72ca9d59c1eb950b04342b7a";
const EXPLORER_URL = "https://explorer-studio.genlayer.com";

const rounds: Round[] = [
  {
    type: "identify",
    place: "Taj Mahal",
    city: "Agra, India",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Taj_Mahal%2C_Agra%2C_India_edit2.jpg/1280px-Taj_Mahal%2C_Agra%2C_India_edit2.jpg",
    credit: "Joel Godwin / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Taj_Mahal,_Agra,_India_edit2.jpg",
    options: ["Humayun's Tomb", "Taj Mahal", "Lotus Temple", "Hawa Mahal"],
  },
  {
    type: "identify",
    place: "Christ the Redeemer",
    city: "Rio de Janeiro, Brazil",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Christtheredeemer.jpg/1280px-Christtheredeemer.jpg",
    credit: "Wolffystyle / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Christtheredeemer.jpg",
    options: ["Christ the Redeemer", "Cristo Rei", "The Motherland Calls", "Sacred Heart"],
  },
  {
    type: "hunt",
    huntId: "hunt-colosseum-001",
    place: "The Colosseum",
    city: "Rome, Italy",
    clue: "Find a real exterior photo with the recognizable rows of arches clearly visible.",
  },
  {
    type: "identify",
    place: "Sydney Opera House",
    city: "Sydney, Australia",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Sydney_Opera_House_from_Circular_Quay.jpg/960px-Sydney_Opera_House_from_Circular_Quay.jpg",
    credit: "Richard Schneider / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Sydney_Opera_House_from_Circular_Quay.jpg",
    options: ["The Guggenheim", "Marina Bay Sands", "Sydney Opera House", "Lotus Temple"],
  },
  {
    type: "hunt",
    huntId: "hunt-eiffel-001",
    place: "The Eiffel Tower",
    city: "Paris, France",
    clue: "Find a real photo showing most of the tower clearly, not a cropped detail.",
  },
];

const showcase = [rounds[0], rounds[1], rounds[3]] as IdentifyRound[];

function roundTime(round: Round) {
  return round.type === "hunt" ? 90 : 20;
}

function timeLabel(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function playerId() {
  const key = "find-the-landmark.player.v1";
  const existing = window.localStorage.getItem(key);
  if (existing && /^[A-Za-z0-9_-]{12,100}$/.test(existing)) return existing;
  const created = `player-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

function resultMessage(resultKind: ResultKind, round: Round) {
  const copy: Record<ResultKind, { kicker: string; title: string; body: string }> = {
    correct: { kicker: "STAMP EARNED", title: "You know this place.", body: `${round.place} · ${round.city}` },
    wrong: { kicker: "ROUTE MISSED", title: "Not this stop.", body: `The answer was ${round.place}.` },
    expired: { kicker: "TIME'S UP", title: "The route moved on.", body: `This stop was ${round.place}.` },
    accepted: { kicker: "FIRST PROOF ACCEPTED", title: "You claimed the landmark.", body: "Validator consensus locked your win on Studionet." },
    rejected: { kicker: "PROOF NOT ACCEPTED", title: "That photo did not clear every check.", body: "Try a clearer, wider photo when this hunt appears again." },
    pending: { kicker: "CONSENSUS PENDING", title: "Validators are still looking.", body: "Your transaction is live, but no final result was ready yet." },
    closed: { kicker: "HUNT CLAIMED", title: "Another explorer got there first.", body: "The first accepted proof already won this landmark." },
    unverified: { kicker: "NO CONSENSUS", title: "This proof was not finalized.", body: "No XP was awarded because validator consensus was not reached." },
  };
  return copy[resultKind];
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [roundIndex, setRoundIndex] = useState(0);
  const [seconds, setSeconds] = useState(roundTime(rounds[0]));
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "checking">("idle");
  const [proofError, setProofError] = useState("");
  const [resultKind, setResultKind] = useState<ResultKind>("correct");
  const [earnedXp, setEarnedXp] = useState(0);
  const [proofMeta, setProofMeta] = useState<ProofResponse | null>(null);
  const answerTimer = useRef<number | null>(null);

  const round = rounds[roundIndex];
  const isLastRound = roundIndex === rounds.length - 1;
  const progress = ((roundIndex + (screen === "result" ? 1 : 0)) / rounds.length) * 100;
  const stageKey = `${screen}-${roundIndex}`;

  useEffect(() => {
    if (screen !== "playing" || seconds <= 0 || verifyState === "checking") return;
    const timer = window.setTimeout(() => {
      if (seconds === 1) {
        setSeconds(0);
        setEarnedXp(0);
        setResultKind("expired");
        setScreen("result");
      } else {
        setSeconds((value) => value - 1);
      }
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [screen, seconds, verifyState]);

  const resultCopy = resultMessage(resultKind, round);

  useEffect(() => () => {
    if (answerTimer.current !== null) window.clearTimeout(answerTimer.current);
  }, []);

  function resetRound(index: number) {
    setRoundIndex(index);
    setSeconds(roundTime(rounds[index]));
    setSelected(null);
    setImageUrl("");
    setVerifyState("idle");
    setProofError("");
    setProofMeta(null);
    setEarnedXp(0);
  }

  function beginRun() {
    if (answerTimer.current !== null) window.clearTimeout(answerTimer.current);
    setScore(0);
    resetRound(0);
    setScreen("playing");
  }

  function chooseAnswer(option: string) {
    if (round.type !== "identify" || selected) return;
    const correct = option === round.place;
    const points = correct ? 100 + seconds * 2 : 0;
    setSelected(option);
    setResultKind(correct ? "correct" : "wrong");
    setEarnedXp(points);
    if (points) setScore((value) => value + points);
    answerTimer.current = window.setTimeout(() => {
      setScreen("result");
      answerTimer.current = null;
    }, 420);
  }

  async function submitProof() {
    if (round.type !== "hunt" || verifyState === "checking") return;
    setVerifyState("checking");
    setProofError("");
    try {
      const response = await fetch("/api/photo-hunt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ huntId: round.huntId, evidenceUrl: imageUrl, playerId: playerId() }),
      });
      const data = await response.json() as ProofResponse;
      setProofMeta(data);
      if (!response.ok && response.status !== 409 && data.status !== "not_verified") {
        setProofError(data.error ?? "The proof could not be checked.");
        return;
      }

      if (response.status === 409) {
        setResultKind("closed");
        setEarnedXp(0);
      } else if (data.status === "accepted") {
        const points = data.rewardXp ?? 250;
        setResultKind("accepted");
        setEarnedXp(points);
        setScore((value) => value + points);
      } else if (data.status === "rejected") {
        setResultKind("rejected");
        setEarnedXp(0);
      } else if (data.status === "pending") {
        setResultKind("pending");
        setEarnedXp(0);
      } else {
        setResultKind("unverified");
        setEarnedXp(0);
      }
      setScreen("result");
    } catch {
      setProofError("The live verifier could not be reached. Try again.");
    } finally {
      setVerifyState("idle");
    }
  }

  function nextRound() {
    if (isLastRound) {
      setScreen("finished");
      return;
    }
    resetRound(roundIndex + 1);
    setScreen("playing");
  }

  function leaveRun() {
    if (answerTimer.current !== null) window.clearTimeout(answerTimer.current);
    answerTimer.current = null;
    setScreen("home");
  }

  const successResult = resultKind === "correct" || resultKind === "accepted";

  return (
    <main className="world-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <header className="nav-shell">
        <button className="wordmark" onClick={leaveRun} aria-label="Find the Landmark home">
          <span className="logo-orbit"><i /></span>
          <span>FIND THE<br /><b>LANDMARK</b></span>
        </button>
        <div className="nav-center" aria-label="Network status">
          <span className="signal-dot" /> STUDIONET LIVE
          <span className="nav-divider" />
          <a href={EXPLORER_URL} target="_blank" rel="noreferrer" title={CONTRACT_ADDRESS}>
            {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)}
          </a>
        </div>
        <div className="xp-counter"><span>RUN XP</span><strong>{score.toLocaleString()}</strong></div>
      </header>

      <div key={stageKey} className="screen-stage">
        {screen === "home" && (
          <section className="landing-screen">
            <div className="hero-copy">
              <p className="micro-label"><span>✦</span> DAILY GEOGRAPHY RACE · ROUTE 018</p>
              <h1>THE WORLD IS<br /><em>YOUR GAMEBOARD.</em></h1>
              <p className="hero-lede">Name the landmark. Hunt down the proof. Be first when the validators agree.</p>
              <div className="hero-actions">
                <button className="launch-button" onClick={beginRun}><span>START THE RUN</span><i>↗</i></button>
                <div className="route-facts">
                  <span><b>05</b> stops</span>
                  <span><b>02</b> live hunts</span>
                  <span><b>01</b> winner each</span>
                </div>
              </div>
            </div>

            <div className="world-visual" aria-label="Today's landmark route preview">
              <div className="globe-lines" aria-hidden="true"><i /><i /><i /></div>
              <div className="orbit orbit-one" aria-hidden="true"><span /></div>
              <div className="orbit orbit-two" aria-hidden="true"><span /></div>
              {showcase.map((item, index) => (
                <figure className={`floating-card card-${index + 1}`} key={item.place}>
                  <Image src={item.image} alt="" fill sizes="240px" />
                  <figcaption><span>0{index + 1}</span><strong>{index === 1 ? "???" : item.place}</strong></figcaption>
                </figure>
              ))}
              <div className="globe-core"><span>ROUTE<br /><b>018</b></span></div>
              <div className="proof-pulse"><span>⬡</span><p>PROOF ENGINE<strong>GENLAYER CONSENSUS</strong></p></div>
            </div>

            <ol className="route-rail" aria-label="Today's five rounds">
              {rounds.map((item, index) => (
                <li key={`${item.place}-${index}`} className={item.type === "hunt" ? "is-hunt" : ""}>
                  <span>0{index + 1}</span>
                  <div><b>{item.type === "identify" ? "QUICK PICK" : "PHOTO HUNT"}</b><small>{item.type === "identify" ? "Everyone scores" : "First proof wins"}</small></div>
                  <i>{item.type === "identify" ? "+100" : "+250"}</i>
                </li>
              ))}
            </ol>
          </section>
        )}

        {(screen === "playing" || screen === "result") && (
          <section className="play-screen">
            <div className="run-header">
              <button className="icon-button" onClick={leaveRun} aria-label="Leave today's run">←</button>
              <div className="round-title">
                <p className="micro-label">CHECKPOINT {String(roundIndex + 1).padStart(2, "0")} / {String(rounds.length).padStart(2, "0")}</p>
                <h2>{round.type === "identify" ? "Name the landmark" : `Find ${round.place}`}</h2>
              </div>
              <div className={`countdown ${seconds <= 5 ? "urgent" : ""}`}><span>TIME LEFT</span><strong>{timeLabel(seconds)}</strong></div>
            </div>
            <div className="run-progress"><span style={{ width: `${Math.max(progress, 3)}%` }} /></div>

            {screen === "playing" && round.type === "identify" && (
              <div className="identify-stage">
                <figure className="quiz-photo">
                  <Image src={round.image} alt="Landmark to identify" fill sizes="(max-width: 900px) 100vw, 58vw" priority />
                  <div className="scan-line" aria-hidden="true" />
                  <span className="coordinate-tag">UNKNOWN COORDINATES</span>
                  <figcaption>Photo: <a href={round.creditUrl} target="_blank" rel="noreferrer">{round.credit}</a></figcaption>
                </figure>
                <div className="choice-console">
                  <p className="micro-label"><span>●</span> QUICK PICK · SPEED BONUS ON</p>
                  <h3>Where did we land?</h3>
                  <p className="console-note">Choose one before the signal disappears.</p>
                  <div className="choice-list">
                    {round.options.map((option, index) => (
                      <button
                        key={option}
                        style={{ "--choice-delay": `${index * 55}ms` } as CSSProperties}
                        className={selected === option ? "choice selected" : "choice"}
                        onClick={() => chooseAnswer(option)}
                      >
                        <span>{String.fromCharCode(65 + index)}</span><b>{option}</b><i>↗</i>
                      </button>
                    ))}
                  </div>
                  <div className="reward-meter"><span>BASE REWARD</span><strong>100 XP</strong><small>+ {seconds * 2} speed</small></div>
                </div>
              </div>
            )}

            {screen === "playing" && round.type === "hunt" && (
              <div className="hunt-stage">
                <div className="target-card">
                  <div className="radar-disc" aria-hidden="true"><span>⌖</span><i /><i /></div>
                  <p className="micro-label"><span>●</span> LIVE PHOTO HUNT</p>
                  <h3>{round.place}</h3>
                  <p className="target-location">{round.city}</p>
                  <div className="target-rule"><span>PROOF RULE</span><p>{round.clue}</p></div>
                  <div className="hunt-bounty"><small>FIRST ACCEPTED PROOF</small><strong>250 XP</strong><span>ONE WINNER</span></div>
                </div>

                <div className="submit-console">
                  <div className="console-topline"><span>PROOF UPLINK</span><i>SECURE RELAY · ONLINE</i></div>
                  <h3>Found the right shot?</h3>
                  <p>Paste a direct image link. Independent validators check the landmark and agree on the result.</p>
                  <label htmlFor="image-url">DIRECT IMAGE URL</label>
                  <div className="url-input">
                    <span>↗</span>
                    <input
                      id="image-url"
                      type="url"
                      value={imageUrl}
                      onChange={(event) => { setImageUrl(event.target.value); setProofError(""); }}
                      placeholder="https://upload.wikimedia.org/...jpg"
                      disabled={verifyState === "checking"}
                      autoComplete="off"
                    />
                  </div>
                  <div className="source-chips"><span>WIKIMEDIA COMMONS</span><span>UNSPLASH</span><small>direct JPG, PNG or WebP · max 8 MB</small></div>
                  {proofError && <p className="proof-error" role="alert">{proofError}</p>}
                  <button
                    className="launch-button verify-button"
                    onClick={submitProof}
                    disabled={!imageUrl.startsWith("https://") || verifyState === "checking"}
                  >
                    {verifyState === "checking" ? <><span className="loading-copy">VALIDATORS ARE CHECKING</span><i className="loader" /></> : <><span>SEND LIVE PROOF</span><i>↗</i></>}
                  </button>
                  <div className="consensus-strip"><span>⬡</span><p><b>GENLAYER STUDIONET</b>XP is awarded only after validator-majority consensus.</p></div>
                </div>
              </div>
            )}

            {screen === "result" && (
              <div className={`result-stage ${successResult ? "is-success" : "is-miss"}`}>
                {successResult && <div className="confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>}
                <div className="result-glyph"><span>{successResult ? "✓" : resultKind === "pending" ? "…" : "×"}</span></div>
                <p className="micro-label">{resultCopy.kicker}</p>
                <h3>{resultCopy.title}</h3>
                <p>{resultCopy.body}</p>
                <strong className="xp-award">{earnedXp ? `+${earnedXp} XP` : "NO XP"}</strong>
                {proofMeta?.transactionHash && (
                  <a className="receipt-link" href={proofMeta.explorerUrl ?? `${EXPLORER_URL}/txs/${proofMeta.transactionHash}`} target="_blank" rel="noreferrer">
                    VIEW CONSENSUS RECEIPT <span>↗</span>
                  </a>
                )}
                <button className="launch-button result-next" onClick={nextRound}><span>{isLastRound ? "FINISH THE RUN" : "NEXT CHECKPOINT"}</span><i>→</i></button>
              </div>
            )}
          </section>
        )}

        {screen === "finished" && (
          <section className="finish-screen">
            <div className="passport-stamp"><span>ROUTE<br /><b>COMPLETE</b></span></div>
            <p className="micro-label"><span>✦</span> ALL FIVE CHECKPOINTS CLEARED</p>
            <h1>YOU MADE IT<br /><em>AROUND THE WORLD.</em></h1>
            <div className="score-board"><span>TODAY&apos;S RUN</span><strong>{score.toLocaleString()} XP</strong><small>Studionet proofs count only after consensus</small></div>
            <button className="launch-button" onClick={beginRun}><span>RUN IT AGAIN</span><i>↻</i></button>
          </section>
        )}
      </div>

      <footer className="site-footer"><span>FIND THE LANDMARK · DAILY WORLD RACE</span><span>SUBJECTIVE PHOTO PROOFS SETTLED BY GENLAYER</span></footer>
    </main>
  );
}
