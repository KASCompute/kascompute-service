// KASCompute PRO — subtle parallax + sidebar glow tracker
(() => {
  const root = document.documentElement;

  // Sidebar glow follows scroll position (works with sticky sidebar)
  const updateGlow = () => {
    const scroller = document.scrollingElement || document.documentElement;
    const y = scroller.scrollTop;
    const h = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
    const pct = (y / h) * 100;
    root.style.setProperty("--glow-y", `${pct}%`);
  };

  // Card parallax on hover (very light, safe)
  const cards = () => Array.from(document.querySelectorAll(".card"));
  let raf = null;

  const onMove = (e) => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const cx = e.clientX;
      const cy = e.clientY;

      cards().forEach((card) => {
        const r = card.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;

        // Only when pointer is inside card
        const inside = cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
        if (!inside) {
          card.style.transform = "";
          return;
        }

        const dx = (cx - (r.left + r.width / 2)) / (r.width / 2);
        const dy = (cy - (r.top + r.height / 2)) / (r.height / 2);

        const tiltX = (-dy * 2.2).toFixed(2);
        const tiltY = (dx * 2.6).toFixed(2);

        card.style.transform = `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(0)`;
      });
    });
  };

  const onLeave = () => {
    cards().forEach((c) => (c.style.transform = ""));
  };

  window.addEventListener("scroll", updateGlow, { passive: true });
  window.addEventListener("resize", updateGlow);
  window.addEventListener("mousemove", onMove, { passive: true });
  window.addEventListener("mouseleave", onLeave);

  updateGlow();
})();
