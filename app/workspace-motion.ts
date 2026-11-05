import { flushSync } from "react-dom";

let activeTransition: ViewTransition | Animation | undefined;
const motionPreference = "(prefers-reduced-motion: no-preference)";

export function stopWorkspaceTransition() {
  if (activeTransition && "skipTransition" in activeTransition) activeTransition.skipTransition();
  else activeTransition?.cancel();
  activeTransition = undefined;
  delete document.documentElement.dataset.workspaceTransition;
}

export function animateWorkspace(scope: "page" | "detail", update: () => void) {
  stopWorkspaceTransition();
  if (!matchMedia(motionPreference).matches) {
    update();
    return;
  }

  document.documentElement.dataset.workspaceTransition = scope;
  if (!document.startViewTransition) {
    animateWorkspaceFallback(scope, update);
    return;
  }

  const transition = document.startViewTransition(() => {
    if (activeTransition === transition) flushSync(update);
  });
  activeTransition = transition;
  void transition.ready.catch(() => {});
  void transition.finished.catch(() => {}).then(() => {
    if (activeTransition === transition) stopWorkspaceTransition();
  });
}

function animateWorkspaceFallback(scope: "page" | "detail", update: () => void) {
  const selector = scope === "page" ? ".portal-page" : ".workspace-record";
  const visibleTarget = () => {
    const target = document.querySelector<HTMLElement>(selector);
    return target?.animate && target.getClientRects().length ? target : undefined;
  };

  function enter() {
    flushSync(update);
    const target = visibleTarget();
    if (!target) {
      stopWorkspaceTransition();
      return;
    }
    const arrival = target.animate([
      { opacity: 0.45, transform: "translateY(5px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 185, easing: "cubic-bezier(.2,.75,.3,1)" });
    activeTransition = arrival;
    void arrival.finished.then(() => {
      if (activeTransition === arrival) stopWorkspaceTransition();
    }, () => {});
  }

  const target = visibleTarget();
  if (!target) {
    enter();
    return;
  }
  const departure = target.animate([
    { opacity: 1, transform: "translateY(0)" },
    { opacity: 0.45, transform: "translateY(-4px)" },
  ], { duration: 95, easing: "ease-in", fill: "forwards" });
  activeTransition = departure;
  void departure.finished.then(() => {
    if (activeTransition !== departure) return;
    departure.cancel();
    enter();
  }, () => {});
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
