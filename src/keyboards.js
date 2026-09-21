import { Markup } from "telegraf";

export const CB = {
  menu: "nav:menu",
  back: "nav:back",
  cancel: "nav:cancel",
  newList: "list:new",
  myLists: "list:mine",
  aiPrompt: "list:prompt",
  applyList: "list:apply",
  train: "train:start",
  trainWrite: "train:write",
  trainQuiz: "train:quiz",
  stats: "stats:ready",
  leaders: "stats:leaders",
  help: "help:show",
};

export function navRow() {
  return [Markup.button.callback("◀️ Назад", CB.back), Markup.button.callback("❌ Отмена", CB.cancel)];
}

export function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➕ Новый список", CB.newList)],
    [Markup.button.callback("📚 Мои списки", CB.myLists)],
    [Markup.button.callback("🧠 Тренировка", CB.train)],
    [Markup.button.callback("📈 Готовность к экзамену", CB.stats)],
    [Markup.button.callback("🏆 Лидеры", CB.leaders)],
    [Markup.button.callback("🤖 Промпт для нейросети", CB.aiPrompt)],
    [Markup.button.callback("❓ Как вводить слова", CB.help)],
  ]);
}

export function withNav(rows) {
  return Markup.inlineKeyboard([...rows, navRow()]);
}

export function langKeyboard(prefix) {
  const langs = [
    ["en", "🇬🇧 English"],
    ["ru", "🇷🇺 Русский"],
    ["de", "🇩🇪 Deutsch"],
    ["es", "🇪🇸 Español"],
    ["fr", "🇫🇷 Français"],
    ["it", "🇮🇹 Italiano"],
  ];
  const rows = [];
  for (let i = 0; i < langs.length; i += 2) {
    rows.push(
      langs.slice(i, i + 2).map(([code, label]) => Markup.button.callback(label, `${prefix}:${code}`))
    );
  }
  rows.push([Markup.button.callback("✍️ Другой язык (написать)", `${prefix}:custom`)]);
  rows.push(navRow());
  return Markup.inlineKeyboard(rows);
}

export function confirmListKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("✅ Применить изменения", CB.applyList)],
    navRow(),
  ]);
}

export function trainModeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("⌨️ Письменно (по буквам)", CB.trainWrite)],
    [Markup.button.callback("🔘 Тест с кнопками", CB.trainQuiz)],
    navRow(),
  ]);
}

export function listsKeyboard(lists, actionPrefix) {
  const rows = lists.slice(0, 20).map((list) => [
    Markup.button.callback(
      `${list.sourceLang} → ${list.targetLang} · ${list.pairs.length} слов`,
      `${actionPrefix}:${list._id}`
    ),
  ]);
  if (!rows.length) {
    rows.push([Markup.button.callback("➕ Создать первый список", CB.newList)]);
  }
  rows.push(navRow());
  return Markup.inlineKeyboard(rows);
}

export function quizKeyboard(options, pairId) {
  const rows = options.map((opt, idx) => [
    Markup.button.callback(opt.label, `quiz:${pairId}:${idx}`),
  ]);
  rows.push(navRow());
  return Markup.inlineKeyboard(rows);
}

export function afterAnswerKeyboard(listId, mode) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("➡️ Следующее слово", `next:${mode}:${listId}`)],
    navRow(),
  ]);
}

export function listActionsKeyboard(listId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🧠 Тренировать этот список", `trainlist:${listId}`)],
    [Markup.button.callback("🗑 Удалить список", `dellist:${listId}`)],
    navRow(),
  ]);
}
