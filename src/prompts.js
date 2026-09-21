export const LANG_LABELS = {
  en: "английский",
  ru: "русский",
  de: "немецкий",
  es: "испанский",
  fr: "французский",
  it: "итальянский",
};

export function langName(code) {
  return LANG_LABELS[code] || code;
}

export function parseWordLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*\d+[.)]\s*/, "")
        .replace(/^\s*[-*•]\s*/, "")
        .trim()
    )
    .filter((line) => line && !/^source:|^target:|^язык|^language/i.test(line));
}

/** Если нейросеть вернула оба блока сразу — разбираем SOURCE/TARGET. */
export function parseCombinedLists(text) {
  const raw = String(text || "").trim();
  const sourceMatch = raw.match(/SOURCE:\s*([\s\S]*?)(?:TARGET:|$)/i);
  const targetMatch = raw.match(/TARGET:\s*([\s\S]*)$/i);
  if (!sourceMatch || !targetMatch) return null;
  const sourceWords = parseWordLines(sourceMatch[1]);
  const targetWords = parseWordLines(targetMatch[1]);
  if (sourceWords.length && sourceWords.length === targetWords.length) {
    return { sourceWords, targetWords };
  }
  return null;
}

export function buildAiPrompt(sourceLang, targetLang, topic = "повседневные слова уровня B1") {
  const from = langName(sourceLang);
  const to = langName(targetLang);
  return `Сгенерируй список для изучения слов.

Тема: ${topic}
Исходный язык: ${from}
Язык перевода: ${to}
Количество: 20 пар

Правила:
- Ровно 20 строк в каждом блоке, одинаковый порядок и смысл.
- Одна пара = одна строка. Без нумерации, без транскрипции, без комментариев.
- Если у слова несколько переводов, пиши их через слэш: слово / синоним
- Не добавляй артикли в отдельную колонку — можно внутри перевода.

Ответ СТРОГО в формате:

SOURCE:
слово1
слово2
...

TARGET:
перевод1
перевод2
...`;
}

export function helpText() {
  return `Как бот принимает списки

1) Сначала пришлите слова на исходном языке, каждое с новой строки:
hello
to run
cat / kitty

2) Затем такой же список переводов, в том же порядке:
привет / здравствуй
бегать
кот / кошка

Можно нумеровать — номера я срежу.
Синонимы через / или | — любой вариант засчитается.

Либо нажмите «Промпт для нейросети», скопируйте текст в ChatGPT/Claude, вставьте сюда два блока по очереди.`;
}

export function menuText(user) {
  const acc = user.totalAnswers ? Math.round((user.correctAnswers / user.totalAnswers) * 100) : 0;
  return `📚 Учим слова

Решено задач: ${user.solvedTasks || 0}
Верных ответов: ${acc}% (${user.correctAnswers || 0}/${user.totalAnswers || 0})

Выберите действие кнопками. «Назад» и «Отмена» есть на каждом шаге.`;
}
