"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

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
  place: string;
  city: string;
  clue: string;
};

type Round = IdentifyRound | HuntRound;
type Screen = "home" | "playing" | "result" | "finished";

const rounds: Round[] = [
  {
    type: "identify",
    place: "Taj Mahal",
    city: "Agra, India",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Taj_Mahal%2C_Agra%2C_India_edit2.jpg/1280px-Taj_Mahal%2C_Agra%2C_India_edit2.jpg",
    credit: "Joel Godwin / Wikimedia Commons",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Taj_Mahal,_Agra,_India_edit2.jpg",
    options: ["Humayun's Tomb", "Taj Mahal", "Lotus Temple", "Hawa Mahal"],
  },
  {
    type: "identify",
    place: "Christ the Redeemer",
    city: "Rio de Janeiro, Brazil",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Cristo_Redentor_R%C3%ADo_de_Janeiro.jpg/1024px-Cristo_Redentor_R%C3%ADo_de_Janeiro.jpg",
    credit: "Artyom Sharbatyan / Wikimedia Commons",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Cristo_Redentor_R%C3%ADo_de_Janeiro.jpg",
    options: ["Christ the Redeemer", "Cristo Rei", "The Motherland Calls", "Sacred Heart"],
  },
  {
    type: "hunt",
    place: "The Colosseum",
    city: "Rome, Italy",
    clue: "Find a clear public photo where the outer arches are easy to recognize.",
  },
  {
    type: "identify",
    place: "Sydney Opera House",
    city: "Sydney, Australia",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Sydney_Opera_House_from_Circular_Quay.jpg/960px-Sydney_Opera_House_from_Circular_Quay.jpg",
    credit: "Richard Schneider / Wikimedia Commons",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Sydney_Opera_House_from_Circular_Quay.jpg",
    options: ["The Guggenheim", "Marina Bay Sands", "Sydney Opera House", "Lotus Temple"],
  },
  {
    type: "hunt",
    place: "The Eiffel Tower",
    city: "Paris, France",
    clue: "Find a visible public photo showing most of the tower, not a cropped detail.",
  },
];

const routeLabels = rounds.map((item) => (item.type === "identify" ? "Quick pick" : "Photo hunt"));

function secondsLabel(value: number) {
  return `00:${String(value).padStart(2, "0")}`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [roundIndex, setRoundIndex] = useState(0);
  const [seconds, setSeconds] = useState(20);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [verifyState, setVerifyState] = useState<"idle" | "checking">("idle");

  const round = rounds[roundIndex];
  const isLastRound = roundIndex === rounds.length - 1;
  const progress = ((roundIndex + (screen === "result" ? 1 : 0)) / rounds.length) * 100;

  useEffect(() => {
    if (screen !== "playing" || seconds <= 0 || verifyState === "checking") return;
    const timer = window.setTimeout(() => {
      if (seconds === 1) {
        setSeconds(0);
        setAnswerCorrect(false);
        setScreen("result");
        return;
      }
      setSeconds((value) => value - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [screen, seconds, verifyState]);

  function beginRun() {
    setRoundIndex(0);
    setScore(0);
    setSeconds(20);
    setSelected(null);
    setImageUrl("");
    setScreen("playing");
  }

  function chooseAnswer(option: string) {
    if (round.type !== "identify" || selected) return;
    const correct = option === round.place;
    setSelected(option);
    setAnswerCorrect(correct);
    if (correct) setScore((value) => value + 100 + seconds * 2);
    window.setTimeout(() => setScreen("result"), 480);
  }

  function submitProof() {
    if (round.type !== "hunt" || verifyState === "checking") return;
    try {
      const parsed = new URL(imageUrl);
      if (parsed.protocol !== "https:") return;
    } catch {
      return;
    }
    setVerifyState("checking");
    window.setTimeout(() => {
      setVerifyState("idle");
      setAnswerCorrect(true);
      setScore((value) => value + 250);
      setScreen("result");
    }, 1800);
  }

  function nextRound() {
    if (isLastRound) {
      setScreen("finished");
      return;
    }
    setRoundIndex((value) => value + 1);
    setSeconds(20);
    setSelected(null);
    setAnswerCorrect(false);
    setImageUrl("");
    setVerifyState("idle");
    setScreen("playing");
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("home")} aria-label="Find the Landmark home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>FIND THE<br />LANDMARK</span>
        </button>
        <div className="topbar-actions">
          <span className="live-pill"><i /> DAILY GAME</span>
          <div className="score-pill"><small>XP</small>{score}</div>
          <button className="avatar" aria-label="Player profile">LK</button>
        </div>
      </header>

      {screen === "home" && (
        <section className="home-view">
          <div className="hero-copy">
            <p className="eyebrow"><span>✦</span> TODAY&apos;S WORLD RUN</p>
            <h1>Know the world.<br /><em>Prove it.</em></h1>
            <p className="hero-text">Name famous places, race to find the right photo, and let GenLayer settle the first proof.</p>
            <button className="primary-btn" onClick={beginRun}>PLAY TODAY&apos;S RUN <span>→</span></button>
            <div className="player-strip">
              <div className="mini-avatars" aria-hidden="true"><i>MK</i><i>AN</i><i>JO</i><i>+</i></div>
              <span><strong>184 explorers</strong> are playing today</span>
            </div>
          </div>

          <div className="route-card">
            <div className="route-card-head">
              <div><p className="eyebrow">DAILY ROUTE · #018</p><h2>Five stops.<br />One world.</h2></div>
              <div className="route-globe" aria-hidden="true">◎</div>
            </div>
            <ol className="route-list">
              {routeLabels.map((label, index) => (
                <li key={`${label}-${index}`}>
                  <span className={index < 2 ? "route-number warm" : "route-number"}>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{label}</strong><small>{index < 2 ? "100+ XP" : index === 2 ? "250 XP · FIRST WINS" : "LOCKED"}</small></div>
                  <span className="route-status">{index < 2 ? "OPEN" : index === 2 ? "NEXT" : "—"}</span>
                </li>
              ))}
            </ol>
            <div className="route-note"><span>◈</span><p><strong>Two ways to win</strong>Everyone can score quick picks. Photo hunts have one winner.</p></div>
          </div>
        </section>
      )}

      {(screen === "playing" || screen === "result") && (
        <section className="game-view">
          <div className="game-meta">
            <button className="back-btn" onClick={() => setScreen("home")} aria-label="Leave run">←</button>
            <div className="round-copy"><p className="eyebrow">ROUND {roundIndex + 1} OF {rounds.length}</p><h2>{round.type === "identify" ? "Name that landmark" : `Find: ${round.place}`}</h2></div>
            <div className={`timer ${seconds <= 5 ? "urgent" : ""}`}><span>◷</span>{secondsLabel(seconds)}</div>
          </div>
          <div className="progress-track"><span style={{ width: `${Math.max(4, progress)}%` }} /></div>

          {screen === "playing" && round.type === "identify" && (
            <div className="identify-layout">
              <figure className="landmark-photo">
                <Image src={round.image} alt="Landmark to identify" fill sizes="(max-width: 900px) 100vw, 56vw" priority={roundIndex === 0} />
                <figcaption>Photo: <a href={round.creditUrl} target="_blank" rel="noreferrer">{round.credit}</a></figcaption>
                <span className="photo-tag">WHERE IN THE WORLD?</span>
              </figure>
              <div className="answer-panel">
                <div className="panel-heading"><p className="eyebrow">QUICK PICK · EVERYONE CAN WIN</p><h3>What place is this?</h3><p>Pick the right answer before the clock runs out.</p></div>
                <div className="answer-grid">
                  {round.options.map((option, index) => (
                    <button key={option} className={selected === option ? "answer-option selected" : "answer-option"} onClick={() => chooseAnswer(option)}>
                      <span>{String.fromCharCode(65 + index)}</span>{option}
                    </button>
                  ))}
                </div>
                <div className="reward-line"><span>✦</span><strong>100 XP</strong> + speed bonus</div>
              </div>
            </div>
          )}

          {screen === "playing" && round.type === "hunt" && (
            <div className="hunt-layout">
              <div className="hunt-brief">
                <p className="eyebrow">PHOTO HUNT · FIRST ACCEPTED PROOF WINS</p>
                <div className="hunt-pin" aria-hidden="true"><span>⌖</span></div>
                <h3>{round.place}</h3><p className="location-label">{round.city}</p><p className="hunt-clue">{round.clue}</p>
                <div className="bounty"><span>BOUNTY</span><strong>250 XP</strong><small>ONE WINNER</small></div>
              </div>
              <div className="proof-panel">
                <p className="eyebrow">SUBMIT A PUBLIC IMAGE</p><h3>Found a good one?</h3>
                <p>Paste its direct HTTPS image link. The verifier checks that the target is clear and recognizable.</p>
                <label htmlFor="image-url">IMAGE URL</label>
                <div className="url-field"><span>↗</span><input id="image-url" type="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://example.com/landmark.jpg" disabled={verifyState === "checking"} /></div>
                <button className="primary-btn proof-btn" onClick={submitProof} disabled={!imageUrl.startsWith("https://") || verifyState === "checking"}>
                  {verifyState === "checking" ? <><span className="spinner" /> CHECKING PROOF…</> : <>SEND TO GENLAYER <span>→</span></>}
                </button>
                <div className="consensus-note"><span>⬡</span><p><strong>GenLayer verifier · local test mode</strong>Production mode records only the first consensus-accepted proof.</p></div>
              </div>
            </div>
          )}

          {screen === "result" && (
            <div className={`result-card ${answerCorrect ? "success" : "miss"}`}>
              <div className="result-symbol">{answerCorrect ? "✓" : "×"}</div>
              <p className="eyebrow">{answerCorrect ? "NICE FIND" : "NOT THIS TIME"}</p>
              <h3>{answerCorrect ? (round.type === "hunt" ? "Proof accepted first." : "You know your places.") : "The clock got there first."}</h3>
              <p>{answerCorrect ? `${round.place} · ${round.city}` : `The answer was ${round.place}.`}</p>
              <div className="points-earned">{answerCorrect ? `+${round.type === "hunt" ? 250 : 100 + seconds * 2} XP` : "+0 XP"}</div>
              <button className="primary-btn" onClick={nextRound}>{isLastRound ? "SEE RESULTS" : "NEXT STOP"} <span>→</span></button>
            </div>
          )}
        </section>
      )}

      {screen === "finished" && (
        <section className="finish-view">
          <div className="finish-stamp" aria-hidden="true">✓</div><p className="eyebrow">DAILY RUN COMPLETE</p>
          <h1>You went<br /><em>around the world.</em></h1>
          <div className="final-score"><span>TODAY&apos;S SCORE</span><strong>{score} XP</strong></div>
          <p>Come back tomorrow for five new landmarks and two new first-proof races.</p>
          <button className="primary-btn" onClick={beginRun}>PLAY AGAIN <span>↻</span></button>
        </section>
      )}

      <footer><span>FIND THE LANDMARK · MVP</span><span>SUBJECTIVE PROOFS SETTLED BY GENLAYER</span></footer>
    </main>
  );
}
