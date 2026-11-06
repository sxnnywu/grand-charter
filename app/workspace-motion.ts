import { flushSync } from "react-dom";

let activeAnimations: Animation[] = [];
let revision = 0;
type WorkspaceTransitionScope = "page" | "detail" | "session" | "drawer" | "record" | "collection" | "submission";
const motionPreference = "(prefers-reduced-motion: no-preference)";

export function stopWorkspaceTransition() {
  revision += 1;
  activeAnimations.forEach((animation) => animation.cancel());
  activeAnimations = [];
  delete document.documentElement.dataset.workspaceTransition;
}

export async function animateWorkspace(scope: WorkspaceTransitionScope, update: () => void): Promise<void> {
  if (scope !== "session" && document.documentElement.dataset.workspaceTransition === "session") {
    flushSync(update);
    return;
  }
  stopWorkspaceTransition();
  const current = revision;
  const motion = matchMedia(motionPreference).matches;
  const titleOrigins = new Map((scope === "record" || scope === "detail" ? Array.from(document.querySelectorAll<HTMLElement>("[data-matter-id]")) : []).map(item => {
    const title = item.querySelector<HTMLElement>(".request-title");
    return [item.dataset.matterId!, title ? { box: title.getBoundingClientRect(), font: parseFloat(getComputedStyle(title).fontSize) } : undefined];
  }));
  const leavingIntake = !!document.querySelector(".plaintiff-intake");
  const panel = document.querySelector<HTMLElement>(".firm-record-panel.is-drawer");
  const animate = (element: HTMLElement | null, frames: Keyframe[], duration = 320, delay = 0) => {
    if (!element?.animate || !element.getClientRects().length) return;
    activeAnimations.push(element.animate(frames, { duration, delay, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" }));
  };

  if (motion && scope === "drawer" && panel) {
    document.documentElement.dataset.workspaceTransition = scope;
    animate(panel, [{ transform: getComputedStyle(panel).transform }, { transform: "translateX(100%)" }], 210);
    animate(document.querySelector(".firm-record-panel-backdrop"), [{ opacity: 1 }, { opacity: 0 }], 180);
    await Promise.all(activeAnimations.map((animation) => animation.finished.catch(() => {})));
    if (current !== revision) return;
    activeAnimations.forEach((animation) => animation.cancel());
    activeAnimations = [];
    flushSync(update);
    stopWorkspaceTransition();
    return;
  }

  if (motion && (scope === "page" || scope === "submission") && document.querySelector(".plaintiff-shell")) {
    const departure = document.querySelector<HTMLElement>(leavingIntake ? ".plaintiff-intake" : ".plaintiff-request-navigator, .plaintiff-home-start");
    if (scope === "submission") {
      document.documentElement.dataset.workspaceTransition = scope;
      animate(departure, [{ transform: "none", opacity: 1 },
        { transform: "translateY(-22px) scale(.975)", opacity: 0 }], 240);
    } else animate(departure, [{ transform: "translateY(0)", opacity: 1 },
      { transform: `translateY(${leavingIntake ? 18 : -18}px)`, opacity: 0 }], 170);
    await Promise.all(activeAnimations.map(animation => animation.finished.catch(() => {})));
    if (current !== revision) return;
    activeAnimations.forEach(animation => animation.cancel());
    activeAnimations = [];
  }

  // Animate live destinations after their data is ready. Browser snapshots can
  // capture loading frames and blend different layouts or confidential records.
  flushSync(update);
  if (!motion) return;
  document.documentElement.dataset.workspaceTransition = scope;
  if (scope === "drawer") {
    const nextPanel = document.querySelector<HTMLElement>(".firm-record-panel.is-drawer");
    if (nextPanel && nextPanel !== panel) {
      animate(nextPanel, [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }]);
      animate(document.querySelector(".firm-record-panel-backdrop"), [{ opacity: 0 }, { opacity: 1 }], 260);
    }
  } else if (scope === "submission") {
    animate(document.querySelector(".plaintiff-confirmation"), [
      { transform: "translateY(28px) scale(.97)", opacity: .5, transformOrigin: "center top" },
      { transform: "none", opacity: 1, transformOrigin: "center top" },
    ], 700);
  } else if (scope === "page" && document.querySelector(".plaintiff-intake")) {
    animate(document.querySelector(".plaintiff-intake-layout"), [
      { transform: "translateX(24px) scale(.985)", transformOrigin: "left top" },
      { transform: "none", transformOrigin: "left top" },
    ], 700);
  } else {
    const selector = scope === "session" ? ".demo-entry, .demo-portal"
      : scope === "page" ? ".portal-page"
        : scope === "collection" ? ".firm-board-canvas, .firm-list, .admin-collection"
          : ".plaintiff-reading-page, .firm-record-panel-content, .workspace-record";
    const target = scope === "record" || scope === "detail" || scope === "collection" && document.querySelector(".plaintiff-reading-page")
      ? document.querySelector<HTMLElement>(".plaintiff-reading-page") ?? document.querySelector<HTMLElement>(".firm-record-panel-content") ?? document.querySelector<HTMLElement>(".workspace-record")
      : document.querySelector<HTMLElement>(selector);
    if (target?.classList.contains("plaintiff-reading-page")) {
      const selected = document.querySelector<HTMLElement>('[data-matter-id][aria-pressed="true"]');
      const origin = selected ? titleOrigins.get(selected.dataset.matterId!) : undefined;
      const title = target.querySelector<HTMLElement>(".record-heading");
      if (title && origin && origin.box.bottom > 0 && origin.box.top < innerHeight) {
        const destination = title.getBoundingClientRect();
        const scale = origin.font / parseFloat(getComputedStyle(title).fontSize);
        animate(title, [
          { transform: `translate(${origin.box.left - destination.left}px, ${origin.box.top - destination.top}px) scale(${scale})`, transformOrigin: "left top" },
          { transform: "none", transformOrigin: "left top" },
        ], 650);
      } else animate(title, [{ transform: "translateY(12px)" }, { transform: "none" }], 550);
      const situation = target.querySelector<HTMLElement>(".plaintiff-situation-column");
      const documents = target.querySelector<HTMLElement>(".plaintiff-record-documents, .plaintiff-case-content");
      const details = target.querySelector<HTMLElement>(".plaintiff-record-details");
      if (situation) {
        animate(situation, [{ transform: "translateY(30px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], 600, 80);
        animate(documents, [{ transform: "translateY(34px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], 620, 180);
        animate(details, [{ transform: "translateY(20px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], 500, 280);
      } else animate(target, [{ transform: "translateY(24px)", opacity: .6 }, { transform: "translateY(0)", opacity: 1 }], 550);
    } else if (target && scope === "collection") {
      animate(target, [{ transform: "translateY(12px)" }, { transform: "none" }], 420);
      animate(document.querySelector(".firm-record-panel-content"), [{ transform: "translateY(18px)" }, { transform: "none" }], 500, 60);
      target.querySelectorAll<HTMLElement>(".firm-case-column-heading, .firm-list-summary, .admin-collection-heading").forEach((item, index) =>
        animate(item, [{ transform: "translateY(8px)" }, { transform: "none" }], 420, Math.min(index, 3) * 45));
    } else animate(target, scope === "session" ? [
      { transform: "scale(.995)", transformOrigin: "center top" },
      { transform: "scale(1)", transformOrigin: "center top" },
    ] : [
      { transform: `translateY(${scope === "record" || scope === "detail" ? 10 : 14}px)` },
      { transform: "translateY(0)" },
    ]);
  }
  await Promise.all(activeAnimations.map((animation) => animation.finished.catch(() => {})));
  if (current === revision) stopWorkspaceTransition();
}

export function observeScrollReveals(container: HTMLElement | null) {
  if (!container || !window.IntersectionObserver || !matchMedia(motionPreference).matches) return;

  const items = container.querySelectorAll<HTMLElement>('[data-reveal=""], [data-reveal="pending"]');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const item = entry.target as HTMLElement;
      if (entry.isIntersecting) {
        item.dataset.reveal = item.dataset.reveal === "pending" ? "shown" : "visible";
        observer.unobserve(item);
      } else if (entry.boundingClientRect.height) {
        item.dataset.reveal = "pending";
      }
    }
  }, { threshold: 0.08 });
  items.forEach((item) => { item.dataset.reveal = "pending"; observer.observe(item); });
  return () => observer.disconnect();
}
