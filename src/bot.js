import { Markup, Telegraf } from "telegraf";
import { getOrCreateUser, User, WordList } from "./models.js";
import {
  CB,
  afterAnswerKeyboard,
  confirmListKeyboard,
  langKeyboard,
  listActionsKeyboard,
  listsKeyboard,
  mainMenu,
  quizKeyboard,
  trainModeKeyboard,
  withNav,
} from "./keyboards.js";
import { buildAiPrompt, helpText, langName, menuText, parseCombinedLists, parseWordLines } from "./prompts.js";
import { formatLetterReview, gradeAnswer, verdictLabel } from "./matching.js";
import { applyPractice, listReadiness, overallReadiness, progressBar } from "./readiness.js";

const idleWizard = () => ({ step: "idle", history: [], draft: {}, train: {} });

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function saveWizard(user, wizard) {
  user.wizard = wizard;
  user.markModified("wizard");
  await user.save();
}

async function show(ctx, text, extra = {}) {
  const payload = { parse_mode: "HTML", disable_web_page_preview: true, ...extra };
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, payload);
      return;
    } catch {
      /* message not modified or too old */
    }
  }
  await ctx.reply(text, payload);
}

async function goMenu(ctx, user) {
  user.wizard = idleWizard();
  await user.save();
  await show(ctx, menuText(user), mainMenu());
}

function pushStep(wizard, step) {
  if (wizard.step && wizard.step !== "idle") wizard.history.push(wizard.step);
  wizard.step = step;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createBot(token) {
  const bot = new Telegraf(token);

  bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    ctx.dbUser = await getOrCreateUser(ctx.from);
    if (!ctx.dbUser.wizard) ctx.dbUser.wizard = idleWizard();
    return next();
  });

  bot.start(async (ctx) => {
    await goMenu(ctx, ctx.dbUser);
  });

  bot.command("menu", async (ctx) => goMenu(ctx, ctx.dbUser));
  bot.command("cancel", async (ctx) => {
    await ctx.reply("Отменено.");
    await goMenu(ctx, ctx.dbUser);
  });

  bot.action(CB.menu, async (ctx) => {
    await ctx.answerCbQuery();
    await goMenu(ctx, ctx.dbUser);
  });

  bot.action(CB.cancel, async (ctx) => {
    await ctx.answerCbQuery("Отменено");
    await goMenu(ctx, ctx.dbUser);
  });

  bot.action(CB.back, async (ctx) => {
    await ctx.answerCbQuery();
    const user = ctx.dbUser;
    const w = user.wizard || idleWizard();
    const prev = w.history.pop();
    if (!prev || prev === "idle") {
      await goMenu(ctx, user);
      return;
    }
    w.step = prev;
    await saveWizard(user, w);
    await renderStep(ctx, user);
  });

  bot.action(CB.help, async (ctx) => {
    await ctx.answerCbQuery();
    const w = ctx.dbUser.wizard || idleWizard();
    pushStep(w, "help");
    await saveWizard(ctx.dbUser, w);
    await show(ctx, helpText(), withNav([]));
  });

  bot.action(CB.aiPrompt, async (ctx) => {
    await ctx.answerCbQuery();
    const w = ctx.dbUser.wizard || idleWizard();
    w.draft = w.draft || {};
    w.draft.promptTarget = "source";
    pushStep(w, "prompt_source_lang");
    await saveWizard(ctx.dbUser, w);
    await show(
      ctx,
      "Для промпта выберите <b>исходный язык</b> (с которого учите).",
      langKeyboard("psrc")
    );
  });

  bot.action(CB.newList, async (ctx) => {
    await ctx.answerCbQuery();
    await startNewList(ctx);
  });

  bot.action(CB.myLists, async (ctx) => {
    await ctx.answerCbQuery();
    await showMyLists(ctx);
  });

  bot.action(CB.train, async (ctx) => {
    await ctx.answerCbQuery();
    await pickTrainList(ctx);
  });

  bot.action(CB.trainWrite, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.dbUser.wizard.train = { ...(ctx.dbUser.wizard.train || {}), mode: "write" };
    await startQuestion(ctx);
  });

  bot.action(CB.trainQuiz, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.dbUser.wizard.train = { ...(ctx.dbUser.wizard.train || {}), mode: "quiz" };
    await startQuestion(ctx);
  });

  bot.action(CB.applyList, async (ctx) => {
    await ctx.answerCbQuery("Сохраняю…");
    await applyDraftList(ctx);
  });

  bot.action(CB.stats, async (ctx) => {
    await ctx.answerCbQuery();
    await showReadiness(ctx);
  });

  bot.action(CB.leaders, async (ctx) => {
    await ctx.answerCbQuery();
    await showLeaders(ctx);
  });

  bot.action(/^langsrc:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handleLangPick(ctx, "source", ctx.match[1], "langsrc");
  });

  bot.action(/^langtgt:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handleLangPick(ctx, "target", ctx.match[1], "langtgt");
  });

  bot.action(/^psrc:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handlePromptLang(ctx, "source", ctx.match[1]);
  });

  bot.action(/^ptgt:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await handlePromptLang(ctx, "target", ctx.match[1]);
  });

  bot.action(/^openlist:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await openList(ctx, ctx.match[1]);
  });

  bot.action(/^trainlist:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const w = ctx.dbUser.wizard || idleWizard();
    w.train = { listId: ctx.match[1] };
    pushStep(w, "train_mode");
    await saveWizard(ctx.dbUser, w);
    await show(ctx, "Как тренируем этот список?", trainModeKeyboard());
  });

  bot.action(/^dellist:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const id = ctx.match[1];
    await WordList.deleteOne({ _id: id, userId: ctx.from.id });
    await ctx.reply("Список удалён.");
    await goMenu(ctx, ctx.dbUser);
  });

  bot.action(/^next:(write|quiz):(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const w = ctx.dbUser.wizard || idleWizard();
    w.train = { ...(w.train || {}), mode: ctx.match[1], listId: ctx.match[2] };
    w.step = "train_question";
    await saveWizard(ctx.dbUser, w);
    await startQuestion(ctx);
  });

  bot.action(/^quiz:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await gradeQuiz(ctx, ctx.match[1], Number(ctx.match[2]));
  });

  bot.on("text", async (ctx) => {
    const w = ctx.dbUser.wizard || idleWizard();
    const text = ctx.message.text.trim();
    if (text === "/start" || text === "/menu") return;

    switch (w.step) {
      case "source_lang_custom":
        w.draft.sourceLang = text.slice(0, 32);
        pushStep(w, "target_lang");
        await saveWizard(ctx.dbUser, w);
        await ctx.reply(
          `Исходный язык: <b>${esc(w.draft.sourceLang)}</b>\nТеперь язык перевода.`,
          { parse_mode: "HTML", ...langKeyboard("langtgt") }
        );
        return;
      case "target_lang_custom":
        w.draft.targetLang = text.slice(0, 32);
        pushStep(w, "source_words");
        await saveWizard(ctx.dbUser, w);
        await askSourceWords(ctx, w);
        return;
      case "source_words": {
        const combined = parseCombinedLists(text);
        if (combined) {
          w.draft.sourceWords = combined.sourceWords;
          w.draft.targetWords = combined.targetWords;
          pushStep(w, "confirm");
          await saveWizard(ctx.dbUser, w);
          await showConfirm(ctx, w);
          return;
        }
        w.draft.sourceWords = parseWordLines(text);
        if (w.draft.sourceWords.length < 1) {
          await ctx.reply("Нужна хотя бы одна строка со словом.", withNav([]));
          return;
        }
        pushStep(w, "target_words");
        await saveWizard(ctx.dbUser, w);
        await ctx.reply(
          `Принял <b>${w.draft.sourceWords.length}</b> слов на языке «${esc(
            langName(w.draft.sourceLang)
          )}».\n\nТеперь пришлите <b>такой же список</b> на языке «${esc(
            langName(w.draft.targetLang)
          )}», в том же порядке. Столько же строк.`,
          { parse_mode: "HTML", ...withNav([]) }
        );
        return;
      }
      case "target_words":
        w.draft.targetWords = parseWordLines(text);
        if (w.draft.targetWords.length !== w.draft.sourceWords.length) {
          await ctx.reply(
            `Нужно ${w.draft.sourceWords.length} строк, а пришло ${w.draft.targetWords.length}. Исправьте список или нажмите «Назад».`,
            withNav([])
          );
          return;
        }
        pushStep(w, "confirm");
        await saveWizard(ctx.dbUser, w);
        await showConfirm(ctx, w);
        return;
      case "prompt_source_custom":
        w.draft.sourceLang = text.slice(0, 32);
        pushStep(w, "prompt_target_lang");
        await saveWizard(ctx.dbUser, w);
        await ctx.reply("Язык перевода для промпта:", langKeyboard("ptgt"));
        return;
      case "prompt_target_custom":
        w.draft.targetLang = text.slice(0, 32);
        await sendPrompt(ctx, w);
        return;
      case "prompt_topic":
        await sendPrompt(ctx, w, text);
        return;
      case "train_write":
        await gradeWrite(ctx, text);
        return;
      default:
        await ctx.reply("Откройте меню кнопками.", mainMenu());
    }
  });

  bot.catch((err) => {
    console.error("Bot error", err);
  });

  return bot;
}

async function startNewList(ctx) {
  const w = idleWizard();
  w.draft = {};
  pushStep(w, "source_lang");
  await saveWizard(ctx.dbUser, w);
  await show(ctx, "Новый список. Выберите <b>исходный язык</b> (слова, которые учите).", {
    parse_mode: "HTML",
    ...langKeyboard("langsrc"),
  });
}

async function handleLangPick(ctx, which, code, _prefix) {
  const w = ctx.dbUser.wizard || idleWizard();
  w.draft = w.draft || {};
  if (code === "custom") {
    const step = which === "source" ? "source_lang_custom" : "target_lang_custom";
    pushStep(w, step);
    await saveWizard(ctx.dbUser, w);
    await show(ctx, "Напишите название языка одним сообщением.", withNav([]));
    return;
  }
  if (which === "source") {
    w.draft.sourceLang = code;
    pushStep(w, "target_lang");
    await saveWizard(ctx.dbUser, w);
    await show(ctx, `Исходный язык: <b>${esc(langName(code))}</b>\nВыберите язык перевода.`, {
      parse_mode: "HTML",
      ...langKeyboard("langtgt"),
    });
    return;
  }
  w.draft.targetLang = code;
  pushStep(w, "source_words");
  await saveWizard(ctx.dbUser, w);
  await askSourceWords(ctx, w);
}

async function handlePromptLang(ctx, which, code) {
  const w = ctx.dbUser.wizard || idleWizard();
  w.draft = w.draft || {};
  if (code === "custom") {
    pushStep(w, which === "source" ? "prompt_source_custom" : "prompt_target_custom");
    await saveWizard(ctx.dbUser, w);
    await show(ctx, "Напишите название языка.", withNav([]));
    return;
  }
  if (which === "source") {
    w.draft.sourceLang = code;
    pushStep(w, "prompt_target_lang");
    await saveWizard(ctx.dbUser, w);
    await show(ctx, "Теперь язык перевода.", langKeyboard("ptgt"));
    return;
  }
  w.draft.targetLang = code;
  pushStep(w, "prompt_topic");
  await saveWizard(ctx.dbUser, w);
  await show(
    ctx,
    "Напишите тему списка (например: «еда», «IT», «IELTS writing») или отправьте «-».",
    withNav([])
  );
}

async function sendPrompt(ctx, w, topic) {
  const prompt = buildAiPrompt(
    w.draft.sourceLang || "en",
    w.draft.targetLang || "ru",
    topic && topic !== "-" ? topic : undefined
  );
  w.step = "idle";
  await saveWizard(ctx.dbUser, w);
  await ctx.reply(
    `Скопируйте промпт в нейросеть. Потом в боте: «Новый список» и вставьте блоки SOURCE и TARGET по очереди.\n\n<code>${esc(
      prompt
    )}</code>`,
    { parse_mode: "HTML", ...mainMenu() }
  );
}

async function askSourceWords(ctx, w) {
  await show(
    ctx,
    `Пришлите список на языке «<b>${esc(langName(w.draft.sourceLang))}</b>».\nКаждое слово или фраза — с новой строки.\nСинонимы: <code>big / large</code>`,
    { parse_mode: "HTML", ...withNav([]) }
  );
}

async function showConfirm(ctx, w) {
  const lines = w.draft.sourceWords
    .map((s, i) => `${i + 1}. <b>${esc(s)}</b> → ${esc(w.draft.targetWords[i])}`)
    .slice(0, 40);
  const more =
    w.draft.sourceWords.length > 40 ? `\n… и ещё ${w.draft.sourceWords.length - 40}` : "";
  await show(
    ctx,
    `Проверьте пары (${w.draft.sourceWords.length}). Если всё ок — примените изменения.\n\n${lines.join(
      "\n"
    )}${more}`,
    { parse_mode: "HTML", ...confirmListKeyboard() }
  );
}

async function applyDraftList(ctx) {
  const w = ctx.dbUser.wizard || idleWizard();
  const { sourceLang, targetLang, sourceWords, targetWords } = w.draft || {};
  if (!sourceWords?.length || sourceWords.length !== targetWords?.length) {
    await show(ctx, "Черновик пуст или списки разной длины. Начните заново.", mainMenu());
    return;
  }
  const list = await WordList.create({
    userId: ctx.from.id,
    title: `${langName(sourceLang)} → ${langName(targetLang)}`,
    sourceLang,
    targetLang,
    pairs: sourceWords.map((source, i) => ({ source, target: targetWords[i] })),
  });
  ctx.dbUser.wizard = idleWizard();
  await ctx.dbUser.save();
  await show(
    ctx,
    `Список сохранён: ${list.pairs.length} пар.\nМожно сразу тренироваться.`,
    listActionsKeyboard(String(list._id))
  );
}

async function showMyLists(ctx) {
  const lists = await WordList.find({ userId: ctx.from.id }).sort({ updatedAt: -1 });
  const w = ctx.dbUser.wizard || idleWizard();
  pushStep(w, "my_lists");
  await saveWizard(ctx.dbUser, w);
  if (!lists.length) {
    await show(ctx, "Списков пока нет. Создайте первый.", withNav([[Markup.button.callback("➕ Новый список", CB.newList)]]));
    return;
  }
  await show(ctx, "Ваши списки:", listsKeyboard(lists, "openlist"));
}

async function openList(ctx, id) {
  const list = await WordList.findOne({ _id: id, userId: ctx.from.id });
  if (!list) {
    await show(ctx, "Список не найден.", mainMenu());
    return;
  }
  const w = ctx.dbUser.wizard || idleWizard();
  pushStep(w, "list_view");
  await saveWizard(ctx.dbUser, w);
  const ready = listReadiness(list);
  const preview = list.pairs
    .slice(0, 12)
    .map((p) => `• ${esc(p.source)} → ${esc(p.target)} (${decayHint(p)})`)
    .join("\n");
  await show(
    ctx,
    `<b>${esc(list.title)}</b>\nГотовность по списку: ${progressBar(ready)}\n\n${preview}${
      list.pairs.length > 12 ? `\n… всего ${list.pairs.length}` : ""
    }`,
    { parse_mode: "HTML", ...listActionsKeyboard(String(list._id)) }
  );
}

function decayHint(pair) {
  return `${Math.round(pair.mastery || 0)}%`;
}

async function pickTrainList(ctx) {
  const lists = await WordList.find({ userId: ctx.from.id }).sort({ updatedAt: -1 });
  const w = ctx.dbUser.wizard || idleWizard();
  pushStep(w, "train_pick");
  await saveWizard(ctx.dbUser, w);
  if (!lists.length) {
    await show(ctx, "Сначала добавьте слова.", withNav([[Markup.button.callback("➕ Новый список", CB.newList)]]));
    return;
  }
  await show(ctx, "Какой список тренируем?", listsKeyboard(lists, "trainlist"));
}

async function startQuestion(ctx) {
  const w = ctx.dbUser.wizard || idleWizard();
  const list = await WordList.findOne({ _id: w.train.listId, userId: ctx.from.id });
  if (!list?.pairs?.length) {
    await show(ctx, "Список пуст.", mainMenu());
    return;
  }
  const weighted = list.pairs.map((p) => ({ p, weight: 110 - (p.mastery || 0) }));
  const totalW = weighted.reduce((a, x) => a + x.weight, 0);
  let roll = Math.random() * totalW;
  let pair = weighted[0].p;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) {
      pair = item.p;
      break;
    }
  }
  w.train.pairId = String(pair._id);
  w.step = w.train.mode === "quiz" ? "train_quiz" : "train_write";
  await saveWizard(ctx.dbUser, w);

  if (w.train.mode === "quiz") {
    const others = list.pairs.filter((p) => String(p._id) !== String(pair._id));
    const distractors = shuffle(others).slice(0, 3);
    const options = shuffle([pair, ...distractors]).map((p) => ({
      id: String(p._id),
      label: p.target.slice(0, 60),
    }));
    w.train.quizOptions = options;
    await saveWizard(ctx.dbUser, w);
    await show(
      ctx,
      `Переведите (${esc(langName(list.sourceLang))} → ${esc(langName(list.targetLang))}):\n\n<b>${esc(
        pair.source
      )}</b>`,
      { parse_mode: "HTML", ...quizKeyboard(options, String(pair._id)) }
    );
    return;
  }

  await show(
    ctx,
    `Напишите перевод (${esc(langName(list.targetLang))}):\n\n<b>${esc(pair.source)}</b>\n\nПроверка: не только полное совпадение — учитываются буквы, артикли, порядок слов, опечатки и синонимы через /.`,
    { parse_mode: "HTML", ...withNav([]) }
  );
}

async function gradeWrite(ctx, text) {
  const w = ctx.dbUser.wizard || idleWizard();
  const list = await WordList.findOne({ _id: w.train.listId, userId: ctx.from.id });
  const pair = list?.pairs.id(w.train.pairId);
  if (!pair) {
    await ctx.reply("Вопрос уже сброшен. Выберите тренировку снова.", mainMenu());
    return;
  }
  const grade = gradeAnswer(pair.target, text);
  await persistGrade(ctx, list, pair, grade);
  w.step = "train_result";
  await saveWizard(ctx.dbUser, w);
  await ctx.reply(formatGradeMessage(pair, text, grade), {
    parse_mode: "HTML",
    ...afterAnswerKeyboard(String(list._id), "write"),
  });
}

async function gradeQuiz(ctx, pairId, optionIndex) {
  const w = ctx.dbUser.wizard || idleWizard();
  const list = await WordList.findOne({ _id: w.train.listId, userId: ctx.from.id });
  const pair = list?.pairs.id(pairId);
  const picked = w.train.quizOptions?.[optionIndex];
  if (!pair || !picked) {
    await show(ctx, "Этот вопрос устарел. Нажмите «Тренировка».", mainMenu());
    return;
  }
  const grade = gradeAnswer(pair.target, picked.label);
  await persistGrade(ctx, list, pair, grade);
  await show(ctx, formatGradeMessage(pair, picked.label, grade), {
    parse_mode: "HTML",
    ...afterAnswerKeyboard(String(list._id), "quiz"),
  });
}

async function persistGrade(ctx, list, pair, grade) {
  applyPractice(pair, grade);
  await list.save();
  const user = ctx.dbUser;
  user.totalAnswers += 1;
  user.solvedTasks += 1;
  if (grade.verdict === "correct") user.correctAnswers += 1;
  if (grade.verdict === "almost") user.almostAnswers += 1;
  await user.save();
}

function formatGradeMessage(pair, given, grade) {
  const schemes = grade.schemes.length
    ? grade.schemes.map((s) => `• ${esc(s)}`).join("\n")
    : "• ни одна схема не совпала полностью";
  return `${verdictLabel(grade.verdict)} · буквы ${grade.letterScore}% · итог ${grade.total}%

Ваш ответ: <code>${esc(given)}</code>
Нужно: <code>${esc(pair.target)}</code>

Разбор по буквам:
<code>${esc(formatLetterReview(grade))}</code>
<code>ok буква · ≠замена · +лишняя · −пропуск</code>

Сработавшие схемы:
${schemes}

Мастерство слова: ${pair.mastery}%`;
}

async function showReadiness(ctx) {
  const lists = await WordList.find({ userId: ctx.from.id });
  const w = ctx.dbUser.wizard || idleWizard();
  pushStep(w, "stats");
  await saveWizard(ctx.dbUser, w);
  if (!lists.length) {
    await show(ctx, "Пока нечего измерять — добавьте список слов.", withNav([]));
    return;
  }
  const overall = overallReadiness(lists);
  const perList = lists
    .map((l) => `${esc(l.title)}: ${progressBar(listReadiness(l))}`)
    .join("\n");
  const weak = lists
    .flatMap((l) => l.pairs.map((p) => ({ ...p.toObject(), list: l.title })))
    .sort((a, b) => (a.mastery || 0) - (b.mastery || 0))
    .slice(0, 5)
    .map((p) => `• ${esc(p.source)} (${Math.round(p.mastery || 0)}%)`)
    .join("\n");
  await show(
    ctx,
    `<b>Готовность к экзамену</b>\n${progressBar(overall)}\n\nСчитается так: среднее мастерство всех слов × покрытие (сколько уже пробовали) + затухание, если давно не повторяли. «Почти верно» даёт частичный прогресс, ошибка снижает мастерство.\n\nПо спискам:\n${perList}\n\nСлабые слова:\n${weak || "—"}`,
    { parse_mode: "HTML", ...withNav([]) }
  );
}

async function showLeaders(ctx) {
  const users = await User.find({ totalAnswers: { $gte: 1 } }).lean();
  const ranked = users
    .map((u) => ({
      ...u,
      accuracy: Math.round((u.correctAnswers / u.totalAnswers) * 100),
    }))
    .sort((a, b) => b.accuracy - a.accuracy || b.solvedTasks - a.solvedTasks);

  const byTasks = [...users].sort((a, b) => b.solvedTasks - a.solvedTasks || (b.correctAnswers / b.totalAnswers) - (a.correctAnswers / a.totalAnswers));

  const nameOf = (u) => u.firstName || u.username || `id${u.telegramId}`;
  const me = ctx.from.id;

  const accBoard = ranked
    .slice(0, 10)
    .map((u, i) => `${i + 1}. ${u.telegramId === me ? "<b>" : ""}${esc(nameOf(u))} — ${u.accuracy}% (${u.correctAnswers}/${u.totalAnswers})${u.telegramId === me ? "</b>" : ""}`)
    .join("\n");

  const taskBoard = byTasks
    .slice(0, 10)
    .map((u, i) => `${i + 1}. ${u.telegramId === me ? "<b>" : ""}${esc(nameOf(u))} — ${u.solvedTasks} задач${u.telegramId === me ? "</b>" : ""}`)
    .join("\n");

  const w = ctx.dbUser.wizard || idleWizard();
  pushStep(w, "leaders");
  await saveWizard(ctx.dbUser, w);

  await show(
    ctx,
    `<b>Таблица лидеров</b>\nМинимум 1 ответ. Процент — только полностью верные (не «почти»).\n\n🥇 По % верных:\n${accBoard || "пока пусто"}\n\n🔥 По числу решённых задач:\n${taskBoard || "пока пусто"}`,
    { parse_mode: "HTML", ...withNav([]) }
  );
}

async function renderStep(ctx, user) {
  const w = user.wizard;
  switch (w.step) {
    case "source_lang":
      await show(ctx, "Выберите исходный язык.", langKeyboard("langsrc"));
      break;
    case "target_lang":
      await show(ctx, "Выберите язык перевода.", langKeyboard("langtgt"));
      break;
    case "source_words":
      await askSourceWords(ctx, w);
      break;
    case "target_words":
      await show(ctx, "Пришлите список переводов (столько же строк).", withNav([]));
      break;
    case "confirm":
      await showConfirm(ctx, w);
      break;
    case "my_lists":
      await showMyLists(ctx);
      break;
    case "train_pick":
      await pickTrainList(ctx);
      break;
    case "train_mode":
      await show(ctx, "Как тренируем?", trainModeKeyboard());
      break;
    default:
      await goMenu(ctx, user);
  }
}
