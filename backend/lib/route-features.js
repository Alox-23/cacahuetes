// The same three quantities are used in preference training and at each route stop.
export function stopFeatures(place, interests, covered, walk, minutesLeft) {
  const matches = place.tags.filter(tag => interests.includes(tag));
  return [matches.length, matches.filter(tag => !covered.has(tag)).length, walk / Math.max(1, minutesLeft)];
}

export function walkingMinutes(from, to, pace) {
  const speeds = { tranquilo: 3, normal: 4, activo: 5 };
  const rad = Math.PI / 180;
  const lat = (to.lat - from.lat) * rad;
  const lon = (to.lon - from.lon) * rad;
  const angle = Math.sin(lat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(lon / 2) ** 2;
  const kilometres = 12_742 * Math.asin(Math.min(1, Math.sqrt(angle)));
  return Math.ceil(kilometres * 1.35 / speeds[pace] * 60);
}
