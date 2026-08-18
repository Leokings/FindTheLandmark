"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type IdentifyRound = {
  type: "identify";
  roundId: "quick-taj-001" | "quick-redeemer-001" | "quick-sydney-001";
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
type ResultKind = "correct" | "wrong" | "expired" | "accepted" | "rejected" | "pending" | "closed" | "unverified";
type VerifyState = "idle" | "preparing" | "checking";
type QuickTicket = {
  roundId: string;
  userIdHash: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  signature: string;
};
type ProofResponse = {
  status?: "accepted" | "rejected" | "pending" | "not_verified";
  rewardXp?: number;
  transactionHash?: string;
  submissionId?: string;
  consensusStatus?: string;
  explorerUrl?: string;
  ticket?: QuickTicket;
  seconds?: number;
  error?: string;
};

const CONTRACT_ADDRESS = "0xC3fD27d653D3298833836d239f014f184d85Aa8C";
const EXPLORER_URL = "https://explorer-studio.genlayer.com";
const rounds: Round[] = [
  {
    type: "identify",
    roundId: "quick-taj-001",
    place: "Taj Mahal",
    city: "Agra, India",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Taj_Mahal%2C_Agra%2C_India_edit2.jpg/1280px-Taj_Mahal%2C_Agra%2C_India_edit2.jpg",
    credit: "Joel Godwin / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Taj_Mahal,_Agra,_India_edit2.jpg",
    options: ["Humayun's Tomb", "Taj Mahal", "Lotus Temple", "Hawa Mahal"],
  },
  {
    type: "identify",
    roundId: "quick-redeemer-001",
    place: "Christ the Redeemer",
    city: "Rio de Janeiro, Brazil",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Christtheredeemer.jpg/1280px-Christtheredeemer.jpg",
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
    roundId: "quick-sydney-001",
    place: "Sydney Opera House",
    city: "Sydney, Australia",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Sydney_Opera_House_from_Circular_Quay.jpg/960px-Sydney_Opera_House_from_Circular_Quay.jpg",
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
const previewRounds = rounds.filter((round): round is IdentifyRound => round.type === "identify");

function roundTime(round: Round) {
  return round.type === "hunt" ? 90 : 20;
}
function timeLabel(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}
function getPlayerId() {
  const key = "find-the-landmark.player.v2";
  const existing = window.localStorage.getItem(key);
  if (existing && /^[A-Za-z0-9_-]{12,100}$/.test(existing)) return existing;
  const created = "player-" + crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}
function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
  });
}
async function pollVerdict(endpoint: string, initial: ProofResponse, controller: AbortController) {
  let data = initial;
  const deadline = Date.now() + 120_000;
  while (data.status === "pending" && data.transactionHash && data.submissionId && Date.now() < deadline) {
    await pause(5_000, controller.signal);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", transactionHash: data.transactionHash, submissionId: data.submissionId }),
      signal: controller.signal,
    });
    const update = await response.json() as ProofResponse;
    if (update.transactionHash) data = update;
    if (!response.ok && data.status !== "not_verified" && response.status < 500) break;
  }
  return data;
}
function resultCopy(kind: ResultKind, round: Round) {
  const messages: Record<ResultKind, { eyebrow: string; title: string; body: string }> = {
    correct: { eyebrow: "VALIDATOR SEAL EARNED", title: "Correct landmark.", body: round.place + " · " + round.city },
    wrong: { eyebrow: "CONSENSUS SAYS NO", title: "Wrong turn.", body: "The validators identified " + round.place + "." },
    expired: { eyebrow: "GATE CLOSED", title: "Time escaped.", body: "The route moved before your answer was locked." },
    accepted: { eyebrow: "FIRST PROOF WINS", title: "Landmark claimed.", body: "Your photo cleared validator consensus first." },
    rejected: { eyebrow: "PROOF RETURNED", title: "Try a better angle.", body: "The image did not clear every proof check." },
    pending: { eyebrow: "ROUTE ON HOLD", title: "Still checking.", body: "Your transaction is live and waiting for a final verdict." },
    closed: { eyebrow: "FLAG ALREADY PLANTED", title: "Someone got there first.", body: "This photo hunt already has a winner." },
    unverified: { eyebrow: "NO FINAL SEAL", title: "Couldn’t verify.", body: "No XP was awarded because consensus did not finish." },
  };
  return messages[kind];
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [roundIndex, setRoundIndex] = useState(0);
  const [seconds, setSeconds] = useState(roundTime(rounds[0]));
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [quickTicket, setQuickTicket] = useState<QuickTicket | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [resultKind, setResultKind] = useState<ResultKind>("correct");
  const [earnedXp, setEarnedXp] = useState(0);
  const [proofMeta, setProofMeta] = useState<ProofResponse | null>(null);
  const startController = useRef<AbortController | null>(null);
  const verifyController = useRef<AbortController | null>(null);
  const round = rounds[roundIndex];
  const isLastRound = roundIndex === rounds.length - 1;
  const copy = resultCopy(resultKind, round);
  const successful = resultKind === "correct" || resultKind === "accepted";

  useEffect(() => {
    if (screen !== "playing" || round.type !== "identify") return;
    const controller = new AbortController();
    startController.current?.abort();
    startController.current = controller;
    fetch("/api/quick-pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", roundId: round.roundId, playerId: getPlayerId() }),
      signal: controller.signal,
    })
      .then(async (response) => ({ response, data: await response.json() as ProofResponse }))
      .then(({ response, data }) => {
        if (!response.ok || !data.ticket) throw new Error(data.error ?? "This checkpoint could not open.");
        setQuickTicket(data.ticket);
        setSeconds(data.seconds ?? 20);
        setVerifyState("idle");
      })
      .catch((error) => {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setErrorMessage(error instanceof Error ? error.message : "This checkpoint could not open.");
          setVerifyState("idle");
        }
      });
    return () => controller.abort();
  }, [screen, roundIndex, round]);

  useEffect(() => {
    if (screen !== "playing" || seconds <= 0 || verifyState !== "idle") return;
    if (round.type === "identify" && !quickTicket) return;
    const timer = window.setTimeout(() => {
      if (seconds === 1) {
        setSeconds(0);
        setEarnedXp(0);
        setResultKind("expired");
        setScreen("result");
      } else setSeconds((value) => value - 1);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [screen, seconds, verifyState, quickTicket, round.type]);

  useEffect(() => () => {
    startController.current?.abort();
    verifyController.current?.abort();
  }, []);

  function resetRound(index: number) {
    startController.current?.abort();
    verifyController.current?.abort();
    setRoundIndex(index);
    setSeconds(roundTime(rounds[index]));
    setSelected(null);
    setImageUrl("");
    setQuickTicket(null);
    setVerifyState(rounds[index].type === "identify" ? "preparing" : "idle");
    setErrorMessage("");
    setProofMeta(null);
    setEarnedXp(0);
  }
  function beginRun() {
    setScore(0);
    resetRound(0);
    setScreen("playing");
  }
  function leaveRun() {
    startController.current?.abort();
    verifyController.current?.abort();
    setScreen("home");
  }

  async function chooseAnswer(choiceIndex: number) {
    if (round.type !== "identify" || selected !== null || !quickTicket || verifyState !== "idle") return;
    const ticket = quickTicket;
    setSelected(choiceIndex);
    setQuickTicket(null);
    setVerifyState("checking");
    setErrorMessage("");
    const controller = new AbortController();
    verifyController.current?.abort();
    verifyController.current = controller;
    try {
      const response = await fetch("/api/quick-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", roundId: round.roundId, playerId: getPlayerId(), choiceIndex, ticket }),
        signal: controller.signal,
      });
      let data = await response.json() as ProofResponse;
      setProofMeta(data);
      if (response.status === 408) {
        setResultKind("expired");
        setScreen("result");
        return;
      }
      if (!response.ok && data.status !== "not_verified" && data.status !== "pending") {
        setErrorMessage(data.error ?? "The answer could not be checked.");
        setSelected(null);
        return;
      }
      if (data.status === "pending") {
        data = await pollVerdict("/api/quick-pick", data, controller);
        setProofMeta(data);
      }
      if (data.status === "accepted") {
        const points = data.rewardXp ?? 100;
        setResultKind("correct");
        setEarnedXp(points);
        setScore((value) => value + points);
      } else if (data.status === "rejected") {
        setResultKind("wrong");
        setEarnedXp(0);
      } else if (data.status === "pending") {
        setResultKind("pending");
        setEarnedXp(0);
      } else {
        setResultKind("unverified");
        setEarnedXp(0);
      }
      setScreen("result");
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        setErrorMessage("The validator route could not be reached. Try again.");
        setSelected(null);
      }
    } finally {
      if (verifyController.current === controller) {
        verifyController.current = null;
        setVerifyState("idle");
      }
    }
  }

  async function submitProof() {
    if (round.type !== "hunt" || verifyState !== "idle") return;
    setVerifyState("checking");
    setErrorMessage("");
    const controller = new AbortController();
    verifyController.current?.abort();
    verifyController.current = controller;
    try {
      const response = await fetch("/api/photo-hunt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ huntId: round.huntId, evidenceUrl: imageUrl, playerId: getPlayerId() }),
        signal: controller.signal,
      });
      let data = await response.json() as ProofResponse;
      setProofMeta(data);
      if (!response.ok && response.status !== 409 && data.status !== "not_verified" && data.status !== "pending") {
        setErrorMessage(data.error ?? "The proof could not be checked.");
        return;
      }
      if (data.status === "pending") {
        data = await pollVerdict("/api/photo-hunt", data, controller);
        setProofMeta(data);
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
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setErrorMessage("The proof route could not be reached. Try again.");
    } finally {
      if (verifyController.current === controller) {
        verifyController.current = null;
        setVerifyState("idle");
      }
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

  return (
    <main className={"atlas-app screen-" + screen}>
      <div className="paper-noise" aria-hidden="true" />
      <button className="edge-brand" onClick={leaveRun} aria-label="Find the Landmark home">
        <span>F／L</span><b>FIND THE LANDMARK</b>
      </button>
      {screen === "home" && (
        <section className="atlas-home">
          <div className="atlas-meta">
            <span>DAILY ROUTE 018</span><span>05 STOPS</span><span>GENLAYER LIVE</span>
          </div>
          <div className="map-field" aria-label="Today's world route">
            <svg viewBox="0 0 1000 640" className="route-drawing" aria-hidden="true">
              <path d="M92 432 C230 212 320 500 458 282 S718 130 908 342" />
              <circle cx="92" cy="432" r="9" /><circle cx="458" cy="282" r="9" /><circle cx="908" cy="342" r="9" />
            </svg>
            {previewRounds.map((item, index) => (
              <figure className={"map-photo map-photo-" + (index + 1)} key={item.roundId}>
                <Image src={item.image} alt="" fill sizes="(max-width: 720px) 40vw, 22vw" priority={index === 0} />
                <figcaption><b>0{index + 1}</b><span>{index === 0 ? "FIRST CLUE" : "SEALED"}</span></figcaption>
              </figure>
            ))}
            <div className="map-stamp"><span>WORLD<br />ROUTE</span><b>018</b></div>
            <div className="map-pin pin-one"><i />AGRA</div>
            <div className="map-pin pin-two"><i />RIO</div>
            <div className="map-pin pin-three"><i />SYDNEY</div>
          </div>
          <div className="home-title">
            <p>ONE PHOTO. FOUR PLACES. TWENTY SECONDS.</p>
            <h1>PACK LIGHT.<br /><em>THINK FAST.</em></h1>
          </div>
          <button className="start-orbit" onClick={beginRun}>
            <span>START<br />TODAY&apos;S<br />ROUTE</span><i>↗</i>
          </button>
          <ol className="ticket-strip" aria-label="Route format">
            <li><b>03</b><span>QUICK PICKS<small>100 XP EACH</small></span></li>
            <li><b>02</b><span>PHOTO HUNTS<small>FIRST PROOF WINS</small></span></li>
            <li><b>05</b><span>VALIDATOR STOPS<small>CONSENSUS SCORED</small></span></li>
          </ol>
        </section>
      )}

      {(screen === "playing" || screen === "result") && (
        <section className={"checkpoint checkpoint-" + round.type}>
          <nav className="checkpoint-rail" aria-label="Route progress">
            {rounds.map((item, index) => <span key={item.place + "-" + index} className={index === roundIndex ? "active" : index < roundIndex ? "done" : ""}>{String(index + 1).padStart(2, "0")}</span>)}
          </nav>
          <div className="checkpoint-top">
            <button onClick={leaveRun} aria-label="Leave route">×</button>
            <p><span>STOP {String(roundIndex + 1).padStart(2, "0")}</span>{round.type === "identify" ? "QUICK PICK" : "OPEN PHOTO HUNT"}</p>
            <strong>{score} XP</strong>
          </div>
          {screen === "playing" && round.type === "identify" && (
            <div className="image-round">
              <figure className="landmark-canvas">
                <Image src={round.image} alt="Landmark to identify" fill sizes="100vw" priority />
                <div className="image-wash" />
                <figcaption>IMAGE SOURCE · <a href={round.creditUrl} target="_blank" rel="noreferrer">{round.credit}</a></figcaption>
              </figure>
              <div className={"compass-clock " + (seconds <= 5 ? "urgent" : "")}>
                <i /><small>LOCK IN</small><b>{timeLabel(seconds)}</b>
              </div>
              <div className="round-prompt"><span>WHERE ARE WE?</span><h2>Name this landmark.</h2></div>
              <div className="answer-dock">
                {round.options.map((option, index) => (
                  <button key={option} className={selected === index ? "selected" : ""} onClick={() => chooseAnswer(index)} disabled={!quickTicket || selected !== null || verifyState !== "idle"}>
                    <span>{String.fromCharCode(65 + index)}</span><b>{option}</b><i>↗</i>
                  </button>
                ))}
              </div>
              {verifyState === "preparing" && <div className="signal-banner"><i />OPENING THE 20-SECOND GATE</div>}
              {verifyState === "checking" && <div className="validator-curtain"><i /><p>VALIDATORS ARE READING THE LANDMARK</p><span>Consensus decides the answer</span></div>}
              {errorMessage && <div className="floating-error" role="alert">{errorMessage}</div>}
            </div>
          )}
          {screen === "playing" && round.type === "hunt" && (
            <div className="hunt-round">
              <div className="hunt-word" aria-hidden="true">{round.place.replace("The ", "")}</div>
              <div className="hunt-brief">
                <span>FIRST ACCEPTED IMAGE</span>
                <h2>Find<br />{round.place}.</h2>
                <p>{round.city}</p>
                <blockquote>{round.clue}</blockquote>
              </div>
              <div className="hunt-clock"><small>HUNT WINDOW</small><b>{timeLabel(seconds)}</b><span>250 XP · ONE WINNER</span></div>
              <div className="dispatch-bar">
                <label htmlFor="image-url">DROP A DIRECT IMAGE LINK</label>
                <div className="dispatch-input">
                  <span>↗</span>
                  <input id="image-url" type="url" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setErrorMessage(""); }} placeholder="https://upload.wikimedia.org/...jpg" disabled={verifyState === "checking"} autoComplete="off" />
                  <button onClick={submitProof} disabled={!imageUrl.startsWith("https://") || verifyState !== "idle"}>
                    {verifyState === "checking" ? "CHECKING…" : "CLAIM IT"}<i>→</i>
                  </button>
                </div>
                <p>WIKIMEDIA OR UNSPLASH · JPG, PNG, WEBP · MAX 8 MB</p>
                {errorMessage && <div className="dispatch-error" role="alert">{errorMessage}</div>}
              </div>
              <a className="chain-tag" href={EXPLORER_URL + "/contracts/" + CONTRACT_ADDRESS} target="_blank" rel="noreferrer">GENLAYER CONSENSUS ↗</a>
            </div>
          )}
          {screen === "result" && (
            <div className={"stamp-result " + (successful ? "success" : "miss")}>
              <div className="result-cross" aria-hidden="true" />
              <p>{copy.eyebrow}</p>
              <h2>{copy.title}</h2>
              <span>{copy.body}</span>
              <div className="result-score">{earnedXp ? "+" + earnedXp : "0"}<small>XP</small></div>
              {proofMeta?.transactionHash && <a href={proofMeta.explorerUrl ?? EXPLORER_URL + "/txs/" + proofMeta.transactionHash} target="_blank" rel="noreferrer">OPEN RECEIPT ↗</a>}
              <button onClick={nextRound}>{isLastRound ? "FINISH ROUTE" : "NEXT STOP"}<i>→</i></button>
            </div>
          )}
        </section>
      )}

      {screen === "finished" && (
        <section className="route-finished">
          <div className="finish-sun"><span>ROUTE<br />COMPLETE</span></div>
          <p>FIVE STOPS · ONE WORLD · VALIDATOR-SCORED</p>
          <h1>YOUR PASSPORT<br />NEEDS MORE PAGES.</h1>
          <div className="finish-score"><span>TODAY&apos;S HAUL</span><b>{score}</b><small>XP</small></div>
          <button onClick={leaveRun}>BACK TO THE MAP <i>↗</i></button>
          <a href={EXPLORER_URL + "/contracts/" + CONTRACT_ADDRESS} target="_blank" rel="noreferrer">VIEW LIVE CONTRACT ↗</a>
        </section>
      )}
    </main>
  );
}
