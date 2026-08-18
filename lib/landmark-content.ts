export type IdentifyRound = {
  type: "identify";
  roundId: string;
  place: string;
  city: string;
  image: string;
  credit: string;
  creditUrl: string;
  options: readonly [string, string, string, string];
};

export type HuntRound = {
  type: "hunt";
  huntId: string;
  place: string;
  city: string;
  clue: string;
};

export type QuizRound = {
  type: "quiz";
  quizId: string;
  place: string;
  city: string;
  question: string;
  options: readonly [string, string, string, string];
};

export type Round = IdentifyRound | HuntRound | QuizRound;

export const identifyBank: readonly IdentifyRound[] = [
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
    type: "identify",
    roundId: "quick-machu-001",
    place: "Machu Picchu",
    city: "Cusco Region, Peru",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Machu_Picchu%2C_2023_%28012%29.jpg/1280px-Machu_Picchu%2C_2023_%28012%29.jpg",
    credit: "Draceane / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Machu_Picchu,_2023_(012).jpg",
    options: ["Choquequirao", "Machu Picchu", "Chichén Itzá", "Tikal"],
  },
  {
    type: "identify",
    roundId: "quick-petra-001",
    place: "Al-Deir, Petra",
    city: "Ma'an, Jordan",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Al_Deir_Petra.JPG/1280px-Al_Deir_Petra.JPG",
    credit: "Azurfrog / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Al_Deir_Petra.JPG",
    options: ["Abu Simbel", "Al-Deir at Petra", "Hegra", "Persepolis"],
  },
  {
    type: "identify",
    roundId: "quick-liberty-001",
    place: "Statue of Liberty",
    city: "New York City, USA",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Front_view_of_Statue_of_Liberty_%28cropped%29.jpg/1280px-Front_view_of_Statue_of_Liberty_%28cropped%29.jpg",
    credit: "AskALotl / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Front_view_of_Statue_of_Liberty_(cropped).jpg",
    options: ["Statue of Liberty", "Motherland Monument", "Britannia", "Freedom Monument"],
  },
  {
    type: "identify",
    roundId: "quick-sagrada-001",
    place: "Sagrada Família",
    city: "Barcelona, Spain",
    image: "https://upload.wikimedia.org/wikipedia/commons/e/ef/SF_maig_2_cropped.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:SF_maig_2_cropped.jpg",
    options: ["Milan Cathedral", "Sagrada Família", "Cologne Cathedral", "Sacré-Cœur"],
  },
  {
    type: "identify",
    roundId: "quick-fuji-001",
    place: "Mount Fuji",
    city: "Honshu, Japan",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg/1280px-View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:View_of_Mount_Fuji_from_%C5%8Cwakudani_20211202.jpg",
    options: ["Mount Fuji", "Mount Rainier", "Mount Ararat", "Mount Etna"],
  },
  {
    type: "identify",
    roundId: "quick-golden-gate-001",
    place: "Golden Gate Bridge",
    city: "San Francisco, USA",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Golden_Gate_Bridge_as_seen_from_Battery_East.jpg/1280px-Golden_Gate_Bridge_as_seen_from_Battery_East.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_as_seen_from_Battery_East.jpg",
    options: ["Brooklyn Bridge", "Akashi Kaikyō Bridge", "Golden Gate Bridge", "Forth Bridge"],
  },
  {
    type: "identify",
    roundId: "quick-angkor-001",
    place: "Angkor Wat",
    city: "Siem Reap, Cambodia",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Angkor_Wat.jpg/1280px-Angkor_Wat.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Angkor_Wat.jpg",
    options: ["Borobudur", "Bagan", "Angkor Wat", "Prambanan"],
  },
] as const;

export const huntBank: readonly HuntRound[] = [
  {
    type: "hunt",
    huntId: "hunt-colosseum-001",
    place: "The Colosseum",
    city: "Rome, Italy",
    clue: "Find a real exterior photo with the recognizable rows of arches clearly visible.",
  },
  {
    type: "hunt",
    huntId: "hunt-eiffel-001",
    place: "The Eiffel Tower",
    city: "Paris, France",
    clue: "Find a real photo showing most of the tower clearly, not a cropped detail.",
  },
  {
    type: "hunt",
    huntId: "hunt-pyramids-001",
    place: "The Giza Pyramids",
    city: "Giza, Egypt",
    clue: "Find a real photo with at least one full pyramid and the Giza plateau clearly visible.",
  },
  {
    type: "hunt",
    huntId: "hunt-tower-bridge-001",
    place: "Tower Bridge",
    city: "London, United Kingdom",
    clue: "Find a real photo showing both stone towers and part of the blue suspension structure.",
  },
] as const;

export const quizBank: readonly QuizRound[] = [
  {
    type: "quiz",
    quizId: "quiz-oldest-001",
    place: "Timeline check",
    city: "Atlas field note",
    question: "Which of these landmarks was completed first?",
    options: ["Burj Khalifa", "Sydney Opera House", "Eiffel Tower", "Empire State Building"],
  },
  {
    type: "quiz",
    quizId: "quiz-mausoleum-001",
    place: "Purpose check",
    city: "Atlas field note",
    question: "Which landmark was commissioned as a mausoleum?",
    options: ["Colosseum", "Sagrada Família", "Taj Mahal", "Statue of Liberty"],
  },
  {
    type: "quiz",
    quizId: "quiz-jordan-001",
    place: "Map check",
    city: "Atlas field note",
    question: "Which landmark is in Jordan?",
    options: ["Petra", "Machu Picchu", "Angkor Wat", "Moai of Rapa Nui"],
  },
  {
    type: "quiz",
    quizId: "quiz-strait-001",
    place: "Geography check",
    city: "Atlas field note",
    question: "Which landmark spans the strait between San Francisco Bay and the Pacific Ocean?",
    options: ["Brooklyn Bridge", "Tower Bridge", "Golden Gate Bridge", "Akashi Kaikyō Bridge"],
  },
  {
    type: "quiz",
    quizId: "quiz-gaudi-001",
    place: "Architect check",
    city: "Atlas field note",
    question: "Which landmark is most closely associated with architect Antoni Gaudí?",
    options: ["Sagrada Família", "Sacré-Cœur", "Milan Cathedral", "St. Paul's Cathedral"],
  },
] as const;

export function utcRunId(date = new Date()) {
  return `route-${date.toISOString().slice(0, 10)}`;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededOrder<T>(items: readonly T[], seedText: string) {
  let state = hashSeed(seedText) || 1;
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swap = state % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function getDailyRoute(date = new Date()): Round[] {
  const runId = utcRunId(date);
  const picks = seededOrder(identifyBank, `${runId}:picks`).slice(0, 4);
  const quizzes = seededOrder(quizBank, `${runId}:quizzes`).slice(0, 2);
  const hunt = seededOrder(huntBank, `${runId}:hunt`)[0];
  return [picks[0], picks[1], quizzes[0], hunt, picks[2], quizzes[1], picks[3]];
}

export function routeNumber(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
  return String((day % 999) + 1).padStart(3, "0");
}
