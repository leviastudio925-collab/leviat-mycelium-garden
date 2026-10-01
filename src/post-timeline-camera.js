const clamp = (value) => Math.max(0, Math.min(1, value));

export function advancePostTimelineFollow(current, dt) {
  return clamp(current + Math.max(0, dt) * .24);
}

export function centerPull(progress, follow) {
  const t = clamp((progress - .2) / .3);
  return t * t * (3 - 2 * t) * .78 * (1 - clamp(follow));
}

export function followEyeOffsets(follow) {
  const t = clamp(follow);
  return { along: -14 + 26 * t, side: 7 + 12 * Math.sin(Math.PI * t) };
}
