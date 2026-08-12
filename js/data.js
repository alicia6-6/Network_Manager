// 문제 데이터 로딩 및 공통 유틸리티
const DATA_URL = "data/questions.json";
const WRONG_NOTE_KEY = "nm2_wrong_note_v1";
const EXAM_HISTORY_KEY = "nm2_exam_history_v1";

let _cache = null;

async function loadQuestionBank() {
  if (_cache) return _cache;
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("문제 데이터를 불러오지 못했습니다.");
  const json = await res.json();
  _cache = json;
  return json;
}

function normalizeText(str) {
  return String(str || "")
    .replace(/\s+/g, "")
    .replace(/[.,·・\-()\[\]{}'"“”‘’!?~%]/g, "")
    .toLowerCase();
}

// 동일/유사 문제를 하나의 그룹으로 묶어 출제 빈도를 계산한다.
function groupByFrequency(questions) {
  const groups = new Map();
  questions.forEach((q) => {
    const key = normalizeText(q.question);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  });
  return groups;
}

function getFrequentQuestions(questions, minCount = 2) {
  const groups = groupByFrequency(questions);
  const result = [];
  groups.forEach((arr) => {
    if (arr.length >= minCount) {
      const sorted = [...arr].sort((a, b) => (a.round > b.round ? 1 : -1));
      const rep = sorted[sorted.length - 1];
      result.push({
        ...rep,
        freqCount: arr.length,
        freqRounds: [...new Set(arr.map((a) => a.round))],
      });
    }
  });
  result.sort((a, b) => b.freqCount - a.freqCount);
  return result;
}

function getRounds(questions) {
  const set = new Set(questions.map((q) => q.round));
  return [...set].sort();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- 오답노트 (localStorage) ----
function loadWrongNote() {
  try {
    return JSON.parse(localStorage.getItem(WRONG_NOTE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveWrongNote(note) {
  localStorage.setItem(WRONG_NOTE_KEY, JSON.stringify(note));
}

function markAnswerResult(question, isCorrect) {
  const note = loadWrongNote();
  if (isCorrect) {
    if (note[question.id]) delete note[question.id];
  } else {
    note[question.id] = { ...question, missedAt: new Date().toISOString() };
  }
  saveWrongNote(note);
}

function getWrongQuestions() {
  const note = loadWrongNote();
  return Object.values(note);
}

function clearWrongNote() {
  saveWrongNote({});
}

// ---- 모의고사 응시 기록 (localStorage) ----
function loadExamHistory() {
  try {
    return JSON.parse(localStorage.getItem(EXAM_HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveExamAttempt(entry) {
  const history = loadExamHistory();
  history.unshift(entry);
  localStorage.setItem(EXAM_HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
}

function getExamAttempts(round) {
  const history = loadExamHistory();
  return round ? history.filter((e) => e.round === round) : history;
}
