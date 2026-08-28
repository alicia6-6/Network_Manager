(() => {
  "use strict";

  const roundSelect = document.getElementById("roundSelect");
  const roundDateEl = document.getElementById("roundDate");
  const prevBtn = document.getElementById("prevRoundBtn");
  const nextBtn = document.getElementById("nextRoundBtn");
  const area = document.getElementById("practicalArea");
  const emptyEl = document.getElementById("practicalEmpty");
  const modeRoundBtn = document.getElementById("modeRoundBtn");
  const modeRandomBtn = document.getElementById("modeRandomBtn");
  const roundBar = document.getElementById("roundBar");
  const randomBar = document.getElementById("randomBar");
  const randomScoreEl = document.getElementById("randomScore");
  const randomProgressEl = document.getElementById("randomProgress");
  const nextRandomBtn = document.getElementById("nextRandomBtn");

  let rounds = [];
  let pool = [];
  let mode = "round";
  let randomQueue = [];
  let randomIndex = 0;
  let currentRandomEntry = null;
  const randomStats = { asked: 0, correct: 0 };

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  function nl2br(escaped) {
    return escaped.replace(/\n/g, "<br>");
  }

  function textBlock(text) {
    return `<div class="q-text">${nl2br(escapeHtml(text))}</div>`;
  }

  function answerBlock(answer, explanation, revealed = true) {
    let html = `<div class="explain-box${revealed ? " show" : ""}"><div class="head ok">✓ 정답</div>`;
    html += `<div class="q-text" style="margin:0 0 10px;font-size:1rem;">${nl2br(escapeHtml(answer))}</div>`;
    if (explanation) {
      html += `<div class="practical-explain">${nl2br(escapeHtml(explanation))}</div>`;
    }
    html += `</div>`;
    return html;
  }

  // Parses "라벨 : 값" lines (used by IP/서브넷 answers) into {label, value} pairs.
  function parseLabelValueLines(answerStr) {
    return String(answerStr || "")
      .split("\n")
      .map((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return { label: "", value: line.trim() };
        return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
      })
      .filter((item) => item.value);
  }

  // Splits a 단답형 answer into acceptable alternative phrasings (comma / "또는" separated).
  function parseAlternatives(answerStr) {
    return String(answerStr || "")
      .split(/,|또는/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Splits a multi-blank 단답형 answer like "(A) 128 또는 128bit  (B) 애니 또는 애니캐스트"
  // into separate {label, value} parts so each blank gets its own input field.
  function parseLabeledAnswerParts(answerStr) {
    const parts = String(answerStr || "").split(/\(([A-Z])\)\s*[:：]?\s*/);
    const labeled = [];
    for (let i = 1; i < parts.length; i += 2) {
      const value = (parts[i + 1] || "").trim();
      if (value) labeled.push({ label: parts[i], value });
    }
    return labeled;
  }

  function normalizeStrict(str) {
    return String(str || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function normalizeFree(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/[\s:.\-]/g, "");
  }

  function isFreeAnswerCorrect(userInput, answerStr) {
    const userNorm = normalizeFree(userInput);
    if (!userNorm) return false;
    return parseAlternatives(answerStr).some((alt) => {
      const altNorm = normalizeFree(alt);
      return altNorm && userNorm === altNorm;
    });
  }

  // Pulls "보기N>텍스트" / "①텍스트" choice lines out of a 선택형 prompt, leaving the question stem.
  function parseChoiceLines(prompt) {
    const lines = String(prompt || "").split("\n");
    const choices = [];
    const stemLines = [];
    lines.forEach((line) => {
      const trimmed = line.trim();
      const m1 = /^(보기\d+)\s*[>:.]?\s*(.*)$/.exec(trimmed);
      const m2 = /^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$/.exec(trimmed);
      if (m1) choices.push({ label: m1[1], text: m1[2].trim() });
      else if (m2) choices.push({ label: m2[1], text: m2[2].trim() });
      else stemLines.push(line);
    });
    return { stem: stemLines.join("\n").trim(), choices };
  }

  // Reads the leading comma-separated choice labels off a 선택형 answer (before the parenthetical gloss).
  function parseChoiceAnswerLabels(answerStr) {
    const parts = String(answerStr || "").split(",").map((s) => s.trim());
    const labels = [];
    for (const part of parts) {
      const m = /^(보기\d+|[①②③④⑤⑥⑦⑧⑨⑩])/.exec(part);
      if (m) labels.push(m[1]);
      else break;
    }
    return labels;
  }

  function answerCheckBlock(fieldsHtml) {
    return `
      <div class="answer-check">
        <div class="answer-fields">${fieldsHtml}</div>
        <div class="answer-actions">
          <button type="button" class="btn check-btn">정답 확인</button>
          <button type="button" class="btn ghost reveal-btn">정답 보기</button>
        </div>
        <div class="check-summary"></div>
      </div>`;
  }

  function choiceCheckBlock(choices, answerStr) {
    const optionsHtml = choices.map((c) => `
      <button type="button" class="choice-opt" data-label="${escapeHtml(c.label)}">
        <span class="opt-label">${escapeHtml(c.label)}</span><span class="opt-text">${escapeHtml(c.text)}</span>
      </button>`).join("");
    return `
      <div class="choice-check" data-answer="${escapeHtml(answerStr || "")}">
        <div class="choice-options">${optionsHtml}</div>
        <div class="answer-actions">
          <button type="button" class="btn check-choice-btn">정답 확인</button>
          <button type="button" class="btn ghost reveal-btn">정답 보기</button>
        </div>
        <div class="check-summary"></div>
      </div>`;
  }

  function topologyBlock(topology) {
    if (!topology) return "";
    return `<div class="plain-box"><b class="pb-label">구성도</b>${nl2br(escapeHtml(topology))}</div>`;
  }

  function roundPill(roundLabel) {
    return roundLabel ? `<span class="pill round-pill">${escapeHtml(roundLabel)}</span>` : "";
  }

  function ipCard(ip, roundLabel) {
    if (!ip) return "";
    const fields = parseLabelValueLines(ip.answer);
    const fieldsHtml = fields.map((f, i) => `
      <div class="answer-field">
        <label for="ipf-${ip.number}-${i}">${escapeHtml(f.label || `값 ${i + 1}`)}</label>
        <input type="text" id="ipf-${ip.number}-${i}" class="answer-input" data-expected="${escapeHtml(f.value)}" autocomplete="off" spellcheck="false" placeholder="정답 입력">
        <span class="field-mark"></span>
      </div>`).join("");
    return `
      <div class="practical-card q-card">
        <div class="q-meta">
          ${roundPill(roundLabel)}
          <span class="pill">${ip.number}번</span>
          <span class="pill">IP/서브넷</span>
          <span class="pill answer">정답 확인 가능</span>
        </div>
        <div class="practical-given"><b>제시된 네트워크:</b> <code>${escapeHtml(ip.given || "")}</code></div>
        ${textBlock(ip.prompt || "")}
        ${answerCheckBlock(fieldsHtml)}
        ${answerBlock(ip.answer, ip.explanation, false)}
      </div>`;
  }

  function practiceCard(item) {
    return `
      <div class="practical-card q-card practice-only">
        <div class="q-meta">
          <span class="pill">${item.number}번</span>
          <span class="pill">${escapeHtml(item.category || "")}</span>
          <span class="pill no-answer">문제만 제공 · 정답 없음</span>
        </div>
        ${textBlock(item.prompt || "")}
      </div>`;
  }

  function shortAnswerArea(item) {
    return `
      ${answerCheckBlock(`
        <div class="answer-field wide">
          <input type="text" class="answer-input" data-full-answer="${escapeHtml(item.answer || "")}" autocomplete="off" spellcheck="false" placeholder="정답 입력">
          <span class="field-mark"></span>
        </div>`)}
      ${answerBlock(item.answer, item.explanation, false)}`;
  }

  // For 단답형 answers with multiple labeled blanks (A, B, ...), give each its own input.
  function multiFieldAnswerArea(item, labeledParts) {
    const fieldsHtml = labeledParts.map((part, i) => `
      <div class="answer-field">
        <label for="wf-${item.number}-${i}">${escapeHtml(part.label)}</label>
        <input type="text" id="wf-${item.number}-${i}" class="answer-input" data-full-answer="${escapeHtml(part.value)}" autocomplete="off" spellcheck="false" placeholder="정답 입력">
        <span class="field-mark"></span>
      </div>`).join("");
    return `
      ${answerCheckBlock(fieldsHtml)}
      ${answerBlock(item.answer, item.explanation, false)}`;
  }

  function writtenCard(item, roundLabel) {
    const type = item.type || "단답형";
    const isShortAnswer = type === "단답형";
    const choiceData = type === "선택형" ? parseChoiceLines(item.prompt) : null;
    const isChoice = Boolean(choiceData && choiceData.choices.length >= 2);
    const labeledParts = isShortAnswer ? parseLabeledAnswerParts(item.answer) : [];
    const isMultiPart = labeledParts.length >= 2;
    const checkable = isShortAnswer || isChoice || (type === "선택형" && !isChoice);

    let promptText = item.prompt || "";
    let answerArea;
    if (isChoice) {
      promptText = choiceData.stem;
      answerArea = `${choiceCheckBlock(choiceData.choices, item.answer)}${answerBlock(item.answer, item.explanation, false)}`;
    } else if (isMultiPart) {
      answerArea = multiFieldAnswerArea(item, labeledParts);
    } else if (isShortAnswer || type === "선택형") {
      answerArea = shortAnswerArea(item);
    } else {
      answerArea = answerBlock(item.answer, item.explanation, true);
    }

    return `
      <div class="practical-card q-card">
        <div class="q-meta">
          ${roundPill(roundLabel)}
          <span class="pill">${item.number}번</span>
          <span class="pill">${escapeHtml(type)}</span>
          <span class="pill answer">${checkable ? "정답 확인 가능" : "정답 포함"}</span>
        </div>
        ${textBlock(promptText)}
        ${answerArea}
      </div>`;
  }

  function routerCard(item, roundLabel) {
    return `
      <div class="practical-card q-card">
        <div class="q-meta">
          ${roundPill(roundLabel)}
          <span class="pill">${item.number}번</span>
          <span class="pill">라우터</span>
          <span class="pill answer">정답 포함</span>
        </div>
        ${topologyBlock(item.topology)}
        ${textBlock(item.prompt || "")}
        ${answerBlock(item.answer, item.explanation)}
      </div>`;
  }

  function sectionHtml(title, note, innerHtml) {
    return `
      <section class="practical-section">
        <div class="practical-section-head"><h2>${title}</h2><span>${note}</span></div>
        <div class="practical-grid">${innerHtml}</div>
      </section>`;
  }

  function renderRound(round) {
    if (!round) {
      area.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    roundDateEl.textContent = round.date ? `시행일 ${round.date}` : "";

    const parts = [];
    parts.push(sectionHtml("① IP/서브넷 문제 (2번)", "정답·해설 포함", ipCard(round.ip)));

    const practiceItems = (round.practice || []).map(practiceCard).join("");
    parts.push(sectionHtml(
      "② 실습형 문제 (3~9번)",
      "Windows Server 설정 실습 · 문제만 제공, 정답 없음",
      practiceItems || `<p class="empty-note">데이터 없음</p>`
    ));

    const writtenItems = (round.written || []).map((w) => writtenCard(w)).join("");
    const routerItems = (round.router || []).map((rt) => routerCard(rt)).join("");
    parts.push(sectionHtml(
      "③ 단답형·선택형 문제",
      "정답·해설 포함",
      writtenItems || `<p class="empty-note">데이터 없음</p>`
    ));
    parts.push(sectionHtml(
      "④ 라우터 문제",
      "정답·해설 포함",
      routerItems || `<p class="empty-note">데이터 없음</p>`
    ));

    area.dataset.mode = "round";
    area.innerHTML = parts.join("");
  }

  // Flat pool of answerable items (ip / written) across every round, for random mode.
  // Practice-only items are excluded since they have no answer to check; router items are
  // excluded from random mode by request (CLI topology problems don't fit the quick-drill flow).
  function buildPool(allRounds) {
    const list = [];
    allRounds.forEach((r) => {
      if (r.ip) list.push({ kind: "ip", round: r.round, item: r.ip });
      (r.written || []).forEach((w) => list.push({ kind: "written", round: r.round, item: w }));
    });
    return list;
  }

  function updateRandomScore() {
    randomScoreEl.textContent = `정답 ${randomStats.correct} / 응답 ${randomStats.asked}`;
  }

  function updateRandomProgress() {
    const shown = Math.min(randomIndex + 1, randomQueue.length);
    randomProgressEl.textContent = randomQueue.length ? `${shown} / ${randomQueue.length}문제` : "";
  }

  // Shuffles the whole pool into a fresh no-repeat pass and resets the running score.
  function buildRandomQueue() {
    randomQueue = shuffle(pool);
    randomIndex = 0;
    randomStats.asked = 0;
    randomStats.correct = 0;
    updateRandomScore();
  }

  function renderRandomComplete() {
    updateRandomProgress();
    area.dataset.mode = "random";
    area.innerHTML = `
      <div class="practical-card q-card">
        <div class="q-meta"><span class="pill answer">완료</span></div>
        <div class="q-text">전체 ${randomQueue.length}문제를 모두 풀었습니다. 정답 ${randomStats.correct} / 응답 ${randomStats.asked}</div>
      </div>`;
    nextRandomBtn.textContent = "다시 섞어서 풀기 ↻";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderRandomQuestion() {
    emptyEl.hidden = true;
    if (!randomQueue.length) {
      area.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    if (randomIndex >= randomQueue.length) return renderRandomComplete();

    currentRandomEntry = randomQueue[randomIndex];
    updateRandomProgress();
    const { kind, round, item } = currentRandomEntry;
    const cardHtml = kind === "ip" ? ipCard(item, round) : writtenCard(item, round);
    area.dataset.mode = "random";
    area.innerHTML = `<div class="practical-grid">${cardHtml}</div>`;
    nextRandomBtn.textContent = "다음 문제 →";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function advanceRandom() {
    if (randomIndex >= randomQueue.length) buildRandomQueue();
    else randomIndex += 1;
    renderRandomQuestion();
  }

  function setMode(newMode) {
    mode = newMode === "random" ? "random" : "round";
    modeRoundBtn.classList.toggle("active", mode === "round");
    modeRandomBtn.classList.toggle("active", mode === "random");
    roundBar.hidden = mode !== "round";
    randomBar.hidden = mode !== "random";

    if (mode === "random") {
      try { history.replaceState(null, "", "?mode=random"); } catch (e) { /* ignore */ }
      if (!randomQueue.length) buildRandomQueue();
      renderRandomQuestion();
    } else {
      const value = roundSelect.value || rounds[rounds.length - 1].round;
      selectRoundByValue(value);
    }
  }

  function handleCheck(btn) {
    const wrap = btn.closest(".answer-check");
    const card = btn.closest(".practical-card");
    const inputs = Array.from(wrap.querySelectorAll(".answer-input"));
    let allCorrect = true;
    let answered = false;

    inputs.forEach((input) => {
      const mark = input.parentElement.querySelector(".field-mark");
      const hasValue = input.value.trim() !== "";
      if (hasValue) answered = true;
      const ok = hasValue && ("expected" in input.dataset
        ? normalizeStrict(input.value) === normalizeStrict(input.dataset.expected)
        : isFreeAnswerCorrect(input.value, input.dataset.fullAnswer || ""));
      input.classList.toggle("correct", ok);
      input.classList.toggle("wrong", !ok);
      if (mark) mark.textContent = ok ? "✓" : "✗";
      if (!ok) allCorrect = false;
    });

    const summary = wrap.querySelector(".check-summary");
    summary.textContent = !answered
      ? "정답을 입력해 주세요."
      : allCorrect ? "✓ 정답입니다!" : "✗ 오답이 있습니다. 아래 정답을 확인하세요.";
    summary.className = `check-summary show ${!answered ? "" : allCorrect ? "ok" : "no"}`;

    if (answered) {
      const explainBox = card.querySelector(".explain-box");
      if (explainBox) explainBox.classList.add("show");
      markScored(card, allCorrect);
    }
  }

  function handleReveal(btn) {
    const wrap = btn.closest(".answer-check, .choice-check");
    const card = btn.closest(".practical-card");
    const explainBox = card.querySelector(".explain-box");
    if (explainBox) explainBox.classList.add("show");
    const summary = wrap.querySelector(".check-summary");
    summary.className = "check-summary";
    summary.textContent = "";
  }

  function markScored(card, isCorrect) {
    if (mode !== "random" || card.dataset.scored) return;
    card.dataset.scored = "1";
    randomStats.asked += 1;
    if (isCorrect) randomStats.correct += 1;
    updateRandomScore();
  }

  function handleChoiceCheck(btn) {
    const wrap = btn.closest(".choice-check");
    const card = btn.closest(".practical-card");
    const options = Array.from(wrap.querySelectorAll(".choice-opt"));
    const selected = options.filter((opt) => opt.classList.contains("selected")).map((opt) => opt.dataset.label);
    const correctLabels = new Set(parseChoiceAnswerLabels(wrap.dataset.answer));
    const selectedSet = new Set(selected);
    const isCorrect = selectedSet.size === correctLabels.size && selected.every((l) => correctLabels.has(l));

    options.forEach((opt) => {
      opt.classList.remove("correct", "wrong");
      if (correctLabels.has(opt.dataset.label)) opt.classList.add("correct");
      else if (opt.classList.contains("selected")) opt.classList.add("wrong");
    });

    const summary = wrap.querySelector(".check-summary");
    summary.textContent = !selected.length
      ? "보기를 선택해 주세요."
      : isCorrect ? "✓ 정답입니다!" : "✗ 오답입니다. 초록색이 정답입니다.";
    summary.className = `check-summary show ${!selected.length ? "" : isCorrect ? "ok" : "no"}`;

    if (selected.length) {
      const explainBox = card.querySelector(".explain-box");
      if (explainBox) explainBox.classList.add("show");
      markScored(card, isCorrect);
    }
  }

  area.addEventListener("click", (e) => {
    const opt = e.target.closest(".choice-opt");
    if (opt) {
      opt.classList.toggle("selected");
      const wrap = opt.closest(".choice-check");
      wrap.querySelectorAll(".choice-opt").forEach((o) => o.classList.remove("correct", "wrong"));
      const summary = wrap.querySelector(".check-summary");
      summary.className = "check-summary";
      summary.textContent = "";
      return;
    }
    const checkChoiceBtn = e.target.closest(".check-choice-btn");
    if (checkChoiceBtn) { handleChoiceCheck(checkChoiceBtn); return; }
    const checkBtn = e.target.closest(".check-btn");
    if (checkBtn) { handleCheck(checkBtn); return; }
    const revealBtn = e.target.closest(".reveal-btn");
    if (revealBtn) { handleReveal(revealBtn); return; }
  });

  area.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList.contains("answer-input")) {
      e.preventDefault();
      const wrap = e.target.closest(".answer-check");
      const btn = wrap && wrap.querySelector(".check-btn");
      if (btn) handleCheck(btn);
    }
  });

  function roundNumber(round) {
    const match = /^(\d+)/.exec(round.round || "");
    return match ? parseInt(match[1], 10) : 0;
  }

  function selectRoundByValue(value) {
    roundSelect.value = value;
    const round = rounds.find((r) => r.round === value);
    renderRound(round);
    updateNavButtons();
    try { history.replaceState(null, "", `?round=${encodeURIComponent(value)}`); } catch (e) { /* ignore */ }
  }

  function updateNavButtons() {
    const idx = rounds.findIndex((r) => r.round === roundSelect.value);
    prevBtn.disabled = idx <= 0;
    nextBtn.disabled = idx < 0 || idx >= rounds.length - 1;
  }

  async function init() {
    try {
      const res = await fetch("data/practical.json");
      if (!res.ok) throw new Error("failed to load practical.json");
      const data = await res.json();
      rounds = (data.rounds || []).slice().sort((a, b) => roundNumber(a) - roundNumber(b));
    } catch (error) {
      console.error(error);
      emptyEl.hidden = false;
      return;
    }

    if (!rounds.length) {
      emptyEl.hidden = false;
      return;
    }

    roundSelect.innerHTML = rounds.map((r) => `<option value="${escapeHtml(r.round)}">${escapeHtml(r.round)} (${escapeHtml(r.date || "")})</option>`).join("");
    pool = buildPool(rounds);

    const params = new URLSearchParams(location.search);
    const requested = params.get("round");
    const initial = rounds.find((r) => r.round === requested) ? requested : rounds[rounds.length - 1].round;
    roundSelect.value = initial;

    setMode(params.get("mode") === "random" ? "random" : "round");

    roundSelect.addEventListener("change", () => selectRoundByValue(roundSelect.value));
    prevBtn.addEventListener("click", () => {
      const idx = rounds.findIndex((r) => r.round === roundSelect.value);
      if (idx > 0) selectRoundByValue(rounds[idx - 1].round);
    });
    nextBtn.addEventListener("click", () => {
      const idx = rounds.findIndex((r) => r.round === roundSelect.value);
      if (idx >= 0 && idx < rounds.length - 1) selectRoundByValue(rounds[idx + 1].round);
    });
    modeRoundBtn.addEventListener("click", () => setMode("round"));
    modeRandomBtn.addEventListener("click", () => setMode("random"));
    nextRandomBtn.addEventListener("click", advanceRandom);
  }

  init();
})();
