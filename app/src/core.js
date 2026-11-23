/* Shared building blocks: icons, sample data, navigation map and UI components. */
(() => {
  "use strict";
  /** @type {any} */
  const SP = (window.SP = { pages: {} });

  // ---------- DOM + format helpers ----------
  SP.$ = (s, r = document) => r.querySelector(s);
  SP.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  SP.esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  SP.svg = (body, cls = "") => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${body}</svg>`;
  const num = (v, d = 2) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  SP.money = v => (v < 0 ? `($${num(v)})` : `$${num(v)}`);
  SP.pct = (v, d = 2) => `${v.toFixed(d)}%`;
  SP.int = v => Math.round(v).toLocaleString("en-US");
  SP.rng = seed => { let s = (seed * 2654435761) % 4294967296 || 1; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); };

  // ---------- Dates ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  SP.MONTHS = MONTHS;
  SP.today = new Date(); SP.today.setHours(0, 0, 0, 0);
  SP.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  SP.longDate = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  SP.shortDate = d => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}`;
  SP.dd = d => `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  SP.dash = d => `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()].slice(0, 3)}-${String(d.getFullYear()).slice(2)}`;
  SP.iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  SP.lastDate = SP.addDays(SP.today, -2);

  // ---------- Server API ----------
  // JSON calls to this site's /api routes. A 401 sends the person to sign in, then back here.
  SP.signInPath = "/Identity/Login";
  const apiCall = async (method, path, body) => {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/api/login") location.assign(`${SP.signInPath}?next=${encodeURIComponent(location.pathname)}`);
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (HTTP ${res.status})`), { status: res.status });
    return data;
  };
  SP.api = { get: path => apiCall("GET", path), post: (path, body = {}) => apiCall("POST", path, body) };

  // ---------- Data source ----------
  // Production always shows the real account. Preview deployments and local development start on
  // the sample data; the "Real data" switch in the top bar changes that (and needs sign-in).
  SP.env = window.SP_ENV || "development";
  SP.canSwitchData = SP.env !== "production";
  // The choice is remembered in localStorage when the browser allows it. If storage is blocked, a
  // choice made on this page is kept in memory, so the switch still works until the next reload.
  let dataChoice = null;
  SP.usesRealData = () => {
    if (!SP.canSwitchData) return true;
    if (dataChoice !== null) return dataChoice;
    try {
      return localStorage.getItem("sp-data-source") === "real";
    } catch {
      return false; // no readable saved choice: start on sample data
    }
  };
  SP.setRealData = on => {
    dataChoice = on;
    try {
      localStorage.setItem("sp-data-source", on ? "real" : "sample");
    } catch {
      SP.toast("This browser blocked saving the choice, so it won't be remembered after a reload.");
    }
  };

  // ---------- Icons ----------
  const I = (SP.ICON = {
    dashboard: '<circle cx="12" cy="12" r="9.5"/><path d="M12 12l3.5-4"/><circle cx="12" cy="12" r="1.3" class="fill"/><path d="M7 13h1.5M12 6.5V8M16 13h1.5"/>',
    sales: '<path d="M2.5 4h2.5l2.2 10.5h11l2-7.5H6.2"/><circle cx="9" cy="18.5" r="1.4"/><circle cx="17" cy="18.5" r="1.4"/><path d="M1.5 8h3M1 11h3.5"/>',
    products: '<path d="M4 9l8-4 8 4-8 4z"/><path d="M4 9v7l8 4 8-4V9"/><path d="M12 13v7M2.5 6.5l3 2M21.5 6.5l-3 2"/>',
    restock: '<path d="M2.5 6h11v10h-11zM13.5 9.5h4l3 3.5v3h-7"/><circle cx="6.5" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/><path d="M5 9h5M5 12h4"/>',
    keyword: '<rect x="3" y="14" width="5" height="6" rx="1"/><rect x="9.5" y="9" width="5" height="11" rx="1"/><rect x="16" y="15" width="5" height="5" rx="1"/><circle cx="12" cy="5" r="2"/>',
    ads: '<path d="M9 17h6M10 20h4"/><path d="M12 4a5.5 5.5 0 0 0-3.2 10c.3.3.7 1 .7 1.6V17h5v-1.4c0-.6.4-1.3.7-1.6A5.5 5.5 0 0 0 12 4z"/><path d="M3 9h1.5M19.5 9H21M5 3.5l1 1M19 3.5l-1 1"/>',
    automation: '<rect x="4" y="8" width="16" height="11" rx="3"/><circle cx="9" cy="13" r="1.6"/><circle cx="15" cy="13" r="1.6"/><path d="M12 8V5M10.5 4h3M2 12v3M22 12v3M10 16.5h4"/>',
    mass: '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/>',
    strategy: '<path d="M2 9l10-4.5L22 9l-10 4.5z"/><path d="M6 11v5c2 2 10 2 12 0v-5M22 9v6"/>',
    bars: '<path d="M3 3v18h18"/><path d="M7 17v-5M11 17V8M15 17v-7M19 17V6"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
    line: '<path d="M3 3v18h18"/><path d="M6 15l4-4 3 3 6-6"/>',
    clockcal: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 3v4M13 3v4M3 10h14"/><circle cx="17.5" cy="16.5" r="4"/><path d="M17.5 14.8v1.8l1.2.8"/>',
    cart: '<path d="M2.5 4h2.5l2.2 10.5h11l2-7.5H6.2"/><circle cx="9" cy="18.5" r="1.4"/><circle cx="17" cy="18.5" r="1.4"/>',
    returns: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 9h-5v5M9 9l6 6"/>',
    percent: '<path d="M5 19L19 5"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
    edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="M13 7l4 4"/><path d="M14 20h6"/>',
    inventory: '<rect x="3" y="12" width="18" height="8" rx="1"/><path d="M3 12V5M21 12V5M7 16h2M11 16h2"/>',
    roi: '<circle cx="8" cy="15" r="3"/><circle cx="16" cy="15" r="3"/><path d="M4 9l4-4 3 3 5-5"/><path d="M13 3h3v3"/>',
    package: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16M10 6v6h4V6"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.4M6.6 7.6C4.4 9.1 3 12 3 12s4 6 9 6c1.3 0 2.5-.4 3.6-.9"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 15h6M9 18h4"/>',
    layers: '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11M15 9v11"/>',
    binoculars: '<path d="M5 6h4v12H5zM15 6h4v12h-4z"/><path d="M9 10h6M3 18l2-12M21 18l-2-12"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
    warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.2"/>',
    minusbox: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8"/>',
    gem: '<path d="M6 4h12l4 5-10 11L2 9z"/><path d="M2 9h20M9 4l3 16 3-16"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    chart: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    searchchart: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M8 12v1.5M10.5 9.5v4M13 11v2.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    wand: '<path d="M4 20L16 8M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 11l.6 1.2 1.2.6-1.2.6L19 14.6l-.6-1.2-1.2-.6 1.2-.6z"/>',
    wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M4.5 16.5l5.4-3M19.5 16.5l-5.4-3"/>',
    split: '<circle cx="5" cy="12" r="2"/><path d="M7 12h5l7-6M12 12l7 6M16 6h3v3M16 18h3v-3"/>',
    splitp: '<path d="M12 3v18M5 12h14"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 12a8 8 0 0 1-14.3 4.9M4 12A8 8 0 0 1 18.3 7.1"/><path d="M18.5 3v4.3h-4.3M5.5 21v-4.3h4.3"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4M12 8v4l3 2"/>',
    card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M6 15h4"/>',
    pulse: '<path d="M3 13h4l2-6 4 12 2-6h6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    columns: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M9 5v14M15 5v14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    chevronL: '<path d="M15 6l-6 6 6 6"/>',
    chevronR: '<path d="M9 6l6 6-6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.2"/>',
    funnel: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    play: '<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z" class="fill"/>',
    youtube: '<rect x="2" y="5" width="20" height="14" rx="4" class="fill"/><path d="M10 9l5 3-5 3z" fill="#fff" stroke="none"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16v.2"/>',
    tree: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M6 16v-3h12v3"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 1.5M4 5l3-2M20 5l-3-2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  });

  // ---------- Navigation map ----------
  SP.NAV = [
    { id: "dashboard", path: "/", name: "Dashboard", desc: "Summary overview", color: "#d7dbe3" },
    { id: "sales", path: "/Sales/SalesTrend", name: "Sales", desc: "Trends, orders & returns", color: "#7fd3a4" },
    { id: "products", path: "/Products", name: "Products", desc: "ROI, inventory value, COGS", color: "#f2a7c3" },
    { id: "restock", path: "/Restock", name: "Restock Forecasting", desc: "Inventory restock management", color: "#f6d36b" },
    { id: "keyword", path: "/KeywordRanking", name: "Keyword Ranking", desc: "Keyword rank tracker", color: "#f4a26a" },
    { id: "ads", path: "/Ads", name: "Ads Insights", desc: "Performance & actionable insights", color: "#b79cf7" },
    { id: "optimizer", path: "/ScaleOptimizer", name: "Optimizer", desc: "Recommendations, rules & ad group signals", color: "#b79cf7" },
    { id: "automation", path: "/Automation", name: "Automation", desc: "Automate ads optimisation", color: "#79c3f2" },
    { id: "mass", path: "/MassCampaigns", name: "Mass Campaigns", desc: "Create bulk campaigns", color: "#f39c50" },
    { id: "strategy", path: "/StrategyExperts", name: "Strategy Experts", desc: "Video strategies from experts", color: "#8fd6b0" },
  ];

  // Secondary menus: section -> groups -> items. `head` is the group header colour, `ic` the icon colour.
  SP.SUBNAV = {
    sales: { groups: [
      { name: "Sales", head: "#74a96b", ic: "#8dbb7f", items: [["/Sales/SalesTrend", "Sales trend", "bars"], ["/Sales/MonthlyTrend", "Monthly trend", "calendar"], ["/Sales/MovingAverageTrend", "Moving avg trend", "line"], ["/Sales/DayParting", "Dayparting trend", "clockcal"]] },
      { name: "Orders", head: "#c27c62", ic: "#d77c6c", items: [["/Sales/Orders", "Search orders", "cart"], ["/Sales/CustomerReturns", "Customer returns", "returns"], ["/Sales/RefundRate", "Refund rate", "percent"]] },
      { name: "Tags", head: "#8e97a8", ic: "#8e97a8", items: [["/Sales/Tag", "Event tags", "tag"]] },
    ] },
    products: { groups: [
      { name: "Products", head: "#e0808c", ic: "#ea8f9b", items: [["/Products", "Product details", "edit"], ["/Products/InventoryValue", "Inventory value", "inventory"], ["/Products/ROI", "ROI", "roi"], ["/Products/Package", "Package & carton", "package"], ["/Products/HideShow", "Hide/show product", "eyeoff"], ["/Products/COGS", "Custom COGS", "doc"], ["/Products/BulkOperations", "Bulk operations", "layers"]] },
    ] },
    ads: { groups: [
      { name: "Ads insights", head: "#8b70cf", ic: "#9b84d6", items: [["/Ads", "Insights overview", "globe"], ["/Ads/Performance", "Performance", "table"], ["/Ads/SearchTerms", "Search terms", "binoculars"], ["/Ads/BestMetrics", "Best metrics", "trophy"], ["/Ads/CompetingKeywords", "Competing keywords", "warn"], ["/Ads/NegativeKeywords", "Negative keywords", "minusbox"], ["/Ads/MainKeywords", "Main words", "gem"], ["/Ads/DeadKeywords", "Dead keywords", "trash"]] },
      { name: "Trends", head: "#8b70cf", ic: "#9b84d6", items: [["/Ads/AdvertisingTrend", "Advertising trend", "chart"], ["/Ads/SearchTermTrend", "Search term trend", "searchchart"]] },
      { name: "Settings", head: "#8e97a8", ic: "#9ba3b2", items: [["/Ads/LinkAdsWithAsin", "Link ads with ASINs", "link"]] },
    ] },
    mass: { groups: [
      { name: "", head: "", ic: "#e39255", items: [["/MassCampaigns", "Overview", "globe"], ["/MassCampaigns/BulkAutoCampaigns", "Bulk auto campaigns", "wand"], ["/MassCampaigns/FullyManagedCampaigns", "Fully managed campaigns", "wheel"], ["/MassCampaigns/KeywordCampaigns", "Split keywords to campaigns", "split"], ["/MassCampaigns/ProductCampaigns", "Split products to campaigns", "splitp"], ["/MassCampaigns/DayPartingCampaign", "Dayparting campaign", "clock"]] },
    ] },
  };
  SP.subItem = path => {
    for (const [sec, cfg] of Object.entries(SP.SUBNAV))
      for (const g of cfg.groups) for (const it of g.items) if (it[0] === path) return { section: sec, group: g, path: it[0], label: it[1], icon: it[2], color: g.ic };
    return null;
  };

  // ---------- Sample catalogue (invented) ----------
  SP.PRODUCTS = [
    { asin: "DEMO1001AA", sku: "DEMO-01-BLU", title: "Weighted Training Rope for Home Gym, 30 ft, Blue", short: "Weighted Training Rope, 30 ft", price: 24.99, cost: 8.5, fee: 8.27, stock: 150, hue: 212 },
    { asin: "DEMO1002BB", sku: "DEMO-02-GRY", title: "Weighted Training Rope for Home Gym, 40 ft, Grey", short: "Weighted Training Rope, 40 ft", price: 24.99, cost: 8.5, fee: 8.27, stock: 78, hue: 262 },
    { asin: "DEMO1003CC", sku: "DEMO-03-RED", title: "Adjustable Jump Rope with Counter, Red", short: "Adjustable Jump Rope", price: 14.99, cost: 0, fee: 0, stock: 0, hue: 345 },
  ];
  SP.thumb = (p, size = "") => `<span class="thumb ${size}" style="--h:${p.hue}" aria-hidden="true"><i></i><i></i></span>`;
  SP.productCell = p => `<div class="pcell">${SP.thumb(p, "sm")}<div><div class="ellip">${SP.esc(p.title)}</div><small><a href="#" class="ext">${p.asin}</a> ${p.sku}</small></div></div>`;

  // One period of sales figures, deterministic per seed.
  SP.period = (seed, days) => {
    const r = SP.rng(seed);
    const orders = Math.round(days * (2 + r() * 3.6));
    const units = orders + (orders && r() < 0.4 ? 1 : 0);
    const ppcOrders = Math.round(orders * (0.45 + r() * 0.5));
    const ppcUnits = ppcOrders + (ppcOrders && r() < 0.25 ? 1 : 0);
    const price = 20.5 + r() * 3.5;
    const sales = units * price;
    const refunds = Math.round(units * r() * 0.1);
    const promos = Math.round(units * r() * 0.35);
    const sessions = Math.round(units / (0.03 + r() * 0.05)) || Math.round(days * 14);
    const clicks = Math.round(ppcOrders / (0.025 + r() * 0.05)) || Math.round(days * 9);
    const cpc = 0.68 + r() * 0.55;
    const ppcCost = clicks * cpc;
    const impressions = Math.round(clicks * (85 + r() * 50));
    const ppcSales = ppcUnits * price;
    const fees = sales * 0.15 + units * 8.27;
    const payout = sales - fees - refunds * price * 0.4;
    const cogs = units * 8.5;
    const profits = payout - cogs - ppcCost;
    return {
      sales, profits, orders, units, orgOrders: orders - ppcOrders, orgUnits: units - ppcUnits, promos, refunds,
      refundRate: units ? (refunds / units) * 100 : 0, sessions, conversion: sessions ? (orders / sessions) * 100 : 0,
      unitSession: sessions ? (units / sessions) * 100 : 0, ppcSalesPct: sales ? Math.min(100, (ppcSales / sales) * 100) : 0,
      ppcOrders, ppcUnits, ppcSales, ppcCost, impressions, clicks, ctr: impressions ? (clicks / impressions) * 100 : 0, cpc,
      ppcConversion: clicks ? (ppcOrders / clicks) * 100 : 0, acos: ppcSales ? (ppcCost / ppcSales) * 100 : 0,
      tacos: sales ? (ppcCost / sales) * 100 : 0, asp: units ? sales / units : 0, payout,
      roi: cogs ? (profits / cogs) * 100 : 0, margin: sales ? (profits / sales) * 100 : 0,
      costPerOrder: ppcOrders ? ppcCost / ppcOrders : 0,
    };
  };
  SP.sumPeriods = list => {
    const s = SP.period(1, 0);
    for (const k of Object.keys(s)) s[k] = 0;
    for (const p of list) for (const k of Object.keys(s)) s[k] += p[k];
    const n = list.length || 1;
    for (const k of ["refundRate", "conversion", "unitSession", "ppcSalesPct", "ctr", "cpc", "ppcConversion", "acos", "tacos", "asp", "roi", "margin", "costPerOrder"]) s[k] /= n;
    return s;
  };

  // ---------- Small UI pieces ----------
  SP.caret = '<span class="caret" aria-hidden="true"></span>';
  SP.actions = list => `<div class="actions">${list.map(a => `<button class="act" data-act="${a.act || ""}">${a.yt ? `<span class="yt">${SP.svg(I.youtube)}</span>` : SP.svg(I[a.icon] || I.download)}${a.label}${a.caret ? SP.caret : ""}</button>`).join("")}${list.extra || ""}</div>`;
  SP.note = html => `<div class="note"><div>${html}</div><button class="note-x" aria-label="Close">✕</button></div>`;
  SP.panel = (inner, extra = "") => `<div class="fpanel">${inner}${extra}</div>`;
  SP.ctl = {
    num: (label, val, name) => `<label class="ctl"><span>${label}</span><input type="number" min="1" max="24" value="${val}" data-k="${name}"></label>`,
    date: (label, d, name = "last") => `<label class="ctl"><span>${label}</span><input type="date" value="${SP.iso(d)}" data-k="${name}"></label>`,
    range: (label, days = 30, preset = "") => {
      const s = SP.addDays(SP.today, -days + 1), e = SP.today;
      return `<div class="anchor"><button class="ctl ctl-btn" data-range="${days}">${SP.svg('<rect x="4" y="5" width="16" height="15" rx="2" class="fill"/><path d="M8 3v4M16 3v4"/>', "cal")}<span class="rlabel">${preset ? preset + ": " : ""}${label || `${SP.shortDate(s)} - ${SP.shortDate(e)}`}</span>${SP.caret}</button></div>`;
    },
    products: (ph = "Select products") => `<div class="anchor"><button class="ctl ctl-btn sel" data-products><span class="plabel">${ph}</span>${SP.caret}</button></div>`,
    select: (ph, opts, cls = "") => `<div class="anchor"><button class="ctl ctl-btn sel ${cls}" data-select='${SP.esc(JSON.stringify(opts))}'><span class="slabel">${ph}</span>${SP.caret}</button></div>`,
    text: (ph, name) => `<input class="ctl ctl-text" placeholder="${ph}" data-k="${name}">`,
    apply: (label = "Apply filter") => `<button class="btn-dark" data-apply>${label}</button>`,
    toggle: (label, on = true) => `<label class="switch"><input type="checkbox" ${on ? "checked" : ""} data-toggle><span class="track"></span>${label}</label>`,
  };
  SP.tabs = (id, labels, active = 0, cls = "") => `<div class="ptabs ${cls}" role="tablist" data-tabs="${id}">${labels.map((l, i) => `<button role="tab" data-i="${i}" class="${i === active ? "on" : ""}">${l}</button>`).join("")}</div>`;
  SP.panels = (id, list, active = 0) => `<div data-panels="${id}">${list.map((h, i) => `<div data-panel="${i}" ${i === active ? "" : "hidden"}>${h}</div>`).join("")}</div>`;
  SP.meta = (txt = "Updated just now - Processed: 42 ms") => `<p class="meta">${txt}</p>`;
  SP.step = (n, txt) => `<p class="step"><b>Step ${n}:</b> ${txt}</p>`;
  SP.fileInput = () => `<label class="file"><input type="file" hidden><span class="file-btn">Choose File</span><span class="file-name">No file chosen</span></label>`;

  SP.toast = msg => {
    let t = SP.$("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
  };
  SP.downloadCSV = (name, rows) => {
    const csv = rows.map(r => r.map(c => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  SP.modal = (title, body, onOk, okLabel = "Save") => {
    const m = document.createElement("div");
    m.className = "modal-wrap";
    m.innerHTML = `<div class="modal" role="dialog" aria-label="${SP.esc(title)}"><div class="modal-head"><h3>${title}</h3><button class="note-x" data-close aria-label="Close">✕</button></div><div class="modal-body">${body}</div><div class="modal-foot"><button class="btn-outline" data-close>Cancel</button>${onOk ? `<button class="btn-dark" data-ok>${okLabel}</button>` : ""}</div></div>`;
    document.body.appendChild(m);
    m.addEventListener("click", e => {
      if (e.target === m || e.target.closest("[data-close]")) m.remove();
      else if (e.target.closest("[data-ok]")) { if (onOk(m) !== false) m.remove(); }
    });
    return m;
  };

  // ---------- Popovers ----------
  SP.closePops = () => SP.$$(".popover").forEach(p => p.remove());
  SP.popover = (anchor, items, onPick, opts = {}) => {
    SP.closePops();
    const pop = document.createElement("div");
    pop.className = "popover" + (opts.multi ? " multi" : "");
    pop.innerHTML = items.map((it, i) => opts.multi
      ? `<label><input type="checkbox" data-i="${i}" ${it.on ? "checked" : ""}> ${it.label}</label>`
      : `<button data-i="${i}" class="${it.on ? "on" : ""}">${it.label}</button>`).join("");
    pop.style.top = `${anchor.offsetTop + anchor.offsetHeight + 6}px`;
    pop.style.left = `${anchor.offsetLeft}px`;
    pop.style.minWidth = `${Math.max(anchor.offsetWidth, 180)}px`;
    anchor.parentElement.appendChild(pop);
    pop.addEventListener("click", e => {
      e.stopPropagation();
      if (opts.multi) { const c = e.target.closest("input"); if (c) onPick(items[+c.dataset.i], c.checked); return; }
      const b = e.target.closest("button"); if (!b) return;
      onPick(items[+b.dataset.i]); pop.remove();
    });
    return pop;
  };

  // ---------- Data grid ----------
  // cols: {key,label,align('l'|'r'|'c'),muted,sort,filter,fmt(v,row),w,group}
  const grids = (SP._grids = {});
  let gid = 0;
  SP.grid = cfg => {
    const id = cfg.id || `g${++gid}`;
    grids[id] = { ...cfg, id, q: "", sortKey: cfg.sortKey || null, dir: cfg.dir || -1, hidden: new Set(), page: 0, checked: new Set(), open: new Set() };
    const tools = cfg.search === false ? "" : `<div class="grid-tools">${cfg.toolsBefore || ""}<label class="instant">${SP.svg(I.search)}<input placeholder="Instant search" data-gsearch="${id}" aria-label="Instant search"></label>${cfg.columns ? `<div class="anchor"><button class="plain-btn" data-gcols="${id}">${SP.svg(I.columns)}Columns</button></div>` : ""}${cfg.tools || ""}</div>`;
    return `${tools}<div class="grid-wrap ${cfg.cls || ""}"><table class="grid" data-grid="${id}">${gridHead(grids[id])}<tbody>${gridBody(grids[id])}</tbody></table></div><div class="grid-foot" data-gfoot="${id}">${gridFoot(grids[id])}</div>`;
  };
  const visCols = g => g.cols.filter(c => !g.hidden.has(c.key));
  function gridHead(g) {
    const cols = visCols(g);
    let top = "";
    if (cols.some(c => c.group)) {
      top = "<tr class=\"ghead\">" + (g.check ? "<th></th>" : "") + (g.details ? "<th></th>" : "");
      for (let i = 0; i < cols.length;) {
        const grp = cols[i].group || ""; let n = 0;
        while (i < cols.length && (cols[i].group || "") === grp) { n++; i++; }
        top += `<th colspan="${n}" class="c ${grp ? "grp" : ""}">${grp}</th>`;
      }
      top += "</tr>";
    }
    const th = c => {
      const sorted = g.sortKey === c.key;
      const tools = c.muted ? "" : `<span class="th-tools">${c.sort === false ? "" : `<span class="arr ${sorted ? "on" : ""}">${sorted && g.dir > 0 ? "↑" : "↓"}</span>`}${c.filter ? SP.svg(I.funnel, "fun") : ""}</span>`;
      return `<th class="${c.align || "l"} ${c.muted ? "muted" : ""} ${sorted ? "sorted" : ""}" ${c.sort === false || c.muted ? "" : `data-gsort="${c.key}"`} style="${c.w ? `min-width:${c.w}px` : ""}">${c.label}${tools}</th>`;
    };
    return `<thead>${top}<tr>${g.check ? `<th class="c"><input type="checkbox" data-gall aria-label="Select all"></th>` : ""}${g.details ? `<th class="l muted">Details</th>` : ""}${cols.map(th).join("")}</tr></thead>`;
  }
  function gridRows(g) {
    let rows = g.rows.slice();
    if (g.q) { const q = g.q.toLowerCase(); rows = rows.filter(r => Object.values(r).some(v => typeof v !== "object" && String(v).toLowerCase().includes(q)) || (r.p && `${r.p.title} ${r.p.asin} ${r.p.sku}`.toLowerCase().includes(q))); }
    if (g.sortKey) rows.sort((a, b) => { const x = a[g.sortKey], y = b[g.sortKey]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * g.dir; });
    return rows;
  }
  function cell(c, r) {
    const v = r[c.key];
    const html = c.fmt ? c.fmt(v, r) : v == null ? "" : SP.esc(v);
    return `<td class="${c.align || "l"} ${c.cls ? (typeof c.cls === "function" ? c.cls(v, r) : c.cls) : ""}">${html}</td>`;
  }
  function gridBody(g) {
    const cols = visCols(g), rows = gridRows(g);
    const span = cols.length + (g.check ? 1 : 0) + (g.details ? 1 : 0);
    const per = g.pageSize || 1e9, start = g.page * per, shown = rows.slice(start, start + per);
    let h = "";
    if (g.group && rows.length) h += `<tr class="grow"><td colspan="${span}"><b>▾ ${g.group.label}</b>${g.group.values ? "" : ""}</td></tr>`;
    let sumRow = "";
    if (g.sum && rows.length) {
      const s = typeof g.sum === "function" ? g.sum(rows) : g.sum;
      sumRow = `<tr class="sumrow">${g.check ? "<td></td>" : ""}${g.details ? "<td></td>" : ""}${cols.map(c => (s[c.key] == null ? "<td></td>" : cell(c, s))).join("")}</tr>`;
    }
    if (g.sumTop) h += sumRow;
    h += shown.map((r, i) => {
      const key = r._k ?? `${start + i}`;
      const open = g.open.has(key);
      return `<tr data-k="${key}">${g.check ? `<td class="c"><input type="checkbox" data-gchk="${key}" ${g.checked.has(key) ? "checked" : ""} aria-label="Select row"></td>` : ""}${g.details ? `<td class="l"><button class="details-btn" data-gdet="${key}">Details ${SP.svg(I.chevron, open ? "up" : "")}</button></td>` : ""}${cols.map(c => cell(c, r)).join("")}</tr>${open && g.details ? `<tr class="detrow"><td colspan="${span}">${g.details(r)}</td></tr>` : ""}`;
    }).join("");
    if (!g.sumTop) h += sumRow;
    if (!rows.length) h += `<tr class="empty"><td colspan="${span}">${g.empty || "No records found."}</td></tr>`;
    return h;
  }
  function gridFoot(g) {
    const n = gridRows(g).length;
    if (g.noFoot) return "";
    if (g.agPager) {
      const per = g.pageSize, pages = Math.max(1, Math.ceil(n / per)), s = g.page * per, first = g.page === 0, last = g.page >= pages - 1;
      return `<div class="agpager"><label>Page Size: <select data-gpsize aria-label="Page Size">${[10, 20, 50, 100].map(k => `<option ${k === per ? "selected" : ""}>${k}</option>`).join("")}</select></label><span><b>${n ? s + 1 : 0}</b> to <b>${Math.min(n, s + per)}</b> of <b>${n}</b></span><span class="agnav"><button data-gpage="first" ${first ? "disabled" : ""} aria-label="First Page">|‹</button><button data-gpage="prev" ${first ? "disabled" : ""} aria-label="Previous Page">‹</button><span>Page <b class="pgbox">${n ? g.page + 1 : 0}</b> of <b>${n ? pages : 0}</b></span><button data-gpage="next" ${last ? "disabled" : ""} aria-label="Next Page">›</button><button data-gpage="last" ${last ? "disabled" : ""} aria-label="Last Page">›|</button></span></div>`;
    }
    if (!n) return g.emptyFoot === false ? "" : `<p>No items to display</p>`;
    if (g.pageSize) {
      const pages = Math.ceil(n / g.pageSize), s = g.page * g.pageSize;
      return `<div class="pager"><button data-gpage="first" aria-label="First page">⏮</button><button data-gpage="prev" aria-label="Previous page">◀</button>${Array.from({ length: pages }, (_, i) => `<button data-gpage="${i}" class="${i === g.page ? "on" : ""}">${i + 1}</button>`).join("")}<button data-gpage="next" aria-label="Next page">▶</button><button data-gpage="last" aria-label="Last page">⏭</button><span class="pp">Items per page:</span>${[10, 20, 50].map(k => `<button data-gsize="${k}" class="${k === g.pageSize ? "on" : ""}">${k}</button>`).join("")}<span>Items ${s + 1} to ${Math.min(n, s + g.pageSize)} of ${n}</span></div>`;
    }
    return `<p>Items 1 to ${n} of ${n}</p>${g.footExtra ? g.footExtra(gridRows(g)) : ""}`;
  }
  SP.refreshGrid = id => {
    const g = grids[id], t = SP.$(`[data-grid="${id}"]`); if (!g || !t) return;
    g.page = Math.max(0, Math.min(g.page, Math.ceil(gridRows(g).length / (g.pageSize || 1e9)) - 1));
    t.innerHTML = `${gridHead(g)}<tbody>${gridBody(g)}</tbody>`;
    SP.$(`[data-gfoot="${id}"]`).innerHTML = gridFoot(g);
  };
  SP.gridChecked = id => [...grids[id].checked];

  // ---------- Trend table (metrics down, periods across) ----------
  const HEAT = ["", "#fbe3e3", "#f6caca", "#f0b0b0", "#ea9a9a"];
  SP.trend = cfg => {
    const head = `<tr><th class="l">${cfg.corner || ""}</th>${cfg.noSummary ? "" : `<th class="sumcol r">${cfg.summaryLabel || "Summary"}</th>`}${cfg.heads.map(h => `<th class="r dh">${h.link ? `<a href="#" data-col="${h.key || ""}">` : "<span>"}${h.top}<br>${h.bottom}${h.link ? "</a>" : "</span>"}</th>`).join("")}${cfg.analysis ? '<th class="c">Analysis</th>' : ""}</tr>`;
    const body = cfg.rows.map(r => {
      // A null value means "no data", shown as a dash and left out of the heat scale.
      const vals = r.values;
      const scale = vals.filter(v => v != null);
      const lo = Math.min(...scale), hi = Math.max(...scale);
      const lvl = v => {
        if (v == null || !r.heat || hi === lo) return 0;
        const t = (v - lo) / (hi - lo); const bad = r.heat === "down" ? t : 1 - t;
        return bad > 0.85 ? 4 : bad > 0.6 ? 3 : bad > 0.4 ? 2 : bad > 0.25 ? 1 : 0;
      };
      const f = v => (v == null ? '<span title="No data for these dates">—</span>' : r.fmt ? r.fmt(v) : SP.int(v));
      const neg = v => (r.negRed && v < 0 ? " neg" : "");
      const spark = cfg.analysis ? `<td class="c">${sparkBars(vals, cfg.analysis)}</td>` : "";
      const cl = r.hl ? (v => (v >= (r.hl) ? ' style="background:#f6ee3f"' : "")) : (() => "");
      return `<tr data-metric="${r.key || r.label}"><th class="l rowlab">${r.link ? `<a href="#" class="plusl">${SP.svg(I.plus, "pl")}${r.label}</a>` : r.label}${r.info ? `<span class="i" title="${SP.esc(r.info)}">${SP.svg(I.info)}</span>` : ""}</th>${cfg.noSummary ? "" : `<td class="sumcol r${neg(r.summary)}">${f(r.summary)}</td>`}${vals.map(v => `<td class="r heat${neg(v)}" data-h="${lvl(v)}"${cl(v)}>${f(v)}</td>`).join("")}${spark}</tr>`;
    }).join("");
    return `<div class="trend-wrap"><table class="trend ${cfg.heatOn === false ? "noheat" : ""}" id="${cfg.id || ""}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  };
  function sparkBars(vals, size) {
    const { width: w = 46, height: h = 26 } = typeof size === "object" ? size : {};
    const n = vals.length, m = Math.max(0, ...vals.filter(v => v != null).map(Math.abs)) || 1, bw = w / Math.max(n, 1) - 1.5;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${vals.map((v, i) => {
      if (v == null) return "";
      const bh = Math.max(1, (Math.abs(v) / m) * (h - 4));
      return `<rect data-col="${i}" x="${i * (bw + 1.5)}" y="${v < 0 ? 2 : h - bh}" width="${bw}" height="${bh}" fill="${v < 0 ? "#f3a3a3" : "#9fb0c8"}" stroke="none"/>`;
    }).join("")}<line x1="0" x2="${w}" y1="${h - 0.5}" y2="${h - 0.5}" stroke="#ccc" stroke-width=".5"/></svg>`;
  }
  // heat cell colours applied once mounted (keeps markup small)
  SP.paintHeat = root => SP.$$(".trend td.heat", root).forEach(td => { const l = +td.dataset.h; if (l && !td.style.background) td.style.background = HEAT[l]; });

  // ---------- Area chart ----------
  SP.areaChart = ({ labels, series, title, W = 960, H = 260 }) => {
    const L = 40, R = 30, T = 30, B = 30;
    const stacked = series.filter(s => s.type === "area");
    const totals = labels.map((_, i) => stacked.reduce((a, s) => a + s.values[i], 0));
    const max = Math.max(5, ...totals, ...series.map(s => Math.max(...s.values)));
    const step = Math.max(1, Math.ceil(max / 9 / 5) * 5) || 1;
    const top = step * Math.ceil(max / step);
    const x = i => L + (labels.length < 2 ? 0 : (i * (W - L - R)) / (labels.length - 1));
    const y = v => T + (H - T - B) * (1 - v / top);
    let out = `<text x="${W / 2}" y="14" text-anchor="middle" class="ct">${title || ""}</text>`;
    for (let v = 0; v <= top + 0.001; v += step) out += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#ececec"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(1)}</text>`;
    let base = labels.map(() => 0);
    for (const s of stacked) {
      const upper = s.values.map((v, i) => base[i] + v);
      const pts = upper.map((v, i) => `${x(i)},${y(v)}`).join(" ");
      const low = base.map((v, i) => `${x(i)},${y(v)}`).reverse().join(" ");
      out = out.replace("<!--areas-->", "");
      s._svg = `<polygon points="${pts} ${low}" fill="${s.color}" fill-opacity="${s.opacity || 0.9}" stroke="${s.color}" stroke-width="1"/>`;
      base = upper;
    }
    out += stacked.slice().reverse().map(s => s._svg).join("");
    for (const s of series.filter(s => s.type === "line")) out += `<polyline points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="1.6"/>`;
    labels.forEach((l, i) => { out += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${l}</text>`; });
    const legend = series.map(s => `<span><i style="background:${s.color};${s.type === "line" ? "height:2px;width:20px" : ""}"></i>${s.name}</span>`).join("");
    return `<div class="achart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${SP.esc(title || "chart")}">${out}</svg><div class="alegend">${legend}</div></div>`;
  };

  // ---------- Generic wiring for any page ----------
  SP.wireCommon = root => {
    SP.paintHeat(root);
    root.addEventListener("click", e => {
      const t = e.target;
      const x = t.closest(".note-x"); if (x && x.closest(".note")) { x.closest(".note").remove(); return; }
      const tab = t.closest("[data-tabs] > button");
      if (tab) {
        const id = tab.parentElement.dataset.tabs;
        SP.$$("button", tab.parentElement).forEach(b => b.classList.toggle("on", b === tab));
        const pan = SP.$(`[data-panels="${id}"]`, root);
        if (pan) [...pan.children].forEach(p => (p.hidden = p.dataset.panel !== tab.dataset.i));
        root.dispatchEvent(new CustomEvent("tab", { detail: { id, i: +tab.dataset.i } }));
        return;
      }
      const sort = t.closest("[data-gsort]");
      if (sort) { const g = grids[sort.closest("[data-grid]").dataset.grid]; const k = sort.dataset.gsort; g.dir = g.sortKey === k ? -g.dir : -1; g.sortKey = k; SP.refreshGrid(g.id); return; }
      const det = t.closest("[data-gdet]");
      if (det) { const g = grids[det.closest("[data-grid]").dataset.grid]; const k = det.dataset.gdet; g.open.has(k) ? g.open.delete(k) : g.open.add(k); SP.refreshGrid(g.id); return; }
      const pg = t.closest("[data-gpage]");
      if (pg) {
        const g = grids[pg.closest("[data-gfoot]").dataset.gfoot], pages = Math.ceil(gridRows(g).length / g.pageSize), v = pg.dataset.gpage;
        g.page = v === "first" ? 0 : v === "last" ? pages - 1 : v === "prev" ? Math.max(0, g.page - 1) : v === "next" ? Math.min(pages - 1, g.page + 1) : +v;
        SP.refreshGrid(g.id); return;
      }
      const sz = t.closest("[data-gsize]");
      if (sz) { const g = grids[sz.closest("[data-gfoot]").dataset.gfoot]; g.pageSize = +sz.dataset.gsize; g.page = 0; SP.refreshGrid(g.id); return; }
      const gc = t.closest("[data-gcols]");
      if (gc) {
        e.stopPropagation();
        const g = grids[gc.dataset.gcols];
        SP.popover(gc, g.cols.map(c => ({ label: c.label.replace(/<[^>]+>/g, " ") || c.key, key: c.key, on: !g.hidden.has(c.key) })), (it, on) => { on ? g.hidden.delete(it.key) : g.hidden.add(it.key); SP.refreshGrid(g.id); }, { multi: true });
        return;
      }
      const rng = t.closest("[data-range]");
      if (rng) {
        e.stopPropagation();
        const presets = [["Today", 1], ["Yesterday", 1, 1], ["Last 7 Days", 7], ["Last 14 Days", 14], ["Last 30 Days", 30], ["Last 60 Days", 60], ["Last 90 Days", 90]];
        SP.popover(rng, presets.map(([l, d, off]) => ({ label: l, d, off })), it => {
          const end = SP.addDays(SP.today, -(it.off || 0)), s = SP.addDays(end, -it.d + 1);
          rng.dataset.range = it.d;
          SP.$(".rlabel", rng).textContent = it.d === 1 ? `${it.label}: ${SP.shortDate(end)}` : `${it.label}: ${SP.shortDate(s)} - ${SP.shortDate(end)}`;
        });
        return;
      }
      const pb = t.closest("[data-products]");
      if (pb) {
        e.stopPropagation();
        pb._sel = pb._sel || new Set();
        SP.popover(pb, SP.PRODUCTS.map(p => ({ label: `${p.short} <small>${p.asin}</small>`, p, on: pb._sel.has(p.asin) })), (it, on) => {
          on ? pb._sel.add(it.p.asin) : pb._sel.delete(it.p.asin);
          const lab = SP.$(".plabel", pb);
          lab.textContent = pb._sel.size ? `${pb._sel.size} product${pb._sel.size > 1 ? "s" : ""} selected` : "Select products";
          pb.classList.toggle("has", pb._sel.size > 0);
        }, { multi: true });
        return;
      }
      const sb = t.closest("[data-select]");
      if (sb) {
        e.stopPropagation();
        const opts = JSON.parse(sb.dataset.select);
        SP.popover(sb, opts.map(o => ({ label: o })), it => { SP.$(".slabel", sb).textContent = it.label; sb.classList.add("has"); sb.dataset.value = it.label; });
        return;
      }
      const act = t.closest(".act[data-act='csv']");
      if (act) { SP.downloadCSV("export.csv", [["ASIN", "SKU", "Title", "Price"], ...SP.PRODUCTS.map(p => [p.asin, p.sku, p.title, p.price])]); return; }
      const ext = t.closest("a[href='#']");
      if (ext) e.preventDefault();
    });
    root.addEventListener("input", e => {
      const s = e.target.closest("[data-gsearch]");
      if (s) { const g = grids[s.dataset.gsearch]; g.q = s.value; g.page = 0; SP.refreshGrid(g.id); }
    });
    root.addEventListener("change", e => {
      const all = e.target.closest("[data-gall]");
      if (all) { const g = grids[all.closest("[data-grid]").dataset.grid]; g.checked = all.checked ? new Set(gridRows(g).map((r, i) => r._k ?? `${i}`)) : new Set(); SP.refreshGrid(g.id); SP.$(`[data-grid="${g.id}"] [data-gall]`).checked = all.checked; return; }
      const ck = e.target.closest("[data-gchk]");
      if (ck) { const g = grids[ck.closest("[data-grid]").dataset.grid]; ck.checked ? g.checked.add(ck.dataset.gchk) : g.checked.delete(ck.dataset.gchk); return; }
      const ps = e.target.closest("[data-gpsize]");
      if (ps) { const g = grids[ps.closest("[data-gfoot]").dataset.gfoot]; g.pageSize = +ps.value; g.page = 0; SP.refreshGrid(g.id); return; }
      const f = e.target.closest(".file input");
      if (f) SP.$(".file-name", f.parentElement).textContent = f.files[0] ? f.files[0].name : "No file chosen";
    });
  };
})();
