(() => {
  "use strict";

  const roundSelect = document.getElementById("roundSelect");
  const roundDateEl = document.getElementById("roundDate");
  const prevBtn = document.getElementById("prevRoundBtn");
  const nextBtn = document.getElementById("nextRoundBtn");
  const area = document.getElementById("practicalArea");
  const emptyEl = document.getElementById("practicalEmpty");

  let rounds = [];

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

  function answerBlock(answer, explanation) {
    let html = `<div class="explain-box show"><div class="head ok">✓ 정답</div>`;
    html += `<div class="q-text" style="margin:0 0 10px;font-size:1rem;">${nl2br(escapeHtml(answer))}</div>`;
    if (explanation) {
      html += `<div class="practical-explain">${nl2br(escapeHtml(explanation))}</div>`;
    }
    html += `</div>`;
    return html;
  }

  function topologyBlock(topology) {
    if (!topology) return "";
    return `<div class="plain-box"><b class="pb-label">구성도</b>${nl2br(escapeHtml(topology))}</div>`;
  }

  function ipCard(ip) {
    if (!ip) return "";
    return `
      <div class="practical-card q-card">
        <div class="q-meta">
          <span class="pill">${ip.number}번</span>
          <span class="pill">IP/서브넷</span>
          <span class="pill answer">정답 포함</span>
        </div>
        <div class="practical-given"><b>제시된 네트워크:</b> <code>${escapeHtml(ip.given || "")}</code></div>
        ${textBlock(ip.prompt || "")}
        ${answerBlock(ip.answer, ip.explanation)}
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

  function writtenCard(item) {
    return `
      <div class="practical-card q-card">
        <div class="q-meta">
          <span class="pill">${item.number}번</span>
          <span class="pill">${escapeHtml(item.type || "단답형")}</span>
          <span class="pill answer">정답 포함</span>
        </div>
        ${textBlock(item.prompt || "")}
        ${answerBlock(item.answer, item.explanation)}
      </div>`;
  }

  function routerCard(item) {
    return `
      <div class="practical-card q-card">
        <div class="q-meta">
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

    area.innerHTML = parts.join("");
  }

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

    const params = new URLSearchParams(location.search);
    const requested = params.get("round");
    const initial = rounds.find((r) => r.round === requested) ? requested : rounds[rounds.length - 1].round;

    selectRoundByValue(initial);

    roundSelect.addEventListener("change", () => selectRoundByValue(roundSelect.value));
    prevBtn.addEventListener("click", () => {
      const idx = rounds.findIndex((r) => r.round === roundSelect.value);
      if (idx > 0) selectRoundByValue(rounds[idx - 1].round);
    });
    nextBtn.addEventListener("click", () => {
      const idx = rounds.findIndex((r) => r.round === roundSelect.value);
      if (idx >= 0 && idx < rounds.length - 1) selectRoundByValue(rounds[idx + 1].round);
    });
  }

  init();
})();
