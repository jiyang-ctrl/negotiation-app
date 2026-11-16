import { useState, useCallback, useMemo, useRef, useEffect, createContext, useContext } from "react";

// ═══════════════════════════════════════════
//  ⚙️  CONFIG — paste your Web App URL here
// ═══════════════════════════════════════════
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbxiZYNis9wgbApTYi9xSqcTr9hMja9lfZ9049O1IGaqfGeteUOMmWR5Cv5DaHazMmYl/exec";
const DASHBOARD_PASSWORD = "nugsb2026";

// ═══════════════════════════════════════════
//  SCORING
// ═══════════════════════════════════════════
const vcScoring = {
  equity: (v) => { if (v <= 25) return { pts: null, noDeal: true }; if (v <= 34) return { pts: 2 }; if (v <= 39) return { pts: 3 }; if (v <= 45) return { pts: 6 }; if (v <= 49) return { pts: 9 }; if (v === 50) return { pts: 11 }; if (v <= 59) return { pts: 15 }; if (v <= 69) return { pts: 18 }; return { pts: 20 }; },
  stock: (v) => ({ common: { pts: 0 }, convertible: { pts: 8 }, redeemable: { pts: 12 } })[v] || { pts: 0 },
  dividends: (v) => { if (v === 0) return { pts: 0 }; if (v <= 3) return { pts: 3 }; if (v <= 7) return { pts: 6 }; if (v <= 9) return { pts: 9 }; return { pts: 12 }; },
  antidilution: (v) => v === "rofr" ? { pts: 6 } : { pts: 0 },
  board: (v) => { if (v >= 4) return { pts: 10 }; return { pts: ({ 0: 0, 1: 3, 2: 5, 3: 7 })[v] ?? 0 }; },
  vesting: (v) => { if (v < 4) return { pts: null, noDeal: true }; if (v === 4) return { pts: 8 }; if (v === 5) return { pts: 12 }; return { pts: 14 }; },
  ceo: (v) => ({ none: { pts: null, noDeal: true }, conservative: { pts: 6 }, moderate: { pts: 10 }, aggressive: { pts: 16 } })[v] || { pts: 0 },
  noshop: (v) => v === "included" ? { pts: 10 } : { pts: 2 },
};
const founderScoring = {
  equity: (v) => { if (v >= 60) return { pts: null, noDeal: true }; if (v >= 56) return { pts: 4 }; if (v >= 50) return { pts: 8 }; if (v >= 47) return { pts: 16 }; if (v >= 42) return { pts: 18 }; if (v >= 36) return { pts: 20 }; if (v >= 31) return { pts: 22 }; return { pts: 24 }; },
  stock: (v) => ({ common: { pts: 6 }, convertible: { pts: 5 }, redeemable: { pts: 2 } })[v] || { pts: 0 },
  dividends: (v) => { if (v === 0) return { pts: 16 }; if (v <= 2) return { pts: 12 }; if (v <= 4) return { pts: 8 }; if (v <= 7) return { pts: 5 }; return { pts: 0 }; },
  antidilution: (v) => v === "rofr" ? { pts: 3 } : { pts: 0 },
  board: (v) => { if (v > 2) return { pts: null, noDeal: true }; return { pts: ({ 0: 2, 1: 8, 2: 6 })[v] ?? 0 }; },
  vesting: (v) => { if (v === 0) return { pts: 12 }; if (v <= 3) return { pts: 10 }; if (v <= 5) return { pts: 8 }; return { pts: 3 }; },
  ceo: (v) => ({ none: { pts: 19 }, conservative: { pts: 14 }, moderate: { pts: 7 }, aggressive: { pts: null, noDeal: true } })[v] || { pts: 0 },
  noshop: (v) => v === "included" ? { pts: 2 } : { pts: 12 },
};

const TERMS = [
  { id: "equity", name: "VC Equity Percentage", short: "Equity %" },
  { id: "stock", name: "Type of Stock", short: "Stock Type" },
  { id: "dividends", name: "Dividends (% per annum)", short: "Dividends" },
  { id: "antidilution", name: "Antidilution Rights", short: "Antidilution" },
  { id: "board", name: "VC Appointed Board Members", short: "Board Seats" },
  { id: "vesting", name: "Vesting of Founder's Shares", short: "Vesting" },
  { id: "ceo", name: "CEO Replacement Provision", short: "CEO Replace" },
  { id: "noshop", name: "No Shop Provision", short: "No Shop" },
];

const PDIMS = [
  { id: "trust", name: "Trust", vcQ: "How much do you trust the founder?", fQ: "How much do you trust the VC?",
    vcL: ["I do not trust the founder at all","I do not fully trust the founder","No reason to distrust the founder","I think the founder is trustworthy","The founder is very trustworthy","I completely trust the founder"],
    fL: ["I do not trust the VC at all","I do not fully trust the VC","No reason to distrust the VC","I think the VC is trustworthy","The VC is very trustworthy","I completely trust the VC"] },
  { id: "respect", name: "Respect", vcQ: "How much respect were you given?", fQ: "How much respect were you given?",
    vcL: ["No respect whatsoever","Very little respect","Sufficient respect","Considerable respect","Very much respect","Maximum respect"],
    fL: ["No respect whatsoever","Very little respect","Sufficient respect","Considerable respect","Very much respect","Maximum respect"] },
  { id: "equitability", name: "Equitability", vcQ: "How equitable was the process?", fQ: "How equitable was the process?",
    vcL: ["Fully taken advantage of","Not very fair","Fair at times","Mostly fair","Very fair","Extremely fair"],
    fL: ["Fully taken advantage of","Not very fair","Fair at times","Mostly fair","Very fair","Extremely fair"] },
  { id: "regard", name: "Regard for Other's Interests", vcQ: "How much did the founder understand your interests?", fQ: "How much did the VC understand your interests?",
    vcL: ["Only concerned with EE's interests","Receptive as a front","Considered when convenient","Fairly interested","Often attempted","Greatly concerned"],
    fL: ["Only concerned with firm's interests","Receptive as a front","Considered when convenient","Fairly interested","Often attempted","Greatly concerned"] },
  { id: "collaboration", name: "Future Collaboration", vcQ: "How interested are you in working with the founder?", fQ: "How interested are you in working with this VC?",
    vcL: ["Would never deal again","Prefer someone else","Indifferent","Interested","Would enjoy it","Extremely interested"],
    fL: ["Would never deal again","Prefer a different VC","Indifferent","Interested","Would enjoy it","Extremely interested"] },
];
const PVALS = [0, 2, 4, 6, 8, 10];

// ═══════════════════════════════════════════
//  LANGUAGE (EN / RU)
//  Only the on-screen text changes with the language. Answers are still saved
//  as language neutral codes ("convertible", "rofr", "vc"...), so both
//  languages share the same Google Sheet, scoring and dashboard.
//  Russian link: add ?lang=ru to the address. The EN/RU switch is in the header.
// ═══════════════════════════════════════════
const TERMS_RU = {
  equity: { name: "Доля инвестора в капитале", short: "Доля инвестора" },
  stock: { name: "Тип акций", short: "Тип акций" },
  dividends: { name: "Дивиденды (% годовых)", short: "Дивиденды" },
  antidilution: { name: "Защита от размытия доли", short: "Защита от размытия" },
  board: { name: "Члены совета директоров от инвестора", short: "Места в СД" },
  vesting: { name: "Вестинг акций основателя", short: "Вестинг" },
  ceo: { name: "Условие о замене CEO", short: "Замена CEO" },
  noshop: { name: "Условие об эксклюзивности (no shop)", short: "Эксклюзивность" },
};

const PDIMS_RU = {
  trust: { name: "Доверие", vcQ: "Насколько вы доверяете основателю?", fQ: "Насколько вы доверяете инвестору?",
    vcL: ["Совсем не доверяю основателю","Не вполне доверяю основателю","Нет причин не доверять основателю","Считаю, что основателю можно доверять","Основатель вызывает большое доверие","Полностью доверяю основателю"],
    fL: ["Совсем не доверяю инвестору","Не вполне доверяю инвестору","Нет причин не доверять инвестору","Считаю, что инвестору можно доверять","Инвестор вызывает большое доверие","Полностью доверяю инвестору"] },
  respect: { name: "Уважение", vcQ: "Насколько уважительно к вам относились?", fQ: "Насколько уважительно к вам относились?",
    vcL: ["Никакого уважения","Очень мало уважения","Достаточно уважения","Значительное уважение","Очень много уважения","Максимальное уважение"],
    fL: ["Никакого уважения","Очень мало уважения","Достаточно уважения","Значительное уважение","Очень много уважения","Максимальное уважение"] },
  equitability: { name: "Справедливость", vcQ: "Насколько справедливым был процесс?", fQ: "Насколько справедливым был процесс?",
    vcL: ["Мной полностью воспользовались","Не очень справедливо","Временами справедливо","В основном справедливо","Очень справедливо","Исключительно справедливо"],
    fL: ["Мной полностью воспользовались","Не очень справедливо","Временами справедливо","В основном справедливо","Очень справедливо","Исключительно справедливо"] },
  regard: { name: "Учёт интересов другой стороны", vcQ: "Насколько основатель понимал ваши интересы?", fQ: "Насколько инвестор понимал ваши интересы?",
    vcL: ["Заботили только интересы Earth Escape","Открытость лишь для вида","Учитывались, когда было удобно","Достаточный интерес","Частые попытки учесть","Большая забота о моих интересах"],
    fL: ["Заботили только интересы своего фонда","Открытость лишь для вида","Учитывались, когда было удобно","Достаточный интерес","Частые попытки учесть","Большая забота о моих интересах"] },
  collaboration: { name: "Будущее сотрудничество", vcQ: "Насколько вам интересно работать с этим основателем?", fQ: "Насколько вам интересно работать с этим инвестором?",
    vcL: ["Никогда больше не сотрудничать","Предпочтительнее другой партнёр","Безразлично","Интересно","С удовольствием","Крайне интересно"],
    fL: ["Никогда больше не сотрудничать","Предпочтительнее другой инвестор","Безразлично","Интересно","С удовольствием","Крайне интересно"] },
};

function termsFor(lang) { return lang === "ru" ? TERMS.map((t) => ({ ...t, ...TERMS_RU[t.id] })) : TERMS; }
function pdimsFor(lang) { return lang === "ru" ? PDIMS.map((d) => ({ ...d, ...PDIMS_RU[d.id] })) : PDIMS; }
function ruPlural(n, one, few, many) { const a = n % 10, b = n % 100; if (a === 1 && b !== 11) return one; if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few; return many; }

const FMT_RU = {
  equity: (v) => `${v}%`,
  stock: (v) => ({ common: "Обыкновенные", convertible: "Конв. привилег.", redeemable: "Выкуп. привилег." })[v] || v,
  dividends: (v) => v === 0 ? "Без дивидендов" : `${v}%`,
  antidilution: (v) => v === "rofr" ? "Право первого отказа" : "Без защиты",
  board: (v) => `${v} ${ruPlural(v, "член", "члена", "членов")}`,
  vesting: (v) => v === 0 ? "Без вестинга" : `${v} ${ruPlural(v, "год", "года", "лет")}`,
  ceo: (v) => ({ none: "Без условия", conservative: "Консервативные", moderate: "Умеренные", aggressive: "Агрессивные" })[v] || v,
  noshop: (v) => v === "included" ? "Включено" : "Не включено",
};

const STR = {
  en: {
    docTitle: "Aerospace Investment Negotiation", appTitle: "Earth Escape Negotiation", dashTitleAttr: "Dashboard",
    title: "Aerospace Investment Negotiation", subtitle: "Record your negotiation results and evaluate your counterpart",
    yourRole: "YOUR ROLE", roleVC: "🏦 Venture Capitalist", roleFounder: "👤 Founder / CEO",
    pairNumber: "PAIR NUMBER", pairPh: "e.g. 1, 2, 3...", yourName: "YOUR NAME", namePh: "Enter your name", start: "Start Survey →",
    termStep: (n) => `TERM ${n} OF 8`, badgeVC: "🏦 VC", badgeFounder: "👤 Founder", pair: "Pair",
    agreeQ: "What did you and your counterpart agree on?", back: "← Back", next: "Next →", reviewBtn: "Review →",
    reviewTitle: "Review Agreed Terms", edit: "Edit", processEvalBtn: "Process Evaluation →",
    processStep: (n) => `PROCESS ${n} OF 5`, cpFounder: "the Founder", cpVC: "the VC", evaluating: (cp) => `Evaluating ${cp}`,
    reviewSubmit: "Review & Submit →", finalReview: "Final Review", yourEvalOf: (cp) => `Your Process Evaluation of ${cp}`, total: "Total",
    feedbackFor: (cp) => `Constructive feedback for ${cp}`, optional: "(optional)", fbPh: "How could your counterpart improve?",
    submitFailed: "Submission failed. Please try again.", submitting: "Submitting…", submit: "Submit Everything ✓",
    submittedTitle: "Submitted Successfully", thanks: "Thank you, ", resultsFor: "Your results for ", pairWord: "Pair", recorded: " have been recorded.",
    instructorDash: "Instructor Dashboard", passwordPh: "Password", wrongPw: "Incorrect password", enter: "Enter",
    dashTitle: "📊 Instructor Dashboard", countLine: (t, p) => `${t} submissions · ${p} pairs`, refresh: "↻ Refresh", backSurvey: "← Survey",
    clear: "🗑 Clear", clearConfirm: "Yes, delete all", cancel: "Cancel",
    clearNote: "⚠️ Note: This clears the dashboard view only. To delete data from Google Sheets, delete rows directly in the Sheet.",
    stat: { submissions: "Submissions", completePairs: "Complete Pairs", dealBreakers: "Deal Breakers", mismatches: "Mismatches", avgVcSubst: "Avg VC Subst.", avgFdrSubst: "Avg FDR Subst.", avgVcProc: "Avg VC Process", avgFdrProc: "Avg FDR Process" },
    empty1: "No submissions yet", empty2: "Click ↻ Refresh to load data from Google Sheets",
    waitVC: "⏳ VC", waitFdr: "⏳ Founder", scoreVC: "VC", scoreFdr: "FDR", mismatchTag: "⚠ MISMATCH", breakTag: "BREAK",
    dbBanner: "⚠️ Deal Breaker — BATNA (45)", dbVC: " · VC: ", dbFdr: " · Fdr: ",
    mmTitle: "⚠ Input Mismatch", mmMid: " — inconsistent: ", mmEnd: ". Please verify.",
    substTerms: "Substantive Terms", thTerm: "TERM", thPts: "PTS", nd: "N/D", warnFdr: "⚠FDR", warnVC: "⚠VC", diff: "DIFF", substTotal: "SUBST.",
    processCross: "Process (cross-applied)", vcProcBy: "🏦 VC Process (by Founder)", fdrProcBy: "👤 Founder Process (by VC)",
    pending: "⏳ Pending", feedbackLabel: "FEEDBACK", vcGrand: "🏦 VC GRAND TOTAL", fdrGrand: "👤 FOUNDER GRAND TOTAL",
    loadErr: "Could not load data from Google Sheets. Check your SHEETS_URL.",
    opt: { common: "Common Stock", convertible: "Convertible Preferred Stock", redeemable: "Redeemable Preferred Stock",
      noAnti: "No Antidilution Rights", rofr: "VC Right of First Refusal",
      vesting: ["No Vesting", "1 year", "2 years", "3 years", "4 years", "5 years", "6 years", "7+ years"],
      ceoNone: "No Provision", ceoCons: "Conservative Projections", ceoMod: "Moderate Projections", ceoAggr: "Aggressive Projections",
      nsNot: "Not Included", nsIncl: "Included (60-day exclusivity)" },
    csv: { pair: "Pair", role: "Role", name: "Name", agreed: "(Agreed)", pts: "(Pts)", dealBreakers: "Deal Breakers", batna: "BATNA Applied",
      subst: "Substantive Score", processGiven: (n) => `Process: ${n} (given)`, feedback: "Feedback (for counterpart)", processRcv: "Process Received",
      grand: "Grand Total", consistency: "Pair Consistency", inconsistent: "Inconsistent Items", vc: "VC", founder: "Founder", noDeal: "No Deal",
      vcPrefix: "VC: ", fdrPrefix: "Fdr: ", none: "None", yes: "Yes", no: "No", mismatch: "MISMATCH", ok: "OK", incomplete: "Incomplete",
      filename: "negotiation_results.csv" },
  },
  ru: {
    docTitle: "Переговоры об аэрокосмических инвестициях", appTitle: "Переговоры Earth Escape", dashTitleAttr: "Панель преподавателя",
    title: "Переговоры об аэрокосмических инвестициях", subtitle: "Внесите итоги переговоров и оцените другую сторону",
    yourRole: "ВАША РОЛЬ", roleVC: "🏦 Венчурный инвестор", roleFounder: "👤 Основатель / CEO",
    pairNumber: "НОМЕР ПАРЫ", pairPh: "напр. 1, 2, 3...", yourName: "ВАШЕ ИМЯ", namePh: "Введите имя", start: "Начать опрос →",
    termStep: (n) => `УСЛОВИЕ ${n} ИЗ 8`, badgeVC: "🏦 Инвестор", badgeFounder: "👤 Основатель", pair: "Пара",
    agreeQ: "О чём вы договорились с другой стороной?", back: "← Назад", next: "Далее →", reviewBtn: "К проверке →",
    reviewTitle: "Проверьте согласованные условия", edit: "Изменить", processEvalBtn: "Оценка процесса →",
    processStep: (n) => `ОЦЕНКА ${n} ИЗ 5`, cpFounder: "основателя", cpVC: "инвестора", evaluating: (cp) => `Вы оцениваете ${cp}`,
    reviewSubmit: "Проверить и отправить →", finalReview: "Итоговая проверка", yourEvalOf: (cp) => `Ваша оценка ${cp}`, total: "Итого",
    feedbackFor: (cp) => `Рекомендации для ${cp}`, optional: "(необязательно)", fbPh: "Что другая сторона могла бы сделать лучше?",
    submitFailed: "Не удалось отправить. Попробуйте ещё раз.", submitting: "Отправка…", submit: "Отправить ✓",
    submittedTitle: "Ответ отправлен", thanks: "Спасибо, ", resultsFor: "Ваши результаты для ", pairWord: "пары", recorded: " сохранены.",
    instructorDash: "Панель преподавателя", passwordPh: "Пароль", wrongPw: "Неверный пароль", enter: "Войти",
    dashTitle: "📊 Панель преподавателя", countLine: (t, p) => `Ответов: ${t} · Пар: ${p}`, refresh: "↻ Обновить", backSurvey: "← Опрос",
    clear: "🗑 Очистить", clearConfirm: "Да, очистить", cancel: "Отмена",
    clearNote: "⚠️ Очищается только отображение на панели. Чтобы удалить данные, удалите строки прямо в Google Таблице.",
    stat: { submissions: "Ответы", completePairs: "Полные пары", dealBreakers: "Срывы сделки", mismatches: "Расхождения", avgVcSubst: "Ср. результат инвестора", avgFdrSubst: "Ср. результат основателя", avgVcProc: "Ср. процесс инвестора", avgFdrProc: "Ср. процесс основателя" },
    empty1: "Пока нет ответов", empty2: "Нажмите ↻ Обновить, чтобы загрузить данные из Google Таблицы",
    waitVC: "⏳ Инвестор", waitFdr: "⏳ Основатель", scoreVC: "ИНВ", scoreFdr: "ОСН", mismatchTag: "⚠ РАСХОЖДЕНИЕ", breakTag: "СРЫВ",
    dbBanner: "⚠️ Срыв сделки: BATNA (45)", dbVC: " · Инв.: ", dbFdr: " · Осн.: ",
    mmTitle: "⚠ Расхождение в ответах", mmMid: ": не совпадают ", mmEnd: ". Проверьте, пожалуйста.",
    substTerms: "Условия сделки", thTerm: "УСЛОВИЕ", thPts: "БАЛЛЫ", nd: "СРЫВ", warnFdr: "⚠ОСН", warnVC: "⚠ИНВ", diff: "РАЗН", substTotal: "ИТОГО",
    processCross: "Процесс (оценка другой стороны)", vcProcBy: "🏦 Процесс инвестора (оценка основателя)", fdrProcBy: "👤 Процесс основателя (оценка инвестора)",
    pending: "⏳ Ожидается", feedbackLabel: "РЕКОМЕНДАЦИИ", vcGrand: "🏦 ОБЩИЙ ИТОГ ИНВЕСТОРА", fdrGrand: "👤 ОБЩИЙ ИТОГ ОСНОВАТЕЛЯ",
    loadErr: "Не удалось загрузить данные из Google Таблицы. Проверьте SHEETS_URL.",
    opt: { common: "Обыкновенные акции", convertible: "Конвертируемые привилегированные акции", redeemable: "Выкупаемые привилегированные акции",
      noAnti: "Без защиты от размытия", rofr: "Право первого отказа для инвестора",
      vesting: ["Без вестинга", "1 год", "2 года", "3 года", "4 года", "5 лет", "6 лет", "7+ лет"],
      ceoNone: "Без условия", ceoCons: "Консервативные прогнозы", ceoMod: "Умеренные прогнозы", ceoAggr: "Агрессивные прогнозы",
      nsNot: "Не включено", nsIncl: "Включено (эксклюзивность 60 дней)" },
    csv: { pair: "Пара", role: "Роль", name: "Имя", agreed: "(согласовано)", pts: "(баллы)", dealBreakers: "Срывы сделки", batna: "Применена BATNA",
      subst: "Результат по сделке", processGiven: (n) => `Процесс: ${n} (выставлено)`, feedback: "Рекомендации (для другой стороны)", processRcv: "Процесс (получено)",
      grand: "Общий итог", consistency: "Согласованность пары", inconsistent: "Расхождения", vc: "Инвестор", founder: "Основатель", noDeal: "Срыв",
      vcPrefix: "Инв.: ", fdrPrefix: "Осн.: ", none: "Нет", yes: "Да", no: "Нет", mismatch: "РАСХОЖДЕНИЕ", ok: "OK", incomplete: "Неполная",
      filename: "negotiation_results_ru.csv" },
  },
};

const LangCtx = createContext("en");
function useLang() { const lang = useContext(LangCtx); return { lang, S: STR[lang], terms: termsFor(lang), pdims: pdimsFor(lang) }; }
function initialLang() { try { return new URLSearchParams(window.location.search).get("lang") === "ru" ? "ru" : "en"; } catch (_) { return "en"; } }

// ═══════════════════════════════════════════
//  API HELPERS
// ═══════════════════════════════════════════
async function apiSubmit(data) {
  if (!SHEETS_URL || SHEETS_URL === "PASTE_YOUR_WEB_APP_URL_HERE") {
    throw new Error("SHEETS_URL not configured. Please paste your Web App URL into the app.");
  }
  const res = await fetch(SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // avoids CORS preflight
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Server error");
  return json;
}

async function apiLoad() {
  if (!SHEETS_URL || SHEETS_URL === "PASTE_YOUR_WEB_APP_URL_HERE") return [];
  const res = await fetch(`${SHEETS_URL}?action=get`, { method: "GET" });
  const json = await res.json();
  return json.submissions || [];
}

// ═══════════════════════════════════════════
//  SCORING HELPERS
// ═══════════════════════════════════════════
function calcSub(ans, terms = TERMS) {
  let vcT = 0, fT = 0, vcND = [], fND = [];
  const vcBD = {}, fBD = {};
  terms.forEach((t) => {
    const v = ans[t.id]; if (v === null || v === undefined) return;
    const vs = vcScoring[t.id](v), fs = founderScoring[t.id](v);
    vcBD[t.id] = vs; fBD[t.id] = fs;
    if (vs.noDeal) vcND.push(t.short); else vcT += vs.pts;
    if (fs.noDeal) fND.push(t.short); else fT += fs.pts;
  });
  const nd = vcND.length > 0 || fND.length > 0;
  return { vcBD, fBD, vcND, fND, nd, vcF: nd ? 45 : vcT, fF: nd ? 45 : fT };
}

function fmt(id, v, lang = "en") {
  if (v === null || v === undefined) return "—";
  if (lang === "ru") return (FMT_RU[id] || ((x) => String(x)))(v);
  const m = {
    equity: () => `${v}%`, stock: () => ({ common: "Common", convertible: "Conv. Pref.", redeemable: "Redeem. Pref." })[v] || v,
    dividends: () => v === 0 ? "No Dividends" : `${v}%`, antidilution: () => v === "rofr" ? "Right of First Refusal" : "No Antidilution",
    board: () => `${v} member${v !== 1 ? "s" : ""}`, vesting: () => v === 0 ? "No Vesting" : `${v} yr${v > 1 ? "s" : ""}`,
    ceo: () => ({ none: "No Provision", conservative: "Conservative", moderate: "Moderate", aggressive: "Aggressive" })[v] || v,
    noshop: () => v === "included" ? "Included" : "Not Included",
  };
  return (m[id] || (() => String(v)))();
}

function checkMM(a1, a2, terms = TERMS) { if (!a1 || !a2) return []; return terms.filter((t) => JSON.stringify(a1[t.id]) !== JSON.stringify(a2[t.id])).map((t) => t.short); }
function pTotal(pe) { return pe ? PDIMS.reduce((s, d) => s + (pe[d.id] ?? 0), 0) : null; }

// ═══════════════════════════════════════════
//  CSV EXPORT
// ═══════════════════════════════════════════
function exportCsv(subs, lang = "en") {
  const C = STR[lang].csv, terms = termsFor(lang), pdims = pdimsFor(lang);
  const pm = {}; subs.forEach((s) => { if (!pm[s.pairId]) pm[s.pairId] = {}; pm[s.pairId][s.role] = s; });
  const pids = Object.keys(pm).sort((a, b) => { const na = parseInt(a), nb = parseInt(b); if (!isNaN(na) && !isNaN(nb)) return na - nb; return a.localeCompare(b); });
  const h = [C.pair, C.role, C.name];
  terms.forEach((t) => { h.push(`${t.short} ${C.agreed}`, `${t.short} ${C.pts}`); });
  h.push(C.dealBreakers, C.batna, C.subst);
  pdims.forEach((d) => h.push(C.processGiven(d.name)));
  h.push(C.feedback, C.processRcv, C.grand, C.consistency, C.inconsistent);
  const rows = [h];
  pids.forEach((pid) => {
    const pair = pm[pid];
    const mm = pair.vc && pair.founder ? checkMM(pair.vc.answers, pair.founder.answers, terms) : [];
    ["vc", "founder"].forEach((role) => {
      const sub = pair[role]; if (!sub) return;
      const sc = calcSub(sub.answers, terms);
      const myBD = role === "vc" ? sc.vcBD : sc.fBD;
      const mySub = role === "vc" ? sc.vcF : sc.fF;
      const row = [pid, role === "vc" ? C.vc : C.founder, sub.name];
      terms.forEach((t) => { row.push(fmt(t.id, sub.answers[t.id], lang)); const s = myBD[t.id]; row.push(s?.noDeal ? C.noDeal : (s?.pts ?? "—")); });
      const br = []; if (sc.vcND.length) br.push(C.vcPrefix + sc.vcND.join("; ")); if (sc.fND.length) br.push(C.fdrPrefix + sc.fND.join("; "));
      row.push(br.length ? br.join(" | ") : C.none); row.push(sc.nd ? C.yes : C.no); row.push(mySub);
      pdims.forEach((d) => row.push(sub.processEval?.[d.id] ?? "—"));
      row.push(sub.processComment || "");
      const other = role === "vc" ? pair.founder : pair.vc;
      let pRcv = "—", grand = mySub;
      if (other?.processEval) { const t = pTotal(other.processEval); pRcv = t; grand = mySub + t; }
      row.push(pRcv); row.push(grand);
      row.push(mm.length > 0 ? C.mismatch : (pair.vc && pair.founder ? C.ok : C.incomplete));
      row.push(mm.join("; "));
      rows.push(row);
    });
  });
  const csv = rows.map((r) => r.map((c) => { const s = String(c ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = C.filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════
// Instrument Sans has no Cyrillic letters, so the Russian version uses Golos Text
const FONT_STACK = { en: "'Instrument Sans', -apple-system, sans-serif", ru: "'Golos Text', -apple-system, sans-serif" };
const font = "var(--font-ui)";
const mono = "'JetBrains Mono', 'SF Mono', monospace";
const P = {
  bg: "#f6f5f1", card: "#fff", cardAlt: "#fafaf8", border: "#e8e6e1", text: "#1a1918", muted: "#8a8680", light: "#b5b0a8",
  vc: "#4338ca", vcBg: "#eef2ff", vcBd: "#c7d2fe", fd: "#be185d", fdBg: "#fdf2f8", fdBd: "#fbcfe8",
  green: "#15803d", greenBg: "#f0fdf4", greenBd: "#bbf7d0", red: "#dc2626", redBg: "#fef2f2", redBd: "#fecaca",
  yellow: "#a16207", yellowBg: "#fefce8", yellowBd: "#fef08a", accent: "#0f172a", proc: "#7c3aed", procBg: "#f5f3ff", procBd: "#ddd6fe",
};

// ═══════════════════════════════════════════
//  INPUT COMPONENTS
// ═══════════════════════════════════════════
function RG({ options, value, onChange, accent }) {
  return (<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{options.map((o) => {
    const sel = value === o.value;
    return (<button key={String(o.value)} onClick={() => onChange(o.value)} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer",
      border: sel ? `2px solid ${accent}` : `2px solid ${P.border}`, background: sel ? `${accent}0c` : "white",
      textAlign: "left", width: "100%", fontFamily: font,
    }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, border: sel ? `6px solid ${accent}` : `2px solid ${P.light}`, boxSizing: "border-box" }} />
      <span style={{ fontSize: 14, fontWeight: sel ? 600 : 400, color: sel ? P.text : P.muted }}>{o.label}</span>
    </button>);
  })}</div>);
}

function NS({ value, onChange, min, max, suffix, accent }) {
  return (<div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    <button onClick={() => value > min && onChange(value - 1)} style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 20, fontWeight: 700, cursor: "pointer", color: value > min ? P.text : P.light, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>−</button>
    <div style={{ minWidth: 80, textAlign: "center", fontSize: 28, fontWeight: 800, color: accent, fontFamily: mono }}>{value}{suffix || ""}</div>
    <button onClick={() => value < max && onChange(value + 1)} style={{ width: 40, height: 40, borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 20, fontWeight: 700, cursor: "pointer", color: value < max ? P.text : P.light, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: font }}>+</button>
  </div>);
}

function TI({ tid, value, onChange, role }) {
  const a = role === "vc" ? P.vc : P.fd;
  const o = useLang().S.opt;
  switch (tid) {
    case "equity": return <NS value={value} onChange={onChange} min={20} max={80} suffix="%" accent={a} />;
    case "stock": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "common", label: o.common }, { value: "convertible", label: o.convertible }, { value: "redeemable", label: o.redeemable }]} />;
    case "dividends": return <NS value={value} onChange={onChange} min={0} max={15} suffix="%" accent={a} />;
    case "antidilution": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "none", label: o.noAnti }, { value: "rofr", label: o.rofr }]} />;
    case "board": return <NS value={value} onChange={onChange} min={0} max={5} suffix="" accent={a} />;
    case "vesting": return <RG accent={a} value={value} onChange={onChange} options={o.vesting.map((label, value) => ({ value, label }))} />;
    case "ceo": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "none", label: o.ceoNone }, { value: "conservative", label: o.ceoCons }, { value: "moderate", label: o.ceoMod }, { value: "aggressive", label: o.ceoAggr }]} />;
    case "noshop": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "not_included", label: o.nsNot }, { value: "included", label: o.nsIncl }]} />;
    default: return null;
  }
}

const DEF = { equity: 45, stock: null, dividends: 0, antidilution: null, board: 1, vesting: null, ceo: null, noshop: null };

function PI({ dim, role, value, onChange }) {
  const labels = role === "vc" ? dim.vcL : dim.fL;
  return (<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{PVALS.map((v, i) => {
    const sel = value === v;
    return (<button key={v} onClick={() => onChange(v)} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 10, cursor: "pointer",
      border: sel ? `2px solid ${P.proc}` : `2px solid ${P.border}`, background: sel ? P.procBg : "white",
      textAlign: "left", width: "100%", fontFamily: font,
    }}>
      <div style={{ minWidth: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        background: sel ? P.proc : P.cardAlt, color: sel ? "white" : P.muted, fontSize: 12, fontWeight: 800, fontFamily: mono, border: sel ? "none" : `1px solid ${P.border}` }}>{v}</div>
      <span style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? P.text : P.muted }}>{labels[i]}</span>
    </button>);
  })}</div>);
}

// ═══════════════════════════════════════════
//  SURVEY FLOW
// ═══════════════════════════════════════════
function SurveyFlow({ onSubmit }) {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState(null);
  const [pairId, setPairId] = useState("");
  const [name, setName] = useState("");
  const [ans, setAns] = useState({ ...DEF });
  const [pe, setPe] = useState({});
  const [pc, setPc] = useState("");
  const [submitting, setSub] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const { lang, S, terms, pdims } = useLang();

  const rc = role === "vc" ? P.vc : P.fd;
  const canI = role && pairId.trim() && name.trim();
  const cT = step >= 1 && step <= 8 ? terms[step - 1] : null;
  const canT = cT ? ans[cT.id] !== null && ans[cT.id] !== undefined : false;
  const cD = step >= 10 && step <= 14 ? pdims[step - 10] : null;
  const canD = cD ? pe[cD.id] !== undefined : false;
  const cpL = role === "vc" ? S.cpFounder : S.cpVC;

  // Step 0 — Identity
  if (step === 0) return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🚀</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: P.text, margin: 0, fontFamily: font }}>{S.title}</h1>
        <p style={{ fontSize: 14, color: P.muted, margin: "8px 0 0" }}>{S.subtitle}</p>
      </div>
      <div style={{ background: P.card, borderRadius: 16, padding: 24, border: `1px solid ${P.border}` }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 10 }}>{S.yourRole}</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {[{ v: "vc", l: S.roleVC, c: P.vc, b: P.vcBg }, { v: "founder", l: S.roleFounder, c: P.fd, b: P.fdBg }].map((r) => (
            <button key={r.v} onClick={() => setRole(r.v)} style={{ flex: 1, padding: "14px 12px", borderRadius: 12, cursor: "pointer", border: role === r.v ? `2.5px solid ${r.c}` : `2px solid ${P.border}`, background: role === r.v ? r.b : "white", fontSize: 14, fontWeight: role === r.v ? 700 : 500, color: role === r.v ? r.c : P.muted, fontFamily: font }}>{r.l}</button>
          ))}
        </div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 8 }}>{S.pairNumber}</label>
        <input type="text" value={pairId} onChange={(e) => setPairId(e.target.value)} placeholder={S.pairPh} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${P.border}`, fontSize: 15, fontFamily: font, outline: "none", marginBottom: 20, boxSizing: "border-box" }} />
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 8 }}>{S.yourName}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={S.namePh} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${P.border}`, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
      </div>
      <button onClick={() => canI && setStep(1)} disabled={!canI} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: canI ? rc : P.light, color: "white", fontSize: 16, fontWeight: 700, cursor: canI ? "pointer" : "default", marginTop: 20, fontFamily: font, opacity: canI ? 1 : 0.5 }}>{S.start}</button>
    </div>
  );

  // Step 9 — Review terms
  if (step === 9) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: P.text, fontFamily: font }}>{S.reviewTitle}</h2>
        <div style={{ display: "inline-block", marginTop: 8, padding: "4px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, background: role === "vc" ? P.vcBg : P.fdBg, color: rc }}>{role === "vc" ? S.badgeVC : S.badgeFounder} · {S.pair} {pairId} · {name}</div>
      </div>
      <div style={{ background: P.card, borderRadius: 16, padding: 20, border: `1px solid ${P.border}`, marginBottom: 16 }}>
        {terms.map((t, i) => (<div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < terms.length - 1 ? `1px solid ${P.border}` : "none" }}>
          <div><div style={{ fontSize: 12, color: P.muted, fontWeight: 600 }}>#{i + 1} {t.short}</div><div style={{ fontSize: 15, fontWeight: 600, color: P.text, marginTop: 2 }}>{fmt(t.id, ans[t.id], lang)}</div></div>
          <button onClick={() => setStep(i + 1)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${P.border}`, background: "white", fontSize: 12, color: P.muted, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>{S.edit}</button>
        </div>))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setStep(8)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>{S.back}</button>
        <button onClick={() => setStep(10)} style={{ flex: 2, padding: "14px", borderRadius: 12, border: "none", background: P.proc, color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: font }}>{S.processEvalBtn}</button>
      </div>
    </div>
  );

  // Steps 10-14 — Process evaluation
  if (step >= 10 && step <= 14) {
    const dim = pdims[step - 10];
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: P.muted }}>{S.processStep(step - 9)}</span>
            <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: P.procBg, color: P.proc }}>{S.evaluating(cpL)}</div>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: P.border }}><div style={{ height: "100%", borderRadius: 2, background: P.proc, width: `${((step - 9) / 5) * 100}%` }} /></div>
        </div>
        <div style={{ background: P.card, borderRadius: 16, padding: 24, border: `1px solid ${P.border}` }}>
          <div style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: P.procBg, fontSize: 11, fontWeight: 700, color: P.proc, marginBottom: 10 }}>{dim.name}</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: P.text, margin: "0 0 16px", fontFamily: font }}>{role === "vc" ? dim.vcQ : dim.fQ}</h2>
          <PI dim={dim} role={role} value={pe[dim.id]} onChange={(v) => setPe((p) => ({ ...p, [dim.id]: v }))} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={() => setStep(step - 1)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>{S.back}</button>
          <button onClick={() => canD && setStep(step + 1)} disabled={!canD} style={{ flex: 2, padding: "14px", borderRadius: 12, border: "none", background: canD ? P.proc : P.light, color: "white", fontSize: 16, fontWeight: 700, cursor: canD ? "pointer" : "default", fontFamily: font, opacity: canD ? 1 : 0.5 }}>{step === 14 ? S.reviewSubmit : S.next}</button>
        </div>
      </div>
    );
  }

  // Step 15 — Final review + submit
  if (step === 15) {
    const pt = PDIMS.reduce((s, d) => s + (pe[d.id] ?? 0), 0);
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: P.text, fontFamily: font }}>{S.finalReview}</h2></div>
        <div style={{ background: P.card, borderRadius: 16, padding: 20, border: `1px solid ${P.procBd}`, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.proc, marginBottom: 12 }}>{S.yourEvalOf(cpL)}</div>
          {pdims.map((d) => (<div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${P.border}` }}>
            <span style={{ fontSize: 13, color: P.text }}>{d.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 16, fontWeight: 800, color: P.proc, fontFamily: mono }}>{pe[d.id]}</span><span style={{ fontSize: 11, color: P.muted }}>/10</span>
              <button onClick={() => setStep(10 + pdims.indexOf(d))} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${P.border}`, background: "white", fontSize: 10, color: P.muted, cursor: "pointer", fontFamily: font, marginLeft: 4 }}>{S.edit}</button></div>
          </div>))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0" }}><span style={{ fontSize: 14, fontWeight: 700 }}>{S.total}</span><span style={{ fontSize: 20, fontWeight: 900, color: P.proc, fontFamily: mono }}>{pt}<span style={{ fontSize: 12, color: P.muted, fontWeight: 500 }}>/50</span></span></div>
        </div>
        <div style={{ background: P.card, borderRadius: 16, padding: 20, border: `1px solid ${P.border}`, marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 8 }}>{S.feedbackFor(cpL)} <span style={{ fontWeight: 400, color: P.muted }}>{S.optional}</span></label>
          <textarea value={pc} onChange={(e) => setPc(e.target.value)} rows={3} placeholder={S.fbPh}
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${P.border}`, fontSize: 14, fontFamily: font, outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        </div>
        {submitError && (
          <div style={{ background: P.redBg, border: `1px solid ${P.redBd}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: P.red }}>
            ⚠️ {submitError}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(14)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>{S.back}</button>
          <button onClick={async () => {
            setSub(true); setSubmitError(null);
            try {
              await onSubmit({ role, pairId: pairId.trim().toUpperCase(), name: name.trim(), answers: ans, processEval: pe, processComment: pc.trim() });
            } catch (err) {
              setSubmitError(err.message || S.submitFailed);
              setSub(false);
            }
          }} disabled={submitting} style={{
            flex: 2, padding: "14px", borderRadius: 12, border: "none", background: P.accent, color: "white", fontSize: 16, fontWeight: 700, cursor: submitting ? "default" : "pointer", fontFamily: font, opacity: submitting ? 0.6 : 1,
          }}>{submitting ? S.submitting : S.submit}</button>
        </div>
      </div>
    );
  }

  // Steps 1-8 — Terms
  const term = terms[step - 1];
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: P.muted }}>{S.termStep(step)}</span>
          <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: role === "vc" ? P.vcBg : P.fdBg, color: rc }}>{role === "vc" ? S.badgeVC : S.badgeFounder} · {S.pair} {pairId}</div>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: P.border }}><div style={{ height: "100%", borderRadius: 2, background: rc, width: `${(step / 8) * 100}%` }} /></div>
      </div>
      <div style={{ background: P.card, borderRadius: 16, padding: 24, border: `1px solid ${P.border}` }}>
        <div style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: P.cardAlt, fontSize: 11, fontWeight: 700, color: P.muted, marginBottom: 10 }}>#{step}</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: P.text, margin: "0 0 6px", fontFamily: font }}>{term.name}</h2>
        <p style={{ fontSize: 13, color: P.muted, margin: "0 0 20px" }}>{S.agreeQ}</p>
        <TI tid={term.id} value={ans[term.id]} onChange={(v) => setAns((p) => ({ ...p, [term.id]: v }))} role={role} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={() => setStep(step - 1)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>{S.back}</button>
        <button onClick={() => canT && setStep(step + 1)} disabled={!canT} style={{ flex: 2, padding: "14px", borderRadius: 12, border: "none", background: canT ? rc : P.light, color: "white", fontSize: 16, fontWeight: 700, cursor: canT ? "pointer" : "default", fontFamily: font, opacity: canT ? 1 : 0.5 }}>{step === 8 ? S.reviewBtn : S.next}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  THANK YOU PAGE
// ═══════════════════════════════════════════
function ThankYouPage({ sub }) {
  const { S } = useLang();
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: P.text, margin: "0 0 8px", fontFamily: font }}>{S.submittedTitle}</h1>
      <p style={{ fontSize: 15, color: P.muted, margin: "0 0 24px", lineHeight: 1.6 }}>{S.thanks}<strong>{sub.name}</strong>.<br />{S.resultsFor}<strong>{S.pairWord} {sub.pairId}</strong>{S.recorded}</p>
      <div style={{ display: "inline-block", padding: "6px 18px", borderRadius: 20, fontSize: 14, fontWeight: 700, background: sub.role === "vc" ? P.vcBg : P.fdBg, color: sub.role === "vc" ? P.vc : P.fd, border: `1px solid ${sub.role === "vc" ? P.vcBd : P.fdBd}` }}>
        {sub.role === "vc" ? S.roleVC : S.roleFounder}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  PASSWORD GATE
// ═══════════════════════════════════════════
function PWGate({ onOk }) {
  const { S } = useLang();
  const [pw, setPw] = useState(""); const [err, setErr] = useState(false);
  const ref = useRef(null); useEffect(() => { ref.current?.focus(); }, []);
  const go = () => { if (pw === DASHBOARD_PASSWORD) onOk(); else { setErr(true); setPw(""); setTimeout(() => setErr(false), 2000); } };
  return (
    <div style={{ maxWidth: 380, margin: "0 auto", padding: "80px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: P.text, margin: "0 0 24px", fontFamily: font }}>{S.instructorDash}</h2>
      <input ref={ref} type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder={S.passwordPh}
        style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: `2px solid ${err ? P.red : P.border}`, fontSize: 16, fontFamily: font, outline: "none", boxSizing: "border-box", textAlign: "center" }} />
      {err && <div style={{ fontSize: 13, color: P.red, marginTop: 8, fontWeight: 600 }}>{S.wrongPw}</div>}
      <button onClick={go} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: P.accent, color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 16, fontFamily: font }}>{S.enter}</button>
    </div>
  );
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
function Dash({ subs, onBack, onClear, onRefresh, busy }) {
  const { lang, S, terms, pdims } = useLang();
  const [exp, setExp] = useState(null);
  const [cc, setCC] = useState(false);

  const pairs = useMemo(() => {
    const m = {}; subs.forEach((s) => { if (!m[s.pairId]) m[s.pairId] = {}; m[s.pairId][s.role] = s; });
    return Object.keys(m).sort((a, b) => { const na = parseInt(a), nb = parseInt(b); if (!isNaN(na) && !isNaN(nb)) return na - nb; return a.localeCompare(b); }).map((k) => ({ id: k, vc: m[k].vc, fd: m[k].founder }));
  }, [subs]);

  const stats = useMemo(() => {
    let cp = 0, db = 0, mm = 0;
    const va = [], fa = [], vp = [], fp = [];
    pairs.forEach((p) => {
      const a = p.vc?.answers || p.fd?.answers; if (!a) return;
      const s = calcSub(a);
      if (p.vc && p.fd) { cp++; if (s.nd) db++; if (checkMM(p.vc.answers, p.fd.answers).length) mm++; }
      va.push(s.vcF); fa.push(s.fF);
      if (p.fd?.processEval) vp.push(pTotal(p.fd.processEval));
      if (p.vc?.processEval) fp.push(pTotal(p.vc.processEval));
    });
    const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "—";
    return { total: subs.length, pairs: pairs.length, cp, db, mm, avgVC: avg(va), avgF: avg(fa), avgVP: avg(vp), avgFP: avg(fp) };
  }, [pairs, subs]);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: P.text, fontFamily: font }}>{S.dashTitle}</h1>
          <p style={{ fontSize: 14, color: P.muted, margin: "4px 0 0" }}>{S.countLine(stats.total, stats.pairs)}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onRefresh} disabled={busy} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font, opacity: busy ? 0.5 : 1 }}>{busy ? "⏳" : S.refresh}</button>
          <button onClick={() => subs.length > 0 && exportCsv(subs, lang)} disabled={!subs.length} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.green}40`, background: P.greenBg, fontSize: 13, fontWeight: 600, cursor: subs.length ? "pointer" : "default", color: P.green, fontFamily: font, opacity: subs.length ? 1 : 0.4 }}>⬇ CSV</button>
          <button onClick={onBack} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>{S.backSurvey}</button>
          {cc ? (<>
            <button onClick={() => { onClear(); setCC(false); }} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.red}`, background: P.red, fontSize: 13, fontWeight: 700, cursor: "pointer", color: "white", fontFamily: font }}>{S.clearConfirm}</button>
            <button onClick={() => setCC(false)} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>{S.cancel}</button>
          </>) : (<button onClick={() => setCC(true)} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.redBd}`, background: P.redBg, fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.red, fontFamily: font }}>{S.clear}</button>)}
        </div>
      </div>

      {/* Note: Clear button only clears the dashboard view — it does NOT delete from Google Sheets */}
      {cc && (
        <div style={{ background: P.yellowBg, border: `1px solid ${P.yellowBd}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: P.yellow }}>
          {S.clearNote}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 24 }}>
        {[
          { l: S.stat.submissions, v: stats.total, c: P.accent },
          { l: S.stat.completePairs, v: stats.cp, c: P.green },
          { l: S.stat.dealBreakers, v: stats.db, c: P.red },
          { l: S.stat.mismatches, v: stats.mm, c: P.yellow },
          { l: S.stat.avgVcSubst, v: stats.avgVC, c: P.vc },
          { l: S.stat.avgFdrSubst, v: stats.avgF, c: P.fd },
          { l: S.stat.avgVcProc, v: stats.avgVP, c: P.proc },
          { l: S.stat.avgFdrProc, v: stats.avgFP, c: P.proc },
        ].map((s) => (<div key={s.l} style={{ background: P.card, borderRadius: 12, padding: "12px 8px", border: `1px solid ${P.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: P.muted, letterSpacing: 0.5, marginBottom: 4 }}>{s.l.toUpperCase()}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: s.c, fontFamily: mono }}>{s.v}</div>
        </div>))}
      </div>

      {!pairs.length ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: P.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{S.empty1}</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>{S.empty2}</div>
        </div>
      ) : pairs.map((pair) => {
        const expanded = exp === pair.id;
        const v0 = pair.vc, f0 = pair.fd;
        const ca = v0?.answers || f0?.answers;
        const sc = ca ? calcSub(ca, terms) : null;
        const vcRS = v0 ? calcSub(v0.answers, terms) : null;
        const fRS = f0 ? calcSub(f0.answers, terms) : null;
        const vpR = f0?.processEval ? pTotal(f0.processEval) : null;
        const fpR = v0?.processEval ? pTotal(v0.processEval) : null;
        const vcG = vcRS ? vcRS.vcF + (vpR ?? 0) : null;
        const fG = fRS ? fRS.fF + (fpR ?? 0) : null;
        const mm = v0 && f0 ? checkMM(v0.answers, f0.answers, terms) : [];
        const hasMM = mm.length > 0;

        return (
          <div key={pair.id} style={{ background: P.card, borderRadius: 16, border: `1px solid ${hasMM ? P.yellowBd : P.border}`, marginBottom: 10, overflow: "hidden" }}>
            <button onClick={() => setExp(expanded ? null : pair.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: hasMM ? P.yellowBg : "transparent", border: "none", cursor: "pointer", fontFamily: font, textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: P.cardAlt, border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: P.text, fontFamily: mono }}>{pair.id}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: P.text }}>{S.pair} {pair.id}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                    {v0 ? <span style={{ fontSize: 11, color: P.vc, fontWeight: 600 }}>🏦 {v0.name}</span> : <span style={{ fontSize: 11, color: P.yellow, fontWeight: 600 }}>{S.waitVC}</span>}
                    {f0 ? <span style={{ fontSize: 11, color: P.fd, fontWeight: 600 }}>👤 {f0.name}</span> : <span style={{ fontSize: 11, color: P.yellow, fontWeight: 600 }}>{S.waitFdr}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {vcG !== null && <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: P.vc, fontWeight: 700 }}>{S.scoreVC}</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: mono, color: sc?.nd ? P.red : P.vc }}>{vcG}</div></div>}
                {fG !== null && <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: P.fd, fontWeight: 700 }}>{S.scoreFdr}</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: mono, color: sc?.nd ? P.red : P.fd }}>{fG}</div></div>}
                {hasMM && <div style={{ padding: "3px 8px", borderRadius: 6, background: P.yellowBg, border: `1px solid ${P.yellowBd}`, fontSize: 10, fontWeight: 700, color: P.yellow }}>{S.mismatchTag}</div>}
                {sc?.nd && <div style={{ padding: "3px 8px", borderRadius: 6, background: P.redBg, border: `1px solid ${P.redBd}`, fontSize: 10, fontWeight: 700, color: P.red }}>{S.breakTag}</div>}
                <span style={{ fontSize: 18, color: P.light, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
              </div>
            </button>

            {expanded && (
              <div style={{ borderTop: `1px solid ${P.border}`, padding: "16px 20px", overflowX: "auto" }}>
                {sc?.nd && (<div style={{ background: P.redBg, borderRadius: 10, padding: "12px 16px", border: `1px solid ${P.redBd}`, marginBottom: 12, fontSize: 13, color: P.red }}><strong>{S.dbBanner}</strong>{sc.vcND.length > 0 && <span>{S.dbVC}{sc.vcND.join(", ")}</span>}{sc.fND.length > 0 && <span>{S.dbFdr}{sc.fND.join(", ")}</span>}</div>)}
                {hasMM && (<div style={{ background: P.yellowBg, borderRadius: 10, padding: "12px 16px", border: `1px solid ${P.yellowBd}`, marginBottom: 12, fontSize: 13, color: P.yellow }}><strong>{S.mmTitle}</strong>{S.mmMid}<strong>{mm.join(", ")}</strong>{S.mmEnd}</div>)}

                <div style={{ fontSize: 12, fontWeight: 700, color: P.text, marginBottom: 8 }}>{S.substTerms}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: font, minWidth: 550, marginBottom: 20 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${P.border}` }}>
                    <th style={{ textAlign: "left", padding: "6px 4px 6px 0", color: P.muted, fontSize: 10, width: 90 }}>{S.thTerm}</th>
                    {v0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.vc, fontSize: 10 }}>{S.scoreVC}</th>}
                    {v0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.vc, fontSize: 10, width: 40 }}>{S.thPts}</th>}
                    {f0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.fd, fontSize: 10 }}>{S.scoreFdr}</th>}
                    {f0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.fd, fontSize: 10, width: 40 }}>{S.thPts}</th>}
                    {v0 && f0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.muted, fontSize: 10, width: 40 }}>?</th>}
                  </tr></thead>
                  <tbody>{terms.map((t, i) => {
                    const va = v0?.answers?.[t.id], fa = f0?.answers?.[t.id];
                    const vs = vcRS?.vcBD?.[t.id], vCF = vcRS?.fBD?.[t.id];
                    const fs = fRS?.fBD?.[t.id], fCV = fRS?.vcBD?.[t.id];
                    const tmm = v0 && f0 && JSON.stringify(va) !== JSON.stringify(fa);
                    const bad = vs?.noDeal || fs?.noDeal || vCF?.noDeal || fCV?.noDeal;
                    return (<tr key={t.id} style={{ borderBottom: `1px solid ${P.border}`, background: bad ? P.redBg : tmm ? P.yellowBg : "transparent" }}>
                      <td style={{ padding: "8px 4px 8px 0", fontWeight: 600, fontSize: 11 }}>#{i + 1} {t.short}</td>
                      {v0 && <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 11 }}>{fmt(t.id, va, lang)}</td>}
                      {v0 && <td style={{ padding: "8px 4px", textAlign: "center", fontWeight: 800, fontFamily: mono, fontSize: 11, color: vs?.noDeal ? P.red : P.vc }}>{vs?.noDeal ? S.nd : vs?.pts}{vCF?.noDeal && <div style={{ fontSize: 8, color: P.red }}>{S.warnFdr}</div>}</td>}
                      {f0 && <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 11 }}>{fmt(t.id, fa, lang)}</td>}
                      {f0 && <td style={{ padding: "8px 4px", textAlign: "center", fontWeight: 800, fontFamily: mono, fontSize: 11, color: fs?.noDeal ? P.red : P.fd }}>{fs?.noDeal ? S.nd : fs?.pts}{fCV?.noDeal && <div style={{ fontSize: 8, color: P.red }}>{S.warnVC}</div>}</td>}
                      {v0 && f0 && <td style={{ textAlign: "center" }}>{tmm ? <span style={{ fontSize: 9, fontWeight: 700, color: P.yellow }}>{S.diff}</span> : <span style={{ fontSize: 9, fontWeight: 700, color: P.green }}>✓</span>}</td>}
                    </tr>);
                  })}</tbody>
                  <tfoot><tr style={{ borderTop: `2px solid ${P.border}` }}>
                    <td style={{ padding: "10px 4px 10px 0", fontWeight: 800, fontSize: 12 }}>{S.substTotal}</td>
                    {v0 && <td />}{v0 && <td style={{ textAlign: "center", fontWeight: 900, fontFamily: mono, fontSize: 16, color: vcRS?.nd ? P.red : P.vc }}>{vcRS?.vcF}</td>}
                    {f0 && <td />}{f0 && <td style={{ textAlign: "center", fontWeight: 900, fontFamily: mono, fontSize: 16, color: fRS?.nd ? P.red : P.fd }}>{fRS?.fF}</td>}
                    {v0 && f0 && <td />}
                  </tr></tfoot>
                </table>

                <div style={{ fontSize: 12, fontWeight: 700, color: P.proc, marginBottom: 8 }}>{S.processCross}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ background: P.vcBg, borderRadius: 12, padding: 14, border: `1px solid ${P.vcBd}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.vc, marginBottom: 6 }}>{S.vcProcBy}</div>
                    {f0?.processEval ? pdims.map((d) => <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}><span style={{ color: P.muted }}>{d.name}</span><span style={{ fontWeight: 800, fontFamily: mono, color: P.vc }}>{f0.processEval[d.id]}</span></div>)
                      : <div style={{ fontSize: 11, color: P.yellow }}>{S.pending}</div>}
                    {vpR !== null && <div style={{ borderTop: `1px solid ${P.vcBd}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 12 }}>{S.total}</span><span style={{ fontSize: 16, fontWeight: 900, fontFamily: mono, color: P.vc }}>{vpR}/50</span></div>}
                    {f0?.processComment && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "white", fontSize: 11, border: `1px solid ${P.border}` }}><div style={{ fontSize: 9, fontWeight: 700, color: P.muted, marginBottom: 2 }}>{S.feedbackLabel}</div>{f0.processComment}</div>}
                  </div>
                  <div style={{ background: P.fdBg, borderRadius: 12, padding: 14, border: `1px solid ${P.fdBd}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.fd, marginBottom: 6 }}>{S.fdrProcBy}</div>
                    {v0?.processEval ? pdims.map((d) => <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}><span style={{ color: P.muted }}>{d.name}</span><span style={{ fontWeight: 800, fontFamily: mono, color: P.fd }}>{v0.processEval[d.id]}</span></div>)
                      : <div style={{ fontSize: 11, color: P.yellow }}>{S.pending}</div>}
                    {fpR !== null && <div style={{ borderTop: `1px solid ${P.fdBd}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 12 }}>{S.total}</span><span style={{ fontSize: 16, fontWeight: 900, fontFamily: mono, color: P.fd }}>{fpR}/50</span></div>}
                    {v0?.processComment && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "white", fontSize: 11, border: `1px solid ${P.border}` }}><div style={{ fontSize: 9, fontWeight: 700, color: P.muted, marginBottom: 2 }}>{S.feedbackLabel}</div>{v0.processComment}</div>}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: P.card, borderRadius: 12, padding: 14, border: `2px solid ${P.vcBd}`, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.vc, marginBottom: 4 }}>{S.vcGrand}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, fontFamily: mono, color: P.vc }}>{vcG ?? "—"}</div>
                    <div style={{ fontSize: 10, color: P.muted }}>{vcRS?.vcF ?? "?"} + {vpR ?? "?"}</div>
                  </div>
                  <div style={{ background: P.card, borderRadius: 12, padding: 14, border: `2px solid ${P.fdBd}`, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.fd, marginBottom: 4 }}>{S.fdrGrand}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, fontFamily: mono, color: P.fd }}>{fG ?? "—"}</div>
                    <div style={{ fontSize: 10, color: P.muted }}>{fRS?.fF ?? "?"} + {fpR ?? "?"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// ═══════════════════════════════════════════
//  LANGUAGE SWITCH
// ═══════════════════════════════════════════
function LangSwitch({ lang, onChange }) {
  return (
    <div role="group" aria-label="Language" style={{ display: "flex", border: `1px solid ${P.border}`, borderRadius: 8, overflow: "hidden" }}>
      {["en", "ru"].map((l) => (
        <button key={l} onClick={() => onChange(l)} aria-pressed={lang === l} style={{ padding: "6px 9px", border: "none", background: lang === l ? P.accent : "white", color: lang === l ? "white" : P.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: mono }}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("survey");
  const [lastSub, setLastSub] = useState(null);
  const [allSubs, setAllSubs] = useState([]);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(null);
  const [lang, setLangState] = useState(initialLang);
  const S = STR[lang];
  const setLang = (l) => {
    setLangState(l);
    try { const u = new URL(window.location.href); if (l === "ru") u.searchParams.set("lang", "ru"); else u.searchParams.delete("lang"); window.history.replaceState(null, "", u); } catch (_) {}
  };
  useEffect(() => { try { document.documentElement.lang = lang; document.title = STR[lang].docTitle; } catch (_) {} }, [lang]);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const subs = await apiLoad();
      setAllSubs(subs);
    } catch (e) {
      setLoadErr(true);
    }
  }, []);

  const submit = async (data) => {
    const sub = { ...data, ts: Date.now() };
    await apiSubmit(sub); // throws on failure — caught in SurveyFlow
    setLastSub(sub);
    setPage("thanks");
  };

  const clear = () => {
    // Clears local view only — data stays safe in Google Sheets
    setAllSubs([]);
  };

  const goDash = async () => {
    if (!unlocked) { setPage("pw"); return; }
    setBusy(true); await load(); setBusy(false); setPage("dash");
  };

  const onPw = async () => {
    setUnlocked(true); setBusy(true); await load(); setBusy(false); setPage("dash");
  };

  const refresh = async () => { setBusy(true); await load(); setBusy(false); };

  return (
    <LangCtx.Provider value={lang}>
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: font, "--font-ui": FONT_STACK[lang] }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ background: "white", borderBottom: `1px solid ${P.border}`, padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minWidth: 0 }} onClick={() => setPage("survey")}>
          <span style={{ fontSize: 20 }}>🚀</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: P.text, fontFamily: font }}>{S.appTitle}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <LangSwitch lang={lang} onChange={setLang} />
        <button onClick={goDash} disabled={busy} style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: page === "dash" ? P.accent : "transparent", color: page === "dash" ? "white" : P.light, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title={S.dashTitleAttr}>{busy ? "⏳" : "🔐"}</button>
        </div>
      </div>

      {SHEETS_URL === "PASTE_YOUR_WEB_APP_URL_HERE" && (
        <div style={{ background: "#fef3c7", borderBottom: "1px solid #fcd34d", padding: "10px 20px", fontSize: 13, color: "#92400e", textAlign: "center", fontWeight: 600 }}>
          ⚙️ Setup required: paste your Google Apps Script Web App URL into the SHEETS_URL constant at the top of this file.
        </div>
      )}

      {page === "survey" && <SurveyFlow onSubmit={submit} />}
      {page === "thanks" && lastSub && <ThankYouPage sub={lastSub} />}
      {page === "pw" && <PWGate onOk={onPw} />}
      {page === "dash" && (
        <>
          {loadErr && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 20px", margin: "16px 20px", fontSize: 13, color: "#dc2626" }}>⚠️ {S.loadErr}</div>}
          <Dash subs={allSubs} onBack={() => setPage("survey")} onClear={clear} onRefresh={refresh} busy={busy} />
        </>
      )}
    </div>
    </LangCtx.Provider>
  );
}
