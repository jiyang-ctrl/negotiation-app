import { useState, useCallback, useMemo, useRef, useEffect } from "react";

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
function calcSub(ans) {
  let vcT = 0, fT = 0, vcND = [], fND = [];
  const vcBD = {}, fBD = {};
  TERMS.forEach((t) => {
    const v = ans[t.id]; if (v === null || v === undefined) return;
    const vs = vcScoring[t.id](v), fs = founderScoring[t.id](v);
    vcBD[t.id] = vs; fBD[t.id] = fs;
    if (vs.noDeal) vcND.push(t.short); else vcT += vs.pts;
    if (fs.noDeal) fND.push(t.short); else fT += fs.pts;
  });
  const nd = vcND.length > 0 || fND.length > 0;
  return { vcBD, fBD, vcND, fND, nd, vcF: nd ? 45 : vcT, fF: nd ? 45 : fT };
}

function fmt(id, v) {
  if (v === null || v === undefined) return "—";
  const m = {
    equity: () => `${v}%`, stock: () => ({ common: "Common", convertible: "Conv. Pref.", redeemable: "Redeem. Pref." })[v] || v,
    dividends: () => v === 0 ? "No Dividends" : `${v}%`, antidilution: () => v === "rofr" ? "Right of First Refusal" : "No Antidilution",
    board: () => `${v} member${v !== 1 ? "s" : ""}`, vesting: () => v === 0 ? "No Vesting" : `${v} yr${v > 1 ? "s" : ""}`,
    ceo: () => ({ none: "No Provision", conservative: "Conservative", moderate: "Moderate", aggressive: "Aggressive" })[v] || v,
    noshop: () => v === "included" ? "Included" : "Not Included",
  };
  return (m[id] || (() => String(v)))();
}

function checkMM(a1, a2) { if (!a1 || !a2) return []; return TERMS.filter((t) => JSON.stringify(a1[t.id]) !== JSON.stringify(a2[t.id])).map((t) => t.short); }
function pTotal(pe) { return pe ? PDIMS.reduce((s, d) => s + (pe[d.id] ?? 0), 0) : null; }

// ═══════════════════════════════════════════
//  CSV EXPORT
// ═══════════════════════════════════════════
function exportCsv(subs) {
  const pm = {}; subs.forEach((s) => { if (!pm[s.pairId]) pm[s.pairId] = {}; pm[s.pairId][s.role] = s; });
  const pids = Object.keys(pm).sort((a, b) => { const na = parseInt(a), nb = parseInt(b); if (!isNaN(na) && !isNaN(nb)) return na - nb; return a.localeCompare(b); });
  const h = ["Pair", "Role", "Name"];
  TERMS.forEach((t) => { h.push(`${t.short} (Agreed)`, `${t.short} (Pts)`); });
  h.push("Deal Breakers", "BATNA Applied", "Substantive Score");
  PDIMS.forEach((d) => h.push(`Process: ${d.name} (given)`));
  h.push("Feedback (for counterpart)", "Process Received", "Grand Total", "Pair Consistency", "Inconsistent Items");
  const rows = [h];
  pids.forEach((pid) => {
    const pair = pm[pid];
    const mm = pair.vc && pair.founder ? checkMM(pair.vc.answers, pair.founder.answers) : [];
    ["vc", "founder"].forEach((role) => {
      const sub = pair[role]; if (!sub) return;
      const sc = calcSub(sub.answers);
      const myBD = role === "vc" ? sc.vcBD : sc.fBD;
      const mySub = role === "vc" ? sc.vcF : sc.fF;
      const row = [pid, role === "vc" ? "VC" : "Founder", sub.name];
      TERMS.forEach((t) => { row.push(fmt(t.id, sub.answers[t.id])); const s = myBD[t.id]; row.push(s?.noDeal ? "No Deal" : (s?.pts ?? "—")); });
      const br = []; if (sc.vcND.length) br.push("VC: " + sc.vcND.join("; ")); if (sc.fND.length) br.push("Fdr: " + sc.fND.join("; "));
      row.push(br.length ? br.join(" | ") : "None"); row.push(sc.nd ? "Yes" : "No"); row.push(mySub);
      PDIMS.forEach((d) => row.push(sub.processEval?.[d.id] ?? "—"));
      row.push(sub.processComment || "");
      const other = role === "vc" ? pair.founder : pair.vc;
      let pRcv = "—", grand = mySub;
      if (other?.processEval) { const t = pTotal(other.processEval); pRcv = t; grand = mySub + t; }
      row.push(pRcv); row.push(grand);
      row.push(mm.length > 0 ? "MISMATCH" : (pair.vc && pair.founder ? "OK" : "Incomplete"));
      row.push(mm.join("; "));
      rows.push(row);
    });
  });
  const csv = rows.map((r) => r.map((c) => { const s = String(c ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "negotiation_results.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════
const font = "'Instrument Sans', -apple-system, sans-serif";
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
  switch (tid) {
    case "equity": return <NS value={value} onChange={onChange} min={20} max={80} suffix="%" accent={a} />;
    case "stock": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "common", label: "Common Stock" }, { value: "convertible", label: "Convertible Preferred Stock" }, { value: "redeemable", label: "Redeemable Preferred Stock" }]} />;
    case "dividends": return <NS value={value} onChange={onChange} min={0} max={15} suffix="%" accent={a} />;
    case "antidilution": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "none", label: "No Antidilution Rights" }, { value: "rofr", label: "VC Right of First Refusal" }]} />;
    case "board": return <NS value={value} onChange={onChange} min={0} max={5} suffix="" accent={a} />;
    case "vesting": return <RG accent={a} value={value} onChange={onChange} options={[{ value: 0, label: "No Vesting" }, { value: 1, label: "1 year" }, { value: 2, label: "2 years" }, { value: 3, label: "3 years" }, { value: 4, label: "4 years" }, { value: 5, label: "5 years" }, { value: 6, label: "6 years" }, { value: 7, label: "7+ years" }]} />;
    case "ceo": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "none", label: "No Provision" }, { value: "conservative", label: "Conservative Projections" }, { value: "moderate", label: "Moderate Projections" }, { value: "aggressive", label: "Aggressive Projections" }]} />;
    case "noshop": return <RG accent={a} value={value} onChange={onChange} options={[{ value: "not_included", label: "Not Included" }, { value: "included", label: "Included (60-day exclusivity)" }]} />;
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

  const rc = role === "vc" ? P.vc : P.fd;
  const canI = role && pairId.trim() && name.trim();
  const cT = step >= 1 && step <= 8 ? TERMS[step - 1] : null;
  const canT = cT ? ans[cT.id] !== null && ans[cT.id] !== undefined : false;
  const cD = step >= 10 && step <= 14 ? PDIMS[step - 10] : null;
  const canD = cD ? pe[cD.id] !== undefined : false;
  const cpL = role === "vc" ? "the Founder" : "the VC";

  // Step 0 — Identity
  if (step === 0) return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🚀</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: P.text, margin: 0, fontFamily: font }}>Aerospace Investment Negotiation</h1>
        <p style={{ fontSize: 14, color: P.muted, margin: "8px 0 0" }}>Record your negotiation results and evaluate your counterpart</p>
      </div>
      <div style={{ background: P.card, borderRadius: 16, padding: 24, border: `1px solid ${P.border}` }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 10 }}>YOUR ROLE</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          {[{ v: "vc", l: "🏦 Venture Capitalist", c: P.vc, b: P.vcBg }, { v: "founder", l: "👤 Founder / CEO", c: P.fd, b: P.fdBg }].map((r) => (
            <button key={r.v} onClick={() => setRole(r.v)} style={{ flex: 1, padding: "14px 12px", borderRadius: 12, cursor: "pointer", border: role === r.v ? `2.5px solid ${r.c}` : `2px solid ${P.border}`, background: role === r.v ? r.b : "white", fontSize: 14, fontWeight: role === r.v ? 700 : 500, color: role === r.v ? r.c : P.muted, fontFamily: font }}>{r.l}</button>
          ))}
        </div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 8 }}>PAIR NUMBER</label>
        <input type="text" value={pairId} onChange={(e) => setPairId(e.target.value)} placeholder="e.g. 1, 2, 3..." style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${P.border}`, fontSize: 15, fontFamily: font, outline: "none", marginBottom: 20, boxSizing: "border-box" }} />
        <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 8 }}>YOUR NAME</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${P.border}`, fontSize: 15, fontFamily: font, outline: "none", boxSizing: "border-box" }} />
      </div>
      <button onClick={() => canI && setStep(1)} disabled={!canI} style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: canI ? rc : P.light, color: "white", fontSize: 16, fontWeight: 700, cursor: canI ? "pointer" : "default", marginTop: 20, fontFamily: font, opacity: canI ? 1 : 0.5 }}>Start Survey →</button>
    </div>
  );

  // Step 9 — Review terms
  if (step === 9) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: P.text, fontFamily: font }}>Review Agreed Terms</h2>
        <div style={{ display: "inline-block", marginTop: 8, padding: "4px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, background: role === "vc" ? P.vcBg : P.fdBg, color: rc }}>{role === "vc" ? "🏦 VC" : "👤 Founder"} · Pair {pairId} · {name}</div>
      </div>
      <div style={{ background: P.card, borderRadius: 16, padding: 20, border: `1px solid ${P.border}`, marginBottom: 16 }}>
        {TERMS.map((t, i) => (<div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < TERMS.length - 1 ? `1px solid ${P.border}` : "none" }}>
          <div><div style={{ fontSize: 12, color: P.muted, fontWeight: 600 }}>#{i + 1} {t.short}</div><div style={{ fontSize: 15, fontWeight: 600, color: P.text, marginTop: 2 }}>{fmt(t.id, ans[t.id])}</div></div>
          <button onClick={() => setStep(i + 1)} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${P.border}`, background: "white", fontSize: 12, color: P.muted, cursor: "pointer", fontFamily: font, fontWeight: 600 }}>Edit</button>
        </div>))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setStep(8)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>← Back</button>
        <button onClick={() => setStep(10)} style={{ flex: 2, padding: "14px", borderRadius: 12, border: "none", background: P.proc, color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: font }}>Process Evaluation →</button>
      </div>
    </div>
  );

  // Steps 10-14 — Process evaluation
  if (step >= 10 && step <= 14) {
    const dim = PDIMS[step - 10];
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: P.muted }}>PROCESS {step - 9} OF 5</span>
            <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: P.procBg, color: P.proc }}>Evaluating {cpL}</div>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: P.border }}><div style={{ height: "100%", borderRadius: 2, background: P.proc, width: `${((step - 9) / 5) * 100}%` }} /></div>
        </div>
        <div style={{ background: P.card, borderRadius: 16, padding: 24, border: `1px solid ${P.border}` }}>
          <div style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: P.procBg, fontSize: 11, fontWeight: 700, color: P.proc, marginBottom: 10 }}>{dim.name}</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: P.text, margin: "0 0 16px", fontFamily: font }}>{role === "vc" ? dim.vcQ : dim.fQ}</h2>
          <PI dim={dim} role={role} value={pe[dim.id]} onChange={(v) => setPe((p) => ({ ...p, [dim.id]: v }))} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={() => setStep(step - 1)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>← Back</button>
          <button onClick={() => canD && setStep(step + 1)} disabled={!canD} style={{ flex: 2, padding: "14px", borderRadius: 12, border: "none", background: canD ? P.proc : P.light, color: "white", fontSize: 16, fontWeight: 700, cursor: canD ? "pointer" : "default", fontFamily: font, opacity: canD ? 1 : 0.5 }}>{step === 14 ? "Review & Submit →" : "Next →"}</button>
        </div>
      </div>
    );
  }

  // Step 15 — Final review + submit
  if (step === 15) {
    const pt = PDIMS.reduce((s, d) => s + (pe[d.id] ?? 0), 0);
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}><h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: P.text, fontFamily: font }}>Final Review</h2></div>
        <div style={{ background: P.card, borderRadius: 16, padding: 20, border: `1px solid ${P.procBd}`, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: P.proc, marginBottom: 12 }}>Your Process Evaluation of {cpL}</div>
          {PDIMS.map((d) => (<div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${P.border}` }}>
            <span style={{ fontSize: 13, color: P.text }}>{d.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 16, fontWeight: 800, color: P.proc, fontFamily: mono }}>{pe[d.id]}</span><span style={{ fontSize: 11, color: P.muted }}>/10</span>
              <button onClick={() => setStep(10 + PDIMS.indexOf(d))} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${P.border}`, background: "white", fontSize: 10, color: P.muted, cursor: "pointer", fontFamily: font, marginLeft: 4 }}>Edit</button></div>
          </div>))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0" }}><span style={{ fontSize: 14, fontWeight: 700 }}>Total</span><span style={{ fontSize: 20, fontWeight: 900, color: P.proc, fontFamily: mono }}>{pt}<span style={{ fontSize: 12, color: P.muted, fontWeight: 500 }}>/50</span></span></div>
        </div>
        <div style={{ background: P.card, borderRadius: 16, padding: 20, border: `1px solid ${P.border}`, marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: P.text, marginBottom: 8 }}>Constructive feedback for {cpL} <span style={{ fontWeight: 400, color: P.muted }}>(optional)</span></label>
          <textarea value={pc} onChange={(e) => setPc(e.target.value)} rows={3} placeholder="How could your counterpart improve?"
            style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `2px solid ${P.border}`, fontSize: 14, fontFamily: font, outline: "none", boxSizing: "border-box", resize: "vertical" }} />
        </div>
        {submitError && (
          <div style={{ background: P.redBg, border: `1px solid ${P.redBd}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: P.red }}>
            ⚠️ {submitError}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setStep(14)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>← Back</button>
          <button onClick={async () => {
            setSub(true); setSubmitError(null);
            try {
              await onSubmit({ role, pairId: pairId.trim().toUpperCase(), name: name.trim(), answers: ans, processEval: pe, processComment: pc.trim() });
            } catch (err) {
              setSubmitError(err.message || "Submission failed. Please try again.");
              setSub(false);
            }
          }} disabled={submitting} style={{
            flex: 2, padding: "14px", borderRadius: 12, border: "none", background: P.accent, color: "white", fontSize: 16, fontWeight: 700, cursor: submitting ? "default" : "pointer", fontFamily: font, opacity: submitting ? 0.6 : 1,
          }}>{submitting ? "Submitting…" : "Submit Everything ✓"}</button>
        </div>
      </div>
    );
  }

  // Steps 1-8 — Terms
  const term = TERMS[step - 1];
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: P.muted }}>TERM {step} OF 8</span>
          <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: role === "vc" ? P.vcBg : P.fdBg, color: rc }}>{role === "vc" ? "🏦 VC" : "👤 Founder"} · Pair {pairId}</div>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: P.border }}><div style={{ height: "100%", borderRadius: 2, background: rc, width: `${(step / 8) * 100}%` }} /></div>
      </div>
      <div style={{ background: P.card, borderRadius: 16, padding: 24, border: `1px solid ${P.border}` }}>
        <div style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, background: P.cardAlt, fontSize: 11, fontWeight: 700, color: P.muted, marginBottom: 10 }}>#{step}</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: P.text, margin: "0 0 6px", fontFamily: font }}>{term.name}</h2>
        <p style={{ fontSize: 13, color: P.muted, margin: "0 0 20px" }}>What did you and your counterpart agree on?</p>
        <TI tid={term.id} value={ans[term.id]} onChange={(v) => setAns((p) => ({ ...p, [term.id]: v }))} role={role} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button onClick={() => setStep(step - 1)} style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${P.border}`, background: "white", fontSize: 15, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>← Back</button>
        <button onClick={() => canT && setStep(step + 1)} disabled={!canT} style={{ flex: 2, padding: "14px", borderRadius: 12, border: "none", background: canT ? rc : P.light, color: "white", fontSize: 16, fontWeight: 700, cursor: canT ? "pointer" : "default", fontFamily: font, opacity: canT ? 1 : 0.5 }}>{step === 8 ? "Review →" : "Next →"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  THANK YOU PAGE
// ═══════════════════════════════════════════
function ThankYouPage({ sub }) {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: P.text, margin: "0 0 8px", fontFamily: font }}>Submitted Successfully</h1>
      <p style={{ fontSize: 15, color: P.muted, margin: "0 0 24px", lineHeight: 1.6 }}>Thank you, <strong>{sub.name}</strong>.<br />Your results for <strong>Pair {sub.pairId}</strong> have been recorded.</p>
      <div style={{ display: "inline-block", padding: "6px 18px", borderRadius: 20, fontSize: 14, fontWeight: 700, background: sub.role === "vc" ? P.vcBg : P.fdBg, color: sub.role === "vc" ? P.vc : P.fd, border: `1px solid ${sub.role === "vc" ? P.vcBd : P.fdBd}` }}>
        {sub.role === "vc" ? "🏦 Venture Capitalist" : "👤 Founder / CEO"}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  PASSWORD GATE
// ═══════════════════════════════════════════
function PWGate({ onOk }) {
  const [pw, setPw] = useState(""); const [err, setErr] = useState(false);
  const ref = useRef(null); useEffect(() => { ref.current?.focus(); }, []);
  const go = () => { if (pw === DASHBOARD_PASSWORD) onOk(); else { setErr(true); setPw(""); setTimeout(() => setErr(false), 2000); } };
  return (
    <div style={{ maxWidth: 380, margin: "0 auto", padding: "80px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: P.text, margin: "0 0 24px", fontFamily: font }}>Instructor Dashboard</h2>
      <input ref={ref} type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Password"
        style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: `2px solid ${err ? P.red : P.border}`, fontSize: 16, fontFamily: font, outline: "none", boxSizing: "border-box", textAlign: "center" }} />
      {err && <div style={{ fontSize: 13, color: P.red, marginTop: 8, fontWeight: 600 }}>Incorrect password</div>}
      <button onClick={go} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: P.accent, color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 16, fontFamily: font }}>Enter</button>
    </div>
  );
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
function Dash({ subs, onBack, onClear, onRefresh, busy }) {
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
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: P.text, fontFamily: font }}>📊 Instructor Dashboard</h1>
          <p style={{ fontSize: 14, color: P.muted, margin: "4px 0 0" }}>{stats.total} submissions · {stats.pairs} pairs</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onRefresh} disabled={busy} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font, opacity: busy ? 0.5 : 1 }}>{busy ? "⏳" : "↻ Refresh"}</button>
          <button onClick={() => subs.length > 0 && exportCsv(subs)} disabled={!subs.length} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.green}40`, background: P.greenBg, fontSize: 13, fontWeight: 600, cursor: subs.length ? "pointer" : "default", color: P.green, fontFamily: font, opacity: subs.length ? 1 : 0.4 }}>⬇ CSV</button>
          <button onClick={onBack} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>← Survey</button>
          {cc ? (<>
            <button onClick={() => { onClear(); setCC(false); }} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.red}`, background: P.red, fontSize: 13, fontWeight: 700, cursor: "pointer", color: "white", fontFamily: font }}>Yes, delete all</button>
            <button onClick={() => setCC(false)} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.border}`, background: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.muted, fontFamily: font }}>Cancel</button>
          </>) : (<button onClick={() => setCC(true)} style={{ padding: "10px 16px", borderRadius: 10, border: `2px solid ${P.redBd}`, background: P.redBg, fontSize: 13, fontWeight: 600, cursor: "pointer", color: P.red, fontFamily: font }}>🗑 Clear</button>)}
        </div>
      </div>

      {/* Note: Clear button only clears the dashboard view — it does NOT delete from Google Sheets */}
      {cc && (
        <div style={{ background: P.yellowBg, border: `1px solid ${P.yellowBd}`, borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: P.yellow }}>
          ⚠️ Note: This clears the dashboard view only. To delete data from Google Sheets, delete rows directly in the Sheet.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 24 }}>
        {[
          { l: "Submissions", v: stats.total, c: P.accent },
          { l: "Complete Pairs", v: stats.cp, c: P.green },
          { l: "Deal Breakers", v: stats.db, c: P.red },
          { l: "Mismatches", v: stats.mm, c: P.yellow },
          { l: "Avg VC Subst.", v: stats.avgVC, c: P.vc },
          { l: "Avg FDR Subst.", v: stats.avgF, c: P.fd },
          { l: "Avg VC Process", v: stats.avgVP, c: P.proc },
          { l: "Avg FDR Process", v: stats.avgFP, c: P.proc },
        ].map((s) => (<div key={s.l} style={{ background: P.card, borderRadius: 12, padding: "12px 8px", border: `1px solid ${P.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: P.muted, letterSpacing: 0.5, marginBottom: 4 }}>{s.l.toUpperCase()}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: s.c, fontFamily: mono }}>{s.v}</div>
        </div>))}
      </div>

      {!pairs.length ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: P.muted }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No submissions yet</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>Click ↻ Refresh to load data from Google Sheets</div>
        </div>
      ) : pairs.map((pair) => {
        const expanded = exp === pair.id;
        const v0 = pair.vc, f0 = pair.fd;
        const ca = v0?.answers || f0?.answers;
        const sc = ca ? calcSub(ca) : null;
        const vcRS = v0 ? calcSub(v0.answers) : null;
        const fRS = f0 ? calcSub(f0.answers) : null;
        const vpR = f0?.processEval ? pTotal(f0.processEval) : null;
        const fpR = v0?.processEval ? pTotal(v0.processEval) : null;
        const vcG = vcRS ? vcRS.vcF + (vpR ?? 0) : null;
        const fG = fRS ? fRS.fF + (fpR ?? 0) : null;
        const mm = v0 && f0 ? checkMM(v0.answers, f0.answers) : [];
        const hasMM = mm.length > 0;

        return (
          <div key={pair.id} style={{ background: P.card, borderRadius: 16, border: `1px solid ${hasMM ? P.yellowBd : P.border}`, marginBottom: 10, overflow: "hidden" }}>
            <button onClick={() => setExp(expanded ? null : pair.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: hasMM ? P.yellowBg : "transparent", border: "none", cursor: "pointer", fontFamily: font, textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: P.cardAlt, border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: P.text, fontFamily: mono }}>{pair.id}</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: P.text }}>Pair {pair.id}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                    {v0 ? <span style={{ fontSize: 11, color: P.vc, fontWeight: 600 }}>🏦 {v0.name}</span> : <span style={{ fontSize: 11, color: P.yellow, fontWeight: 600 }}>⏳ VC</span>}
                    {f0 ? <span style={{ fontSize: 11, color: P.fd, fontWeight: 600 }}>👤 {f0.name}</span> : <span style={{ fontSize: 11, color: P.yellow, fontWeight: 600 }}>⏳ Founder</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {vcG !== null && <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: P.vc, fontWeight: 700 }}>VC</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: mono, color: sc?.nd ? P.red : P.vc }}>{vcG}</div></div>}
                {fG !== null && <div style={{ textAlign: "center" }}><div style={{ fontSize: 9, color: P.fd, fontWeight: 700 }}>FDR</div><div style={{ fontSize: 18, fontWeight: 800, fontFamily: mono, color: sc?.nd ? P.red : P.fd }}>{fG}</div></div>}
                {hasMM && <div style={{ padding: "3px 8px", borderRadius: 6, background: P.yellowBg, border: `1px solid ${P.yellowBd}`, fontSize: 10, fontWeight: 700, color: P.yellow }}>⚠ MISMATCH</div>}
                {sc?.nd && <div style={{ padding: "3px 8px", borderRadius: 6, background: P.redBg, border: `1px solid ${P.redBd}`, fontSize: 10, fontWeight: 700, color: P.red }}>BREAK</div>}
                <span style={{ fontSize: 18, color: P.light, transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", display: "inline-block" }}>▾</span>
              </div>
            </button>

            {expanded && (
              <div style={{ borderTop: `1px solid ${P.border}`, padding: "16px 20px", overflowX: "auto" }}>
                {sc?.nd && (<div style={{ background: P.redBg, borderRadius: 10, padding: "12px 16px", border: `1px solid ${P.redBd}`, marginBottom: 12, fontSize: 13, color: P.red }}><strong>⚠️ Deal Breaker — BATNA (45)</strong>{sc.vcND.length > 0 && <span> · VC: {sc.vcND.join(", ")}</span>}{sc.fND.length > 0 && <span> · Fdr: {sc.fND.join(", ")}</span>}</div>)}
                {hasMM && (<div style={{ background: P.yellowBg, borderRadius: 10, padding: "12px 16px", border: `1px solid ${P.yellowBd}`, marginBottom: 12, fontSize: 13, color: P.yellow }}><strong>⚠ Input Mismatch</strong> — inconsistent: <strong>{mm.join(", ")}</strong>. Please verify.</div>)}

                <div style={{ fontSize: 12, fontWeight: 700, color: P.text, marginBottom: 8 }}>Substantive Terms</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: font, minWidth: 550, marginBottom: 20 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${P.border}` }}>
                    <th style={{ textAlign: "left", padding: "6px 4px 6px 0", color: P.muted, fontSize: 10, width: 90 }}>TERM</th>
                    {v0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.vc, fontSize: 10 }}>VC</th>}
                    {v0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.vc, fontSize: 10, width: 40 }}>PTS</th>}
                    {f0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.fd, fontSize: 10 }}>FDR</th>}
                    {f0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.fd, fontSize: 10, width: 40 }}>PTS</th>}
                    {v0 && f0 && <th style={{ textAlign: "center", padding: "6px 4px", color: P.muted, fontSize: 10, width: 40 }}>?</th>}
                  </tr></thead>
                  <tbody>{TERMS.map((t, i) => {
                    const va = v0?.answers?.[t.id], fa = f0?.answers?.[t.id];
                    const vs = vcRS?.vcBD?.[t.id], vCF = vcRS?.fBD?.[t.id];
                    const fs = fRS?.fBD?.[t.id], fCV = fRS?.vcBD?.[t.id];
                    const tmm = v0 && f0 && JSON.stringify(va) !== JSON.stringify(fa);
                    const bad = vs?.noDeal || fs?.noDeal || vCF?.noDeal || fCV?.noDeal;
                    return (<tr key={t.id} style={{ borderBottom: `1px solid ${P.border}`, background: bad ? P.redBg : tmm ? P.yellowBg : "transparent" }}>
                      <td style={{ padding: "8px 4px 8px 0", fontWeight: 600, fontSize: 11 }}>#{i + 1} {t.short}</td>
                      {v0 && <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 11 }}>{fmt(t.id, va)}</td>}
                      {v0 && <td style={{ padding: "8px 4px", textAlign: "center", fontWeight: 800, fontFamily: mono, fontSize: 11, color: vs?.noDeal ? P.red : P.vc }}>{vs?.noDeal ? "N/D" : vs?.pts}{vCF?.noDeal && <div style={{ fontSize: 8, color: P.red }}>⚠FDR</div>}</td>}
                      {f0 && <td style={{ padding: "8px 4px", textAlign: "center", fontSize: 11 }}>{fmt(t.id, fa)}</td>}
                      {f0 && <td style={{ padding: "8px 4px", textAlign: "center", fontWeight: 800, fontFamily: mono, fontSize: 11, color: fs?.noDeal ? P.red : P.fd }}>{fs?.noDeal ? "N/D" : fs?.pts}{fCV?.noDeal && <div style={{ fontSize: 8, color: P.red }}>⚠VC</div>}</td>}
                      {v0 && f0 && <td style={{ textAlign: "center" }}>{tmm ? <span style={{ fontSize: 9, fontWeight: 700, color: P.yellow }}>DIFF</span> : <span style={{ fontSize: 9, fontWeight: 700, color: P.green }}>✓</span>}</td>}
                    </tr>);
                  })}</tbody>
                  <tfoot><tr style={{ borderTop: `2px solid ${P.border}` }}>
                    <td style={{ padding: "10px 4px 10px 0", fontWeight: 800, fontSize: 12 }}>SUBST.</td>
                    {v0 && <td />}{v0 && <td style={{ textAlign: "center", fontWeight: 900, fontFamily: mono, fontSize: 16, color: vcRS?.nd ? P.red : P.vc }}>{vcRS?.vcF}</td>}
                    {f0 && <td />}{f0 && <td style={{ textAlign: "center", fontWeight: 900, fontFamily: mono, fontSize: 16, color: fRS?.nd ? P.red : P.fd }}>{fRS?.fF}</td>}
                    {v0 && f0 && <td />}
                  </tr></tfoot>
                </table>

                <div style={{ fontSize: 12, fontWeight: 700, color: P.proc, marginBottom: 8 }}>Process (cross-applied)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div style={{ background: P.vcBg, borderRadius: 12, padding: 14, border: `1px solid ${P.vcBd}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.vc, marginBottom: 6 }}>🏦 VC Process (by Founder)</div>
                    {f0?.processEval ? PDIMS.map((d) => <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}><span style={{ color: P.muted }}>{d.name}</span><span style={{ fontWeight: 800, fontFamily: mono, color: P.vc }}>{f0.processEval[d.id]}</span></div>)
                      : <div style={{ fontSize: 11, color: P.yellow }}>⏳ Pending</div>}
                    {vpR !== null && <div style={{ borderTop: `1px solid ${P.vcBd}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 12 }}>Total</span><span style={{ fontSize: 16, fontWeight: 900, fontFamily: mono, color: P.vc }}>{vpR}/50</span></div>}
                    {f0?.processComment && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "white", fontSize: 11, border: `1px solid ${P.border}` }}><div style={{ fontSize: 9, fontWeight: 700, color: P.muted, marginBottom: 2 }}>FEEDBACK</div>{f0.processComment}</div>}
                  </div>
                  <div style={{ background: P.fdBg, borderRadius: 12, padding: 14, border: `1px solid ${P.fdBd}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.fd, marginBottom: 6 }}>👤 Founder Process (by VC)</div>
                    {v0?.processEval ? PDIMS.map((d) => <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}><span style={{ color: P.muted }}>{d.name}</span><span style={{ fontWeight: 800, fontFamily: mono, color: P.fd }}>{v0.processEval[d.id]}</span></div>)
                      : <div style={{ fontSize: 11, color: P.yellow }}>⏳ Pending</div>}
                    {fpR !== null && <div style={{ borderTop: `1px solid ${P.fdBd}`, marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 12 }}>Total</span><span style={{ fontSize: 16, fontWeight: 900, fontFamily: mono, color: P.fd }}>{fpR}/50</span></div>}
                    {v0?.processComment && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "white", fontSize: 11, border: `1px solid ${P.border}` }}><div style={{ fontSize: 9, fontWeight: 700, color: P.muted, marginBottom: 2 }}>FEEDBACK</div>{v0.processComment}</div>}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: P.card, borderRadius: 12, padding: 14, border: `2px solid ${P.vcBd}`, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.vc, marginBottom: 4 }}>🏦 VC GRAND TOTAL</div>
                    <div style={{ fontSize: 28, fontWeight: 900, fontFamily: mono, color: P.vc }}>{vcG ?? "—"}</div>
                    <div style={{ fontSize: 10, color: P.muted }}>{vcRS?.vcF ?? "?"} + {vpR ?? "?"}</div>
                  </div>
                  <div style={{ background: P.card, borderRadius: 12, padding: 14, border: `2px solid ${P.fdBd}`, textAlign: "center" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: P.fd, marginBottom: 4 }}>👤 FOUNDER GRAND TOTAL</div>
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
//  MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState("survey");
  const [lastSub, setLastSub] = useState(null);
  const [allSubs, setAllSubs] = useState([]);
  const [unlocked, setUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const subs = await apiLoad();
      setAllSubs(subs);
    } catch (e) {
      setLoadErr("Could not load data from Google Sheets. Check your SHEETS_URL.");
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
    <div style={{ minHeight: "100vh", background: P.bg, fontFamily: font }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet" />
      <div style={{ background: "white", borderBottom: `1px solid ${P.border}`, padding: "10px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setPage("survey")}>
          <span style={{ fontSize: 20 }}>🚀</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: P.text, fontFamily: font }}>Earth Escape Negotiation</span>
        </div>
        <button onClick={goDash} disabled={busy} style={{ width: 36, height: 36, borderRadius: 8, border: "none", background: page === "dash" ? P.accent : "transparent", color: page === "dash" ? "white" : P.light, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="Dashboard">{busy ? "⏳" : "🔐"}</button>
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
          {loadErr && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 20px", margin: "16px 20px", fontSize: 13, color: "#dc2626" }}>⚠️ {loadErr}</div>}
          <Dash subs={allSubs} onBack={() => setPage("survey")} onClear={clear} onRefresh={refresh} busy={busy} />
        </>
      )}
    </div>
  );
}
