/* Scale Optimizer (recommendations, manage, history) and Ad group signals. */
(() => {
  "use strict";
  const SP = window.SP, { $, $$, svg, esc, ICON: I } = SP;
  const P = SP.PRODUCTS;
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  I.signal = '<circle cx="12" cy="12" r="9.5"/><path d="M14.8 9.2c-.6-.9-1.6-1.4-2.8-1.4-1.6 0-2.7.9-2.7 2.1 0 2.9 5.6 1.6 5.6 4.3 0 1.3-1.2 2.2-2.9 2.2-1.3 0-2.4-.6-2.9-1.5"/>';
  I.optimizer = '<path d="M9 18h6M10 21h4M8 14c-4-5-1-12 4-12s8 7 4 12c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/><path d="m12 6-2 4h3l-2 4"/>';
  I.gavel = '<path d="M14.5 3.5l6 6M12 6l6 6M13.2 4.8l-5 5 6 6 5-5M10.7 12.3L3.5 19.5l1 1 7.2-7.2"/>';
  I.okc = '<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.2l3 3 6-6.4"/>';
  I.failc = '<circle cx="12" cy="12" r="9.5"/><path d="M9 9l6 6M15 9l-6 6"/>';
  I.restore = '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>';
  I.box = '<path d="M4 8l2-4h12l2 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 8h16M12 4v4"/>';
  I.camp = '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>';
  I.adgroup = '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/>';
  I.flag = '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>';
  I.wandc = '<circle cx="12" cy="12" r="11" fill="#fff" stroke="none"/><path d="M7 17l7.5-7.5M13 6.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6zM17 11l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" stroke="#6996ff"/>';

  // ---------- Card colour schemes (left half = title colour, right half = card colour) ----------
  const SCHEMES = { 1: ["#D16B6B", "#FFF1D6"], 2: ["#367F5D", "#E1F7DA"], 3: ["#414141", "#FFF4BD"], 4: ["#205DA1", "#E4F1FF"], 5: ["#243B55", "#E0E4E9"] };
  const sw = s => `<span class="osw" aria-hidden="true"><i style="background:${SCHEMES[s][0]}"></i><i style="background:${SCHEMES[s][1]}"></i></span>`;
  const tag = m => (m ? `<span class="otag">${esc(m)}</span>` : "");
  const usd = v => `$${Number(v).toFixed(2)}`;
  const BTN = (cls, label, attrs = "", style = "") => `<button type="button" class="ob ${cls}" ${attrs}${style ? ` style="${style}"` : ""}>${label}</button>`;

  // ---------- Rule library (what an optimizer is built on) ----------
  const bid = (id, name, criteria, action, desc, mode, value, days = 30, cooldown = 7) => ({ id, kind: "bid", name, criteria, action, desc, mode, value, days, cooldown });
  const neg = (id, name, criteria, desc, source, days = 60) => ({ id, kind: "neg", name, criteria, action: "Add search term as negative exact", desc, source, days, mode: "neg" });
  const LIB = [
    bid("l60", "-60% bids if >= 100% ACOS", { ACOS: "≥ 100.00%" }, "Adjust bid by -60%", "Cut bids by 60% if ACOS >= 100% and no adjustment in last 7 days", "pct", -60),
    bid("l50", "-50% bids if >= 80% ACOS", { ACOS: "≥ 80.00%" }, "Adjust bid by -50%", "Cut bids by 50% if ACOS >= 80% and no adjustment in last 7 days", "pct", -50),
    bid("l33", "-33% bids if >= 60% ACOS", { ACOS: "≥ 60.00%" }, "Adjust bid by -33%", "Cut bids by 33% if ACOS >= 60% and no adjustment in last 7 days", "pct", -33),
    bid("lbad", "Bad Conversions", { Conversion: "1.00% - 5.00%", Spend: "≥ $10.00" }, "Move bid towards 20% ACOS", "Adjust bids to 20% ACOS for bad ads with conversion <= 5% and spend >= $10", "acos", 20),
    bid("lbad7", "Bad Conversions (7 days)", { Conversion: "1.00% - 5.00%", Spend: "≥ $10.00" }, "Move bid towards 20% ACOS", "Adjust bids to 20% ACOS for recent bad ads with conversion <= 5% and spend >= $10", "acos", 20, 7),
    bid("lgood", "Good Conversions", { Orders: "≥ 3", Conversion: "≥ 20.00%" }, "Move bid towards 40% ACOS", "Move bids towards 40% ACOS for good ads with conversion >= 20% and orders >= 3", "acos", 40),
    bid("lgood7", "Good Conversions (7 days)", { Orders: "≥ 3", Conversion: "≥ 20.00%" }, "Move bid towards 40% ACOS", "Move bids towards 40% ACOS for recent good ads with conversion >= 20% and orders >= 3", "acos", 40, 7),
    bid("ldef", "Default 30% ACOS Keyword Bid", { Clicks: "≥ 10" }, "Move bid towards 30% ACOS", "Move keyword bids towards 30% ACOS once they have at least 10 clicks", "acos", 30),
    bid("lraise", "Raise bids on strong converters", { Orders: "≥ 5", ACOS: "≤ 15.00%" }, "Adjust bid by +15%", "Raise bids by 15% for keywords with 5+ orders and ACOS <= 15%", "pct", 15),
    neg("nasin", "Negate No Sale Bleeders [ASIN Phrase/Broad]", { Clicks: "≥ 15", Orders: "= 0" }, "Negate search terms with 15+ clicks and no orders from the phrase and broad campaigns of an ASIN", "ASIN search terms"),
    neg("nauto", "Negate No Sale Bleeders [Auto]", { Clicks: "≥ 20", Orders: "= 0" }, "Negate search terms with 20+ clicks and no orders from auto campaigns", "Auto campaign"),
  ];
  const lib = id => LIB.find(r => r.id === id);
  const RTYPE = { bid: "Bidding", neg: "Negative" };

  // ---------- Optimizers (the Manage list) ----------
  const OPT_KEY = "sp-opt-list2";
  const DEFAULT_OPTS = [
    ["-60% bids if >= 100% ACOS", "l60", 1], ["-50% bids if >= 80% ACOS", "l50", 1], ["-33% bids if >= 60% ACOS", "l33", 1],
    ["Bad Conversions <=5%", "lbad", 1], ["Bad Conversions <=5% (7 days)", "lbad7", 1], ["Good Conversions >= 20%", "lgood", 1],
    ["Good Conversions >= 20% (7 days)", "lgood7", 1], ["Default 30% ACOS Keyword Bid", "ldef", 1], ["Raise bids on strong converters", "lraise", 2],
    ["Negate No Sale Bleeders [ASIN Phrase/Broad]", "nasin", 1], ["Negate No Sale Bleeders [Auto]", "nauto", 3],
  ].map(([name, rule, scheme], i) => ({ _k: `o${i}`, name, rule, scheme, active: true, include: { SP: true, SB: true, SD: true }, signals: [] }));
  let OPTS = load(OPT_KEY, null) || DEFAULT_OPTS.map(o => ({ ...o }));
  const saveOpts = () => save(OPT_KEY, OPTS);
  const opt = k => OPTS.find(o => o._k === k);
  // Manage rows carry the fields the grid shows, searches and sorts.
  const optRow = o => { const r = lib(o.rule); return { ...o, trigger: r.criteria, solution: r.action, type: RTYPE[r.kind], ruleName: r.name, ruleDesc: r.desc }; };

  // ---------- Recommendations (sample) ----------
  const camp = (i, kind) => `${kind}-${["BROAD", "BROAD", "PHRASE"][i % 3]}-${["VIDEO", "DISCOVERY", "BUNDLE"][i % 3]} - ${P[i % 2].asin}`;
  const ag = i => `${P[i % 2].asin} - ${["Broad", "Exact", "Phrase"][i % 3]}`;
  /** @type {[string, string, number, number, number][]} */
  const BIDS = [
    ["o2", "jump rope with counter", 67.33, 0.9, 0.6], ["o7", "ropeless jump rope", 45.74, 0.6, 0.57], ["o7", "jump rope with counter", 31.94, 1.2, 1.11],
    ["o7", "cordless battle ropes", 26.69, 0.9, 0.94], ["o7", "weighted jump rope", 21.34, 0.65, 0.75],
  ];
  const NEGS = ["exercise equipment", "exercise equipment", "exercise equipment", "exercise equipment", "home gym equipment", "home gym equipment", "home gym equipment", "home gym equipment", "battle ropes for exercise", "battle ropes for exercise", "weighted jump rope", "weighted jump rope", "skipping rope", "skipping rope", "rope trainer", "exercise rope", "gym rope", "heavy rope", "jump rope for kids", "speed rope"];
  const stat = (statsType, value, show) => ({ statsType, value, show });
  const RECS = [
    ...BIDS.map(([o, kw, acos, from, to], i) => {
      const r = SP.rng(i + 7), clicks = 18 + Math.round(r() * 40), spend = +(clicks * from * 0.92).toFixed(2), sales = +(spend / (acos / 100)).toFixed(2);
      const orders = Math.max(1, Math.round(sales / 24.99)), impr = clicks * (60 + Math.round(r() * 80));
      return { _k: `b${i}`, opt: o, kw, match: "Broad", market: "US", acos, old: from, new: to, campaign: camp(i, "SB"), adgroup: ag(i), asin: P[i % 2].asin,
        stats: [stat("ACOS", acos / 100, true), stat("Clicks", clicks, true), stat("Orders", orders, true), stat("Spend", spend, false), stat("Sales", sales, false), stat("Impressions", impr, false), stat("CTR", clicks / impr, false), stat("Conversion", orders / clicks, false), stat("CPC", spend / clicks, false)] };
    }),
    ...NEGS.map((kw, i) => {
      const r = SP.rng(i + 31), clicks = 15 + Math.round(r() * 22), spend = +(clicks * (0.55 + r() * 0.6)).toFixed(2), impr = clicks * (40 + Math.round(r() * 90));
      return { _k: `n${i}`, opt: i % 5 === 4 ? "o10" : "o9", kw, match: "Exact", market: "US", acos: null, campaign: camp(i + 1, "SP"), adgroup: ag(Math.floor(i / 4)), asin: P[Math.floor(i / 4) % 2].asin,
        stats: [stat("Clicks", clicks, true), stat("Orders", 0, true), stat("Spend", spend, true), stat("Impressions", impr, false), stat("CTR", clicks / impr, false), stat("CPC", spend / clicks, false)] };
    }),
  ];

  // ---------- History + state ----------
  const DONE_KEY = "sp-opt-done2", HIST_KEY = "sp-opt-hist2", MKT_KEY = "sp-opt-allmarkets";
  const done = () => load(DONE_KEY, {});
  const hist = () => load(HIST_KEY, []);
  const pendingRecs = () => {
    const d = done(), all = load(MKT_KEY, true);
    return RECS.filter(r => !d[r._k] && opt(r.opt)?.active && (all || r.market === "US")).map(r => {
      const o = opt(r.opt), lr = lib(o.rule);
      return { ...r, optName: o.name, scheme: o.scheme, rule: lr, solution: solutionHTML(r, lr) };
    });
  };
  const fmtStat = (v, type) => {
    const t = type.toLowerCase();
    if (["spend", "sales", "cpc", "cost"].includes(t)) return usd(v);
    if (["acos", "ctr", "conversion"].includes(t)) return `${+(v * 100).toFixed(2)}%`;
    return Math.round(v).toLocaleString("en-US");
  };
  function solutionHTML(r, lr) {
    if (lr.kind === "neg") return "Add keyword as <b>negative exact</b>";
    return `${lr.mode === "acos" ? `<div>Target ACOS: <b>${lr.value}%</b></div>` : ""}<div>${r.new < r.old ? "Decrease" : "Increase"} bid: <b>${usd(r.old)} → ${usd(r.new)}</b></div>`;
  }
  const calcHTML = (r, lr) => lr.mode === "pct"
    ? `<div>Current bid: <b>${usd(r.old)}</b></div><div>Adjustment: <b>${lr.value > 0 ? "+" : ""}${lr.value}%</b></div><div>New bid: ${usd(r.old)} × ${(1 + lr.value / 100).toFixed(2)} = <b>${usd(r.new)}</b></div>`
    : `<div>Current bid: <b>${usd(r.old)}</b></div><div>Current ACOS: <b>${r.acos.toFixed(2)}%</b> · Target ACOS: <b>${lr.value}%</b></div><div>Bid at target: ${usd(r.old)} × ${lr.value}% ÷ ${r.acos.toFixed(2)}% = <b>${usd((r.old * lr.value) / r.acos)}</b></div><div>Each change moves the bid part of the way, so the new bid is <b>${usd(r.new)}</b></div>`;
  const logFix = (r, how = "fix") => {
    const o = opt(r.opt), lr = lib(o.rule), h = hist(), key = `h${Date.now()}${Math.round(Math.random() * 1e4)}`;
    h.unshift({ _k: key, rec: r._k, created: Date.now(), optKey: o._k, optName: o.name, scheme: o.scheme, campaign: r.campaign, adgroup: r.adgroup, itemType: "Keyword",
      kw: r.kw, match: r.match, kind: how, ruleKind: lr.kind, prev: lr.kind === "bid" ? r.old.toFixed(2) : null, cur: lr.kind === "bid" ? r.new.toFixed(2) : null, reverted: false });
    save(HIST_KEY, h);
    const d = done(); d[r._k] = key; save(DONE_KEY, d);
    return key;
  };
  const undoLog = key => {
    save(HIST_KEY, hist().filter(x => x._k !== key));
    const d = done(); for (const k in d) if (d[k] === key) delete d[k]; save(DONE_KEY, d);
  };
  const similarTo = r => pendingRecs().filter(x => x._k !== r._k && x.adgroup === r.adgroup && x.rule.kind === lib(opt(r.opt).rule).kind);

  // ---------- Dialogs ----------
  let refresh = () => {};
  const openDialog = ({ title, subtitle = "", body, foot, width = 400, top = false, cls = "" }) => {
    /** @type {HTMLDivElement & { close?: () => void }} */
    const w = document.createElement("div");
    w.className = `om-wrap${top ? " top" : ""}`;
    w.innerHTML = `<div class="om ${cls}" tabindex="-1" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="width:min(${width}px,100%)"><div class="om-head"><span class="om-title">${title}</span>${subtitle ? `<span class="om-div"></span><span class="om-sub">${subtitle}</span>` : ""}<button type="button" class="om-x" data-omclose aria-label="Close">✕</button></div><div class="om-body">${body}</div>${foot === null ? "" : `<div class="om-foot">${foot}</div>`}</div>`;
    document.body.appendChild(w);
    document.body.classList.add("om-lock");
    const close = () => { w.remove(); if (!$(".om-wrap")) document.body.classList.remove("om-lock"); };
    w.close = close;
    w.addEventListener("click", e => { if (e.target.closest("[data-omclose]")) close(); });
    w.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab") {
        const f = $$("button,input,select,textarea,a[href]", w).filter(el => !el.disabled && el.getClientRects().length);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      }
    });
    setTimeout(() => ($("[data-autofocus]", w) || $(".om-foot button:last-child", w) || $(".om-x", w) || $(".om", w))?.focus());
    return w;
  };
  const statusDialog = ({ title, status, top = "", bottom, detail = "", ok = "OK", width = 400 }) => openDialog({
    title, width,
    body: `<div class="om-status ${status}">${status === "processing" ? "" : svg(status === "success" ? I.okc : I.failc, "om-sico")}${top ? `<b>${esc(top)}</b>` : ""}<div class="om-smsg">${bottom}</div>${detail ? `<div class="om-sdet">${esc(detail)}</div>` : ""}</div>`,
    foot: status === "processing" ? `<div class="om-loader"><i></i></div>` : `<span></span>${BTN("ob-sec", ok, "data-omclose", "width:100px")}`,
  });
  const processing = (title, message, then) => { const d = statusDialog({ title, status: "processing", bottom: esc(message) }); $(".om-x", d).remove(); setTimeout(() => { d.close(); then(); }, 650); };

  const ruleBadge = lr => `<a class="rule-badge" href="/Automation" target="_blank" rel="noopener"><span class="rb-ic">${svg(I.gavel)}</span><span class="rb-name">${esc(lr.name)}</span><span class="rb-tip" role="tooltip"><b>${svg(I.gavel)}${esc(lr.name)}</b>${Object.entries(lr.criteria).map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join("")}<em>Looks at the last ${lr.days} days of data</em></span></a>`;
  const condLines = lr => Object.entries(lr.criteria).map(([k, v]) => `<div>${esc(k)}: <b>${esc(v.replace(/\.00(?=%|$)/g, ""))}</b></div>`).join("");

  // Recommendation details ("Scale Optimizer details")
  function showDetails(r) {
    const lr = r.rule, links = !load(MKT_KEY, true), stats = r.stats;
    const statsHTML = more => {
      const list = more ? stats : stats.filter(s => s.show);
      return list.map((s, i) => `<div class="${i === list.length - 1 ? "dstat last" : "dstat"}"><div class="dstat-v"><span class="dgrey">${s.statsType}:</span><span>${fmtStat(s.value, s.statsType)}</span></div>${i === list.length - 1 ? `<button type="button" class="dmore" data-more>${more ? "Less" : "More"} stats (${lr.days} days)${svg(I.chevronR, more ? "rot-up" : "rot-down")}</button>` : ""}</div>`).join("");
    };
    const kindWord = lr.kind === "bid" ? "keyword" : "search term";
    const suggested = lr.kind === "bid"
      ? `${lr.mode === "acos" ? `<div>Target ACOS: <b>${lr.value}%</b></div>` : ""}<div>${r.new < r.old ? "Decrease" : "Increase"} bid: <b>${usd(r.old)} → ${usd(r.new)}</b></div>`
      : `<span>Add search term as <b>exact</b> keyword</span>`;
    const line = (icon, label, value, url) => `<div class="dline">${svg(icon, "dgrey-ic")}<span class="dgrey">${label}:</span>${links && url ? `<a class="dlink" href="${url}" target="_blank" rel="noopener">${esc(value)}</a>` : `<span>${esc(value)}</span>`}</div>`;
    const d = openDialog({
      title: "Scale Optimizer details", width: 480, top: true, cls: "om-details",
      body: `<div class="dcard" style="background:${SCHEMES[r.scheme][1]}"><div class="dtitle" style="color:${SCHEMES[r.scheme][0]}">${esc(r.optName)}</div><div class="dkw">${lr.kind === "bid" ? tag(r.match) : ""}<b>${esc(r.kw)}</b></div><div data-stats>${statsHTML(false)}</div></div>
        <div class="dbody"><div class="dbox"><div class="dsec"><div class="drow"><b class="dhead">Rule used</b><button type="button" class="dtoggle" data-crit>See criteria${svg(I.chevronR, "rot-down")}</button></div><div>${ruleBadge(lr)}</div>
          <div class="dlines" data-critbox hidden>${lr.kind === "neg" ? `<div>Search term source: <b>${esc(lr.source)}</b></div>` : ""}<div>If ${kindWord} during last ${lr.days} days has:</div>${condLines(lr)}</div></div>
          <div class="dsec"><div class="drow"><b class="dhead">Suggested action</b>${lr.kind === "bid" ? `<button type="button" class="dtoggle" data-calc>See calculations${svg(I.chevronR, "rot-down")}</button>` : ""}</div><div class="dlines">${suggested}</div>
          ${lr.kind === "bid" ? `<div class="dcalc" data-calcbox hidden><b class="dhead">Calculations</b><div class="dlines">${calcHTML(r, lr)}</div></div>` : ""}</div></div>
          <div class="dmeta">${links ? "" : line(I.flag, "Marketplace", r.market)}${line(I.camp, "Campaign", r.campaign, "/Ads/Performance")}${line(I.adgroup, "Ad group", r.adgroup, "/Ads/Performance")}${line(I.box, "ASIN", r.asin, "/Ads/Performance")}</div></div>`,
      foot: `${BTN("ob-sec", "Cancel", "data-omclose")}<div class="om-right">${BTN("ob-grey", "Ignore", "data-dignore")}${BTN("ob-main", "Fix once", "data-dfix")}</div>`,
    });
    let more = false;
    d.addEventListener("click", e => {
      if (e.target.closest("[data-more]")) { more = !more; $("[data-stats]", d).innerHTML = statsHTML(more); }
      const flip = (btn, box, on, off) => { const b = $(box, d), opening = b.hidden; b.hidden = !opening; btn.innerHTML = `${opening ? off : on}${svg(I.chevronR, opening ? "rot-up" : "rot-down")}`; };
      const c = e.target.closest("[data-crit]"); if (c) flip(c, "[data-critbox]", "See criteria", "Hide criteria");
      const k = e.target.closest("[data-calc]"); if (k) flip(k, "[data-calcbox]", "See calculations", "Hide calculations");
      if (e.target.closest("[data-dignore]")) { d.close(); confirmIgnore(r); }
      if (e.target.closest("[data-dfix]")) { d.close(); confirmResolve(r, () => showDetails(r)); }
    });
  }

  function confirmIgnore(r) {
    const d = openDialog({
      title: "Ignore this keyword?",
      body: `<div class="om-pad">Clicking 'Ignore' will prevent <b>${esc(r.optName)}</b> optimizer for this keyword from appearing again.</div>`,
      foot: `${BTN("ob-sec", "Cancel", "data-omclose", "width:80px")}${BTN("ob-danger", "Ignore", "data-ok", "width:80px")}`,
    });
    $("[data-ok]", d).addEventListener("click", () => { d.close(); processing("Ignore recommendation", "Please wait while ignoring the recommendation.", () => { logFix(r, "ignore"); refresh(); }); });
  }

  function confirmResolve(r, back) {
    const d = openDialog({
      title: "Resolve recommendation",
      body: `<div class="om-pad">Proceed with applying the change?</div>`,
      foot: `${BTN("ob-sec", "Cancel", "data-back", "width:80px")}${BTN("ob-main", "Resolve", "data-ok", "width:80px")}`,
    });
    $("[data-back]", d).addEventListener("click", () => { d.close(); if (back) back(); });
    $("[data-ok]", d).addEventListener("click", () => {
      d.close();
      processing("Apply recommendation", "Please wait while applying the recommendation.", () => { const key = logFix(r); refresh(); resolved(r, key); });
    });
  }

  function resolved(r, key) {
    const lr = r.rule, sim = similarTo(r);
    const primary = lr.kind === "bid"
      ? `<div class="rs-line">${svg(I.okc, "rs-ok")}${lr.mode === "acos" ? `<div>Bid adjusted to target <b>ACOS ${lr.value}%</b>: ${usd(r.old)} → <b>${usd(r.new)}</b></div>` : `<div>Bid adjusted: ${usd(r.old)} → <b>${usd(r.new)}</b></div>`}</div><div>${tag(r.match)}<b class="rs-kw">${esc(r.kw)}</b></div>`
      : `<div class="rs-line">${svg(I.okc, "rs-ok")}<div>Search term added as <b>negative exact</b> keyword</div></div><div><b class="rs-kw">${esc(r.kw)}</b></div>`;
    const wand = svg(I.wandc, "rs-wand");
    const secondary = sim.length
      ? `<div class="rs-auto col"><div class="rs-row">${wand}<div class="rs-col"><b>Auto-resolve similar cases from now on?</b><span>${sim.length} similar issue${sim.length > 1 ? "s" : ""} found in the same ad group</span></div></div><div class="rs-row">${BTN("ob-main bold", "Yes, automate", "data-auto")}${BTN("ob-outline", "Review similar issues", "data-sim", "width:185px;background:transparent")}</div></div>`
      : `<div class="rs-auto">${wand}<b class="rs-q">Auto-resolve similar cases from now on?</b>${BTN("ob-main bold", "Review solution", "data-auto", "width:140px")}</div>`;
    const d = openDialog({
      title: "Resolved successfully",
      body: `<div class="rs-primary">${primary}</div>${secondary}`,
      foot: `${BTN("ob-grey", "Undo", "data-undo", "width:100px")}${BTN("ob-sec", "OK", "data-omclose", "width:100px")}`,
    });
    d.addEventListener("click", e => {
      if (e.target.closest("[data-undo]")) { d.close(); processing("Undo recommendation", "Please wait while we undo the recommendation.", () => { undoLog(key); refresh(); SP.toast("The change was undone."); }); }
      if (e.target.closest("[data-auto]")) { d.close(); automate(r); }
      if (e.target.closest("[data-sim]")) { d.close(); similar(r, sim, key); }
    });
  }

  function automate(r) {
    const lr = r.rule, kw = lr.kind === "bid" ? "keyword" : "search term";
    const conds = Object.entries(lr.criteria).map(([k, v]) => {
      const m = v.match(/^([≥≤=])\s*(.*)$/), range = v.match(/^(.*) - (.*)$/);
      return range ? `${esc(k)} <span class="dgrey">: from</span> <b>${esc(range[1])}</b> <span class="dgrey">to</span> <b>${esc(range[2])}</b>`
        : m ? `${esc(k)} <span class="dgrey">${{ "≥": "more or equal", "≤": "less or equal", "=": "equal" }[m[1]]}</span> <b>${m[1]} ${esc(m[2])}</b>` : `${esc(k)} <b>${esc(v)}</b>`;
    });
    const does = lr.kind === "neg" ? ["Add search term as <b>negative exact</b> keyword"]
      : lr.mode === "acos" ? [`Adjust the keyword bids to <b>${lr.value}%</b> target ACOS`]
      : [`${lr.value > 0 ? "Increase" : "Decrease"} the keyword bids by <b>${Math.abs(lr.value)}%</b>`];
    const list = (items, cap) => `<ul class="au-list">${items.map((t, i) => `<li ${cap && i >= 2 ? "hidden" : ""}>${t}</li>`).join("")}${cap && items.length > 2 ? `<li class="au-foot"><button type="button" data-moreconds>See ${items.length - 2} more criteria</button></li>` : ""}</ul>`;
    const step = (n, title, inner) => `<div class="au-step"><div class="au-title"><span class="au-num">${n}</span><b>${title}</b></div>${inner}</div>`;
    const tabs = [["Preview changes<br>before they apply", "Every change shows up first as a recommendation you can check."], ["Review calculations<br>and revert changes", "Each change is listed under History with its numbers, ready to restore."], ["Track your savings", "See what the automated changes saved you over time."]];
    const d = openDialog({
      title: "Automate future cases", width: 580, top: true,
      body: `<div class="au-wrap"><div class="au-intro"><div class="au-h">What happens after you automate</div><div>Once we've automated ${esc(r.asin)}, we'll move on to the next steps:</div></div>
        <div class="au-steps">${step(1, `Daily check of ${kw} stats from: <span class="au-tip" title="Campaign: ${esc(r.campaign)}&#10;Ad group: ${esc(r.adgroup)}">${svg(I.adgroup)}<u>Ad group</u></span>`, `<div>We'll review the past <b>${lr.days} days</b> of data based on the rule:</div><div>${ruleBadge(lr)}</div>`)}
        ${step(2, `We'll find ${lr.kind === "bid" ? "keywords" : "search terms"} that match all these conditions:`, list(conds, true))}
        ${step(3, "If we find those keywords, we'll automatically:", list(does))}
        ${lr.kind === "bid" && lr.cooldown ? step(4, "Keyword cooldown", `<div>After changes are applied, no further updates will be made to those keywords <b>for ${lr.cooldown} days</b> to observe results.</div>`) : ""}</div>
        ${lr.kind === "bid" ? `<details class="au-control"><summary>👍 See how you are always in control${svg(I.chevronR)}</summary><div class="au-tabs" role="tablist">${tabs.map((t, i) => `<button type="button" role="tab" data-autab="${i}" class="${i ? "" : "on"}">${t[0]}</button>`).join("")}</div><div class="au-pane" data-aupane>${tabs[0][1]}</div></details>` : ""}</div>`,
      foot: `${BTN("ob-sec", "Cancel", "data-omclose", "width:80px")}${BTN("ob-main", "Automate", "data-ok")}`,
    });
    d.addEventListener("click", e => {
      const m = e.target.closest("[data-moreconds]");
      if (m) {
        const items = $$("li:not(.au-foot)", m.closest("ul")), opening = items.some(li => li.hidden);
        items.forEach((li, i) => (li.hidden = !opening && i >= 2));
        m.textContent = opening ? "Collapse" : `See ${items.length - 2} more criteria`;
      }
      const t = e.target.closest("[data-autab]");
      if (t) { $$("[data-autab]", d).forEach(b => b.classList.toggle("on", b === t)); $("[data-aupane]", d).textContent = tabs[+t.dataset.autab][1]; }
      if (e.target.closest("[data-ok]")) {
        d.close();
        const autos = load("sp-opt-auto", []); autos.push({ opt: r.opt, adgroup: r.adgroup, t: Date.now() }); save("sp-opt-auto", autos);
        similarTo(r).forEach(x => logFix(x));
        refresh();
        statusDialog({ title: "Automate future cases", status: "success", top: r.optName, bottom: "Automated succesfully" });
      }
    });
  }

  function similar(r, list, key) {
    const rows = list.map(x => `<tr><td><span class="si-item">${esc(x.kw)}<span class="si-stats" tabindex="0">${svg(I.info)}Stats<span class="rb-tip" role="tooltip"><b>Keyword stats</b>${x.stats.map(s => `<span>${s.statsType}:</span><span>${fmtStat(s.value, s.statsType)}</span>`).join("")}</span></span></span></td><td>${esc(x.match)}</td><td>${x.rule.kind === "bid" ? `Bid: ${usd(x.old)} → ${usd(x.new)}` : "Add as&nbsp;<b>negative exact</b>&nbsp; keyword"}</td><td>${BTN("ob-outline", "Resolve", `data-res="${x._k}"`)}</td></tr>`).join("");
    const d = openDialog({
      title: "Review similar issues", width: 882,
      subtitle: `<span class="au-tip" title="Campaign: ${esc(r.campaign)}&#10;Ad group: ${esc(r.adgroup)}">${svg(I.adgroup)} Ad group</span>`,
      body: `<div class="si-banner">${svg(I.wandc, "rs-wand")}<b>Auto-resolve similar cases <br>in this ad group going forward?</b>${BTN("ob-main bold", "Review solution", "data-auto")}</div>
        <div class="si-table"><table><thead><tr><th>Item</th><th>Match type</th><th>Recommended solution</th><th>Resolve</th></tr></thead><tbody>${rows || `<tr><td colspan="4" class="si-empty">No similar issues found</td></tr>`}</tbody></table></div>`,
      foot: BTN("ob-sec", "Back", "data-back", "width:100px"),
    });
    d.addEventListener("click", e => {
      if (e.target.closest("[data-back]")) { d.close(); resolved(r, key); }
      if (e.target.closest("[data-auto]")) { d.close(); automate(r); }
      const b = e.target.closest("[data-res]");
      if (b) { const x = list.find(y => y._k === b.dataset.res); d.close(); confirmResolve(x, () => similar(r, list.filter(y => !done()[y._k]), key)); }
    });
  }

  // ---------- Create / edit an optimizer ----------
  const sigList = () => signals();
  function optimizerEditor(o) {
    const editing = !!o;
    const st = editing ? { ...o, include: { ...o.include }, signals: [...o.signals], kind: lib(o.rule).kind } : { name: "", rule: null, scheme: 1, active: true, include: { SP: true, SB: true, SD: true }, signals: [], kind: "bid" };
    let open = true;
    const d = openDialog({
      title: editing ? "Edit Scale Optimizer" : "Create Scale Optimizer", width: 860, top: true, cls: "om-manage",
      body: `<div class="mg"><div class="mg-main"><div class="mg-pad">
          <div class="mg-field"><span class="mg-label"><span class="req">*</span>Select rule</span><div class="mg-rule"><select class="mg-select" data-kind aria-label="Rule type"><option value="bid">Bidding rule</option><option value="neg">Negative rule</option></select><div class="mg-pick-wrap"><button type="button" class="mg-select mg-pick" data-pick aria-haspopup="listbox"><span data-picklabel>Please Select</span>${svg(I.chevron)}</button></div></div><div class="mg-err" data-ruleerr hidden>Please select a rule</div></div>
          <div class="mg-details"><b>Rule details:</b><div class="mg-dl"><span class="dgrey" data-if>If keyword meets conditions:</span><div data-conds></div></div><div class="mg-dl"><span class="dgrey">Then:</span><span data-then></span></div></div>
          <div class="mg-field"><span class="mg-label"><span class="req">*</span>Card color scheme</span><div class="mg-schemes" role="radiogroup" aria-label="Card color scheme">${Object.keys(SCHEMES).map(s => `<label><input type="radio" name="scheme" value="${s}" aria-label="Scheme ${s}">${sw(s)}</label>`).join("")}</div></div></div>
        <div class="mg-sec"><div class="mg-sechead"><div class="mg-sectitle" data-sectitle>Target specific ad groups</div><button type="button" class="mg-exp" data-exp aria-label="Show or hide">${svg(I.chevronR, "rot-up")}</button></div>
          <div data-secbody class="mg-secbody"><div>Optimize only the ad groups of the selected ad types and only if they contain all required ad group signals for their ad type:</div>
          ${["SP", "SB", "SD"].map(t => `<div class="mg-sig"><label class="switch mini sig"><input type="checkbox" data-inc="${t}" aria-label="${t}"><span class="track"></span></label><span>${t}:</span><div class="mg-ms-wrap"><button type="button" class="mg-select mg-ms" data-ms="${t}"><span class="mg-mslabel" data-mslabel="${t}"></span>${svg(I.chevron)}</button></div></div>`).join("")}</div></div></div>
        <div class="mg-side">${editing ? `<button type="button" class="ob ob-grey mg-del" data-del>${svg(I.trash)}Delete optimizer</button>` : ""}
          <label class="switch mini sec"><input type="checkbox" data-active><span class="track"></span><span data-activelabel></span></label>
          <div class="mg-prev"><span>Scale Optimizer card preview:</span><div class="mg-card"><div class="mg-card-h" data-prevhead><span data-prevtitle>Title</span></div><div class="mg-card-b"><div class="mg-sk-row"><span class="otag">Match type</span><i class="sk" style="width:80px"></i></div><i class="sk" style="width:180px"></i><i class="sk" style="width:160px"></i></div><div class="mg-card-f"><i class="sk"></i><div class="mg-sk-btns"><span class="ob ob-main" style="width:97px"></span><span class="ob ob-grey" style="width:80px"></span></div></div></div></div>
          <span class="dgrey">Scale Optimizer displays recommended solutions based on selected rule.</span></div></div>`,
      foot: `${BTN("ob-sec", "Cancel", "data-omclose", "width:180px")}<label class="mg-name"><span class="mg-nl"><span class="req">*</span>Name (60 char max)</span><span class="mg-in"><input maxlength="60" data-name autocomplete="off" aria-label="Name"><button type="button" class="mg-clear" data-clear aria-label="Clear" hidden>✕</button><span class="mg-err" data-nameerr hidden>Please enter the name</span></span></label>${BTN("ob-main", editing ? "Save" : "Create", "data-submit", "width:180px")}`,
    });
    const nameIn = $("[data-name]", d);
    nameIn.value = st.name;
    $("[data-kind]", d).value = st.kind;
    $(`input[name=scheme][value="${st.scheme}"]`, d).checked = true;
    const paint = () => {
      const lr = st.rule ? lib(st.rule) : null;
      $("[data-picklabel]", d).textContent = lr ? lr.name : "Please Select";
      $("[data-pick]", d).classList.toggle("ph", !lr);
      $("[data-if]", d).textContent = st.kind === "neg" ? "If search term meets conditions:" : "If keyword meets conditions:";
      $("[data-conds]", d).innerHTML = lr ? Object.entries(lr.criteria).map(([k, v]) => `<div>• ${esc(k)}: ${esc(v)}</div>`).join("") : "";
      $("[data-then]", d).textContent = lr ? lr.action : "";
      $("[data-prevtitle]", d).textContent = nameIn.value.trim() || "Title";
      $("[data-prevhead]", d).style.cssText = `background:${SCHEMES[st.scheme][1]};color:${SCHEMES[st.scheme][0]}`;
      $("[data-active]", d).checked = st.active;
      $("[data-activelabel]", d).textContent = st.active ? "Active" : "Disable";
      $("[data-clear]", d).hidden = !nameIn.value;
      $("[data-secbody]", d).hidden = !open;
      $("[data-sectitle]", d).classList.toggle("collapsed", !open);
      $("[data-exp] svg", d).setAttribute("class", open ? "rot-up" : "rot-down");
      const sigs = sigList();
      ["SP", "SB", "SD"].forEach(t => {
        $(`[data-inc="${t}"]`, d).checked = st.include[t];
        const chosen = sigs.filter(s => s.type === t && st.signals.includes(s._k));
        $(`[data-ms="${t}"]`, d).disabled = !st.include[t];
        $(`[data-mslabel="${t}"]`, d).innerHTML = chosen.length ? chosen.map(s => `<span class="mg-chip">${esc(s.name)}</span>`).join("") : `<span class="ph">Specify ad groups by their signals</span>`;
      });
    };
    paint();
    d.addEventListener("input", e => { if (e.target === nameIn) { $("[data-nameerr]", d).hidden = true; paint(); } });
    d.addEventListener("change", e => {
      if (e.target.matches("[data-kind]")) { st.kind = e.target.value; st.rule = null; paint(); }
      if (e.target.matches("input[name=scheme]")) { st.scheme = +e.target.value; paint(); }
      if (e.target.matches("[data-active]")) { st.active = e.target.checked; paint(); }
      if (e.target.matches("[data-inc]")) { st.include[e.target.dataset.inc] = e.target.checked; paint(); }
    });
    const dropdown = (anchor, html, onClick) => {
      $$(".mg-pop", d).forEach(p => p.remove());
      const pop = document.createElement("div");
      pop.className = "mg-pop"; pop.innerHTML = html;
      anchor.parentElement.appendChild(pop);
      pop.addEventListener("click", e => onClick(e, pop));
      const off = e => { if (!pop.isConnected) { d.removeEventListener("mousedown", off, true); return; } if (!pop.contains(e.target) && !anchor.contains(e.target)) { pop.remove(); d.removeEventListener("mousedown", off, true); } };
      d.addEventListener("mousedown", off, true);
      return pop;
    };
    d.addEventListener("click", e => {
      if (e.target.closest(".mg-pop")) return;
      if (e.target.closest("[data-clear]")) { nameIn.value = ""; paint(); nameIn.focus(); }
      if (e.target.closest("[data-exp]")) { open = !open; paint(); }
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        const was = $(".mg-pop", pick.parentElement); if (was) { was.remove(); return; }
        const opts = LIB.filter(r => r.kind === st.kind);
        const render = q => opts.filter(r => r.name.toLowerCase().includes(q.toLowerCase())).map(r => `<button type="button" role="option" data-rid="${r.id}" class="${r.id === st.rule ? "on" : ""}">${svg(I.gavel, "gv")}${esc(r.name)}</button>`).join("") || `<div class="mg-none">No data</div>`;
        const pop = dropdown(pick, `<label class="mg-psearch">${svg(I.search)}<input placeholder="Instant Search" aria-label="Instant Search"></label><span class="mg-ptitle">Select ${st.kind === "neg" ? "negative" : "bidding"} rule</span><div class="mg-plist" role="listbox">${render("")}</div>`, (ev, p) => {
          const b = ev.target.closest("[data-rid]");
          if (b) { st.rule = b.dataset.rid; $("[data-ruleerr]", d).hidden = true; p.remove(); paint(); }
        });
        const q = $("input", pop); q.focus();
        q.addEventListener("input", () => { $(".mg-plist", pop).innerHTML = render(q.value); });
      }
      const ms = e.target.closest("[data-ms]");
      if (ms && !ms.disabled) {
        const was = $(".mg-pop", ms.parentElement); if (was) { was.remove(); return; }
        const t = ms.dataset.ms, list = sigList().filter(s => s.type === t);
        const count = () => `${list.filter(s => st.signals.includes(s._k)).length} ad group signals selected`;
        dropdown(ms, `<div class="mg-count"><b>${count()}</b></div><div class="mg-plist">${list.map(s => `<label><input type="checkbox" data-sig="${s._k}" ${st.signals.includes(s._k) ? "checked" : ""}>${esc(s.name)}</label>`).join("") || `<div class="mg-none">No data</div>`}</div>`, (ev, p) => {
          const c = ev.target.closest("[data-sig]"); if (!c) return;
          st.signals = c.checked ? [...st.signals, c.dataset.sig] : st.signals.filter(x => x !== c.dataset.sig);
          $(".mg-count b", p).textContent = count();
          paint();
        });
      }
      if (e.target.closest("[data-del]")) confirmDelete(o, () => d.close());
      if (e.target.closest("[data-submit]")) {
        const name = nameIn.value.trim();
        $("[data-nameerr]", d).hidden = !!name;
        $("[data-ruleerr]", d).hidden = !!st.rule;
        if (!name || !st.rule) return;
        const vals = { name, rule: st.rule, scheme: st.scheme, active: st.active, include: st.include, signals: st.signals };
        if (editing) Object.assign(o, vals); else OPTS.push({ _k: `u${Date.now()}`, ...vals });
        saveOpts(); refresh(); d.close();
        SP.toast(editing ? "Single edit successful." : "Create Scale Optimizer successful.");
      }
    });
  }
  function confirmDelete(o, after) {
    const d = openDialog({
      title: "Are you sure?", width: 500,
      body: `<div class="om-pad">This will permanently remove the Scale Optimizer.<br>If you're unsure, you may consider deactivating it instead.<br>Are you sure you want to delete it?</div>`,
      foot: `<div class="om-pair">${BTN("ob-sec", "Cancel", "data-omclose")}${BTN("ob-danger", "Yes. Delete", "data-ok")}</div>`,
    });
    $("[data-ok]", d).addEventListener("click", () => { OPTS = OPTS.filter(x => x !== o); saveOpts(); refresh(); d.close(); if (after) after(); SP.toast("Deleted successfully."); });
  }

  // ---------- History dialogs ----------
  function confirmRestore(h) {
    const ignore = h.kind === "ignore";
    const d = openDialog({
      title: ignore ? "Unignore this keyword?" : "Revert action",
      body: `<div class="om-pad">${ignore ? `Clicking ‘Unignore’ will re-enable the <b>${esc(h.optName)}</b> Optimizer for this keyword, allowing recommendations to appear if the conditions are met again.`
        : h.ruleKind === "bid" ? `Replace current bid (<b>${h.cur}</b>) with previous bid (<b>${h.prev}</b>)?` : "Archive negative search term?"}</div>`,
      foot: `${BTN("ob-sec", "Cancel", "data-omclose", "width:80px")}${ignore ? BTN("ob-main", "Unignore", "data-ok", "width:110px") : BTN("ob-danger", "Revert", "data-ok", "width:80px")}`,
    });
    $("[data-ok]", d).addEventListener("click", () => { restoreLogs([h._k]); d.close(); SP.toast("Restore successful."); });
  }
  function restoreLogs(keys) {
    const list = hist(), dn = done();
    list.forEach(h => { if (keys.includes(h._k)) { h.reverted = true; if (dn[h.rec] === h._k) delete dn[h.rec]; } });
    save(HIST_KEY, list); save(DONE_KEY, dn); refresh();
  }

  // ---------- Page ----------
  const performed = h => {
    if (h.kind === "ignore") return `<span class="h-ign">Ignored</span>`;
    const ok = `<span class="h-ok">${svg(I.okc)} Resolved</span>`;
    return h.ruleKind === "bid" ? `<span class="h-act">${ok}(Bid: ${h.prev ?? "-"} → ${h.cur ?? "-"})</span>` : `<span class="h-act">${ok}Add negative search term</span>`;
  };
  const restoreCell = h => {
    if (h.reverted) return "<span>Restored</span>";
    if (!opt(h.optKey)) return "-";
    const label = h.kind === "ignore" ? "Unignore" : h.ruleKind === "bid" ? `Restore bid ${h.prev}` : "Restore";
    return `<button type="button" class="ob ob-grey h-restore" data-restore="${h._k}">${svg(I.restore)}${label}</button>`;
  };
  const longDay = t => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")} ${SP.MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const PRESETS = ["Last Month", "This Month", "Last Year", "This Year"];

  SP.pages["/ScaleOptimizer"] = {
    title: "Scale Optimizer", noSub: true, section: "optimizer", icon: "optimizer", iconColor: "#8b70cf",
    render() {
      const allMk = load(MKT_KEY, true);
      const recGrid = SP.grid({
        id: "recs", agPager: true, pageSize: 20, columns: true, cls: "ag", sortKey: "acos", dir: -1,
        toolsBefore: `<label class="switch green"><input type="checkbox" ${allMk ? "checked" : ""} data-markets aria-label="All markets"><span class="track"></span>All markets</label>`,
        cols: [
          { key: "_k", label: "Actions", sort: false, cls: "actcell", fmt: k => `<span class="recacts">${BTN("ob-outline", "Fix once", `data-fix="${k}"`)}${BTN("ob-plain", "Ignore", `data-ignore="${k}"`)}</span>` },
          { key: "optName", label: "Optimiser", filter: true, w: 260, fmt: (v, r) => `<span class="optname">${sw(r.scheme)}<span>${esc(v)}</span></span>` },
          { key: "market", label: "Marketplace", filter: true },
          { key: "kw", label: "Target", filter: true, w: 200, fmt: (v, r) => `<span>${tag(r.match)}${esc(v)}</span>` },
          { key: "acos", label: "Current ACOS", filter: true, fmt: v => (v == null ? "" : `${v.toFixed(2)}%`) },
          { key: "solution", label: "Solution (Action to execute)", sort: false, w: 230, fmt: v => `<span class="sol">${v}</span>` },
          { key: "campaign", label: "Campaign Name", filter: true, w: 200 },
          { key: "adgroup", label: "Ad Group Name", filter: true, w: 170 },
          { key: "asin", label: "ASIN", filter: true },
        ],
        rows: pendingRecs(), empty: "No Rows To Show",
      });
      const ruleGrid = SP.grid({
        id: "rules", agPager: true, pageSize: 20, columns: true, check: true, cls: "ag",
        toolsBefore: `<button type="button" class="btn-soft" data-newrule>${svg(I.plus)}Create new</button>`,
        tools: `<div class="anchor"><button type="button" class="plain-btn bulk" data-bulk disabled><span data-bulklabel>Bulk edit</span> ${SP.caret}</button></div>`,
        cols: [
          { key: "_k", label: "Actions", sort: false, fmt: k => `<span class="rowacts"><button type="button" class="ic-round" data-editrule="${k}" aria-label="Edit">${svg(I.pencil)}</button><button type="button" class="ic-round" data-delrule="${k}" aria-label="Delete">${svg(I.trash)}</button></span>` },
          { key: "active", label: "Active", filter: true, sort: false, fmt: (v, r) => `<label class="switch green mini"><input type="checkbox" ${v ? "checked" : ""} data-active="${r._k}" aria-label="Active"><span class="track"></span></label>` },
          { key: "scheme", label: "Color", sort: false, fmt: s => sw(s) },
          { key: "name", label: "Optimizer name", filter: true, sort: false, w: 230 },
          { key: "trigger", label: "Trigger condition", sort: false, w: 200, fmt: v => Object.entries(v).map(([k, x]) => `<div>${esc(k)}: ${esc(x)}</div>`).join("") },
          { key: "solution", label: "Solution (Action to execute)", filter: true, sort: false, w: 230 },
          { key: "type", label: "Rule type", filter: true, sort: false },
          { key: "ruleName", label: "Rule name", filter: true, sort: false, w: 360, fmt: (_, r) => `<div class="optimizer-rule">${ruleBadge(lib(r.rule))}<small>${esc(r.ruleDesc)}</small></div>` },
        ],
        rows: OPTS.map(optRow), empty: "No Rows To Show",
      });
      const range = load("sp-opt-hrange", null) || [SP.iso(SP.addDays(SP.today, -30)), SP.iso(SP.today)];
      const histGrid = SP.grid({
        id: "hist", agPager: true, pageSize: 10, columns: true, check: true, cls: "ag", sortKey: "created", dir: -1,
        tools: `<button type="button" class="plain-btn bulk" data-revert disabled><span data-revertlabel>Bulk revert</span></button>`,
        cols: [
          { key: "created", label: "Created", filter: true, fmt: v => longDay(v) },
          { key: "optName", label: "Optimizer Name", sort: false, w: 200, fmt: (v, h) => (opt(h.optKey) ? `<span class="optname">${sw(h.scheme)}<span>${esc(v)}</span></span>` : "Optimizer deleted") },
          { key: "campaign", label: "Campaign Name", filter: true, sort: false, w: 200 },
          { key: "adgroup", label: "Ad Group Name", filter: true, sort: false, w: 150 },
          { key: "itemType", label: "Item Type", filter: true, sort: false },
          { key: "kw", label: "Changed Item", sort: false, w: 200, fmt: (v, h) => `${tag(h.match)}<span>${esc(v)}</span>` },
          { key: "kind", label: "Performed Action", sort: false, w: 240, fmt: (_, h) => performed(h) },
          { key: "reverted", label: "Restore", sort: false, fmt: (_, h) => restoreCell(h) },
        ],
        rows: [], empty: "No records found.",
      });
      const histPanel = `<div class="h-range"><div class="h-range-in">${svg(I.calendar, "cal")}<input type="date" data-hfrom value="${range[0]}" aria-label="Start date"><span>-</span><input type="date" data-hto value="${range[1]}" aria-label="End date"><div class="anchor"><button type="button" class="h-presets" data-hpresets aria-label="Date presets">${SP.caret}</button></div></div>${BTN("ob-main", "Filter", "data-hfilter", "width:70px")}</div>${histGrid}`;
      return `<div class="actions tight"><a class="btn-outline linkbtn" href="/AdGroupSignals" target="_blank" rel="noopener">Manage Signals</a></div>
        ${SP.tabs("opt", ["Recommendations", "Manage", "History"], 0, "ant")}${SP.panels("opt", [recGrid, ruleGrid, histPanel], 0)}`;
    },
    wire(root) {
      const g = SP._grids;
      let hRange = [$("[data-hfrom]", root).value, $("[data-hto]", root).value];
      const histRows = () => {
        const from = new Date(`${hRange[0] || "2000-01-01"}T00:00:00`).getTime(), to = new Date(`${hRange[1] || "2999-01-01"}T23:59:59`).getTime();
        return hist().filter(h => h.created >= from && h.created <= to);
      };
      const locked = () => new Set(hist().filter(h => h.reverted || !opt(h.optKey)).map(h => h._k));
      const lockReverted = () => {
        const rev = locked();
        $$('[data-grid="hist"] [data-gchk]', root).forEach(c => { if (rev.has(c.dataset.gchk) && !c.disabled) { c.disabled = true; c.checked = false; } });
      };
      new MutationObserver(lockReverted).observe($('[data-grid="hist"]', root), { childList: true, subtree: true });
      const syncBulk = () => {
        const n = g.rules.checked.size;
        $("[data-bulk]", root).disabled = !n;
        $("[data-bulklabel]", root).textContent = n ? `Bulk edit ${n} scale optimizer${n > 1 ? "s" : ""}` : "Bulk edit";
        const rev = locked();
        [...g.hist.checked].forEach(k => { if (rev.has(k)) g.hist.checked.delete(k); });
        const m = g.hist.checked.size;
        $("[data-revert]", root).disabled = !m;
        $("[data-revertlabel]", root).innerHTML = m ? `Bulk revert <b>${m}</b> change log${m > 1 ? "s" : ""}` : "Bulk revert";
      };
      refresh = () => {
        g.recs.rows = pendingRecs(); SP.refreshGrid("recs");
        const keep = new Set(OPTS.map(o => o._k));
        g.rules.rows = OPTS.map(optRow); g.rules.checked = new Set([...g.rules.checked].filter(k => keep.has(k))); SP.refreshGrid("rules");
        g.hist.rows = histRows(); SP.refreshGrid("hist");
        lockReverted(); syncBulk();
      };
      refresh();

      root.addEventListener("click", e => {
        const t = e.target;
        const fix = t.closest("[data-fix]"); if (fix) { const r = g.recs.rows.find(x => x._k === fix.dataset.fix); if (r) showDetails(r); return; }
        const ign = t.closest("[data-ignore]"); if (ign) { const r = g.recs.rows.find(x => x._k === ign.dataset.ignore); if (r) confirmIgnore(r); return; }
        const row = t.closest('[data-grid="recs"] tbody tr[data-k]');
        if (row && !t.closest(".actcell")) { const r = g.recs.rows.find(x => x._k === row.dataset.k); if (r) showDetails(r); return; }
        if (t.closest("[data-newrule]")) { optimizerEditor(null); return; }
        const er = t.closest("[data-editrule]"); if (er) { optimizerEditor(opt(er.dataset.editrule)); return; }
        const dr = t.closest("[data-delrule]"); if (dr) { confirmDelete(opt(dr.dataset.delrule)); return; }
        const bulk = t.closest("[data-bulk]");
        if (bulk && !bulk.disabled) {
          e.stopPropagation();
          const pop = SP.popover(bulk, [{ label: "Delete scale optimizer", act: "del" }, { label: '<span class="bdot off"></span>Disable scale optimizer', act: "off" }, { label: '<span class="bdot on"></span>Activate scale optimizer', act: "on" }], it => {
            const sel = new Set(g.rules.checked);
            if (it.act === "del") OPTS = OPTS.filter(o => !sel.has(o._k)); else OPTS.forEach(o => { if (sel.has(o._k)) o.active = it.act === "on"; });
            g.rules.checked.clear(); saveOpts(); refresh(); SP.toast("Bulk edit successful.");
          });
          pop.classList.add("bulkmenu");
          return;
        }
        const rs = t.closest("[data-restore]"); if (rs) { confirmRestore(hist().find(h => h._k === rs.dataset.restore)); return; }
        const rv = t.closest("[data-revert]");
        if (rv && !rv.disabled) {
          const sel = [...g.hist.checked];
          const d = openDialog({
            title: "Bulk restore confirmation",
            body: `<div class="om-pad big">Are you sure you want to restore the <b>${sel.length}</b> selected change log${sel.length > 1 ? "s" : ""} ?</div>`,
            foot: `${BTN("ob-sec", "Cancel", "data-omclose", "width:80px")}${BTN("ob-danger", "Restore", "data-ok", "width:80px")}`,
          });
          $("[data-ok]", d).addEventListener("click", () => { g.hist.checked.clear(); restoreLogs(sel); d.close(); SP.toast("Restore successful."); });
          return;
        }
        if (t.closest("[data-hfilter]")) {
          hRange = [$("[data-hfrom]", root).value, $("[data-hto]", root).value];
          save("sp-opt-hrange", hRange); refresh(); return;
        }
        const hp = t.closest("[data-hpresets]");
        if (hp) {
          e.stopPropagation();
          SP.popover(hp, PRESETS.map(label => ({ label })), it => {
            const y = SP.today.getFullYear(), m = SP.today.getMonth();
            const r = { "Last Month": [new Date(y, m - 1, 1), new Date(y, m, 0)], "This Month": [new Date(y, m, 1), new Date(y, m + 1, 0)], "Last Year": [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)], "This Year": [new Date(y, 0, 1), new Date(y, 11, 31)] }[it.label];
            $("[data-hfrom]", root).value = SP.iso(r[0]); $("[data-hto]", root).value = SP.iso(r[1]);
          });
        }
      });
      root.addEventListener("change", e => {
        const a = e.target.closest("[data-active]");
        if (a) { const o = opt(a.dataset.active); o.active = a.checked; saveOpts(); refresh(); SP.toast("Update Status successful."); }
        if (e.target.matches("[data-markets]")) { save(MKT_KEY, e.target.checked); refresh(); }
        // the shared grid handler updates the selection first
        setTimeout(syncBulk);
      });
    },
  };

  // ================= Ad group signals =================
  const INFO = '<svg viewBox="0 0 16 16" class="sg-info-ic" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="#34465E"/><path d="M8 7.2v4.3M8 4.7v.1" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
  const info = (tip, below = false) => `<span class="sg-info${below ? " below" : ""}" tabindex="0" aria-label="${esc(tip)}">${INFO}<span class="sg-tip" role="tooltip">${esc(tip)}</span></span>`;
  const MATCHES = [["Any single type", "Exact only", "Phrase only", "Broad only"], ["Exact", "Phrase", "Broad"], ["Any but not Exact", "Any but not Phrase", "Any but not Broad"], ["At least two types"]];
  const MATCH_LIST = MATCHES.flat();
  const COLORS = ["#20C997", "#e56874", "#a52834", "#ff8d28", "#007bff", "#005cbf", "#6e1a23", "#cb30e0", "#6610f2", "#003d7f", "#ff2d55", "#00c3d0", "#dc3545", "#409cff", "#bf9105", "#ac7f5e", "#ffc107", "#8c4cf5", "#7f6003", "#000000", "#28a745", "#4c0cb5", "#1e7d34", "#565e64"];
  const BIDS_OPTS = [[1, "Bid down"], [2, "Bid up and down"], [3, "Fixed bid"]];
  const blankCfg = () => ({ bidding: [], place: { on: false, only: false, top: [null, null], rest: [null, null], pages: [null, null] }, targets: [], kw: [null, null], pr: [null, null], match: { on: false, value: 0 } });
  const cfgWith = patch => Object.assign(blankCfg(), patch);
  const SIGNALS = [
    ["Multi Target/Keyword AdGroup (SP)", "SP", 9, "Ad group containing multiple targets in an SP campaign", { targets: ["Keywords", "Products"], kw: [2, null], pr: [2, null] }],
    ["Multi Target/Keyword AdGroup (SB)", "SB", 9, "Ad group containing multiple targets in an SB campaign", { targets: ["Keywords", "Products"], kw: [2, null], pr: [2, null] }],
    ["No Placement Modifier", "SP", 9, "Ad group in an SP campaign with no placement modifiers", { place: { on: false, only: true, top: [null, null], rest: [null, null], pages: [null, null] } }],
    ["Bid Down Or Fixed", "SP", 9, "Ad group in a campaign with either a bid down or fixed bid strategy", { bidding: [1, 3] }],
    ["Auto", "SP", 3, "Auto-targeting ad group in an SP campaign", { targets: ["Auto targeting"] }],
    ["Keyword (SP)", "SP", 2, "Keyword targeting ad group in an SP campaign", { targets: ["Keywords"] }],
    ["Keyword (SB)", "SB", 2, "Keyword targeting ad group in an SB campaign", { targets: ["Keywords"] }],
    ["Not Exact (SP)", "SP", 2, "Ad group without exact match type targets in an SP campaign", { match: { on: true, value: 7 } }],
    ["Not Exact (SB)", "SB", 2, "Ad group without exact match type targets in an SB campaign", { match: { on: true, value: 7 } }],
    ["Product (SP)", "SP", 1, "Product targeting ad group in an SP campaign", { targets: ["Products"] }],
    ["Product (SB)", "SB", 1, "Product targeting ad group in an SB campaign", { targets: ["Products"] }],
  ].map(([name, type, used, desc, cfg], i) => ({ _k: `s${i}`, name, type, used, desc, color: "#20C997", cfg: cfgWith(cfg) }));
  const SIG_KEY = "sp-signals2";
  const signals = () => load(SIG_KEY, null) || SIGNALS.map(s => ({ ...s, cfg: JSON.parse(JSON.stringify(s.cfg)) }));

  // Create / edit window, following the original's rules for each section.
  function signalEditor(s, onSaved) {
    const editing = !!s;
    const st = editing ? JSON.parse(JSON.stringify({ name: s.name, type: s.type, desc: s.desc || "", color: s.color || "#20C997", cfg: s.cfg || blankCfg() }))
      : { name: "", type: "SP", desc: "", color: "#20C997", cfg: blankCfg() };
    const c = st.cfg;
    const saved = { place: JSON.parse(JSON.stringify(c.place)), kw: [...c.kw], pr: [...c.pr] };
    let descOpen = true;
    const num = (name, ph, min, max) => `<input type="number" class="sg-num" data-num="${name}" placeholder="${ph}" min="${min}" max="${max}" step="1" inputmode="numeric" aria-label="${ph}">`;
    const range = (key, min, max) => `<div class="sg-rangecol"><div class="sg-range">${num(`${key}.0`, "At least", min, max)}<span>—</span>${num(`${key}.1`, "At most", min, max)}</div><div class="sg-err" data-err="${key}" hidden>'At least' value cannot be greater than 'At most' value</div></div>`;
    const head = (key, title, tip = "") => `<div class="sg-head"><label class="sg-hcheck"><input type="checkbox" class="sg-cb" data-head="${key}" aria-label="${esc(title)}"></label><span class="sg-title" data-title="${key}">${title}${tip ? info(tip) : ""}</span></div>`;
    const w = document.createElement("div");
    w.className = "sg-wrap";
    w.innerHTML = `<form class="sg-dialog${editing ? " edit" : ""}" role="dialog" aria-modal="true" aria-labelledby="sg-title" novalidate>
      <div class="sg-card"><div class="sg-top"><h2 id="sg-title">${editing ? "Edit" : "Create"} ad group signal</h2></div>
      <div class="sg-scroll"><div class="sg-cols"><div class="sg-main">
        <section class="sg-sec sg-types${editing ? " disabled" : ""}"><div class="sg-title">Select applicable ad type:</div><div class="sg-radios">${["SP", "SB", "SD"].map(t => `<label><input type="radio" name="adType" value="${t}">${t}</label>`).join("")}</div></section>
        <section class="sg-sec" data-sec="bidding">${head("bidding", "Campaign bidding strategies")}<div class="sg-body" data-body="bidding"><div>Allowed bidding strategies:</div><div class="sg-checks">${BIDS_OPTS.map(([v, l]) => `<label><input type="checkbox" class="sg-cb" data-bid="${v}">${l}</label>`).join("")}</div></div></section>
        <section class="sg-sec" data-sec="place">${head("place", "Campaign placement modifiers")}<div class="sg-body" data-body="place"><label class="sg-line"><input type="checkbox" class="sg-cb" data-only>Only campaigns without placement modifiers.</label>
          ${[["top", "Top of search (%):"], ["rest", "Rest of search (%):"], ["pages", "Product pages (%):"]].map(([k, l]) => `<div class="sg-row"><span class="sg-rlabel" data-plabel>${l}</span>${range(k, 0, 900)}</div>`).join("")}</div></section>
        <section class="sg-sec" data-sec="targets">${head("targets", "Allowed ad groups targets", "As soon as allowed ad group targets are specified, everything except CPC SB Goal Types is excluded.")}<div class="sg-body" data-body="targets">
          <div class="sg-row"><span class="sg-rlabel"><label><input type="checkbox" class="sg-cb" data-tgt="Keywords">Keywords</label>${info("You can set min/max ranges if needed. 'Keywords' includes keyword groups as well.")}</span>${range("kw", 1, 1000)}</div>
          <div class="sg-row"><span class="sg-rlabel"><label><input type="checkbox" class="sg-cb" data-tgt="Products">Products</label>${info("You can set min/max ranges if needed. 'Products' also includes category targets.")}</span>${range("pr", 1, 1000)}</div>
          <div class="sg-row sg-auto" data-autorow><label><input type="checkbox" class="sg-cb" data-tgt="Auto targeting">Auto targeting</label></div></div></section>
        <section class="sg-sec" data-sec="match">${head("match", "Keyword match types")}<div class="sg-body" data-body="match"><div class="sg-matchrow"><span>Ad group must have keyword with match type:</span><div class="sg-dd"><button type="button" class="sg-select" data-matchbtn aria-haspopup="listbox"><span data-matchlabel></span><span class="sg-caret"></span></button></div></div></div></section>
        <section class="sg-sec sg-none" data-sec="none">No filters available for Sponsored Display ad group signals.</section>
        <section class="sg-sec sg-color"><div class="sg-title">Signal color</div><div class="sg-dd"><button type="button" class="sg-select sg-colorbtn" data-colorbtn aria-label="Signal color" aria-haspopup="listbox"><span class="sg-dot" data-dot></span><span class="sg-caret"></span></button></div></section>
        <section class="sg-sec sg-desc"><div class="sg-head"><span class="sg-title" data-title="desc">Description</span><button type="button" class="sg-exp" data-descexp aria-label="Show or hide description">${svg(I.chevronR)}</button></div><div class="sg-body" data-body="desc"><textarea class="sg-textarea" maxlength="256" rows="4" data-desc placeholder="Add context or notes for this ad group signal" aria-label="Description"></textarea></div></section>
      </div>${editing ? `<aside class="sg-side"><button type="button" class="ob ob-grey sg-delbtn" data-sigdel>${svg(I.trash)}Delete</button></aside>` : ""}</div></div></div>
      <div class="sg-foot"><button type="button" class="ob ob-sec" data-cancel style="width:180px">Cancel</button><label class="sg-name"><span>Name <span class="req">*</span></span><span class="sg-in"><input data-name maxlength="80" placeholder="Enter name" autocomplete="off" aria-label="Name"><button type="button" class="mg-clear" data-clear aria-label="Clear" hidden>✕</button></span></label><button type="submit" class="ob ob-main" data-submit style="width:180px">${editing ? "Save" : "Create"}</button></div></form>`;
    const f = w.querySelector("form");
    const q = sel => $(sel, w), qa = sel => $$(sel, w);
    q("[data-name]").value = st.name;
    q("[data-desc]").value = st.desc;
    q(`input[name=adType][value="${st.type}"]`).checked = true;
    const setNum = (key, v) => { const [k, i] = key.split("."); (k === "kw" ? c.kw : k === "pr" ? c.pr : c.place[k])[+i] = v; };
    const getNum = key => { const [k, i] = key.split("."); return (k === "kw" ? c.kw : k === "pr" ? c.pr : c.place[k])[+i]; };
    qa("[data-num]").forEach(el => { const v = getNum(el.dataset.num); el.value = v ?? ""; });
    const errOf = pair => pair[0] != null && pair[1] != null && pair[0] > pair[1];
    const tgtOpts = () => (st.type === "SP" ? ["Keywords", "Products", "Auto targeting"] : ["Keywords", "Products"]);
    const valid = () => {
      const name = q("[data-name]").value.trim();
      if (!name || name.length > 80 || q("[data-desc]").value.length > 256) return false;
      if (st.type === "SP" && c.place.on && !c.place.only) {
        const pairs = [c.place.top, c.place.rest, c.place.pages];
        if (pairs.some(errOf) || !pairs.some(p => p[0] != null || p[1] != null)) return false;
      }
      if (st.type !== "SD") {
        if (c.targets.includes("Keywords") && errOf(c.kw)) return false;
        if (c.targets.includes("Products") && errOf(c.pr)) return false;
        if (c.match.on && c.match.value == null) return false;
      }
      return true;
    };
    const paint = () => {
      const T = st.type, sp = T === "SP", sd = T === "SD";
      q('[data-sec="bidding"]').hidden = !sp;
      q('[data-sec="place"]').hidden = !sp;
      q('[data-sec="targets"]').hidden = sd;
      q('[data-sec="match"]').hidden = sd;
      q('[data-sec="none"]').hidden = !sd;
      qa("input[name=adType]").forEach(r => { r.disabled = editing && r.value !== T; });
      // bidding
      const bAll = c.bidding.length === BIDS_OPTS.length, bSome = c.bidding.length > 0;
      const bh = q('[data-head="bidding"]'); bh.checked = bAll; bh.indeterminate = bSome && !bAll;
      qa("[data-bid]").forEach(cb => { const v = +cb.dataset.bid; cb.checked = c.bidding.includes(v); cb.disabled = c.bidding.length === 1 && c.bidding[0] === v; });
      // placement
      const pOn = c.place.on || c.place.only;
      q('[data-head="place"]').checked = pOn;
      q("[data-only]").checked = c.place.only;
      qa("[data-plabel]").forEach(l => (l.style.opacity = c.place.on ? 1 : 0.5));
      ["top", "rest", "pages"].forEach(k => {
        qa(`[data-num^="${k}."]`).forEach(el => (el.disabled = c.place.only));
        const e = errOf(c.place[k]); q(`[data-err="${k}"]`).hidden = !e; qa(`[data-num^="${k}."]`).forEach(el => el.classList.toggle("bad", e));
      });
      // targets
      const opts = tgtOpts();
      c.targets = c.targets.filter(t => opts.includes(t));
      const tAll = c.targets.length === opts.length, tSome = c.targets.length > 0, only = c.targets.length === 1 ? c.targets[0] : null;
      const th = q('[data-head="targets"]'); th.checked = tAll; th.indeterminate = tSome && !tAll;
      q("[data-autorow]").hidden = !sp;
      qa("[data-tgt]").forEach(cb => { const t = cb.dataset.tgt; cb.checked = c.targets.includes(t); cb.disabled = (!tSome) || only === t; });
      [["kw", "Keywords"], ["pr", "Products"]].forEach(([k, t]) => {
        qa(`[data-num^="${k}."]`).forEach(el => (el.disabled = !tSome || !c.targets.includes(t)));
        const e = c.targets.includes(t) && errOf(c[k]); q(`[data-err="${k}"]`).hidden = !e; qa(`[data-num^="${k}."]`).forEach(el => el.classList.toggle("bad", e));
      });
      // match type
      q('[data-head="match"]').checked = c.match.on;
      q("[data-matchlabel]").innerHTML = c.match.value == null ? '<span class="ph">Select match type</span>' : esc(MATCH_LIST[c.match.value]);
      // section open = section ticked
      const open = { bidding: bSome, place: pOn, targets: tSome, match: c.match.on };
      Object.entries(open).forEach(([k, on]) => { q(`[data-body="${k}"]`).hidden = !on; q(`[data-title="${k}"]`).classList.toggle("collapsed", !on); });
      // colour, description, name
      q("[data-dot]").style.background = st.color;
      q('[data-body="desc"]').hidden = !descOpen;
      q('[data-title="desc"]').classList.toggle("collapsed", !descOpen);
      q("[data-descexp] svg").setAttribute("class", descOpen ? "rot-up" : "rot-down");
      q("[data-clear]").hidden = !q("[data-name]").value;
      q("[data-submit]").disabled = !valid();
    };
    const dropdown = (btn, html, onPick) => {
      qa(".sg-pop").forEach(p => p.remove());
      const pop = document.createElement("div");
      pop.className = "sg-pop"; pop.setAttribute("role", "listbox"); pop.innerHTML = html;
      btn.parentElement.appendChild(pop);
      pop.addEventListener("click", e => { const o = e.target.closest("[data-v]"); if (o) { onPick(o.dataset.v); pop.remove(); paint(); btn.focus(); } });
      pop.querySelector(".on")?.scrollIntoView({ block: "nearest" });
    };
    const close = () => { w.remove(); document.body.classList.remove("om-lock"); };
    w.addEventListener("mousedown", e => { if (!e.target.closest(".sg-pop, .sg-select")) qa(".sg-pop").forEach(p => p.remove()); });
    w.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("[data-cancel]")) { close(); return; }
      if (t.closest("[data-clear]")) { q("[data-name]").value = ""; paint(); q("[data-name]").focus(); }
      if (t.closest("[data-descexp]")) { descOpen = !descOpen; paint(); }
      const mb = t.closest("[data-matchbtn]");
      if (mb) {
        if ($(".sg-pop", mb.parentElement)) { $(".sg-pop", mb.parentElement).remove(); return; }
        let i = 0;
        dropdown(mb, MATCHES.map(g => `<div class="sg-group">${g.map(l => { const v = i++; return `<button type="button" role="option" data-v="${v}" class="${c.match.value === v ? "on" : ""}">${l}</button>`; }).join("")}</div>`).join(""), v => { c.match.value = +v; });
      }
      const cb = t.closest("[data-colorbtn]");
      if (cb) {
        if ($(".sg-pop", cb.parentElement)) { $(".sg-pop", cb.parentElement).remove(); return; }
        dropdown(cb, COLORS.map(col => `<button type="button" role="option" aria-label="Color ${col}" data-v="${col}" class="${st.color === col ? "on" : ""}"><span class="sg-dot" style="background:${col}"></span></button>`).join(""), v => { st.color = v; });
        $(".sg-pop", cb.parentElement).classList.add("colors");
      }
      if (t.closest("[data-sigdel]")) deleteSignal(s, () => { close(); onSaved(); });
    });
    w.addEventListener("change", e => {
      const t = e.target;
      if (t.name === "adType") {
        st.type = t.value;
        c.place = { on: false, only: false, top: [null, null], rest: [null, null], pages: [null, null] };
        qa('[data-num^="top."],[data-num^="rest."],[data-num^="pages."]').forEach(el => (el.value = ""));
        if (st.type === "SD") c.match = { on: false, value: 0 };
      }
      const hd = t.dataset.head;
      if (hd === "bidding") c.bidding = t.checked ? BIDS_OPTS.map(o => o[0]) : [];
      if (hd === "place") {
        c.place.on = t.checked;
        if (t.checked) c.place.only = false; else c.place.only = false;
      }
      if (hd === "targets") {
        c.targets = t.checked ? tgtOpts() : [];
        if (!t.checked) { c.kw = [null, null]; c.pr = [null, null]; qa('[data-num^="kw."],[data-num^="pr."]').forEach(el => (el.value = "")); }
      }
      if (hd === "match") c.match.on = t.checked;
      if (t.dataset.bid) { const v = +t.dataset.bid; c.bidding = t.checked ? [...c.bidding, v] : c.bidding.filter(x => x !== v); }
      if (t.matches("[data-only]")) {
        c.place.only = t.checked;
        if (t.checked) {
          c.place.on = false;
          ["top", "rest", "pages"].forEach(k => (c.place[k] = [null, null]));
        } else {
          c.place.on = true;
          ["top", "rest", "pages"].forEach(k => (c.place[k] = [...saved.place[k]]));
        }
        ["top", "rest", "pages"].forEach(k => [0, 1].forEach(i => (q(`[data-num="${k}.${i}"]`).value = c.place[k][i] ?? "")));
      }
      if (t.dataset.tgt) {
        const tg = t.dataset.tgt;
        c.targets = t.checked ? [...c.targets, tg] : c.targets.filter(x => x !== tg);
        const k = tg === "Keywords" ? "kw" : tg === "Products" ? "pr" : null;
        if (k) { c[k] = t.checked ? [...saved[k]] : [null, null]; [0, 1].forEach(i => (q(`[data-num="${k}.${i}"]`).value = c[k][i] ?? "")); }
      }
      paint();
    });
    w.addEventListener("input", e => {
      if (e.target.type === "checkbox" || e.target.type === "radio") return; // handled on change
      const n = e.target.closest("[data-num]");
      if (n) {
        const min = +n.min, max = +n.max;
        let v = n.value === "" ? null : Math.round(+n.value);
        if (v != null && (Number.isNaN(v) || v < min || v > max)) { v = Number.isNaN(v) ? null : Math.min(max, Math.max(min, v)); }
        setNum(n.dataset.num, v);
        const k = n.dataset.num.split(".")[0];
        if (k === "kw" || k === "pr") saved[k] = [...c[k]]; else saved.place[k] = [...c.place[k]];
      }
      paint();
    });
    w.addEventListener("focusout", e => { const n = e.target.closest("[data-num]"); if (n) n.value = getNum(n.dataset.num) ?? ""; });
    w.addEventListener("keydown", e => {
      if (e.key === "Escape") { if (qa(".sg-pop").length) { qa(".sg-pop").forEach(p => p.remove()); } else close(); e.preventDefault(); }
      if (e.key === "Tab") {
        const fo = qa("button,input,select,textarea,[tabindex='0']").filter(el => !el.disabled && el.getClientRects().length);
        if (e.shiftKey && document.activeElement === fo[0]) { e.preventDefault(); fo.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === fo.at(-1)) { e.preventDefault(); fo[0].focus(); }
      }
    });
    f.addEventListener("submit", e => {
      e.preventDefault(); paint(); if (!valid()) return;
      const vals = { name: q("[data-name]").value.trim(), type: st.type, desc: q("[data-desc]").value.trim(), color: st.color, cfg: c };
      const list = signals();
      if (editing) Object.assign(list.find(x => x._k === s._k), vals); else list.push({ _k: `u${Date.now()}`, used: 0, ...vals });
      save(SIG_KEY, list); close(); onSaved();
      SP.toast(editing ? "Ad group signal updated successfully." : "Ad group signal created successfully.");
    });
    document.body.appendChild(w);
    document.body.classList.add("om-lock");
    paint();
    (editing ? q("[data-name]") : q("input[name=adType]:checked")).focus();
  }

  function deleteSignal(s, after) {
    const d = openDialog({
      title: "Delete ad group signal", width: 500,
      body: s.used > 0 ? `<div class="om-pad">This signal is currently used by ${s.used} <b>Scale Optimizers</b>.<br>Deleting it will remove it from all of them.<br> Do you want to continue?</div>` : "",
      foot: `<div class="om-pair">${BTN("ob-sec", "Cancel", "data-omclose")}${BTN("ob-danger", "Delete", "data-ok")}</div>`,
    });
    $("[data-ok]", d).addEventListener("click", () => {
      save(SIG_KEY, signals().filter(x => x._k !== s._k));
      OPTS.forEach(o => { o.signals = (o.signals || []).filter(k => k !== s._k); }); saveOpts();
      d.close(); after(); SP.toast("Ad group signal deleted successfully.");
    });
  }

  SP.pages["/AdGroupSignals"] = {
    title: "Ad group signals", noSub: true, section: "optimizer", icon: "signal", iconColor: "#6c757d",
    render() {
      return `<div class="sig-page">${SP.note("Note: Ad Group Signals help you get more accurate, targeted rule recommendations by identifying key ad group characteristics.")}
        <div class="sig-create"><button type="button" class="btn-soft" data-newsig>${svg(I.plus)}Create new</button></div>
        ${SP.grid({ id: "sig", agPager: true, pageSize: 20, columns: true, cls: "ag", sortKey: "used",
          cols: [
            { key: "_k", label: "Actions", sort: false, fmt: k => `<span class="rowacts"><button type="button" class="ic-round" data-editsig="${k}" aria-label="Edit">${svg(I.pencil)}</button><button type="button" class="ic-round" data-delsig="${k}" aria-label="Delete">${svg(I.trash)}</button></span>` },
            { key: "name", label: `<span class="sg-th">Ad group signal${info("Ad Group Signals help you get more accurate, targeted rule recommendations by identifying key ad group characteristics.", true)}</span>`, w: 230, sort: false },
            { key: "type", label: "Ad type", filter: true, sort: false },
            { key: "used", label: "Used by optimizers", align: "r", filter: true },
            { key: "desc", label: "Description", filter: true, w: 420 },
          ],
          rows: signals() })}</div>`;
    },
    wire(root) {
      const g = SP._grids.sig;
      const reload = () => { g.rows = signals(); SP.refreshGrid("sig"); };
      root.addEventListener("click", e => {
        if (e.target.closest("[data-newsig]")) signalEditor(null, reload);
        const ed = e.target.closest("[data-editsig]"); if (ed) signalEditor(signals().find(x => x._k === ed.dataset.editsig), reload);
        const d = e.target.closest("[data-delsig]"); if (d) deleteSignal(signals().find(x => x._k === d.dataset.delsig), reload);
      });
    },
  };
})();
