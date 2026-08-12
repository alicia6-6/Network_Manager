(() => {
  const refs = [...document.querySelectorAll(".fnref")];
  if (!refs.length) return;

  const popover = document.createElement("div");
  popover.className = "footnote-popover";
  popover.id = "footnote-popover";
  popover.setAttribute("role", "tooltip");
  document.body.appendChild(popover);

  let activeRef = null;
  let closeTimer = null;

  const getText = (ref) => {
    const note = document.querySelector(ref.getAttribute("href"));
    if (!note) return "";
    const copy = note.cloneNode(true);
    copy.querySelectorAll(".fnback").forEach((link) => link.remove());
    return copy.textContent.trim();
  };

  const position = (ref) => {
    const anchor = ref.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    const gap = 10;
    const edge = 12;
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.max(edge, Math.min(left, window.innerWidth - box.width - edge));
    let top = anchor.bottom + gap;
    const above = top + box.height > window.innerHeight - edge && anchor.top > box.height + gap;
    if (above) top = anchor.top - box.height - gap;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.setProperty("--arrow-left", `${Math.max(12, Math.min(anchor.left + anchor.width / 2 - left - 5, box.width - 22))}px`);
    popover.classList.toggle("is-above", above);
  };

  const open = (ref) => {
    clearTimeout(closeTimer);
    const text = getText(ref);
    if (!text) return;
    if (activeRef && activeRef !== ref) activeRef.removeAttribute("aria-describedby");
    activeRef = ref;
    popover.textContent = text;
    popover.classList.add("is-open");
    ref.setAttribute("aria-describedby", popover.id);
    position(ref);
  };

  const close = () => {
    clearTimeout(closeTimer);
    popover.classList.remove("is-open");
    activeRef?.removeAttribute("aria-describedby");
    activeRef = null;
  };

  const scheduleClose = () => {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, 120);
  };

  refs.forEach((ref) => {
    ref.addEventListener("mouseenter", () => open(ref));
    ref.addEventListener("mouseleave", scheduleClose);
    ref.addEventListener("focus", () => open(ref));
    ref.addEventListener("blur", scheduleClose);
    ref.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activeRef === ref && popover.classList.contains("is-open") ? close() : open(ref);
    });
  });

  popover.addEventListener("mouseenter", () => clearTimeout(closeTimer));
  popover.addEventListener("mouseleave", scheduleClose);
  popover.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  window.addEventListener("resize", () => activeRef ? position(activeRef) : null);
  window.addEventListener("scroll", close, { passive: true });
})();
