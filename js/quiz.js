const params = new URLSearchParams(location.search);
const MODE = params.get("mode") || "random";
let ROUND = params.get("round") || "";
const EXAM_SECONDS = 50 * 60;

const els = Object.fromEntries([
  "toolbar", "roundControls", "roundSelect", "startRoundBtn", "progressBar",
  "progressText", "scoreText", "modeTitle", "modeDesc", "quizArea",
  "resultArea", "emptyArea", "timerCard", "timerText", "examNavigator",
  "questionMap", "answerCount"
].map((id) => [id, document.getElementById(id)]));

const MODE_INFO = {
  random: { title: "랜덤 문제", desc: "전체 기출문제에서 한 문제씩 가볍게 학습합니다." },
  frequent: { title: "빈출문제", desc: "여러 회차에서 반복 출제된 핵심 문제를 모아 학습합니다." },
  round: { title: "회차별 모의시험", desc: "50분 동안 한 회차를 풀고, 제출한 뒤 점수와 해설을 확인하세요." },
  wrong: { title: "오답노트", desc: "이전에 틀린 문제를 다시 풀어 확실하게 복습합니다." },
};

const state = {
  all: [], queue: [], index: 0, correct: 0, answered: 0,
  currentAnswered: false, answers: {}, exam: false, submitted: false,
  remaining: EXAM_SECONDS, timerId: null,
};

async function init() {
  els.modeTitle.textContent = MODE_INFO[MODE]?.title || "문제 풀기";
  els.modeDesc.textContent = MODE_INFO[MODE]?.desc || "";
  try {
    const bank = await loadQuestionBank();
    state.all = bank.questions || [];
  } catch (error) {
    showEmpty("문제 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }

  if (MODE === "round") {
    els.roundSelect.innerHTML = getRounds(state.all).map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    if (ROUND) els.roundSelect.value = ROUND;
    els.roundControls.hidden = false;
    els.startRoundBtn.addEventListener("click", startRoundSession);
    if (ROUND) startRoundSession();
    return;
  }
  if (MODE === "frequent") state.queue = shuffle(getFrequentQuestions(state.all, 2));
  else if (MODE === "wrong") state.queue = shuffle(getWrongQuestions());
  else if (state.all.length) return startRandomMode();

  if (!state.queue.length) return showEmpty(MODE === "wrong" ? "오답노트가 비어 있습니다." : "표시할 문제가 없습니다.");
  beginSequentialSession();
}

function startRoundSession() {
  ROUND = els.roundSelect.value;
  const list = state.all.filter((q) => q.round === ROUND);
  if (!list.length) return showEmpty("선택한 회차에 등록된 문제가 없습니다.");
  stopTimer();
  state.queue = [...list].sort((a, b) => (a.number || 0) - (b.number || 0));
  state.answers = {};
  state.exam = true;
  state.submitted = false;
  state.remaining = EXAM_SECONDS;
  els.roundControls.hidden = true;
  els.timerCard.hidden = false;
  els.examNavigator.hidden = false;
  beginSequentialSession();
  renderQuestionMap();
  updateTimer();
  state.timerId = setInterval(() => {
    state.remaining -= 1;
    updateTimer();
    if (state.remaining <= 0) submitExam(true);
  }, 1000);
}

function beginSequentialSession() {
  state.index = 0; state.correct = 0; state.answered = 0; state.currentAnswered = false;
  els.toolbar.hidden = false; els.resultArea.hidden = true; els.emptyArea.hidden = true;
  els.quizArea.hidden = false;
  renderSequentialQuestion();
}

function startRandomMode() {
  els.toolbar.hidden = false;
  els.progressBar.parentElement.style.visibility = "hidden";
  els.progressText.textContent = "자유 학습";
  renderRandomQuestion();
}

function renderRandomQuestion() {
  state.currentAnswered = false;
  state.lastChoice = null;
  state._current = pickRandom(state.all);
  renderQuestionCard(state._current, { showFreq: false });
  updateScoreText();
}

function renderSequentialQuestion() {
  if (state.index >= state.queue.length) return renderResult();
  const q = state.queue[state.index];
  state._current = q;
  state.currentAnswered = Boolean(state.answers[q.id]);
  els.progressBar.style.width = `${Math.round(((state.index + 1) / state.queue.length) * 100)}%`;
  els.progressText.textContent = `${state.index + 1} / ${state.queue.length}`;
  renderQuestionCard(q, { showFreq: MODE === "frequent" });
  updateScoreText();
}

function renderQuestionCard(q, opts = {}) {
  const saved = state.answers[q.id];
  const freqBadge = opts.showFreq && q.freqCount ? `<span class="pill freq">${q.freqCount}회 출제</span>` : "";
  els.quizArea.innerHTML = `
    <article class="q-card">
      <div class="q-meta"><span class="pill">${escapeHtml(q.round || "")}</span>${q.subject ? `<span class="pill">${escapeHtml(q.subject)}</span>` : ""}${freqBadge}</div>
      <div class="q-number">QUESTION ${String(q.number || state.index + 1).padStart(2, "0")}</div>
      <div class="q-text">${escapeHtml(q.question)}</div>
      ${q.imageText ? `<pre class="q-image-text">${escapeHtml(q.imageText)}</pre>` : q.image ? `<div class="q-image"><img src="${escapeHtml(q.image)}" alt="문제 참고 이미지" /></div>` : ""}
      <div class="choices" id="choicesBox">${q.choices.map((c, i) => `<button class="choice ${saved === i + 1 ? "selected" : ""}" data-idx="${i + 1}" type="button"><span class="num">${i + 1}</span><span class="txt">${escapeHtml(c)}</span></button>`).join("")}</div>
      <div class="explain-box" id="explainBox"></div>
      <div class="quiz-actions">
        <div class="action-group">
          <a class="btn secondary" href="index.html">나가기</a>
          ${MODE === "random" ? `<button class="btn ai-share-trigger" id="shareBtn" type="button">AI에게 질문</button>` : ""}
        </div>
        <div class="action-group">
          ${state.exam && state.index > 0 ? `<button class="btn ghost" id="prevBtn" type="button">이전</button>` : ""}
          ${state.exam ? `<button class="btn ghost" id="nextBtn" type="button">${state.index === state.queue.length - 1 ? "처음으로" : "다음"}</button><button class="btn submit-btn" id="submitBtn" type="button">답안 제출</button>` : `<button class="btn" id="nextBtn" type="button" ${state.currentAnswered ? "" : "disabled"}>다음 문제</button>`}
        </div>
      </div>
      ${MODE === "random" ? `<div class="ai-share-menu" id="aiShareMenu" hidden>
        <div><strong>어디에 질문할까요?</strong><span>문제와 보기가 복사되고 새 창이 열립니다.</span></div>
        <div class="ai-share-links">
          <a id="chatgptLink" class="ai-link chatgpt" href="#" target="_blank" rel="noopener noreferrer"><b>ChatGPT</b><small>OpenAI</small></a>
          <a id="geminiLink" class="ai-link gemini" href="#" target="_blank" rel="noopener noreferrer"><b>Gemini</b><small>Google</small></a>
        </div>
        <p id="shareStatus" aria-live="polite"></p>
      </div>` : ""}
    </article>`;

  document.querySelectorAll(".choice").forEach((choice) => choice.addEventListener("click", () => onSelectChoice(q, Number(choice.dataset.idx))));
  document.getElementById("prevBtn")?.addEventListener("click", () => goToQuestion(state.index - 1));
  document.getElementById("nextBtn")?.addEventListener("click", () => state.exam ? goToQuestion((state.index + 1) % state.queue.length) : goNext());
  document.getElementById("submitBtn")?.addEventListener("click", () => submitExam(false));
  if (MODE === "random") setupAiShare(q);
}

function buildAiPrompt(q) {
  const choices = q.choices.map((choice, index) => `${index + 1}. ${choice}`).join("\n");
  const selected = state.lastChoice ? `\n내가 선택한 답: ${state.lastChoice}번` : "";
  const image = q.image ? `\n참고 이미지: ${new URL(q.image, location.href).href}` : q.imageText ? `\n문제 자료:\n${q.imageText}` : "";
  return `네트워크관리사 2급 문제를 풀고 있어. 아래 문제의 정답과 각 보기가 맞거나 틀린 이유를 초보자도 이해할 수 있게 설명해 줘.\n\n문제: ${q.question}${image}\n\n보기:\n${choices}${selected}`;
}

function setupAiShare(q) {
  const trigger = document.getElementById("shareBtn");
  const menu = document.getElementById("aiShareMenu");
  const chatgpt = document.getElementById("chatgptLink");
  const gemini = document.getElementById("geminiLink");
  const refreshLinks = () => {
    const encoded = encodeURIComponent(buildAiPrompt(q));
    chatgpt.href = `https://chatgpt.com/?q=${encoded}`;
    gemini.href = `https://gemini.google.com/app?text=${encoded}`;
  };
  refreshLinks();
  trigger.addEventListener("click", () => {
    refreshLinks();
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", String(!menu.hidden));
  });
  [chatgpt, gemini].forEach((link) => link.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildAiPrompt(q));
      document.getElementById("shareStatus").textContent = "질문을 복사했습니다. 입력창이 비어 있으면 붙여넣어 주세요.";
    } catch {
      document.getElementById("shareStatus").textContent = "새 창에서 문제와 보기를 붙여넣어 질문해 주세요.";
    }
  }));
}

function onSelectChoice(q, idx) {
  if (state.exam) {
    state.answers[q.id] = idx;
    state.currentAnswered = true;
    document.querySelectorAll(".choice").forEach((el) => el.classList.toggle("selected", Number(el.dataset.idx) === idx));
    renderQuestionMap();
    updateScoreText();
    return;
  }
  if (state.currentAnswered) return;
  state.currentAnswered = true; state.answered++;
  state.lastChoice = idx;
  const isCorrect = idx === q.answer;
  if (isCorrect) state.correct++;
  markAnswerResult(q, isCorrect);
  document.querySelectorAll(".choice").forEach((el) => {
    const n = Number(el.dataset.idx); el.disabled = true;
    if (n === q.answer) el.classList.add("correct");
    if (n === idx && !isCorrect) el.classList.add("wrong");
  });
  const box = document.getElementById("explainBox");
  box.className = "explain-box show";
  box.innerHTML = `<div class="head ${isCorrect ? "ok" : "no"}">${isCorrect ? "정답입니다" : "오답입니다"}</div><div>${escapeHtml(q.explanation || "해설이 등록되지 않았습니다.")}</div>`;
  document.getElementById("nextBtn").disabled = false;
  updateScoreText();
}

function renderQuestionMap() {
  const answered = Object.keys(state.answers).length;
  els.answerCount.textContent = `${answered} / ${state.queue.length} 답변`;
  els.questionMap.innerHTML = state.queue.map((q, i) => `<button type="button" class="map-item ${state.answers[q.id] ? "answered" : ""} ${i === state.index ? "current" : ""}" data-index="${i}" aria-label="${i + 1}번 문제">${i + 1}</button>`).join("");
  els.questionMap.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => goToQuestion(Number(btn.dataset.index))));
}

function goToQuestion(index) { state.index = index; renderSequentialQuestion(); if (state.exam) renderQuestionMap(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function goNext() { if (MODE === "random") return renderRandomQuestion(); state.index++; renderSequentialQuestion(); }

function submitExam(autoSubmitted) {
  if (state.submitted) return;
  const unanswered = state.queue.length - Object.keys(state.answers).length;
  if (!autoSubmitted && unanswered && !confirm(`아직 ${unanswered}문제가 비어 있습니다. 그래도 제출할까요?`)) return;
  state.submitted = true; stopTimer();
  state.correct = state.queue.reduce((sum, q) => {
    const right = state.answers[q.id] === q.answer;
    if (state.answers[q.id]) markAnswerResult(q, right);
    return sum + (right ? 1 : 0);
  }, 0);
  state.answered = Object.keys(state.answers).length;
  renderResult(autoSubmitted);
}

function renderResult(autoSubmitted = false) {
  stopTimer();
  els.quizArea.hidden = true; els.resultArea.hidden = false; els.examNavigator.hidden = true; els.timerCard.hidden = true;
  els.progressBar.style.width = "100%";
  const total = state.queue.length;
  const rate = total ? Math.round((state.correct / total) * 100) : 0;
  const examScore = state.exam ? Math.round((state.correct / total) * 100) : state.correct;
  const reviewRows = state.exam ? state.queue.map((q, i) => {
    const chosen = state.answers[q.id];
    const status = !chosen ? "unanswered" : chosen === q.answer ? "correct" : "wrong";
    const statusText = status === "correct" ? "정답" : status === "wrong" ? "오답" : "미응답";
    const choices = q.choices.map((choice, choiceIndex) => {
      const number = choiceIndex + 1;
      const classes = ["review-choice"];
      if (number === q.answer) classes.push("answer");
      if (number === chosen && number !== q.answer) classes.push("picked-wrong");
      return `<li class="${classes.join(" ")}"><span>${number}</span><p>${escapeHtml(choice)}</p>${number === q.answer ? `<b>정답</b>` : ""}${number === chosen ? `<em>내 선택</em>` : ""}</li>`;
    }).join("");
    return `<details class="review-item ${status}" data-status="${status}" ${status !== "correct" ? "open" : ""}>
      <summary><span class="review-number">${i + 1}번</span><strong>${statusText}</strong><small>${chosen ? `내 답 ${chosen}번 · 정답 ${q.answer}번` : `미응답 · 정답 ${q.answer}번`}</small></summary>
      <div class="review-body">
        <div class="review-question">${escapeHtml(q.question)}</div>
        ${q.imageText ? `<pre class="q-image-text">${escapeHtml(q.imageText)}</pre>` : q.image ? `<div class="q-image review-image"><img src="${escapeHtml(q.image)}" alt="문제 참고 이미지" /></div>` : ""}
        <ol class="review-choices">${choices}</ol>
        <div class="review-explanation"><b>해설</b><p>${escapeHtml(q.explanation || "해설이 등록되지 않았습니다.")}</p></div>
      </div>
    </details>`;
  }).join("") : "";
  els.resultArea.innerHTML = `<section class="result-card"><span class="eyebrow">RESULT</span><h2>${autoSubmitted ? "시간이 종료되어 자동 제출됐습니다" : "채점이 완료됐습니다"}</h2><div class="score">${state.exam ? `${examScore}<small> / 100점</small>` : `${state.correct}<small> / ${total}문제</small>`}</div><div class="result-rate">${state.correct}문제 정답 · 정답률 ${rate}% · ${state.answered}문제 응답</div><div class="result-actions"><button class="btn secondary" id="retryBtn" type="button">다시 풀기</button><a class="btn" href="index.html">홈으로</a></div></section>${reviewRows ? `<section class="review-list"><div class="review-heading"><div><span class="eyebrow">ANSWER REVIEW</span><h2>전체 문제 다시 보기</h2></div><div class="review-filters"><button class="active" type="button" data-filter="all">전체</button><button type="button" data-filter="wrong">오답</button><button type="button" data-filter="correct">정답</button><button type="button" data-filter="unanswered">미응답</button></div></div>${reviewRows}</section>` : ""}`;
  document.getElementById("retryBtn").addEventListener("click", () => MODE === "round" ? (els.roundControls.hidden = false, els.resultArea.hidden = true, els.toolbar.hidden = true) : location.reload());
  document.querySelectorAll(".review-filters button").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".review-filters button").forEach((item) => item.classList.toggle("active", item === button));
    const filter = button.dataset.filter;
    document.querySelectorAll(".review-item").forEach((item) => { item.hidden = filter !== "all" && item.dataset.status !== filter; });
  }));
}

function updateTimer() {
  const m = Math.floor(Math.max(0, state.remaining) / 60);
  const s = Math.max(0, state.remaining) % 60;
  els.timerText.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  els.timerCard.classList.toggle("urgent", state.remaining <= 300);
}
function stopTimer() { if (state.timerId) clearInterval(state.timerId); state.timerId = null; }
function updateScoreText() { els.scoreText.textContent = state.exam ? `${Object.keys(state.answers).length}문제 답변` : `정답 ${state.correct} / ${state.answered}`; }
function showEmpty(msg) { stopTimer(); els.toolbar.hidden = true; els.quizArea.hidden = true; els.resultArea.hidden = true; els.emptyArea.hidden = false; els.emptyArea.innerHTML = `<div class="empty-state"><div class="empty-icon">!</div><p>${escapeHtml(msg)}</p><a class="btn secondary" href="index.html">홈으로</a></div>`; }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value ?? ""); return div.innerHTML; }
window.addEventListener("beforeunload", stopTimer);
init();
