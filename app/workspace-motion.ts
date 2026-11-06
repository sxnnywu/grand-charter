import { flushSync } from "react-dom";

let activeTransition: ViewTransition | Animation | undefined;
let activeShade: Animation | undefined;
type WorkspaceTransitionScope = "page" | "detail" | "session" | "drawer" | "record" | "collection";
const motionPreference = "(prefers-reduced-motion: no-preference)";

export function stopWorkspaceTransition() {
  if (activeTransition && "skipTransition" in activeTransition) activeTransition.skipTransition();
  else activeTransition?.cancel();
  activeShade?.cancel();
  activeShade = undefined;
  activeTransition = undefined;
  delete document.documentElement.dataset.workspaceTransition;
}

export function animateWorkspace(scope: WorkspaceTransitionScope, update: () => void): Promise<void> {
  if (scope !== "session" && document.documentElement.dataset.workspaceTransition === "session") {
    update();
    return Promise.resolve();
  }
  stopWorkspaceTransition();
  // Collections can depend on async data. Snapshot crossfades mix two different
  // records layouts and can capture a loading frame instead of the destination.
  if (scope === "collection" || scope === "record" || !matchMedia(motionPreference).matches) {
    update();
    return Promise.resolve();
  }

  document.documentElement.dataset.workspaceTransition = scope;
  if (!document.startViewTransition) {
    return animateWorkspaceFallback(scope, update);
  }

  const transition = document.startViewTransition(() => {
    if (activeTransition === transition || scope === "session") flushSync(update);
  });
  activeTransition = transition;
  void transition.ready.catch(() => {});
  return transition.finished.catch(() => {}).then(() => {
    if (activeTransition === transition) stopWorkspaceTransition();
  });
}

async function animateWorkspaceFallback(scope: WorkspaceTransitionScope, update: () => void): Promise<void> {
  const selector = scope === "session" ? ".demo-entry, .demo-portal" : scope === "page" ? ".portal-page"
    : scope === "drawer" ? ".firm-record-panel.is-drawer" : scope === "record" ? ".firm-record-panel-content"
      : scope === "collection" ? ".firm-board-canvas, .firm-list" : ".workspace-record";
  const visibleTarget = () => {
    const target = document.querySelector<HTMLElement>(selector);
    return target?.animate && target.getClientRects().length ? target : undefined;
  };

  const target = visibleTarget();
  if (target) {
    const departure = target.animate([
      { opacity: 1, transform: "translate(0, 0)" },
      { opacity: scope === "drawer" ? 1 : 0.45, transform: scope === "drawer" ? "translateX(100%)" : "translateY(-4px)" },
    ], { duration: scope === "session" ? 75 : scope === "drawer" ? 160 : 95, easing: "ease-in", fill: "forwards" });
    if (scope === "drawer") activeShade = document.querySelector<HTMLElement>(".firm-record-panel-backdrop")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    activeTransition = departure;
    await departure.finished.catch(() => {});
    if (activeTransition !== departure) {
      if (scope === "session") flushSync(update);
      return;
    }
    departure.cancel();
  }

  flushSync(update);
  const nextTarget = visibleTarget();
  if (!nextTarget) {
    stopWorkspaceTransition();
    return;
  }
  const arrival = nextTarget.animate([
    { opacity: scope === "drawer" ? 1 : 0.45, transform: scope === "drawer" ? "translateX(100%)" : "translateY(5px)" },
    { opacity: 1, transform: "translate(0, 0)" },
  ], { duration: scope === "session" ? 175 : scope === "drawer" ? 220 : 185, easing: "cubic-bezier(.2,.75,.3,1)" });
  if (scope === "drawer") activeShade = document.querySelector<HTMLElement>(".firm-record-panel-backdrop")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  activeTransition = arrival;
  await arrival.finished.catch(() => {});
  if (activeTransition === arrival) stopWorkspaceTransition();
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
  items.forEach((item) => observer.observe(item));
  return () => observer.disconnect();
}
