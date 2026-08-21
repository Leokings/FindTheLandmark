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
  sourceSha256?: string;
  evidenceUrl?: string;
  evidenceSha256?: string;
};

const GENLAYER_DOCS_COMMIT = "9699f3900dd697689090f6595f5c14b4f0a60fdf";

function genLayerSource(label: string, path: string, sourceSha256: string) {
  return {
    sourceLabel: `GenLayer Docs · ${label}`,
    sourceUrl: `https://raw.githubusercontent.com/genlayerlabs/genlayer-docs/${GENLAYER_DOCS_COMMIT}/pages/${path}`,
    sourceSha256,
  };
}

function unescoSource(label: string, listId: number) {
  return {
    sourceLabel: `UNESCO World Heritage DataHub · ${label}`,
    sourceUrl: `https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?where=id_no%3D${listId}&limit=1`,
    sourceSha256: "",
  };
}

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
  {
    kind: "identify", challengeId: "quick-eiffel-001", question: "Name this landmark.",
    options: ["Eiffel Tower", "Tokyo Tower", "Blackpool Tower", "CN Tower"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Eiffel Tower", city: "Paris, France",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/1280px-Tour_Eiffel_Wikimedia_Commons.jpg",
    credit: "Benh LIEU SONG / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Wikimedia_Commons.jpg",
  },
  {
    kind: "identify", challengeId: "quick-colosseum-001", question: "Name this landmark.",
    options: ["Arena of Verona", "Colosseum", "Pantheon", "Roman Forum"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Colosseum", city: "Rome, Italy",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Colosseum_in_Rome-April_2007-1-_copie_2B.jpg/1280px-Colosseum_in_Rome-April_2007-1-_copie_2B.jpg",
    credit: "Diliff / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Colosseum_in_Rome-April_2007-1-_copie_2B.jpg",
  },
  {
    kind: "identify", challengeId: "quick-sphinx-001", question: "Name this landmark.",
    options: ["Great Sphinx of Giza", "Lion of Babylon", "Mount Rushmore", "Abu Simbel"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Great Sphinx of Giza", city: "Giza, Egypt",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Great_Sphinx_of_Giza_%28%D8%A3%D8%A8%D9%88_%D8%A7%D9%84%D9%87%D9%88%D9%84%29.jpg/1280px-Great_Sphinx_of_Giza_%28%D8%A3%D8%A8%D9%88_%D8%A7%D9%84%D9%87%D9%88%D9%84%29.jpg",
    credit: "Petar Milošević / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Great_Sphinx_of_Giza_(%D8%A3%D8%A8%D9%88_%D8%A7%D9%84%D9%87%D9%88%D9%84).jpg",
  },
  {
    kind: "identify", challengeId: "quick-big-ben-001", question: "Name this landmark.",
    options: ["Elizabeth Tower", "Victoria Tower", "Peace Tower", "Palace of Culture"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Elizabeth Tower", city: "London, United Kingdom",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Big_Ben_at_sunset_-_2014-10-27_17-30.jpg/1280px-Big_Ben_at_sunset_-_2014-10-27_17-30.jpg",
    credit: "Colin / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Big_Ben_at_sunset_-_2014-10-27_17-30.jpg",
  },
  {
    kind: "identify", challengeId: "quick-burj-001", question: "Name this landmark.",
    options: ["Shanghai Tower", "Burj Khalifa", "Merdeka 118", "Taipei 101"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Burj Khalifa", city: "Dubai, United Arab Emirates",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Burj_Khalifa_%2816260269606%29.jpg/1280px-Burj_Khalifa_%2816260269606%29.jpg",
    credit: "Laika ac / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Burj_Khalifa_(16260269606).jpg",
  },
  {
    kind: "identify", challengeId: "quick-chichen-001", question: "Name this landmark.",
    options: ["Chichén Itzá", "Tikal", "Uxmal", "Teotihuacan"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Chichén Itzá", city: "Yucatán, Mexico",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Chichen_Itza_3.jpg/1280px-Chichen_Itza_3.jpg",
    credit: "Daniel Schwen / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Chichen_Itza_3.jpg",
  },
  {
    kind: "identify", challengeId: "quick-moai-001", question: "Name this landmark.",
    options: ["Moai of Rapa Nui", "Olmec colossal head", "Terracotta Army", "Stonehenge"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Moai of Rapa Nui", city: "Easter Island, Chile",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Moai_Rano_raraku.jpg/1280px-Moai_Rano_raraku.jpg",
    credit: "Aurbina / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Moai_Rano_raraku.jpg",
  },
  {
    kind: "identify", challengeId: "quick-pisa-001", question: "Name this landmark.",
    options: ["Leaning Tower of Pisa", "Giotto's Campanile", "Torre del Mangia", "Asinelli Tower"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Leaning Tower of Pisa", city: "Pisa, Italy",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/The_Duomo_and_Tower_of_Pisa_at_sunrise.jpg/1280px-The_Duomo_and_Tower_of_Pisa_at_sunrise.jpg",
    credit: "MHoser / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:The_Duomo_and_Tower_of_Pisa_at_sunrise.jpg",
  },
  {
    kind: "identify", challengeId: "quick-neuschwanstein-001", question: "Name this landmark.",
    options: ["Hohenzollern Castle", "Neuschwanstein Castle", "Alcázar of Segovia", "Bran Castle"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Neuschwanstein Castle", city: "Bavaria, Germany",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Neuschwanstein_Castle_2024-02.jpg/1280px-Neuschwanstein_Castle_2024-02.jpg",
    credit: "Wilfredor / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Neuschwanstein_Castle_2024-02.jpg",
  },
  {
    kind: "identify", challengeId: "quick-rushmore-001", question: "Name this landmark.",
    options: ["Crazy Horse Memorial", "Mount Rushmore", "Stone Mountain", "Presidents' Heads"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Mount Rushmore", city: "South Dakota, USA",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Dean_Franklin_-_06.04.03_Mount_Rushmore_Monument_%28by-sa%29.jpg/1280px-Dean_Franklin_-_06.04.03_Mount_Rushmore_Monument_%28by-sa%29.jpg",
    credit: "Dean Franklin / Wikimedia Commons",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Dean_Franklin_-_06.04.03_Mount_Rushmore_Monument_(by-sa).jpg",
  },
  {
    kind: "identify", challengeId: "quick-hagia-sophia-001", question: "Name this landmark.",
    options: ["Blue Mosque", "Hagia Sophia", "Süleymaniye Mosque", "Basilica of San Vitale"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Hagia Sophia", city: "Istanbul, Türkiye",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Hagia_Sophia_%28228968325%29.jpeg/1280px-Hagia_Sophia_%28228968325%29.jpeg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Hagia_Sophia_(228968325).jpeg",
  },
  {
    kind: "identify", challengeId: "quick-tower-bridge-001", question: "Name this landmark.",
    options: ["London Bridge", "Tower Bridge", "Brooklyn Bridge", "Forth Bridge"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Tower Bridge", city: "London, United Kingdom",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Tower_Bridge_at_Dawn.jpg/1280px-Tower_Bridge_at_Dawn.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Tower_Bridge_at_Dawn.jpg",
  },
  {
    kind: "identify", challengeId: "quick-brandenburg-001", question: "Name this landmark.",
    options: ["Arc de Triomphe", "Brandenburg Gate", "India Gate", "Siegestor"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Brandenburg Gate", city: "Berlin, Germany",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Brandenburger_Tor_abends.jpg/1280px-Brandenburger_Tor_abends.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Brandenburger_Tor_abends.jpg",
  },
  {
    kind: "identify", challengeId: "quick-gateway-india-001", question: "Name this landmark.",
    options: ["India Gate", "Gateway of India", "Buland Darwaza", "Rumi Darwaza"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Gateway of India", city: "Mumbai, India",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Mumbai_03-2016_30_Gateway_of_India.jpg/1280px-Mumbai_03-2016_30_Gateway_of_India.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Mumbai_03-2016_30_Gateway_of_India.jpg",
  },
  {
    kind: "identify", challengeId: "quick-cn-tower-001", question: "Name this landmark.",
    options: ["Space Needle", "CN Tower", "Tokyo Skytree", "Oriental Pearl Tower"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "CN Tower", city: "Toronto, Canada",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/CN_Tower%2C_Toronto%2C_Canada_%28Unsplash_DJ_kOgH5u0o%29.jpg/1280px-CN_Tower%2C_Toronto%2C_Canada_%28Unsplash_DJ_kOgH5u0o%29.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:CN_Tower,_Toronto,_Canada_(Unsplash_DJ_kOgH5u0o).jpg",
  },
  {
    kind: "identify", challengeId: "quick-marina-bay-001", question: "Name this landmark.",
    options: ["Marina Bay Sands", "The Venetian Macao", "Atlantis The Palm", "Petronas Towers"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Marina Bay Sands", city: "Singapore",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Marina_Bay_Sands_%28I%29.jpg/1280px-Marina_Bay_Sands_%28I%29.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Marina_Bay_Sands_(I).jpg",
  },
  {
    kind: "identify", challengeId: "quick-arc-triomphe-001", question: "Name this landmark.",
    options: ["Arc de Triomphe", "Brandenburg Gate", "Marble Arch", "Arch of Constantine"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Arc de Triomphe", city: "Paris, France",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Arc_de_Triomphe%2C_Paris_21_October_2010.jpg/1280px-Arc_de_Triomphe%2C_Paris_21_October_2010.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Arc_de_Triomphe,_Paris_21_October_2010.jpg",
  },
  {
    kind: "identify", challengeId: "quick-stonehenge-001", question: "Name this landmark.",
    options: ["Stonehenge", "Callanish Stones", "Avebury", "Carnac stones"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Stonehenge", city: "Wiltshire, United Kingdom",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Stonehenge2007_07_30.jpg/1280px-Stonehenge2007_07_30.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Stonehenge2007_07_30.jpg",
  },
  {
    kind: "identify", challengeId: "quick-st-basil-001", question: "Name this landmark.",
    options: ["Saint Basil's Cathedral", "Church of the Savior on Spilled Blood", "Kazan Cathedral", "Alexander Nevsky Cathedral"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Saint Basil's Cathedral", city: "Moscow, Russia",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Saint_Basil%27s_Cathedral_in_Moscow.jpg/1280px-Saint_Basil%27s_Cathedral_in_Moscow.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Saint_Basil's_Cathedral_in_Moscow.jpg",
  },
  {
    kind: "identify", challengeId: "quick-forbidden-city-001", question: "Name this landmark.",
    options: ["Forbidden City", "Temple of Heaven", "Gyeongbokgung Palace", "Potala Palace"],
    durationMs: 20_000, rewardXp: 100, speedBonus: 50, place: "Forbidden City", city: "Beijing, China",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/The_Forbidden_City_-_View_from_Coal_Hill.jpg/1280px-The_Forbidden_City_-_View_from_Coal_Hill.jpg",
    credit: "Wikimedia Commons contributors",
    creditUrl: "https://commons.wikimedia.org/wiki/File:The_Forbidden_City_-_View_from_Coal_Hill.jpg",
  },
];

const quizBank: readonly GameRound[] = [
  {
    kind: "quiz", challengeId: "quiz-paris-seine-001", question: "Which landmark belongs to the UNESCO property Paris, Banks of the Seine?",
    options: ["Burj Khalifa", "Sydney Opera House", "Eiffel Tower", "Empire State Building"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Timeline check", city: "Atlas quiz",
    ...unescoSource("Paris, Banks of the Seine", 600),
  },
  {
    kind: "quiz", challengeId: "quiz-mausoleum-001", question: "Which landmark was commissioned as a mausoleum?",
    options: ["Colosseum", "Sagrada Família", "Taj Mahal", "Statue of Liberty"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Purpose check", city: "Atlas quiz",
    ...unescoSource("Taj Mahal", 252),
  },
  {
    kind: "quiz", challengeId: "quiz-jordan-001", question: "Which landmark is in Jordan?",
    options: ["Petra", "Machu Picchu", "Angkor Wat", "Moai of Rapa Nui"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Map check", city: "Atlas quiz",
    ...unescoSource("Petra", 326),
  },
  {
    kind: "quiz", challengeId: "quiz-sydney-unesco-001", question: "Which landmark is Australia's UNESCO-listed performing-arts icon?",
    options: ["Brooklyn Bridge", "Tower Bridge", "Sydney Opera House", "Akashi Kaikyō Bridge"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Culture check", city: "Atlas quiz",
    ...unescoSource("Sydney Opera House", 166),
  },
  {
    kind: "quiz", challengeId: "quiz-gaudi-001", question: "Which landmark is most closely associated with Antoni Gaudí?",
    options: ["Sagrada Família", "Sacré-Cœur", "Milan Cathedral", "St. Paul's Cathedral"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Architect check", city: "Atlas quiz",
    ...unescoSource("Works of Antoni Gaudí", 320),
  },
  {
    kind: "quiz", challengeId: "quiz-rio-001", question: "Which landmark is located in Rio de Janeiro?",
    options: ["Christ the Redeemer", "Cristo Rei", "Atomium", "Monumental Axis"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "City check", city: "Atlas quiz",
    ...unescoSource("Rio de Janeiro: Carioca Landscapes", 1100),
  },
  {
    kind: "quiz", challengeId: "quiz-liberty-island-001", question: "Which landmark stands on Liberty Island?",
    options: ["Statue of Liberty", "Freedom Monument", "Motherland Monument", "Angel of Independence"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Island check", city: "Atlas quiz",
    ...unescoSource("Statue of Liberty", 307),
  },
  {
    kind: "quiz", challengeId: "quiz-cambodia-001", question: "Which landmark is in Cambodia?",
    options: ["Bagan", "Borobudur", "Angkor Wat", "Prambanan"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Country check", city: "Atlas quiz",
    ...unescoSource("Angkor", 668),
  },
  {
    kind: "quiz", challengeId: "quiz-fujisan-001", question: "Which landmark is the cultural property UNESCO calls Fujisan?",
    options: ["Mount Fuji", "Mount Etna", "Mount Rainier", "Mount Ararat"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Mountain check", city: "Atlas quiz",
    ...unescoSource("Fujisan", 1418),
  },
  {
    kind: "quiz", challengeId: "quiz-barcelona-001", question: "Which landmark is in Barcelona?",
    options: ["Sagrada Família", "Hagia Sophia", "Saint Basil's Cathedral", "Cologne Cathedral"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "City check", city: "Atlas quiz",
    ...unescoSource("Works of Antoni Gaudí", 320),
  },
  {
    kind: "quiz", challengeId: "quiz-stonehenge-001", question: "Which landmark is part of UNESCO's Stonehenge, Avebury and Associated Sites?",
    options: ["Stonehenge", "Brooklyn Bridge", "Forth Bridge", "Golden Gate Bridge"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Heritage check", city: "Atlas quiz",
    ...unescoSource("Stonehenge, Avebury and Associated Sites", 373),
  },
  {
    kind: "quiz", challengeId: "quiz-rapa-nui-001", question: "Which landmark is found on Rapa Nui?",
    options: ["Moai", "Stonehenge", "Terracotta Army", "Olmec heads"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Island check", city: "Atlas quiz",
    ...unescoSource("Rapa Nui National Park", 715),
  },
  {
    kind: "quiz", challengeId: "quiz-agra-001", question: "Which landmark is in Agra?",
    options: ["Taj Mahal", "Gateway of India", "India Gate", "Hawa Mahal"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "City check", city: "Atlas quiz",
    ...unescoSource("Taj Mahal", 252),
  },
  {
    kind: "quiz", challengeId: "quiz-inca-001", question: "Which landmark is an ancient Inca citadel?",
    options: ["Machu Picchu", "Chichén Itzá", "Petra", "Angkor Wat"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Civilization check", city: "Atlas quiz",
    ...unescoSource("Historic Sanctuary of Machu Picchu", 274),
  },
  {
    kind: "quiz", challengeId: "quiz-honshu-001", question: "Which landmark is on Honshu, Japan?",
    options: ["Mount Fuji", "Mount Etna", "Mount Rainier", "Mount Ararat"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Island check", city: "Atlas quiz",
    ...unescoSource("Fujisan", 1418),
  },
];

const genLayerQuizBank: readonly GameRound[] = [
  {
    kind: "quiz", challengeId: "genlayer-exec-prompt-001", question: "Which GenLayer function sends a prompt to an LLM?",
    options: ["gl.nondet.web.get()", "gl.nondet.exec_prompt()", "gl.vm.run_nondet_unsafe()", "gl.public.write"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Calling LLMs", city: "GenLayer docs",
    ...genLayerSource("Calling LLMs", "developers/intelligent-contracts/features/calling-llms.mdx", "1f42760bee718355a87ac111259fca665b14e834a4d8e0ab1739918569c87722"),
  },
  {
    kind: "quiz", challengeId: "genlayer-image-limit-001", question: "What is the documented maximum number of images in one exec_prompt call?",
    options: ["One", "Two", "Four", "Eight"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Calling LLMs", city: "GenLayer docs",
    ...genLayerSource("Calling LLMs", "developers/intelligent-contracts/features/calling-llms.mdx", "1f42760bee718355a87ac111259fca665b14e834a4d8e0ab1739918569c87722"),
  },
  {
    kind: "quiz", challengeId: "genlayer-nondet-block-001", question: "Where must gl.nondet operations execute?",
    options: ["Inside a nondeterministic block", "Only in the constructor", "Only in view functions", "Outside the contract"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Non-determinism", city: "GenLayer docs",
    ...genLayerSource("Non-determinism", "developers/intelligent-contracts/features/non-determinism.mdx", "7b74be7ae6c01befc81bc8482c0a1548d42f6ca82f346d6aca77be78f0902608"),
  },
  {
    kind: "quiz", challengeId: "genlayer-storage-write-001", question: "Which operation must remain outside a nondeterministic block?",
    options: ["LLM prompts", "Web requests", "Storage writes", "Validator comparisons"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Non-determinism", city: "GenLayer docs",
    ...genLayerSource("Non-determinism", "developers/intelligent-contracts/features/non-determinism.mdx", "7b74be7ae6c01befc81bc8482c0a1548d42f6ca82f346d6aca77be78f0902608"),
  },
  {
    kind: "quiz", challengeId: "genlayer-language-001", question: "Which language is used to write GenLayer Intelligent Contracts?",
    options: ["Python", "Solidity", "Rust", "Go"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Introduction", city: "GenLayer docs",
    ...genLayerSource("Introduction", "developers/intelligent-contracts/introduction.mdx", "95f3ecb0c05465f3d525d7ea7406d228ad462960b83a3ecb168b19c57c64a30f"),
  },
  {
    kind: "quiz", challengeId: "genlayer-view-decorator-001", question: "Which decorator marks a read-only Intelligent Contract method?",
    options: ["@gl.public.view", "@gl.public.write", "@gl.public.write.payable", "@gl.contract_interface"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Public methods", city: "GenLayer docs",
    ...genLayerSource("Features overview", "developers/intelligent-contracts/features.mdx", "cb20bd015db1957afd6f93fa719cc07013b6778734621cd40bc825f2af31417f"),
  },
  {
    kind: "quiz", challengeId: "genlayer-payable-decorator-001", question: "Which decorator marks a public method that can modify state and receive value?",
    options: ["@gl.public.write.payable", "@gl.public.view", "@gl.public.write", "@gl.nondet"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Public methods", city: "GenLayer docs",
    ...genLayerSource("Features overview", "developers/intelligent-contracts/features.mdx", "cb20bd015db1957afd6f93fa719cc07013b6778734621cd40bc825f2af31417f"),
  },
  {
    kind: "quiz", challengeId: "genlayer-equivalence-purpose-001", question: "What is the Equivalence Principle used for?",
    options: ["Reaching consensus on nondeterministic results", "Calculating gas fees", "Encrypting contract storage", "Creating wallet addresses"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Equivalence Principle", city: "GenLayer docs",
    ...genLayerSource("Equivalence Principle", "developers/intelligent-contracts/equivalence-principle.mdx", "ecf116d9a4d0f72b56000a0111ed167106f1b2b6916673bbdd86bbfa23dbd59b"),
  },
  {
    kind: "quiz", challengeId: "genlayer-validator-role-001", question: "What must validators do with a leader's proposed nondeterministic result?",
    options: ["Independently verify it", "Accept it automatically", "Store it offchain only", "Replace it with the first answer"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Consensus", city: "GenLayer docs",
    ...genLayerSource("Equivalence Principle", "developers/intelligent-contracts/equivalence-principle.mdx", "ecf116d9a4d0f72b56000a0111ed167106f1b2b6916673bbdd86bbfa23dbd59b"),
  },
  {
    kind: "quiz", challengeId: "genlayer-strict-eq-001", question: "When is strict_eq the best comparison mode?",
    options: ["When results should match exactly", "When any plausible answer is enough", "When storage is encrypted", "When no validators are available"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Equivalence Principle", city: "GenLayer docs",
    ...genLayerSource("Equivalence Principle", "developers/intelligent-contracts/equivalence-principle.mdx", "ecf116d9a4d0f72b56000a0111ed167106f1b2b6916673bbdd86bbfa23dbd59b"),
  },
  {
    kind: "quiz", challengeId: "genlayer-view-call-001", question: "How does view() interact with another Intelligent Contract?",
    options: ["It reads synchronously and returns a value", "It queues an asynchronous write", "It deploys a new contract", "It starts an appeal"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Contract calls", city: "GenLayer docs",
    ...genLayerSource("Interacting with Intelligent Contracts", "developers/intelligent-contracts/features/interacting-with-intelligent-contracts.mdx", "f5e2b93d543e384b448ef0ce02aad09d838be21626f0bac0474719c3ab1563b3"),
  },
  {
    kind: "quiz", challengeId: "genlayer-emit-call-001", question: "How does emit() interact with another Intelligent Contract?",
    options: ["It queues an asynchronous write message", "It performs a synchronous read", "It downloads a web page", "It creates a validator"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Contract calls", city: "GenLayer docs",
    ...genLayerSource("Interacting with Intelligent Contracts", "developers/intelligent-contracts/features/interacting-with-intelligent-contracts.mdx", "f5e2b93d543e384b448ef0ce02aad09d838be21626f0bac0474719c3ab1563b3"),
  },
  {
    kind: "quiz", challengeId: "genlayer-finalized-message-001", question: "What is the safe default timing for an internal message?",
    options: ["on='finalized'", "on='accepted'", "on='pending'", "on='leader'"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Internal messages", city: "GenLayer docs",
    ...genLayerSource("Messages", "developers/intelligent-contracts/features/messages.mdx", "9280288a2f14ce6e05152087f803aab5697c6df075664a62008cbcd30785c570"),
  },
  {
    kind: "quiz", challengeId: "genlayer-origin-address-001", question: "What does gl.message.origin_address represent?",
    options: ["The original transaction submitter", "The current validator", "The contract's own address", "The latest internal-message sender"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Transaction context", city: "GenLayer docs",
    ...genLayerSource("Transaction Context", "developers/intelligent-contracts/features/transaction-context.mdx", "c6d603432d54261cd8128e530005809d4a68da0e1d3a55265f4df88b916f2268"),
  },
  {
    kind: "quiz", challengeId: "genlayer-transaction-time-001", question: "Which time do validators observe while executing the same transaction?",
    options: ["A timestamp pinned to the transaction", "Each validator's wall-clock time", "The contract deployment time", "The user's browser time"],
    durationMs: 25_000, rewardXp: 75, speedBonus: 25, place: "Transaction context", city: "GenLayer docs",
    ...genLayerSource("Transaction Context", "developers/intelligent-contracts/features/transaction-context.mdx", "c6d603432d54261cd8128e530005809d4a68da0e1d3a55265f4df88b916f2268"),
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

function withShuffledOptions(round: GameRound): GameRound {
  return {
    ...round,
    options: shuffled(round.options) as [string, string, string, string],
  };
}

export const CONTENT_POOL_COUNTS = Object.freeze({
  landmarks: identifyBank.length,
  atlas: quizBank.length,
  genLayerDocs: genLayerQuizBank.length,
  total: identifyBank.length + quizBank.length + genLayerQuizBank.length,
});

export function createGamePlan(): GameRound[] {
  const landmarks = shuffled(identifyBank).slice(0, 5);
  const quizzes = shuffled(quizBank).slice(0, 3);
  const docs = shuffled(genLayerQuizBank).slice(0, 4);
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
  ].map(withShuffledOptions);
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
    source_sha256: round.sourceSha256 ?? "",
    evidence_url: round.evidenceUrl ?? "",
    evidence_sha256: round.evidenceSha256 ?? "",
  }));
}
