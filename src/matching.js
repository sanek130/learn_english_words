/** Схемы проверки ответа: не просто ===, а нормализация, буквы, опечатки, альтернативы. */

const ARTICLES = new Set([
  "a",
  "an",
  "the",
  "to",
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "des",
  "el",
  "los",
  "las",
  "lo",
  "un",
  "una",
  "unos",
  "unas",
  "der",
  "die",
  "das",
  "den",
  "dem",
  "ein",
  "eine",
  "einen",
  "einem",
  "einer",
  "il",
  "lo",
  "gli",
  "i",
  "le",
  "un",
  "uno",
  "una",
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "het",
]);

export function splitAlternatives(raw) {
  return String(raw || "")
    .split(/\s*(?:\/|\||;|\n| или | or )\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function canonicalize(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ё/gi, "е")
    .toLowerCase()
    .replace(/[«»„“”"'`´]/g, "")
    .replace(/[.,!?;:()[\]{}…·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripArticles(canon) {
  const tokens = canon.split(" ").filter(Boolean);
  const stripped = tokens.filter((t, i) => !(i === 0 && ARTICLES.has(t)));
  return stripped.join(" ");
}

function tokenBag(canon) {
  return stripArticles(canon).split(" ").filter(Boolean).sort().join(" ");
}

function levenshtein(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp;
}

function alignLetters(expected, actual) {
  const dp = levenshtein(expected, actual);
  let i = expected.length;
  let j = actual.length;
  const marks = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] && expected[i - 1] === actual[j - 1]) {
      marks.push({ kind: "ok", ch: actual[j - 1] });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      marks.push({ kind: "sub", expected: expected[i - 1], actual: actual[j - 1] });
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      marks.push({ kind: "extra", ch: actual[j - 1] });
      j--;
    } else {
      marks.push({ kind: "miss", ch: expected[i - 1] });
      i--;
    }
  }
  marks.reverse();
  return marks;
}

function maxTypoDistance(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 3;
}

function scoreAgainst(expectedRaw, actualRaw) {
  const expectedAlts = splitAlternatives(expectedRaw).length
    ? splitAlternatives(expectedRaw)
    : [expectedRaw];
  const actualCanon = canonicalize(actualRaw);
  let best = null;

  for (const alt of expectedAlts) {
    const expCanon = canonicalize(alt);
    const schemes = [];

    if (actualCanon === expCanon) {
      schemes.push({ name: "точное совпадение", weight: 1 });
    }

    const aArt = stripArticles(actualCanon);
    const eArt = stripArticles(expCanon);
    if (aArt && aArt === eArt) {
      schemes.push({ name: "без артиклей", weight: 0.98 });
    }

    if (tokenBag(actualCanon) && tokenBag(actualCanon) === tokenBag(expCanon)) {
      schemes.push({ name: "мешок слов (порядок не важен)", weight: 0.96 });
    }

    const expLetters = eArt.replace(/\s/g, "");
    const actLetters = aArt.replace(/\s/g, "");
    const dist = levenshtein(expLetters, actLetters)[expLetters.length][actLetters.length];
    const maxLen = Math.max(expLetters.length, actLetters.length, 1);
    const letterRatio = 1 - dist / maxLen;
    const allowed = maxTypoDistance(expLetters.length);
    if (dist <= allowed && letterRatio >= 0.72) {
      schemes.push({
        name: `опечатки (Левенштейн ≤ ${allowed})`,
        weight: Math.max(0.8, letterRatio),
      });
    }

    const hyphenFold = (s) => s.replace(/[-\u2011]/g, " ").replace(/\s+/g, " ").trim();
    if (hyphenFold(aArt) === hyphenFold(eArt) && eArt) {
      schemes.push({ name: "дефис/пробел", weight: 0.97 });
    }

    const marks = alignLetters(expLetters, actLetters);
    const okCount = marks.filter((m) => m.kind === "ok").length;
    const letterScore = okCount / Math.max(expLetters.length, 1);
    const schemeWeight = schemes.length ? Math.max(...schemes.map((s) => s.weight)) : letterScore;
    const total = Math.round(Math.min(1, Math.max(0, schemeWeight)) * 100);

    const candidate = {
      expected: alt,
      total,
      letterScore: Math.round(letterScore * 100),
      distance: dist,
      schemes: schemes.map((s) => s.name),
      marks,
      exact: actualCanon === expCanon,
    };
    if (!best || candidate.total > best.total) best = candidate;
  }

  return best;
}

export function gradeAnswer(expectedRaw, actualRaw) {
  const result = scoreAgainst(expectedRaw, actualRaw);
  let verdict = "wrong";
  if (result.total >= 92 || result.exact) verdict = "correct";
  else if (result.total >= 75) verdict = "almost";

  return { ...result, verdict };
}

export function formatLetterReview(result) {
  const parts = result.marks.map((m) => {
    if (m.kind === "ok") return m.ch;
    if (m.kind === "sub") return `≠${m.actual}`;
    if (m.kind === "extra") return `+${m.ch}`;
    return `−${m.ch}`;
  });
  return parts.join(" ");
}

export function verdictLabel(verdict) {
  if (verdict === "correct") return "✅ Верно";
  if (verdict === "almost") return "🟡 Почти верно";
  return "❌ Неверно";
}
