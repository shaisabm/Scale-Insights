(() => {
  "use strict";

  // ---------- Icons (simple line drawings, one per section) ----------
  const ICONS = {
    dashboard: '<circle cx="12" cy="12" r="9.5"/><path d="M12 12l3.5-4"/><circle cx="12" cy="12" r="1.3" class="fill"/><path d="M7 13h1.5M12 6.5V8M16 13h1.5"/>',
    sales: '<path d="M2.5 4h2.5l2.2 10.5h11l2-7.5H6.2"/><circle cx="9" cy="18.5" r="1.4"/><circle cx="17" cy="18.5" r="1.4"/><path d="M1.5 8h3M1 11h3.5"/>',
    products: '<path d="M4 9l8-4 8 4-8 4z"/><path d="M4 9v7l8 4 8-4V9"/><path d="M12 13v7M2.5 6.5l3 2M21.5 6.5l-3 2"/>',
    restock: '<path d="M2.5 6h11v10h-11zM13.5 9.5h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/><path d="M5 9h5M5 12h4"/>',
    keyword: '<rect x="3" y="14" width="5" height="6" rx="1"/><rect x="9.5" y="9" width="5" height="11" rx="1"/><rect x="16" y="15" width="5" height="5" rx="1"/><circle cx="12" cy="5" r="2"/>',
    ads: '<path d="M9 17h6M10 20h4"/><path d="M12 4a5.5 5.5 0 0 0-3.2 10c.3.3.7 1 .7 1.6V17h5v-1.4c0-.6.4-1.3.7-1.6A5.5 5.5 0 0 0 12 4z"/><path d="M3 9h1.5M19.5 9H21M5 3.5l1 1M19 3.5l-1 1"/>',
    automation: '<rect x="4" y="8" width="16" height="11" rx="3"/><circle cx="9" cy="13" r="1.6"/><circle cx="15" cy="13" r="1.6"/><path d="M12 8V5M10.5 4h3M2 12v3M22 12v3M10 16.5h4"/>',
    mass: '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/>',
    strategy: '<path d="M2 9l10-4.5L22 9l-10 4.5z"/><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6"/>',
  };
  const svg = (body, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${body}</svg>`;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- Dates ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const longDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const shortDate = d => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}`;

  // ---------- Sample data (invented, not the account's real numbers) ----------
  const money = v => (v < 0 ? `($${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const pct = v => `${v.toFixed(1)}%`;

  const PERIODS = [
    { key: "today", title: "Today", color: "#4796E0", from: 0, to: 0, sales: 64.5, pl: -18.4, fees: 0, orders: [2, 2, 0], ppc: [1, 1], ad: -28.7, payout: -2.15, roi: -84.2, margin: -28.5, acos: 132.4, tacos: 44.5 },
    { key: "yesterday", title: "Yesterday", color: "#32A6A6", from: -1, to: -1, sales: 96.4, pl: -61.3, fees: 0, orders: [4, 4, 1], ppc: [2, 2], ad: -92.1, payout: -41.8, roi: -210.6, margin: -63.6, acos: 181.2, tacos: 95.5 },
    { key: "d7", title: "7 Days", color: "#D2B934", from: -7, to: -1, sales: 212.8, pl: -288.4, fees: 0, orders: [9, 9, 2], ppc: [4, 4], ad: -301.5, payout: -244.9, roi: -402.3, margin: -135.5, acos: 341.8, tacos: 141.7, cls: "p7" },
    { key: "d30", title: "30 Days", color: "#AB60DA", from: -30, to: -1, sales: 2240.6, pl: -1384.1, fees: 0, orders: [92, 95, 7], ppc: [47, 48], ad: -1126.3, payout: -702.6, roi: -148.9, margin: -61.8, acos: 96.4, tacos: 50.3 },
  ];

  const PRODUCTS = [
    { id: "SKU-A1", sku: "DEMO-01-BLU", title: "Weighted Training Rope, 30 ft, Blue", stock: 140, supply: "70d", base: { orders: 2, units: 2, sales: 39.98, profits: 1.42, ads: 4.8, acos: 19.4, tacos: 12.0, organic: 1, promo: 1, ppcSales: 19.99, ppcOrders: 1, ppcUnits: 1, roi: 7.1, margin: 3.6, velocity: 2.1, payout: 21.55, plUnit: 0.71 } },
    { id: "SKU-B2", sku: "DEMO-02-GRY", title: "Weighted Training Rope, 40 ft, Grey", stock: 72, supply: "75d", base: { orders: 1, units: 1, sales: 24.5, profits: -19.82, ads: 23.9, acos: 0, tacos: 97.6, organic: 1, promo: 0, ppcSales: 0, ppcOrders: 0, ppcUnits: 0, roi: -80.9, margin: -80.9, velocity: 0.9, payout: -2.6, plUnit: -19.82 } },
    { id: "SKU-C3", sku: "DEMO-03-RED", title: "Adjustable Jump Rope with Counter", stock: 210, supply: "120d", base: { orders: 1, units: 1, sales: 14.99, profits: 2.12, ads: 1.4, acos: 9.3, tacos: 9.3, organic: 0, promo: 0, ppcSales: 14.99, ppcOrders: 1, ppcUnits: 1, roi: 16.4, margin: 14.1, velocity: 0.5, payout: 8.4, plUnit: 2.12 } },
  ];
  const PERIOD_SCALE = { today: [1, 2, 0], yesterday: [2, 1, 1], d7: [4, 3, 2], d14: [8, 5, 3], d30: [19, 14, 6], bydate: [19, 14, 6], fees: [0, 0, 0] };

  const RECS = [
    { title: "Negate No Sale Bleeders on keyword", term: "training rope", clicks: 34, orders: 0 },
    { title: "Negate No Sale Bleeders on keyword", term: "battle rope set", clicks: 27, orders: 0 },
    { title: "Negate No Sale Bleeders on keyword", term: "home gym rope", clicks: 22, orders: 0 },
  ];

  // ---------- Side rail ----------
  const SP = window.SP;
  const rail = $("#rail"), scrim = $("#scrim"), toggle = $("#menu-toggle");
  $("#rail-list").innerHTML = SP.NAV.map(n => `
    <li class="rail-item" data-id="${n.id}">
      <a href="${n.path}" title="${n.name}">
        <span class="rail-icon" style="color:${n.color}">${svg(ICONS[n.id] || SP.ICON[n.id] || "")}</span>
        <span class="rail-text label"><b>${n.name}</b><small>${n.desc}</small></span>
      </a>
    </li>`).join("");

  const isPhone = () => matchMedia("(max-width: 767.98px)").matches;
  function setDrawer(open) {
    rail.classList.toggle("open", open);
    scrim.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", () => setDrawer(!rail.classList.contains("open")));
  scrim.addEventListener("click", () => setDrawer(false));
  rail.addEventListener("mouseenter", () => { if (!isPhone()) setDrawer(true); });
  rail.addEventListener("mouseleave", () => { if (!isPhone()) setDrawer(false); });
  rail.addEventListener("click", e => { if (e.target.closest(".rail-item a")) setDrawer(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { setDrawer(false); closePops(); } });

  // ---------- User menu & popovers ----------
  const userBtn = $("#user-btn"), userMenu = $("#user-menu");
  $("#logout").addEventListener("click", async e => {
    e.preventDefault();
    try { await SP.api.post("/api/logout"); } catch { /* the cookie is cleared or already gone */ }
    location.assign(SP.signInPath);
  });

  // ---------- Real data switch (preview deployments and local development only) ----------
  if (SP.canSwitchData) {
    const sw = document.createElement("label");
    sw.className = "switch data-switch";
    sw.title = "Show live data from your Amazon account instead of sample data. Needs sign-in.";
    sw.innerHTML = `<input type="checkbox" ${SP.usesRealData() ? "checked" : ""}><span class="track"></span>Real data`;
    $(".topbar-right").prepend(sw);
    sw.querySelector("input").addEventListener("change", e => { SP.setRealData(e.target.checked); route(); });
  }
  userBtn.addEventListener("click", e => {
    e.stopPropagation();
    const open = userMenu.hidden;
    closePops();
    userMenu.hidden = !open;
    userBtn.setAttribute("aria-expanded", String(open));
  });
  function closePops() {
    userMenu.hidden = true;
    userBtn.setAttribute("aria-expanded", "false");
    SP.closePops();
  }
  document.addEventListener("click", e => { if (!e.target.closest(".popover, .menu")) closePops(); });

  function popover(anchor, items, onPick) {
    closePops();
    const pop = document.createElement("div");
    pop.className = "popover";
    pop.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.on ? "on" : ""}">${it.label}</button>`).join("");
    pop.style.top = `${anchor.offsetHeight + 6}px`;
    pop.style.left = "0";
    pop.style.minWidth = `${anchor.offsetWidth}px`;
    anchor.parentElement.appendChild(pop);
    pop.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      e.stopPropagation(); onPick(items[+b.dataset.i]); pop.remove();
    });
  }

  // ---------- Dashboard view ----------
  const state = { range: 30, products: [], tab: "today", sort: { key: "profits", dir: -1 }, query: "", series: { tacos: true, ppc: true, organic: true }, bucket: "days" };

  function cardHTML(p) {
    const from = addDays(today, p.from), to = addDays(today, p.to);
    const dateText = p.from === p.to ? longDate(from) : `${longDate(from)} —<br>${longDate(to)}`;
    const sign = v => (v < 0 ? "neg" : "");
    return `
      <div class="${p.cls || ""}">
        <div class="dash-card">
          <div class="dash-card-head" style="border-bottom-color:${p.color}">
            <div class="head-left">
              <div><h4 style="color:${p.color}">${p.title}</h4><p>${dateText}</p></div>
              <div><div class="card-text">Account fees</div><div class="head-value">${money(p.fees)}</div></div>
            </div>
            <div class="head-left right">
              <div><div class="card-text">Sales</div><div class="head-value pos-sales">${money(p.sales)}</div></div>
              <div><div class="card-text">Overall P&amp;L</div><div class="head-value ${sign(p.pl)}">${money(p.pl)}</div></div>
            </div>
          </div>
          <div class="dash-card-body">
            <div class="col">
              <div class="card-text">Orders / Units / Refunds</div><div class="val">${p.orders.join(" / ")}</div>
              <div class="card-text">PPC Orders / PPC Units</div><div class="val">${p.ppc.join(" / ")}</div>
              <div class="card-text">Advertising Cost</div><div class="val">${money(p.ad)}</div>
              <div class="card-text">Est. Payout</div><div class="val ${sign(p.payout)}">${money(p.payout)}</div>
            </div>
            <div class="col right">
              <div class="card-text">ROI</div><div class="val ${sign(p.roi)}">${pct(p.roi)}</div>
              <div class="card-text">Margin</div><div class="val ${sign(p.margin)}">${pct(p.margin)}</div>
              <div class="card-text">ACOS</div><div class="val">${pct(p.acos)}</div>
              <div class="card-text">TACOS</div><div class="val">${pct(p.tacos)}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function recHTML(r, i) {
    return `
      <div class="opt-card" data-rec="${i}">
        <div class="opt-head" title="${r.title}">${r.title}</div>
        <div class="opt-summary"><b>${r.term}</b><br>${r.clicks} clicks<br>${r.orders} orders</div>
        <div class="opt-action">Add keyword <b>as negative exact</b>
          <div class="opt-buttons"><button class="btn-dark fix">Fix once</button><button class="btn-outline details">See Details</button></div>
        </div>
      </div>`;
  }

  function dashboardHTML() {
    const start = addDays(today, -state.range + 1);
    return `
      <div class="toolbar-row">
        <div class="filters">
          <div class="anchor"><button class="date-btn" id="date-btn">
            ${svg('<rect x="4" y="5" width="16" height="15" rx="2" class="fill"/><path d="M8 3v4M16 3v4" />')}
            <span id="date-label">${shortDate(start)} - ${shortDate(today)}</span><span class="caret"></span></button></div>
          <div class="anchor"><button class="select" id="product-btn"><span id="product-label">Select products</span><span class="caret"></span></button></div>
          <button class="btn-dark" id="apply">Apply filter</button>
        </div>
        <div class="auto-strip">
          <div class="robot">${svg(ICONS.automation)}</div>
          <div class="stat"><div class="stat-label">Saved by automations</div><div class="stat-value">$0.00 USD</div></div>
          <div class="stat"><div class="stat-label">Time saved</div><div class="stat-value">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}0m 00s</div></div>
          <div class="stat"><div class="stat-label">Apply automations to start saving</div>
            <a class="stat-link" href="/ScaleOptimizer">See ${RECS.length * 8 + 2} suggested optimizations ${svg('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a></div>
        </div>
      </div>

      <div class="sales-cards">${PERIODS.map(cardHTML).join("")}</div>

      <section class="section" id="sec-opt">
        <div class="section-head">
          <button class="collapse" aria-label="Collapse Optimizer" aria-expanded="true"></button>
          <h2>Optimizer</h2>
          <a class="btn-outline linkbtn" href="/ScaleOptimizer">Customize</a>
          <span class="hint">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.2"/>')}Recommendations refresh daily.</span>
        </div>
        <div class="section-body"><div class="opt-cards">${RECS.map(recHTML).join("")}</div></div>
      </section>

      <section class="section" id="sec-perf">
        <div class="section-head">
          <button class="collapse" aria-label="Collapse Performance & activity" aria-expanded="true"></button>
          <h2>Performance &amp; activity</h2>
        </div>
        <div class="section-body">
          <div class="chart-controls pc-toolbar">
            <div class="chips pc-left" id="chips"></div>
            <div class="pc-gran" id="bucket" role="radiogroup" aria-label="Granularity">
              <button type="button" data-b="day">Days</button><button type="button" data-b="week">Weeks</button><button type="button" data-b="month">Months</button>
            </div>
          </div>
          <div class="pc-wrap" id="chart-wrap">
            <svg class="chart pc-main" id="chart" role="img" aria-label="Performance chart"></svg>
            <svg class="pc-rules" id="chart-rules" role="img" aria-label="Rule and strategy activity"></svg>
            <div class="pc-tip" id="chart-tip" role="tooltip" hidden></div>
          </div>
          <div class="legend"><span style="--c:#FFC107">Rule/Strategy assigned</span><span style="--c:#FF8B07">Rule/Strategy edited</span></div>
        </div>
      </section>

      <div class="tabs-wrap">
        <div class="tabs" role="tablist" id="tabs">
          ${[["today", "Today"], ["yesterday", "Yesterday"], ["d7", "7 Days"], ["d14", "14 Days"], ["d30", "30 Days"], ["bydate", "Sales by date"], ["fees", "Account-level fees"]]
            .map(([k, l]) => `<button role="tab" data-tab="${k}" class="${k === state.tab ? "on" : ""}">${l}</button>`).join("")}
        </div>
        <div class="grid-tools">
          <label class="instant">${svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>')}<input id="instant" placeholder="Instant search" aria-label="Instant search"></label>
          <button class="plain-btn">${svg('<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M9 5v14M15 5v14"/>')}Columns</button>
          <button class="btn-dark" id="download">Download</button>
        </div>
        <div class="table-scroll"><table id="grid"></table></div>
        <div class="grid-foot" id="grid-foot"></div>
        <div class="updated">Updated just now - Processed: 0 ms</div>
      </div>`;
  }

  // ---------- Chart (Performance & activity) ----------
  // Metrics, presets and limits follow the original: up to 5 metrics, presets swap the set,
  // and any manual add/remove switches back to "Custom", which remembers its own set.
  const METRICS = {
    sales: { label: "Sales (includes PPC & Organic)", chip: "Sales", color: "#2C4BDB", kind: "currency" },
    profits: { label: "Profits", color: "#F59E0B", kind: "currency" },
    ppcSales: { label: "PPC Sales", color: "#7986CB", kind: "currency" },
    organicSales: { label: "Organic sales", color: "#26C6DA", kind: "currency" },
    costs: { label: "PPC cost", color: "#EC4899", kind: "currency" },
    margin: { label: "Margin", color: "#22C55E", kind: "percent" },
    fbaFees: { label: "FBA fees", color: "#8B5CF6", kind: "currency" },
    refunds: { label: "Refunds", color: "#EF4444", kind: "currency" },
    totalUnits: { label: "Total units", color: "#475569", kind: "count" },
    organicUnits: { label: "Organic units", color: "#827717", kind: "count" },
    promotionUnits: { label: "Promotion units", color: "#9CCC65", kind: "count" },
    sessions: { label: "Sessions", color: "#26A69A", kind: "count" },
    conversions: { label: "Conversions", color: "#67E8F9", kind: "percent" },
    ppcClicks: { label: "PPC Clicks", color: "#2E7D32", kind: "count" },
    avgOrder: { label: "Average order", color: "#B91C1C", kind: "currency" },
    acos: { label: "ACOS", color: "#0D6EFD", kind: "percent", dashed: true },
    tacos: { label: "TACOS", color: "#A78BFA", kind: "percent", dashed: true },
  };
  const PRESETS = {
    custom: { label: "Custom", metrics: null },
    salesDist: { label: "Sales distribution", metrics: ["sales", "ppcSales", "organicSales"] },
    plDist: { label: "P&L distribution", metrics: ["sales", "profits", "costs", "fbaFees", "refunds"] },
    units: { label: "Units", metrics: ["totalUnits", "organicUnits", "promotionUnits"] },
    sessions: { label: "Sessions", metrics: ["sessions", "conversions"] },
    ppc: { label: "PPC", metrics: ["costs", "ppcClicks", "acos", "tacos"] },
  };
  const MAX_METRICS = 5;
  /** @type {[string, string, number, number][]} */
  const GRAN = [["day", "Days", 1, 62], ["week", "Weeks", 14, 210], ["month", "Months", 32, Infinity]];
  const RULE = { ruleAssigned: ["Rule/Strategy assigned", "#FFC107"], ruleEdited: ["Rule/Strategy edited", "#FF8B07"] };
  const SUMS = ["sales", "ppcSales", "organicSales", "costs", "vatTax", "refunds", "totalUnits", "organicUnits", "promotionUnits", "ppcClicks", "profits", "fbaFees", "sessions", "ruleAssigned", "ruleEdited"];
  const DEFAULT_SET = ["tacos", "ppcSales", "organicSales"];
  const chart = { preset: "custom", metrics: [...DEFAULT_SET], custom: [...DEFAULT_SET], gran: "day" };

  // Sample daily figures (invented, deterministic).
  const DAYS = 30;
  const DAILY = (() => {
    let s = 20251;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const out = [];
    for (let i = 0; i < DAYS; i++) {
      const date = addDays(today, -DAYS + i);
      const ppcSales = r() < 0.18 ? 0 : Math.round(20 + r() * 160);
      let organicSales = r() < 0.4 ? 0 : Math.round(r() * 120);
      if (i === 18) organicSales = 760;
      const sales = ppcSales + organicSales, costs = ppcSales ? Math.round(ppcSales * (0.25 + r() * 0.9)) : Math.round(r() * 15);
      const totalUnits = Math.round(sales / 24.99), promotionUnits = Math.round(totalUnits * r() * 0.3);
      const fbaFees = Math.round(totalUnits * 8.27), refunds = r() < 0.15 ? 24.99 : 0, vatTax = 0;
      const sessions = Math.round(30 + r() * 90);
      out.push({ date, sales, ppcSales, organicSales, costs, vatTax, refunds, fbaFees, totalUnits, organicUnits: Math.max(0, totalUnits - Math.round(ppcSales / 24.99)), promotionUnits,
        profits: Math.round(sales - fbaFees - costs - totalUnits * 8.5 - refunds), sessions, ppcClicks: Math.round(costs / (0.7 + r() * 0.5)),
        ruleAssigned: r() < 0.1 ? 1 : 0, ruleEdited: r() < 0.08 ? 1 : 0 });
    }
    return out;
  })();
  const withRatios = p => ({
    ...p,
    acos: p.ppcSales > 0 ? p.costs / p.ppcSales : null,
    tacos: p.sales - p.vatTax > 0 ? p.costs / (p.sales - p.vatTax) : null,
    margin: p.sales > 0 ? p.profits / p.sales : null,
    conversions: p.sessions > 0 ? p.totalUnits / p.sessions : null,
    avgOrder: p.totalUnits > 0 ? p.sales / p.totalUnits : null,
  });
  // Weeks and months add up the totals and recompute the ratios from them.
  function chartData() {
    if (chart.gran === "day") return DAILY.map(withRatios);
    const groups = new Map();
    for (const d of DAILY) {
      const start = new Date(d.date);
      if (chart.gran === "week") start.setDate(start.getDate() - start.getDay()); else start.setDate(1);
      const k = start.toDateString();
      if (!groups.has(k)) groups.set(k, { date: start, ...Object.fromEntries(SUMS.map(m => [m, 0])) });
      const g = groups.get(k);
      for (const m of SUMS) g[m] += d[m];
    }
    return [...groups.values()].map(withRatios);
  }
  const granAllowed = g => { const [, , min, max] = GRAN.find(x => x[0] === g); return DAYS >= min && DAYS <= max; };
  const metricLine = m => `<span class="pc-line" style="background:${m.dashed ? `repeating-linear-gradient(to right, ${m.color} 0 4px, transparent 4px 7px)` : m.color}"></span>`;
  const fmtKind = (v, kind) => (v == null ? "-" : kind === "currency" ? money(v) : kind === "percent" ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString("en-US"));
  const niceMax = v => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };
  const dateLabel = d => (chart.gran === "month" ? `${SP.MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : `${d.getMonth() + 1}/${d.getDate()}`);

  function drawChart() {
    const el = $("#chart"), rules = $("#chart-rules"); if (!el || !rules) return;
    const data = chartData(), n = data.length;
    const kinds = [...new Set(chart.metrics.map(k => METRICS[k].kind))];
    const left = kinds.filter(k => k !== "count"), countRight = kinds.includes("count") && left.length > 0;
    const leftAxes = [...left, ...(kinds.includes("count") && !countRight ? ["count"] : [])];
    const AX = 50, W = el.clientWidth || 1300, H = el.clientHeight || 320, Hr = rules.clientHeight || 175;
    const L = Math.max(AX, leftAxes.length * AX), R = 40 + (countRight ? AX : 0), T = 10, B = 6;
    const max = {};
    for (const k of kinds) max[k] = niceMax(Math.max(0, ...chart.metrics.filter(m => METRICS[m].kind === k).flatMap(m => data.map(d => d[m] ?? 0))) * 1.05);
    const step = n > 1 ? (W - L - R) / n : W - L - R, x = i => L + step * (i + 0.5);
    const y = (v, k) => T + (H - T - B) * (1 - v / max[k]);
    const axisLabel = (v, k) => (k === "currency" ? (v >= 1000 ? `$${+(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`) : k === "percent" ? `${Math.round(v * 1000) / 10}%` : Math.round(v).toLocaleString("en-US"));
    let out = "";
    const ticks = 5;
    for (let t = 0; t <= ticks; t++) {
      const yy = T + (H - T - B) * (1 - t / ticks);
      out += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#E9ECEF"/>`;
      leftAxes.forEach((k, i) => { out += `<text x="${L - leftAxes.length * AX + i * AX + AX - 8}" y="${yy + 4}" text-anchor="end">${axisLabel((max[k] * t) / ticks, k)}</text>`; });
      if (countRight) out += `<text x="${W - R + 8}" y="${yy + 4}">${axisLabel((max.count * t) / ticks, "count")}</text>`;
    }
    for (const key of chart.metrics) {
      const m = METRICS[key];
      let path = "", pen = false;
      data.forEach((d, i) => {
        const v = d[key];
        if (v == null) { pen = false; return; }
        path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v, m.kind).toFixed(1)}`; pen = true;
      });
      out += `<path d="${path}" stroke="${m.color}" stroke-width="2" fill="none" ${m.dashed ? 'stroke-dasharray="4 3"' : ""}/>`;
    }
    out += `<line class="pc-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#adb5bd" visibility="hidden"/>`;
    out += chart.metrics.map(k => `<circle class="pc-dot" data-m="${k}" r="4" fill="#fff" stroke="${METRICS[k].color}" stroke-width="3" visibility="hidden"/>`).join("");
    el.setAttribute("viewBox", `0 0 ${W} ${H}`);
    el.innerHTML = out;

    // Rule/Strategy activity bars, sharing the x positions, with the date labels.
    const rMax = niceMax(Math.max(1, ...data.map(d => d.ruleAssigned + d.ruleEdited)));
    const RT = 14, RB = 34, ry = v => RT + (Hr - RT - RB) * (1 - v / rMax);
    let rout = "";
    for (const v of [0, rMax]) { const yy = ry(v); rout += `<text x="${L - 8}" y="${yy + 4}" text-anchor="end">${Math.round(v)}</text>`; }
    const bw = Math.max(4, step * 0.6);
    data.forEach((d, i) => {
      let base = 0;
      for (const k of ["ruleAssigned", "ruleEdited"]) {
        if (!d[k]) continue;
        rout += `<rect x="${x(i) - bw / 2}" y="${ry(base + d[k])}" width="${bw}" height="${ry(base) - ry(base + d[k])}" fill="${RULE[k][1]}"/>`;
        base += d[k];
      }
      const every = W < 700 ? Math.ceil(n / 8) : 1;
      if (i % every === 0) rout += `<text x="${x(i)}" y="${Hr - 10}" text-anchor="middle">${dateLabel(d.date)}</text>`;
    });
    rules.setAttribute("viewBox", `0 0 ${W} ${Hr}`);
    rules.innerHTML = rout;
    chart._geo = { L, R, W, step, n, data, y, x };
  }

  function renderChips() {
    const box = $("#chips"); if (!box) return;
    const full = chart.metrics.length >= MAX_METRICS;
    box.innerHTML = `<div class="anchor pc-preset"><button type="button" class="pc-preset-btn" id="pc-preset" aria-haspopup="listbox">${PRESETS[chart.preset].label}<span class="pc-caret"></span></button></div>
      <div class="pc-chips">${chart.metrics.map(k => { const m = METRICS[k]; return `<span class="pc-chip">${metricLine(m)}<span>${m.chip || m.label}</span>${chart.metrics.length > 1 ? `<button type="button" class="pc-x" data-rm="${k}" aria-label="Remove ${m.chip || m.label}">✕</button>` : ""}</span>`; }).join("")}</div>
      <div class="anchor"><button type="button" class="pc-add" id="chip-add" aria-label="Add metric" ${full ? "disabled" : ""}>+</button></div>`;
    $$("#bucket button").forEach(b => { b.disabled = !granAllowed(b.dataset.b); b.classList.toggle("on", b.dataset.b === chart.gran); });
  }
  const setPreset = key => {
    const keep = chart.preset === "custom" ? chart.metrics : chart.custom;
    chart.custom = [...keep];
    chart.metrics = [...(PRESETS[key].metrics || keep)];
    chart.preset = key;
  };
  const toCustom = list => { chart.metrics = list; chart.custom = [...list]; chart.preset = "custom"; };
  function chartMenu(anchor, html, onPick) {
    $$(".pc-menu").forEach(p => p.remove());
    const pop = document.createElement("div");
    pop.className = "pc-menu"; pop.setAttribute("role", "listbox"); pop.innerHTML = html;
    anchor.parentElement.appendChild(pop);
    pop.addEventListener("click", e => { e.stopPropagation(); const b = e.target.closest("[data-k]"); if (b) { pop.remove(); onPick(b.dataset.k); } });
    const off = e => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener("click", off, true); } };
    setTimeout(() => document.addEventListener("click", off, true));
  }
  function wireChart() {
    $("#chips").addEventListener("click", e => {
      const rm = e.target.closest("[data-rm]");
      if (rm) { toCustom(chart.metrics.filter(k => k !== rm.dataset.rm)); renderChips(); drawChart(); return; }
      const pb = e.target.closest("#pc-preset");
      if (pb) {
        if ($(".pc-menu", pb.parentElement)) { $(".pc-menu", pb.parentElement).remove(); return; }
        chartMenu(pb, Object.entries(PRESETS).map(([k, p]) => `<button type="button" role="option" data-k="${k}" class="${k === chart.preset ? "on" : ""}">${p.label}</button>`).join(""), k => { setPreset(k); renderChips(); drawChart(); });
        return;
      }
      const add = e.target.closest("#chip-add");
      if (add && !add.disabled) {
        if ($(".pc-menu", add.parentElement)) { $(".pc-menu", add.parentElement).remove(); return; }
        const rest = Object.keys(METRICS).filter(k => !chart.metrics.includes(k));
        chartMenu(add, `<div class="pc-hint">You can select up to ${MAX_METRICS} metrics</div>${rest.map(k => `<button type="button" role="option" data-k="${k}" class="pc-opt">${metricLine(METRICS[k])}${METRICS[k].label}</button>`).join("")}`, k => {
          if (chart.metrics.length < MAX_METRICS && !chart.metrics.includes(k)) toCustom([...chart.metrics, k]);
          renderChips(); drawChart();
        });
        $(".pc-menu", add.parentElement).classList.add("metrics");
      }
    });
    $("#bucket").addEventListener("click", e => {
      const b = e.target.closest("button[data-b]"); if (!b || b.disabled) return;
      chart.gran = b.dataset.b; renderChips(); drawChart();
    });
    // Hover: crosshair, dots and a tooltip like the original's; click opens the change history.
    const wrap = $("#chart-wrap"), tip = $("#chart-tip");
    const hit = e => {
      const g = chart._geo; if (!g) return null;
      const svgEl = $("#chart"), r = svgEl.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * g.W;
      if (px < g.L || px > g.W - g.R) return null;
      return Math.max(0, Math.min(g.n - 1, Math.floor((px - g.L) / g.step)));
    };
    wrap.addEventListener("mousemove", e => {
      const i = hit(e), g = chart._geo;
      if (i == null) { tip.hidden = true; $$("#chart .pc-dot, #chart .pc-cross").forEach(n => n.setAttribute("visibility", "hidden")); return; }
      const d = g.data[i], cx = g.x(i);
      const cross = $("#chart .pc-cross"); cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("visibility", "visible");
      $$("#chart .pc-dot").forEach(c => { const m = METRICS[c.dataset.m], v = d[c.dataset.m]; if (v == null) { c.setAttribute("visibility", "hidden"); return; } c.setAttribute("cx", cx); c.setAttribute("cy", g.y(v, m.kind)); c.setAttribute("visibility", "visible"); });
      const when = chart.gran === "day" ? `${SP.MONTHS[d.date.getMonth()].slice(0, 3)} ${d.date.getDate()}, ${d.date.getFullYear()}` : chart.gran === "week" ? `Week of ${SP.MONTHS[d.date.getMonth()].slice(0, 3)} ${d.date.getDate()}, ${d.date.getFullYear()}` : `${SP.MONTHS[d.date.getMonth()]} ${d.date.getFullYear()}`;
      tip.innerHTML = `<div class="pc-tdate">${when}</div>${chart.metrics.map(k => { const m = METRICS[k]; return `<div class="pc-trow">${metricLine(m)}<span class="pc-tl">${m.chip || m.label}</span><b>${fmtKind(d[k] ?? 0, m.kind)}</b></div>`; }).join("")}${Object.entries(RULE).filter(([k]) => d[k] > 0).map(([k, [l, c]]) => `<div class="pc-trow"><span class="pc-tdot" style="background:${c}"></span><span class="pc-tl">${l}</span><b>${d[k]}</b></div>`).join("")}<div class="pc-tfoot">Click to open Change History</div>`;
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect(), tw = tip.offsetWidth, mx = e.clientX - wr.left;
      tip.style.left = `${mx + 16 + tw > wr.width ? Math.max(0, mx - tw - 16) : mx + 16}px`;
      tip.style.top = `${Math.max(0, e.clientY - wr.top - tip.offsetHeight / 2)}px`;
    });
    wrap.addEventListener("mouseleave", () => { tip.hidden = true; $$("#chart .pc-dot, #chart .pc-cross").forEach(n => n.setAttribute("visibility", "hidden")); });
    wrap.addEventListener("click", e => { if (hit(e) != null) window.open("/Ads/Performance", "_blank", "noopener"); });
  }

  // ---------- Table ----------
  const COLS = [
    ["orders", "Orders"], ["units", "Units"], ["sales", "Sales", "usd"], ["profits", "Profits", "usd"], ["ads", "Ads", "usd"], ["acos", "ACOS", "pct2"], ["tacos", "TACOS", "pct"],
    ["organic", "Organic Units"], ["promo", "Promo Units"], ["ppcSales", "PPC Sales", "usd"], ["ppcOrders", "PPC Orders"], ["ppcUnits", "PPC Units"],
    ["roi", "ROI", "pct"], ["margin", "Margin", "pct"], ["velocity", "Velocity"], ["payout", "Payout", "usd"], ["plUnit", "P&L Per Unit", "usd"],
  ];
  const fmt = (v, t) => (v === 0 && t !== "usd" && t !== "pct" && t !== "pct2" ? "" : t === "usd" ? money(v) : t === "pct" ? pct(v) : t === "pct2" ? (v ? `${v.toFixed(2)}%` : "") : String(v));

  /** @returns {any[]} Rows whose fields are filled from COLS at runtime. */
  function rowsFor(tab) {
    const [mult, count, offset] = PERIOD_SCALE[tab];
    if (!count) return [];
    return PRODUCTS.slice(0, Math.min(PRODUCTS.length, count)).map((p, i) => {
      const k = i === 0 ? mult : Math.max(1, Math.round(mult * (0.6 - i * 0.15) + offset * 0.2));
      const r = { ...p };
      for (const [key] of COLS) {
        const b = p.base[key];
        r[key] = ["acos", "tacos", "roi", "margin"].includes(key) ? b : ["sales", "profits", "ads", "ppcSales", "payout"].includes(key) ? Math.round(b * k * 100) / 100 : key === "plUnit" ? b : key === "velocity" ? b : Math.round(b * k);
      }
      return r;
    });
  }

  function renderTable() {
    const grid = $("#grid"); if (!grid) return;
    let rows = rowsFor(state.tab);
    const q = state.query.trim().toLowerCase();
    if (q) rows = rows.filter(r => `${r.title} ${r.id} ${r.sku}`.toLowerCase().includes(q));
    const { key, dir } = state.sort;
    rows.sort((a, b) => (a[key] - b[key]) * dir);
    const sum = {};
    for (const [k] of COLS) sum[k] = rows.reduce((a, r) => a + r[k], 0);
    if (rows.length) {
      sum.acos = sum.ppcSales ? (sum.ads / sum.ppcSales) * 100 : 0;
      sum.tacos = sum.sales ? (sum.ads / sum.sales) * 100 : 0;
      sum.roi = rows.reduce((a, r) => a + r.roi, 0) / rows.length;
      sum.margin = sum.sales ? (sum.profits / sum.sales) * 100 : 0;
      sum.plUnit = sum.units ? sum.profits / sum.units : 0;
    }
    const cell = (r, k, t) => {
      const v = r[k], neg = typeof v === "number" && v < 0 && (k === "profits" || k === "payout" || k === "plUnit" || k === "roi" || k === "margin");
      const red = k === "ads" && v ? "neg" : "";
      if (k === "profits") return `<td class="profit"><span class="dash-u ${neg ? "neg" : "pos-sales"}">${fmt(v, t)}</span></td>`;
      return `<td class="${neg ? "neg" : red}">${fmt(v, t)}</td>`;
    };
    grid.innerHTML = `
      <thead><tr>
        <th class="l" style="cursor:default">Product<span class="arrow">↓</span></th><th class="l" style="cursor:default">Title<span class="arrow">↓</span></th>
        ${COLS.map(([k, l]) => `<th data-sort="${k}" class="${key === k ? "sorted" : ""}">${l}<span class="arrow">${key === k ? (dir < 0 ? "↓" : "↑") : "↓"}</span></th>`).join("")}
      </tr></thead>
      <tbody>
        ${rows.length ? `<tr class="sum"><td class="l" colspan="2">▾ Sum</td>${COLS.map(([k, , t]) => cell(sum, k, t)).join("")}</tr>` : ""}
        ${rows.map(r => `<tr>
          <td class="l"><div class="thumb"></div></td>
          <td class="title-cell"><div>${r.title}</div><small><a href="/Products">${r.id}</a>, ${r.sku}, Stock: ${r.stock} , ${r.supply} Supply</small></td>
          ${COLS.map(([k, , t]) => cell(r, k, t)).join("")}
        </tr>`).join("")}
        ${rows.length ? "" : `<tr><td class="l" colspan="${COLS.length + 2}" style="color:var(--muted)">No records for this period.</td></tr>`}
      </tbody>`;
    $("#grid-foot").textContent = rows.length ? `Items 1 to ${rows.length} of ${rows.length}` : "No items to display";
  }

  function wireDashboard() {
    const ranges = [[1, "Today"], [7, "Last 7 days"], [14, "Last 14 days"], [30, "Last 30 days"], [60, "Last 60 days"], [90, "Last 90 days"]];
    $("#date-btn").addEventListener("click", e => {
      e.stopPropagation();
      popover(e.currentTarget, ranges.map(([d, l]) => ({ d, label: l, on: d === state.range })), it => {
        state.range = it.d;
        $("#date-label").textContent = `${shortDate(addDays(today, -it.d + 1))} - ${shortDate(today)}`;
      });
    });
    $("#product-btn").addEventListener("click", e => {
      e.stopPropagation();
      popover(e.currentTarget, [{ label: "All products", id: null }, ...PRODUCTS.map(p => ({ label: p.title, id: p.id, on: state.products.includes(p.id) }))], it => {
        state.products = it.id ? [it.id] : [];
        const lbl = $("#product-label");
        lbl.textContent = it.id ? it.label : "Select products";
        lbl.style.color = it.id ? "var(--body)" : "";
      });
    });
    $("#apply").addEventListener("click", () => {
      const pick = state.products[0];
      state.query = pick ? PRODUCTS.find(p => p.id === pick).title : "";
      $("#instant").value = state.query;
      renderTable();
    });

    $$(".collapse").forEach(b => b.addEventListener("click", () => {
      const body = b.closest(".section").querySelector(".section-body");
      body.hidden = !body.hidden;
      b.classList.toggle("closed", body.hidden);
      b.setAttribute("aria-expanded", String(!body.hidden));
      if (!body.hidden) drawChart();
    }));

    $(".opt-cards").addEventListener("click", e => {
      const card = e.target.closest(".opt-card"); if (!card) return;
      if (e.target.closest(".fix")) {
        card.classList.add("fixed");
        card.querySelector(".opt-head").textContent = "Fixed — keyword negated";
        e.target.closest(".fix").disabled = true;
      } else if (e.target.closest(".details")) {
        const r = RECS[+card.dataset.rec];
        alert(`${r.term}\n${r.clicks} clicks, ${r.orders} orders in the last 30 days.\nSuggested: add as negative exact.`);
      }
    });

    wireChart();

    $("#tabs").addEventListener("click", e => {
      const t = e.target.closest("[data-tab]"); if (!t) return;
      state.tab = t.dataset.tab;
      $$("#tabs button").forEach(x => x.classList.toggle("on", x === t));
      renderTable();
    });
    $("#grid").addEventListener("click", e => {
      const th = e.target.closest("th[data-sort]"); if (!th) return;
      const k = th.dataset.sort;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
      renderTable();
    });
    $("#instant").addEventListener("input", e => { state.query = e.target.value; renderTable(); });
    $("#download").addEventListener("click", () => {
      const rows = rowsFor(state.tab);
      const csv = [["Product", "Title", ...COLS.map(c => c[1])].join(","), ...rows.map(r => [r.id, `"${r.title}"`, ...COLS.map(([k]) => r[k])].join(","))].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `products-${state.tab}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    renderChips();
    drawChart();
    renderTable();
  }

  // ---------- Page shell + router ----------
  SP.pages["/"] = { title: "Dashboard", noSub: true, icon: "dashboard", iconColor: "#4796e0", render: dashboardHTML, wire: wireDashboard };
  const view = $("#view"), subnav = $("#subnav");
  const norm = p => p.replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
  const SECTIONS = [["/sales", "sales"], ["/products", "products"], ["/restock", "restock"], ["/keywordranking", "keyword"], ["/ads", "ads"], ["/automation", "automation"], ["/masscampaigns", "mass"], ["/strategyexperts", "strategy"]];

  function renderSubnav(section, path) {
    const cfg = SP.SUBNAV[section];
    subnav.innerHTML = `<div class="subnav-inner">${cfg.groups.map(g => `${g.name ? `<h5 style="color:${g.head}">${g.name}</h5>` : ""}<ul>${g.items.map(([href, label, icon]) => `<li><a href="${href}" class="${href.toLowerCase() === path.toLowerCase() ? "on" : ""}"><span style="color:${g.ic}">${svg(SP.ICON[icon])}</span>${label}</a></li>`).join("")}</ul>`).join("")}</div><button class="subnav-toggle" id="subnav-toggle" aria-label="Collapse menu">${svg(SP.ICON.chevronL)}</button>`;
    $("#subnav-toggle").addEventListener("click", () => {
      const c = !document.body.classList.contains("sub-collapsed");
      document.body.classList.toggle("sub-collapsed", c);
      localStorage.setItem("sp-sub-collapsed", c ? "1" : "");
    });
  }

  function route() {
    const path = norm(location.pathname);
    const key = Object.keys(SP.pages).find(k => k.toLowerCase() === path.toLowerCase());
    const page = key ? SP.pages[key] : { title: "Page not found", noSub: true, render: () => `<div class="placeholder"><h2>Page not found</h2>There's nothing at this address. <a href="/">Back to the dashboard</a>.</div>` };
    const lower = path.toLowerCase();
    const found = SECTIONS.find(([p]) => lower === p || lower.startsWith(p + "/"));
    const section = (found && found[1]) || page.section || "dashboard";
    const nav = SP.NAV.find(n => n.id === section);
    $$(".rail-item").forEach(li => li.classList.toggle("active", li.dataset.id === section));

    const hasSub = !!SP.SUBNAV[section] && !page.noSub;
    document.body.classList.toggle("has-sub", hasSub);
    document.body.classList.toggle("hero", !!page.hero);
    document.body.classList.toggle("sub-collapsed", hasSub && localStorage.getItem("sp-sub-collapsed") === "1");
    if (hasSub) renderSubnav(section, key || path); else subnav.innerHTML = "";

    const item = SP.subItem(key || path);
    const iconName = page.icon || (item && item.icon) || (nav && nav.id) || "dashboard";
    const iconColor = page.iconColor || (item && item.color) || (nav && nav.color) || "#4796e0";
    const title = $("#page-title");
    title.innerHTML = `${page.noIcon ? "" : `<span class="title-icon" style="color:${iconColor}">${svg(SP.ICON[iconName] || "")}</span>`}<span id="page-title-text">${page.title}</span>${SP.SUBNAV[section] ? `<span class="title-caret">${svg(SP.ICON.chevron)}</span>` : ""}`;
    title.classList.toggle("has-menu", !!SP.SUBNAV[section]);
    title.classList.toggle("small", !!page.smallTitle);
    document.title = `${page.title} - Seller Portal`;

    // Pages with live data define load(); its result is passed to render() and wire().
    const paint = data => {
      view.innerHTML = `<div class="page page-${section}">${page.render(data)}</div>`;
      const root = view.firstElementChild;
      SP.wireCommon(root);
      if (page.wire) page.wire(root, data);
    };
    if (!page.load) return paint();
    view.innerHTML = `<div class="page page-${section}"><p class="lead">Loading…</p></div>`;
    return page.load().then(paint, err => {
      view.innerHTML = `<div class="page page-${section}"><div class="placeholder"><h2>This page couldn't load</h2>${SP.esc(err.message)}</div></div>`;
    });
  }

  $("#page-title").addEventListener("click", e => {
    const t = e.currentTarget;
    if (!t.classList.contains("has-menu")) return;
    e.stopPropagation();
    const active = $(".rail-item.active");
    const cfg = active && SP.SUBNAV[active.dataset.id];
    if (!cfg) return;
    const here = norm(location.pathname).toLowerCase();
    const items = cfg.groups.flatMap(g => g.items.map(([href, label]) => ({ label, href, on: href.toLowerCase() === here })));
    SP.popover(t, items, it => (location.href = it.href));
  });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if ($("#chart")) drawChart(); }, 120); });
  route();
})();
