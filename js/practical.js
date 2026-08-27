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
  const nextRandomBtn = document.getElementById("nextRandomBtn");

  let rounds = [];
  let pool = [];
  let mode = "round";
  let currentRandomEntry = null;
  const randomStats = { asked: 0, correct: 0 };

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
      return altNorm && (userNorm === altNorm || userNorm.includes(altNorm) || altNorm.includes(userNorm));
    });
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

  function writtenCard(item, roundLabel) {
    const isShortAnswer = (item.type || "단답형") === "단답형";
    const answerArea = isShortAnswer
      ? `
        ${answerCheckBlock(`
          <div class="answer-field wide">
            <input type="text" class="answer-input" data-full-answer="${escapeHtml(item.answer || "")}" autocomplete="off" spellcheck="false" placeholder="정답 입력">
            <span class="field-mark"></span>
          </div>`)}
        ${answerBlock(item.answer, item.explanation, false)}`
      : answerBlock(item.answer, item.explanation, true);

    return `
      <div class="practical-card q-card">
        <div class="q-meta">
          ${roundPill(roundLabel)}
          <span class="pill">${item.number}번</span>
          <span class="pill">${escapeHtml(item.type || "단답형")}</span>
          <span class="pill answer">${isShortAnswer ? "정답 확인 가능" : "정답 포함"}</span>
        </div>
        ${textBlock(item.prompt || "")}
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

    const writtenItems = (round.written || []).map(writtenCard).join("");
    const routerItems = (round.router || []).map(routerCard).join("");
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

  // Flat pool of answerable items (ip / written / router) across every round, for random mode.
  // Practice-only items are excluded since they have no answer to check.
  function buildPool(allRounds) {
    const list = [];
    allRounds.forEach((r) => {
      if (r.ip) list.push({ kind: "ip", round: r.round, item: r.ip });
      (r.written || []).forEach((w) => list.push({ kind: "written", round: r.round, item: w }));
      (r.router || []).forEach((rt) => list.push({ kind: "router", round: r.round, item: rt }));
    });
    return list;
  }

  function pickRandomEntry() {
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    let next = currentRandomEntry;
    while (next === currentRandomEntry) {
      next = pool[Math.floor(Math.random() * pool.length)];
    }
    return next;
  }

  function updateRandomScore() {
    randomScoreEl.textContent = `정답 ${randomStats.correct} / 응답 ${randomStats.asked}`;
  }

  function renderRandomQuestion() {
    currentRandomEntry = pickRandomEntry();
    emptyEl.hidden = true;
    if (!currentRandomEntry) {
      area.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    const { kind, round, item } = currentRandomEntry;
    const cardHtml = kind === "ip" ? ipCard(item, round)
      : kind === "written" ? writtenCard(item, round)
      : routerCard(item, round);
    area.dataset.mode = "random";
    area.innerHTML = `<div class="practical-grid">${cardHtml}</div>`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setMode(newMode) {
    mode = newMode === "random" ? "random" : "round";
    modeRoundBtn.classList.toggle("active", mode === "round");
    modeRandomBtn.classList.toggle("active", mode === "random");
    roundBar.hidden = mode !== "round";
    randomBar.hidden = mode !== "random";

    if (mode === "random") {
      try { history.replaceState(null, "", "?mode=random"); } catch (e) { /* ignore */ }
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
    }

    if (answered && mode === "random" && !card.dataset.scored) {
      card.dataset.scored = "1";
      randomStats.asked += 1;
      if (allCorrect) randomStats.correct += 1;
      updateRandomScore();
    }
  }

  function handleReveal(btn) {
    const wrap = btn.closest(".answer-check");
    const card = btn.closest(".practical-card");
    const explainBox = card.querySelector(".explain-box");
    if (explainBox) explainBox.classList.add("show");
    const summary = wrap.querySelector(".check-summary");
    summary.className = "check-summary";
    summary.textContent = "";
  }

  area.addEventListener("click", (e) => {
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
    updateRandomScore();

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
    nextRandomBtn.addEventListener("click", renderRandomQuestion);
  }

  init();
})();
