export type GameRound = {
  kind: "identify" | "quiz";
  challengeId: string;
  question: string;
  options: [string, string, string, string];
  durationMs: number;
  rewardXp: number;
  speedBonus: number;
  place: string;
  city: string;
  image?: string;
  credit?: string;
  creditUrl?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  sourceExcerpt?: string;
};

const identifyBank: readonly GameRound[] = [
  {
    kind: "identify", challengeId: "quick-taj-001", question: "Name this landmark.",
    options: ["Humayun's Tomb", "Taj Mahal", "Lotus Temple", "Hawa Mahal"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Taj Mahal", city: "Agra, India",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Taj_Mahal%2C_Agra%2C_India_edit2.jpg/1280px-Taj_Mahal%2C_Agra%2C_India_edit2.jpg",
    credit: "Joel Godwin / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Taj_Mahal,_Agra,_India_edit2.jpg",
  },
  {
    kind: "identify", challengeId: "quick-redeemer-001", question: "Name this landmark.",
    options: ["Christ the Redeemer", "Cristo Rei", "The Motherland Calls", "Sacred Heart"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Christ the Redeemer", city: "Rio de Janeiro, Brazil",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Christtheredeemer.jpg/1280px-Christtheredeemer.jpg",
    credit: "Wolffystyle / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Christtheredeemer.jpg",
  },
  {
    kind: "identify", challengeId: "quick-sydney-001", question: "Name this landmark.",
    options: ["The Guggenheim", "Marina Bay Sands", "Sydney Opera House", "Lotus Temple"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Sydney Opera House", city: "Sydney, Australia",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Sydney_Opera_House_from_Circular_Quay.jpg/960px-Sydney_Opera_House_from_Circular_Quay.jpg",
    credit: "Richard Schneider / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Sydney_Opera_House_from_Circular_Quay.jpg",
  },
  {
    kind: "identify", challengeId: "quick-machu-001", question: "Name this landmark.",
    options: ["Choquequirao", "Machu Picchu", "Chichén Itzá", "Tikal"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Machu Picchu", city: "Cusco Region, Peru",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Machu_Picchu%2C_2023_%28012%29.jpg/1280px-Machu_Picchu%2C_2023_%28012%29.jpg",
    credit: "Draceane / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Machu_Picchu,_2023_(012).jpg",
  },
  {
    kind: "identify", challengeId: "quick-petra-001", question: "Name this landmark.",
    options: ["Abu Simbel", "Al-Deir at Petra", "Hegra", "Persepolis"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Al-Deir, Petra", city: "Ma'an, Jordan",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Al_Deir_Petra.JPG/1280px-Al_Deir_Petra.JPG",
    credit: "Azurfrog / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Al_Deir_Petra.JPG",
  },
  {
    kind: "identify", challengeId: "quick-liberty-001", question: "Name this landmark.",
    options: ["Statue of Liberty", "Motherland Monument", "Britannia", "Freedom Monument"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Statue of Liberty", city: "New York City, USA",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Front_view_of_Statue_of_Liberty_%28cropped%29.jpg/1280px-Front_view_of_Statue_of_Liberty_%28cropped%29.jpg",
    credit: "AskALotl / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Front_view_of_Statue_of_Liberty_(cropped).jpg",
  },
  {
    kind: "identify", challengeId: "quick-sagrada-001", question: "Name this landmark.",
    options: ["Milan Cathedral", "Sagrada Família", "Cologne Cathedral", "Sacré-Cœur"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Sagrada Família", city: "Barcelona, Spain",
    image: "https://upload.wikimedia.org/wikipedia/commons/e/ef/SF_maig_2_cropped.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:SF_maig_2_cropped.jpg",
  },
  {
    kind: "identify", challengeId: "quick-fuji-001", question: "Name this landmark.",
    options: ["Mount Fuji", "Mount Rainier", "Mount Ararat", "Mount Etna"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Mount Fuji", city: "Honshu, Japan",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg/1280px-View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg",
  },
  {
    kind: "identify", challengeId: "quick-golden-gate-001", question: "Name this landmark.",
    options: ["Brooklyn Bridge", "Akashi Kaikyō Bridge", "Golden Gate Bridge", "Forth Bridge"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Golden Gate Bridge", city: "San Francisco, USA",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Golden_Gate_Bridge_as_seen_from_Battery_East.jpg/1280px-Golden_Gate_Bridge_as_seen_from_Battery_East.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_as_seen_from_Battery_East.jpg",
  },
  {
    kind: "identify", challengeId: "quick-angkor-001", question: "Name this landmark.",
    options: ["Borobudur", "Bagan", "Angkor Wat", "Prambanan"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Angkor Wat", city: "Siem Reap, Cambodia",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/1280px-Angkor_Wat.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Angkor_Wat.jpg",
  },
];

const quizBank: readonly GameRound[] = [
  {
    kind: "quiz", challengeId: "quiz-oldest-001", question: "Which landmark was completed first?",
    options: ["Burj Khalifa", "Sydney Opera House", "Eiffel Tower", "Empire State Building"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Timeline check", city: "Atlas quiz",
  },
  {
    kind: "quiz", challengeId: "quiz-mausoleum-001", question: "Which landmark was commissioned as a mausoleum?",
    options: ["Colosseum", "Sagrada Família", "Taj Mahal", "Statue of Liberty"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Purpose check", city: "Atlas quiz",
  },
  {
    kind: "quiz", challengeId: "quiz-jordan-001", question: "Which landmark is in Jordan?",
    options: ["Petra", "Machu Picchu", "Angkor Wat", "Moai of Rapa Nui"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Map check", city: "Atlas quiz",
  },
  {
    kind: "quiz", challengeId: "quiz-strait-001", question: "Which landmark spans the strait between San Francisco Bay and the Pacific Ocean?",
    options: ["Brooklyn Bridge", "Tower Bridge", "Golden Gate Bridge", "Akashi Kaikyō Bridge"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Geography check", city: "Atlas quiz",
  },
  {
    kind: "quiz", challengeId: "quiz-gaudi-001", question: "Which landmark is most closely associated with Antoni Gaudí?",
    options: ["Sagrada Família", "Sacré-Cœur", "Milan Cathedral", "St. Paul's Cathedral"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Architect check", city: "Atlas quiz",
  },
];

const genLayerQuizBank: readonly GameRound[] = [
  {
    kind: "quiz", challengeId: "genlayer-exec-prompt-001", question: "Which GenLayer function sends a prompt to an LLM?",
    options: ["gl.nondet.web.get()", "gl.nondet.exec_prompt()", "gl.vm.run_nondet_unsafe()", "gl.public.write"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Calling LLMs", city: "GenLayer docs",
    sourceLabel: "GenLayer Docs · Calling LLMs",
    sourceUrl: "https://docs.genlayer.com/developers/intelligent-contracts/features/calling-llms",
    sourceExcerpt: "The Calling LLMs guide documents gl.nondet.exec_prompt() as the function that executes an LLM prompt. It can request structured JSON by setting response_format to json.",
  },
  {
    kind: "quiz", challengeId: "genlayer-image-limit-001", question: "What is the documented maximum number of images in one exec_prompt call?",
    options: ["One", "Two", "Four", "Eight"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Calling LLMs", city: "GenLayer docs",
    sourceLabel: "GenLayer Docs · Calling LLMs",
    sourceUrl: "https://docs.genlayer.com/developers/intelligent-contracts/features/calling-llms",
    sourceExcerpt: "The Calling LLMs guide says the images parameter supports image processing and documents a maximum of two images per prompt.",
  },
  {
    kind: "quiz", challengeId: "genlayer-nondet-block-001", question: "Where must gl.nondet operations execute?",
    options: ["Inside a nondeterministic block", "Only in the constructor", "Only in view functions", "Outside the contract"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Non-determinism", city: "GenLayer docs",
    sourceLabel: "GenLayer Docs · Non-determinism",
    sourceUrl: "https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism",
    sourceExcerpt: "The Non-determinism guide says nondeterministic operations, including LLM prompts and web requests, must run inside a nondeterministic block.",
  },
  {
    kind: "quiz", challengeId: "genlayer-storage-write-001", question: "Which operation must remain outside a nondeterministic block?",
    options: ["LLM prompts", "Web requests", "Storage writes", "Validator comparisons"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Non-determinism", city: "GenLayer docs",
    sourceLabel: "GenLayer Docs · Non-determinism",
    sourceUrl: "https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism",
    sourceExcerpt: "The Non-determinism guide requires contract storage writes to happen in deterministic context outside nondeterministic blocks, after consensus is reached.",
  },
];

function shuffled<T>(source: readonly T[]) {
  const values = [...source];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [values[index], values[random]] = [values[random], values[index]];
  }
  return values;
}

export function createGamePlan(): GameRound[] {
  const landmarks = shuffled(identifyBank).slice(0, 5);
  const quizzes = shuffled(quizBank).slice(0, 3);
  const docs = shuffled(genLayerQuizBank);
  return [
    landmarks[0],
    docs[0],
    landmarks[1],
    quizzes[0],
    docs[1],
    landmarks[2],
    quizzes[1],
    docs[2],
    landmarks[3],
    quizzes[2],
    docs[3],
    landmarks[4],
  ];
}

export function contractPlan(plan: readonly GameRound[]) {
  return plan.map((round) => ({
    kind: round.kind,
    challenge_id: round.challengeId,
    question: round.question,
    options: round.options,
    duration_ms: round.durationMs,
    reward_xp: round.rewardXp,
    speed_bonus: round.speedBonus,
    source_label: round.sourceLabel ?? "",
    source_url: round.sourceUrl ?? "",
    source_excerpt: round.sourceExcerpt ?? "",
  }));
}
