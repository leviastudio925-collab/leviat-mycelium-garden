export const GROWTH_DURATION_SECONDS = 120;

// The UI measures playing time; the scene advances gently, then accelerates.
export function advanceTimeline(timeline, seconds, speed = 1) {
  return Math.min(1, Math.max(0, timeline + seconds * speed / GROWTH_DURATION_SECONDS));
}

export function growthPhase(timeline) {
  const t = Math.min(1, Math.max(0, timeline));
  return .18 * t + .82 * t * t;
}
