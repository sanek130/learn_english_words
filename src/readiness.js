export function decayedMastery(pair, now = Date.now()) {
  let mastery = pair.mastery || 0;
  if (!pair.lastPracticedAt) return 0;
  const days = (now - new Date(pair.lastPracticedAt).getTime()) / 86400000;
  if (days > 14) mastery *= 0.7;
  else if (days > 7) mastery *= 0.85;
  else if (days > 3) mastery *= 0.93;
  return Math.round(Math.max(0, Math.min(100, mastery)));
}

export function applyPractice(pair, grade) {
  const score = grade.total;
  const old = pair.mastery || 0;
  pair.attempts = (pair.attempts || 0) + 1;
  pair.lastScore = score;
  pair.lastPracticedAt = new Date();

  if (grade.verdict === "correct") {
    pair.correct = (pair.correct || 0) + 1;
    pair.streak = (pair.streak || 0) + 1;
    pair.mastery = 0.62 * old + 0.38 * score;
    if (pair.streak >= 3) pair.mastery = Math.min(100, pair.mastery + 6);
  } else if (grade.verdict === "almost") {
    pair.almost = (pair.almost || 0) + 1;
    pair.streak = 0;
    pair.mastery = 0.72 * old + 0.28 * score;
  } else {
    pair.streak = 0;
    pair.mastery = 0.55 * old + 0.12 * score;
  }
  pair.mastery = Math.round(Math.max(0, Math.min(100, pair.mastery)));
  return pair;
}

export function listReadiness(list) {
  if (!list.pairs?.length) return 0;
  const sum = list.pairs.reduce((acc, p) => acc + decayedMastery(p), 0);
  return Math.round(sum / list.pairs.length);
}

export function overallReadiness(lists) {
  const pairs = lists.flatMap((l) => l.pairs || []);
  if (!pairs.length) return 0;
  const practiced = pairs.filter((p) => p.attempts > 0).length;
  const avg = Math.round(pairs.reduce((acc, p) => acc + decayedMastery(p), 0) / pairs.length);
  const coverage = practiced / pairs.length;
  return Math.round(avg * (0.55 + 0.45 * coverage));
}

export function progressBar(percent) {
  const filled = Math.round(percent / 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${percent}%`;
}
