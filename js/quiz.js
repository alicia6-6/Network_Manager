// 퀴즈 실행 엔진: quiz.html 에서 사용
const params = new URLSearchParams(location.search);
const MODE = params.get("mode") || "random"; // random | frequent | round | wrong
let ROUND = params.get("round") || "";

const els = {
  toolbar: document.getElementById("toolbar"),
  roundControls: document.getElementById("roundControls"),
  roundSelect: document.getElementById("roundSelect"),
  startRoundBtn: document.getElementById("startRoundBtn"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  scoreText: document.getElementById("scoreText"),
  modeTitle: document.getElementById("modeTitle"),
  modeDesc: document.getElementById("modeDesc"),
  quizArea: document.getElementById("quizArea"),
  resultArea: document.getElementById("resultArea"),
  emptyArea: document.getElementById("emptyArea"),
};

const MODE_INFO = {
  random: { title: "🎲 랜덤 문제 풀기", desc: "전체 기출문제 중 한 문제씩 무작위로 출제됩니다. 원하는 만큼 계속 풀어보세요." },
  frequent: { title: "🔥 빈출문제 풀기", desc: "여러 회차에서 반복 출제된 빈출 개념 문제만 모아서 출제합니다." },
  round: { title: "🗂 차수별로 풀기", desc: "선택한 회차의 문제를 순서대로 풀어봅니다." },
  wrong: { title: "📝 오답노트", desc: "이전에 틀렸던 문제만 다시 풀어봅니다. 맞히면 오답노트에서 자동으로 제거됩니다." },
};

const state = {
  all: [],
  queue: [],
  index: 0,
  correct: 0,
  answered: 0,
  currentAnswered: false,
};

function fmtRoundLabel(r) {
  return r ? r : "전체";
}

async function init() {
  els.modeTitle.textContent = MODE_INFO[MODE]?.title || "문제 풀기";
  els.modeDesc.textContent = MODE_INFO[MODE]?.desc || "";

  const bank = await loadQuestionBank();
  state.all = bank.questions || [];

  if (MODE === "round") {
    const rounds = getRounds(state.all);
    els.roundSelect.innerHTML = rounds
      .map((r) => `<option value="${r}">${r}</option>`)
      .join("");
    if (ROUND) els.roundSelect.value = ROUND;
    els.roundControls.style.display = "flex";
    els.startRoundBtn.addEventListener("click", () => {
      ROUND = els.roundSelect.value;
      startRoundSession();
    });
    if (ROUND) {
      startRoundSession();
    }
    return;
  }

  if (MODE === "frequent") {
    const freq = getFrequentQuestions(state.all, 2);
    if (freq.length === 0) {
      showEmpty("아직 2회 이상 반복 출제된 빈출문제가 없습니다. 기출문제가 더 쌓이면 자동으로 표시됩니다.");
      return;
    }
    state.queue = shuffle(freq);
    beginSequentialSession();
    return;
  }

  if (MODE === "wrong") {
    const wrong = getWrongQuestions();
    if (wrong.length === 0) {
      showEmpty("오답노트가 비어 있습니다. 문제를 풀다가 틀리면 이곳에 자동으로 모입니다.");
      return;
    }
    state.queue = shuffle(wrong);
    beginSequentialSession();
    return;
  }

  // random mode: 무한 랜덤
  if (state.all.length === 0) {
    showEmpty("아직 등록된 문제가 없습니다.");
    return;
  }
  els.toolbar.style.display = "flex";
  els.progressBar.parentElement.style.visibility = "hidden";
  els.progressText.textContent = `누적 ${0}문제`;
  renderRandomQuestion();
}

function startRoundSession() {
  const list = state.all.filter((q) => q.round === ROUND);
  if (list.length === 0) {
    showEmpty("선택한 회차에 등록된 문제가 없습니다.");
    return;
  }
  state.queue = [...list].sort((a, b) => (a.number || 0) - (b.number || 0));
  beginSequentialSession();
}

function beginSequentialSession() {
  state.index = 0;
  state.correct = 0;
  state.answered = 0;
  els.toolbar.style.display = "flex";
  els.progressBar.parentElement.style.visibility = "visible";
  els.resultArea.style.display = "none";
  els.emptyArea.style.display = "none";
  els.quizArea.style.display = "block";
  renderSequentialQuestion();
}

function showEmpty(msg) {
  els.toolbar.style.display = "none";
  els.quizArea.style.display = "none";
  els.resultArea.style.display = "none";
  els.emptyArea.style.display = "block";
  els.emptyArea.innerHTML = `<div class="empty-state"><div class="big">🗒️</div><p>${msg}</p><a class="btn secondary" href="index.html">홈으로</a></div>`;
}

function updateScoreText() {
  els.scoreText.textContent = `정답 ${state.correct} / ${state.answered}`;
}

function renderRandomQuestion() {
  state.currentAnswered = false;
  const q = pickRandom(state.all);
  state._current = q;
  renderQuestionCard(q, { showFreq: false });
  updateScoreText();
}

function renderSequentialQuestion() {
  if (state.index >= state.queue.length) {
    return renderResult();
  }
  state.currentAnswered = false;
  const q = state.queue[state.index];
  state._current = q;
  const pct = Math.round((state.index / state.queue.length) * 100);
  els.progressBar.style.width = pct + "%";
  els.progressText.textContent = `${state.index + 1} / ${state.queue.length}`;
  renderQuestionCard(q, { showFreq: MODE === "frequent" });
  updateScoreText();
}

function renderQuestionCard(q, opts) {
  els.quizArea.style.display = "block";
  els.resultArea.style.display = "none";
  els.emptyArea.style.display = "none";

  const freqBadge =
    opts.showFreq && q.freqCount
      ? `<span class="pill freq">🔥 ${q.freqCount}회 출제 (${q.freqRounds.join(", ")})</span>`
      : "";

  els.quizArea.innerHTML = `
    <div class="q-card">
      <div class="q-meta">
        <span class="pill">${q.round || ""}</span>
        ${q.subject ? `<span class="pill">${q.subject}</span>` : ""}
        ${freqBadge}
      </div>
      <div class="q-text">${escapeHtml(q.question)}</div>
      ${q.image ? `<div class="q-image"><img src="${q.image}" alt="문제 자료 이미지" loading="lazy" /></div>` : ""}
      <div class="choices" id="choicesBox">
        ${q.choices
          .map(
            (c, i) => `
          <div class="choice" data-idx="${i + 1}">
            <span class="num">${i + 1}</span>
            <span class="txt">${escapeHtml(c)}</span>
          </div>`
          )
          .join("")}
      </div>
      <div class="explain-box" id="explainBox"></div>
      <div class="quiz-actions">
        <a class="btn secondary" href="index.html">홈으로</a>
        <div style="display:flex; gap:8px;">
          ${MODE !== "random" ? `<button class="btn ghost" id="skipBtn" type="button">건너뛰기</button>` : ""}
          <button class="btn" id="nextBtn" type="button" disabled>다음 문제</button>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll(".choice").forEach((el) => {
    el.addEventListener("click", () => onSelectChoice(q, parseInt(el.dataset.idx, 10)));
  });

  const nextBtn = document.getElementById("nextBtn");
  nextBtn.addEventListener("click", goNext);
  const skipBtn = document.getElementById("skipBtn");
  if (skipBtn) skipBtn.addEventListener("click", goNext);
}

function onSelectChoice(q, idx) {
  if (state.currentAnswered) return;
  state.currentAnswered = true;
  state.answered++;
  const isCorrect = idx === q.answer;
  if (isCorrect) state.correct++;

  if (MODE === "wrong" || MODE === "random" || MODE === "frequent" || MODE === "round") {
    markAnswerResult(q, isCorrect);
  }

  document.querySelectorAll(".choice").forEach((el) => {
    const elIdx = parseInt(el.dataset.idx, 10);
    el.classList.add("disabled");
    if (elIdx === q.answer) el.classList.add("correct");
    if (elIdx === idx && !isCorrect) el.classList.add("wrong");
    if (elIdx === idx) el.classList.add("selected");
  });

  const explainBox = document.getElementById("explainBox");
  explainBox.classList.add("show");
  explainBox.innerHTML = `
    <div class="head ${isCorrect ? "ok" : "no"}">${isCorrect ? "✅ 정답입니다" : "❌ 오답입니다"}</div>
    <div>${escapeHtml(q.explanation || "해설이 등록되지 않았습니다.")}</div>
  `;

  document.getElementById("nextBtn").disabled = false;
  updateScoreText();
}

function goNext() {
  if (MODE === "random") {
    renderRandomQuestion();
    return;
  }
  state.index++;
  renderSequentialQuestion();
}

function renderResult() {
  els.quizArea.style.display = "none";
  els.resultArea.style.display = "block";
  els.progressBar.style.width = "100%";
  els.progressText.textContent = `${state.queue.length} / ${state.queue.length}`;
  const total = state.queue.length;
  const rate = total ? Math.round((state.correct / total) * 100) : 0;
  els.resultArea.innerHTML = `
    <div class="result-card">
      <div>수고하셨습니다!</div>
      <div class="score">${state.correct} / ${total}</div>
      <div style="color:var(--text-muted); margin-bottom:20px;">정답률 ${rate}%</div>
      <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
        <button class="btn secondary" id="retryBtn" type="button">다시 풀기</button>
        <a class="btn" href="index.html">홈으로</a>
      </div>
    </div>
  `;
  document.getElementById("retryBtn").addEventListener("click", () => {
    if (MODE === "round") startRoundSession();
    else if (MODE === "frequent") {
      state.queue = shuffle(getFrequentQuestions(state.all, 2));
      beginSequentialSession();
    } else if (MODE === "wrong") {
      const wrong = getWrongQuestions();
      if (wrong.length === 0) return showEmpty("오답노트가 비어 있습니다. 모든 문제를 맞혔습니다! 🎉");
      state.queue = shuffle(wrong);
      beginSequentialSession();
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
