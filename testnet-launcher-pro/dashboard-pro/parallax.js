// KASCompute PRO – UI Motion Engine

document.addEventListener("DOMContentLoaded", () => {
  // 3D CARD PARALLAX
  const cards = document.querySelectorAll(".card");

  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const midX = rect.width / 2;
      const midY = rect.height / 2;

      const rotateX = ((y - midY) / midY) * 4;
      const rotateY = ((x - midX) / midX) * -4;

      card.style.transform = `
        perspective(900px)
        rotateX(${rotateX}deg)
        rotateY(${rotateY}deg)
        translateY(-2px)
      `;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    });
  });

  // SIDEBAR GLOW FOLLOW (optional, if your CSS uses --glow-y)
  const sidebar = document.querySelector(".sidebar");
  if (sidebar) {
    sidebar.addEventListener("mousemove", (e) => {
      const rect = sidebar.getBoundingClientRect();
      const y = e.clientY - rect.top;
      sidebar.style.setProperty("--glow-y", `${y}px`);
    });
  }
});
