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
      .replace(/(\d+)\s*개/g, "$1")
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

  // 드래그앤드롭형 answers show up in a few different shapes in the source data:
  //   "(A) : grub / (B) : /etc/fstab / (C) : init"
  //   "A-RAM, B-NVRAM, C-FLASH, D-ROM"
  //   "설명A → RIP\n설명B → OSPF"
  //   "7계층(응용): Data, 6계층(표현): Data, ..."
  // Each is tried in turn; the first that yields pairs wins.
  function parseDragAnswerPairs(answerStr) {
    const str = String(answerStr || "").trim();
    if (!str) return [];

    if (/\([^)]+\)\s*:/.test(str) && str.includes("/")) {
      const pairs = [];
      const re = /\(([^)]+)\)\s*:\s*(.+?)(?=\/\s*\([^)]+\)\s*:|$)/g;
      let m;
      while ((m = re.exec(str))) {
        const value = m[2].trim().replace(/\/\s*$/, "").trim();
        if (value) pairs.push({ label: m[1].trim(), value });
      }
      if (pairs.length) return pairs;
    }

    if (/→|->/.test(str)) {
      const pairs = str.split("\n").map((line) => {
        const m = /^(.+?)\s*(?:→|->)\s*(.+)$/.exec(line.trim());
        return m ? { label: m[1].trim(), value: m[2].trim() } : null;
      }).filter(Boolean);
      if (pairs.length) return pairs;
    }

    if (str.includes(",") && /[:：]/.test(str)) {
      const pairs = str.split(",").map((part) => {
        const idx = part.search(/[:：]/);
        if (idx === -1) return null;
        return { label: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() };
      }).filter(Boolean);
      if (pairs.length) return pairs;
    }

    if (str.includes(",") && str.includes("-")) {
      const pairs = str.split(",").map((part) => {
        const m = /^\s*([^-]+)-(.+)$/.exec(part.trim());
        return m ? { label: m[1].trim(), value: m[2].trim() } : null;
      }).filter(Boolean);
      if (pairs.length) return pairs;
    }

    return [];
  }

  const DRAG_BANK_LINE_RE = /^(?:\[보기\]|보기\s*[:：]|드래그\s*대상\s*\(?보기\)?\s*[:：])\s*(.+)$/;

  // Pulls the word-bank line ("[보기] a, b, c" / "보기: a, b, c" / "드래그 대상(보기): a, b, c")
  // out of a 드래그앤드롭형 prompt, if the source data has one in a recognizable shape.
  function extractDragBank(prompt) {
    for (const line of String(prompt || "").split("\n")) {
      const m = DRAG_BANK_LINE_RE.exec(line.trim());
      if (m) return m[1].split(/[,、]/).map((s) => s.trim()).filter(Boolean);
    }
    return null;
  }

  function dragDropStem(prompt) {
    return String(prompt || "")
      .split("\n")
      .filter((line) => !DRAG_BANK_LINE_RE.test(line.trim()))
      .join("\n")
      .trim();
  }

  function dragDropCheckBlock(pairs, bank) {
    const chips = bank.map((word) => `
      <button type="button" class="drag-chip" draggable="true" data-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`).join("");
    const slots = pairs.map((p, i) => `
      <div class="drag-slot">
        <span class="slot-label">${escapeHtml(p.label)}</span>
        <span class="slot-drop" data-index="${i}" data-answer="${escapeHtml(p.value)}" data-filled="">여기로 드래그 또는 클릭</span>
      </div>`).join("");
    return `
      <div class="drag-check">
        <div class="dragdrop-bank">${chips}</div>
        <div class="dragdrop-slots">${slots}</div>
        <div class="answer-actions">
          <button type="button" class="btn check-drag-btn">정답 확인</button>
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
    const isDragDrop = type === "드래그앤드롭형";
    const dragPairs = isDragDrop ? parseDragAnswerPairs(item.answer) : [];
    const isDraggable = isDragDrop && dragPairs.length >= 2;
    const checkable = isShortAnswer || isChoice || isDraggable || (type === "선택형" && !isChoice);

    let promptText = item.prompt || "";
    let answerArea;
    if (isChoice) {
      promptText = choiceData.stem;
      answerArea = `${choiceCheckBlock(choiceData.choices, item.answer)}${answerBlock(item.answer, item.explanation, false)}`;
    } else if (isMultiPart) {
      answerArea = multiFieldAnswerArea(item, labeledParts);
    } else if (isDraggable) {
      promptText = dragDropStem(item.prompt);
      let bank = extractDragBank(item.prompt) || [];
      if (!bank.length) bank = dragPairs.map((p) => p.value);
      dragPairs.forEach((p) => {
        if (!bank.some((b) => normalizeFree(b) === normalizeFree(p.value))) bank.push(p.value);
      });
      answerArea = `${dragDropCheckBlock(dragPairs, bank)}${answerBlock(item.answer, item.explanation, false)}`;
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

  function normalizeForDedupe(str) {
    return String(str || "")
      .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // 전각 문자 -> 반각
      .replace(/[‐-―−]/g, "-") // 다양한 대시/마이너스 -> 하이픈
      .replace(/\s+/g, "")
      .replace(/[.,·、!?~\-()\[\]{}'":：]/g, "")
      .toLowerCase();
  }

  // Some 실기 문제(선택형 다지선다, 일부 IP 템플릿 등)는 여러 회차에 그대로 재출제된다.
  // 회차별 보기는 각 회차의 원본을 그대로 보여줘야 하므로 손대지 않고, 랜덤 모드 풀만
  // 문제/정답 내용이 같은 항목을 한 번만 포함하도록 걸러낸다.
  function dedupePoolItems(list) {
    const seen = new Set();
    const result = [];
    list.forEach((entry) => {
      const key = `${entry.kind}|${normalizeForDedupe(entry.item.prompt)}|${normalizeForDedupe(entry.item.answer)}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(entry);
    });
    return result;
  }

  function levenshteinDist(a, b) {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const curr = [i];
      for (let j = 1; j <= n; j++) {
        curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
      prev = curr;
    }
    return prev[n];
  }

  function textSim(a, b) {
    const d = levenshteinDist(a, b);
    const len = Math.max(a.length, b.length) || 1;
    return 1 - d / len;
  }

  // 쉼표로 나열된 정답 대안들을 순서 무관 집합으로 비교한다(예: 동의어 나열 순서가
  // 회차마다 다른 경우).
  function altSet(str) {
    return new Set(String(str || "").split(",").map((s) => normalizeForDedupe(s)).filter(Boolean));
  }

  function jaccard(setA, setB) {
    const inter = [...setA].filter((x) => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size || 1;
    return inter / union;
  }

  function answerSimilarity(a, b) {
    return Math.max(textSim(normalizeForDedupe(a), normalizeForDedupe(b)), jaccard(altSet(a), altSet(b)));
  }

  // 선택형(보기1/① 라벨) 답안은 회차마다 정답 개수·구성이 달라 유사도만으로 같은
  // 문제인지 판단하기 위험하므로 유사문제 병합 대상에서 제외한다.
  function isChoiceLabelAnswer(answerStr) {
    return /^\s*(보기\d+|[①②③④⑤⑥⑦⑧⑨⑩])/.test(String(answerStr || ""));
  }

  function makeUnionFind(n) {
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }
    return { find, union };
  }

  const NEAR_DUP_ANSWER_THRESHOLD = 0.5;
  const NEAR_DUP_PROMPT_THRESHOLD = 0.4;

  // 오탈자 없이 완전히 같은 문항 외에도, 여러 회차에 걸쳐 문구만 다시 써서(전개 방식,
  // 예시 추가 등) 재출제된 단답형 문제가 있다(예: RIP 설명 문제가 5개 회차에 각각
  // 조금씩 다르게 서술됨). written 항목만 대상으로, 문제 문장과 정답이 모두 충분히
  // 비슷할 때만 하나로 묶는다. ip 문제는 제외한다 — 안내 문구(템플릿)는 거의 같아도
  // 실제 네트워크 대역/계산 값이 회차마다 달라 유사도만으로는 구분이 안 된다.
  function dedupeWrittenNearMatches(pool) {
    const eligible = [];
    pool.forEach((entry, index) => {
      if (entry.kind === "written" && !isChoiceLabelAnswer(entry.item.answer)) eligible.push(index);
    });

    const uf = makeUnionFind(pool.length);
    for (let a = 0; a < eligible.length; a++) {
      const i = eligible[a];
      for (let b = a + 1; b < eligible.length; b++) {
        const j = eligible[b];
        const itemA = pool[i].item;
        const itemB = pool[j].item;
        const promptSim = textSim(normalizeForDedupe(itemA.prompt), normalizeForDedupe(itemB.prompt));
        if (promptSim < NEAR_DUP_PROMPT_THRESHOLD) continue;
        if (answerSimilarity(itemA.answer, itemB.answer) < NEAR_DUP_ANSWER_THRESHOLD) continue;
        uf.union(i, j);
      }
    }

    const seenRoot = new Set();
    const result = [];
    pool.forEach((entry, index) => {
      const root = uf.find(index);
      if (seenRoot.has(root)) return;
      seenRoot.add(root);
      result.push(entry);
    });
    return result;
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
    return dedupeWrittenNearMatches(dedupePoolItems(list));
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
    const wrap = btn.closest(".answer-check, .choice-check, .drag-check");
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

  const DRAG_SLOT_PLACEHOLDER = "여기로 드래그 또는 클릭";

  function fillDragSlot(slot, word) {
    slot.dataset.filled = word;
    slot.textContent = word;
    slot.classList.add("filled");
    slot.classList.remove("correct", "wrong");
    const summary = slot.closest(".drag-check").querySelector(".check-summary");
    summary.className = "check-summary";
    summary.textContent = "";
  }

  function clearDragSlot(slot) {
    slot.dataset.filled = "";
    slot.textContent = DRAG_SLOT_PLACEHOLDER;
    slot.classList.remove("filled", "correct", "wrong");
  }

  function handleDragCheck(btn) {
    const wrap = btn.closest(".drag-check");
    const card = btn.closest(".practical-card");
    const slots = Array.from(wrap.querySelectorAll(".slot-drop"));
    const filledCount = slots.filter((slot) => slot.dataset.filled).length;
    let allCorrect = true;

    slots.forEach((slot) => {
      const filled = slot.dataset.filled || "";
      const ok = Boolean(filled) && normalizeFree(filled) === normalizeFree(slot.dataset.answer);
      slot.classList.toggle("correct", ok);
      slot.classList.toggle("wrong", Boolean(filled) && !ok);
      if (!ok) allCorrect = false;
    });

    const summary = wrap.querySelector(".check-summary");
    summary.textContent = !filledCount
      ? "빈칸에 보기를 배치해 주세요."
      : allCorrect ? "✓ 정답입니다!" : "✗ 오답이 있습니다. 아래 정답을 확인하세요.";
    summary.className = `check-summary show ${!filledCount ? "" : allCorrect ? "ok" : "no"}`;

    if (filledCount) {
      const explainBox = card.querySelector(".explain-box");
      if (explainBox) explainBox.classList.add("show");
      markScored(card, allCorrect);
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
    const chip = e.target.closest(".drag-chip");
    if (chip) {
      const wrap = chip.closest(".drag-check");
      const wasSelected = chip.classList.contains("selected");
      wrap.querySelectorAll(".drag-chip.selected").forEach((c) => c.classList.remove("selected"));
      if (!wasSelected) chip.classList.add("selected");
      return;
    }
    const slot = e.target.closest(".slot-drop");
    if (slot) {
      const wrap = slot.closest(".drag-check");
      const selectedChip = wrap.querySelector(".drag-chip.selected");
      if (selectedChip) {
        fillDragSlot(slot, selectedChip.dataset.word);
        selectedChip.classList.remove("selected");
      } else if (slot.dataset.filled) {
        clearDragSlot(slot);
      }
      return;
    }
    const checkChoiceBtn = e.target.closest(".check-choice-btn");
    if (checkChoiceBtn) { handleChoiceCheck(checkChoiceBtn); return; }
    const checkDragBtn = e.target.closest(".check-drag-btn");
    if (checkDragBtn) { handleDragCheck(checkDragBtn); return; }
    const checkBtn = e.target.closest(".check-btn");
    if (checkBtn) { handleCheck(checkBtn); return; }
    const revealBtn = e.target.closest(".reveal-btn");
    if (revealBtn) { handleReveal(revealBtn); return; }
  });

  area.addEventListener("dragstart", (e) => {
    const chip = e.target.closest(".drag-chip");
    if (!chip) return;
    e.dataTransfer.setData("text/plain", chip.dataset.word);
    e.dataTransfer.effectAllowed = "copy";
  });

  area.addEventListener("dragover", (e) => {
    if (e.target.closest(".slot-drop")) e.preventDefault();
  });

  area.addEventListener("drop", (e) => {
    const slot = e.target.closest(".slot-drop");
    if (!slot) return;
    e.preventDefault();
    const word = e.dataTransfer.getData("text/plain");
    if (word) fillDragSlot(slot, word);
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
