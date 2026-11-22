/* Restock forecasting and Ads insights sections. */
(() => {
  "use strict";
  const SP = window.SP, { $, $$, svg, ICON: I, money, pct, int, ctl } = SP;
  const P = SP.PRODUCTS;
  const thumbCol = { key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p) };
  const smallThumb = { key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p, "sm") };
  const neg = v => `<span class="neg">${money(v)}</span>`;
  const pl = v => (v < 0 ? neg(v) : money(v));

  // ================= Restock =================
  SP.pages["/Restock"] = {
    title: "Restock forecasting",
    render() {
      const rows = [P[1], P[0], P[2]].map(p => ({ p, parent: "", asin: p.asin, sku: p.sku, title: p.title, stock: null, days: null, date: null, qty: null, cost: null }));
      const dash = v => (v == null ? "" : v);
      const forecast = SP.grid({ id: "rf", cols: [thumbCol, { key: "parent", label: "Parent", filter: true }, { key: "asin", label: "ASIN", filter: true }, { key: "sku", label: "SKU", filter: true, sort: false }, { key: "title", label: "Title", w: 300, fmt: v => `<span class="clamp2 wide">${SP.esc(v)}</span>` }, { key: "stock", label: `<span class="i">${svg(I.info)}</span>Stock<br>level`, align: "r", fmt: dash }, { key: "days", label: "Days to<br>reorder", align: "r", fmt: dash }, { key: "date", label: "Restock<br>date", fmt: dash }, { key: "qty", label: "Restock<br>quantity", align: "r", muted: true, fmt: dash }, { key: "cost", label: "Restock<br>cost", align: "r", muted: true, fmt: dash }], rows });
      const sold = [[P[1], 80, [1, 2, 5, 15, 56, 145, 157, 157]], [P[0], 152, [2, 1, 2, 35, 53, 88, 98, 98]]];
      const per = ["Today", "Yesterday", "7 days", "14 days", "30 days", "60 days", "90 days", "180 days", "365 days"];
      const trend = SP.grid({ id: "rt", cols: [thumbCol, { key: "sku", label: "SKU", filter: true }, { key: "title", label: "Title", sort: false, w: 230, fmt: (v, r) => `<span class="ellip w220">${SP.esc(v)}</span><small class="sub">${r.asin}</small>` }, { key: "fba", label: "FBA<br>stocks", align: "r" }, ...per.map((l, i) => ({ key: `u${i}`, label: l, group: "Units sold", align: "r" }))],
        rows: sold.map(([p, fba, u]) => ({ p, sku: p.sku, title: p.title, asin: p.asin, fba, ...Object.fromEntries(per.map((_, i) => [`u${i}`, u[i] ?? u[7]])) })) });
      const custom = `<div class="frow tight"><div class="joined">${ctl.select("None", ["None", "Default", "Fast movers"], "short")}<button class="btn-dark sq" data-setprof>Set</button></div></div>` +
        SP.grid({ id: "rc", check: true, cols: [thumbCol, { key: "title", label: "Title", w: 230, fmt: v => `<span class="clamp2">${SP.esc(v)}</span>` }, { key: "asin", label: "ASIN", filter: true, sort: false }, { key: "sku", label: "SKU", filter: true, sort: false }, { key: "profile", label: "Profile", filter: true }], rows: P.map(p => ({ _k: p.asin, p, title: p.title, asin: p.asin, sku: p.sku, profile: "Default" })), cls: "fit" });
      const inf = l => `<span class="i">${svg(I.info)}</span>${l}`;
      const profiles = `<div class="actions"><button class="btn-outline" data-newprof>Create profile</button></div>` + SP.grid({ id: "rp", sortKey: "name", dir: 1, cls: "fit", cols: [{ key: "name", label: "Name", filter: true }, { key: "evalDays", label: inf("Days to<br>evaluate"), align: "r", muted: true }, { key: "reserve", label: "Stock level<br>to reserve", align: "r", muted: true, fmt: v => `${v}%` }, { key: "resDays", label: "Days to<br>reserve", align: "r", muted: true }, { key: "min", label: "Min restock<br>quantity", align: "r", muted: true }, { key: "alert", label: inf("Alert<br>level"), align: "r", muted: true, fmt: v => `${v}%` }, { key: "alertDays", label: inf("Alert<br>days"), align: "r", muted: true }, { key: "_k", label: "Action", muted: true, fmt: () => `<span class="rowacts"><span style="color:#3aa55d">${svg(I.edit)}</span><span style="color:#d9534f">${svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>')}</span></span>` }], rows: [{ _k: "default", name: "Default", evalDays: 7, reserve: 50, resDays: 25, min: 100, alert: 150, alertDays: 7 }] });
      const email = `<p>Get an email when stock falls below the alert level.</p><form class="emails" data-emails>${[1, 2, 3].map(n => `<label><span>Email ${n}:</span><input type="email" name="e${n}"></label>`).join("")}<button class="btn-dark sm" type="submit">Save</button></form>`;
      return `${SP.actions([{ icon: "download", label: "Download forecast as CSV", act: "csv" }, { icon: "download", label: "Download unit sales trend as CSV", act: "csv" }])}
        ${SP.note(`<span class="bell">🧮</span> <a href="#" class="ul" data-algo>Click here</a> to find out how the restocking forecast works.`)}
        ${SP.tabs("rs", ["Forecast", "Unit sales trend", "Customize forecast", "Restock profiles", "Email reminder"])}
        ${SP.panels("rs", [forecast, trend, custom, profiles, email])}
        ${SP.meta("Updated just now - Processed: 59 ms")}`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (e.target.closest("[data-algo]")) SP.modal("How the forecast works", `<p>The forecast looks at units sold over the profile's evaluation window, keeps a reserve of stock for the chosen number of days, and suggests a restock date and quantity once stock is expected to drop below the alert level.</p>`);
        if (e.target.closest("[data-setprof]")) {
          const v = $("[data-panels=rs] [data-select]", root).dataset.value || "None", sel = SP.gridChecked("rc");
          if (!sel.length) return SP.toast("Select at least one product.");
          SP._grids.rc.rows.forEach(r => { if (sel.includes(r._k)) r.profile = v === "None" ? "Default" : v; });
          SP._grids.rc.checked.clear(); SP.refreshGrid("rc");
        }
        if (e.target.closest("[data-newprof]")) {
          SP.modal("Create profile", `<label class="field"><span>Name</span><input name="n" placeholder="e.g. Fast movers"></label><div class="detgrid">${[["Days to evaluate", 7], ["Stock level to reserve (%)", 50], ["Days to reserve", 25], ["Min restock quantity", 100], ["Alert level (%)", 150], ["Alert days", 7]].map(([l, v], i) => `<label class="field"><span>${l}</span><input type="number" name="f${i}" value="${v}"></label>`).join("")}</div>`, m => {
            const name = $("[name=n]", m).value.trim(); if (!name) return false;
            const f = i => +$(`[name=f${i}]`, m).value;
            SP._grids.rp.rows.push({ _k: name, name, evalDays: f(0), reserve: f(1), resDays: f(2), min: f(3), alert: f(4), alertDays: f(5) });
            SP.refreshGrid("rp");
          }, "Create");
        }
      });
      root.addEventListener("submit", e => { if (e.target.matches("[data-emails]")) { e.preventDefault(); SP.toast("Email reminders saved."); } });
    },
  };

  // ================= Ads insights =================
  const TERMS = [
    ["training rope with handles", 5921, 23, -27.37], ["training rope", 1450, 14, -15.23], ["cordless battle rope", 284, 12, -11.84],
    ["jump rope for women", 1004, 10, -10.59], ["home gym equipment", 374, 11, -10.42], ["home workout rope", 473, 17, -10.15],
  ];
  const sponsored = ["Products", "Products", "Products", "Products", "Brands", "Display"];
  const card = (title, body, tip, id) => `<section class="icard"><header><h3>${title}</h3><button class="link-btn" data-edit="${id}">${svg(I.pencil)}Edit</button><a href="${{ st0: "/Ads/SearchTerms", acos: "/Ads/SearchTerms", perf: "/Ads/Performance", kw0: "/Ads/DeadKeywords" }[id]}" class="see">See details ${svg(I.chevronR)}</a></header><div class="icard-body">${body}</div><footer>${tip}</footer></section>`;
  const reports = [["/Ads/Performance", "Performance", "Spend, sales and conversion by product, campaign, keyword and more."], ["/Ads/SearchTerms", "Search terms", "What shoppers typed before clicking your ads."], ["/Ads/BestMetrics", "Best metrics", "Keywords with the strongest results."], ["/Ads/CompetingKeywords", "Competing keywords", "Keywords where your own ads compete."], ["/Ads/NegativeKeywords", "Negative keywords", "Negatives across campaigns."], ["/Ads/MainKeywords", "Main words", "The words that drive each product."], ["/Ads/DeadKeywords", "Dead keywords", "Keywords with no impressions."], ["/Ads/AdvertisingTrend", "Advertising trend", "Week-by-week advertising results."], ["/Ads/SearchTermTrend", "Search term trend", "How one search term performs over time."]];

  SP.pages["/Ads"] = {
    title: "Insights overview",
    render() {
      const c1 = SP.grid({ id: "i1", search: false, noFoot: true, cls: "fit", cols: [smallThumb, { key: "sp", label: "Sponsored" }, { key: "term", label: "Search term", w: 130, fmt: v => `<span class="clamp2">${v}</span>` }, { key: "imp", label: "Impressions", align: "r", fmt: int }, { key: "clicks", label: "Clicks", align: "r" }, { key: "pl", label: "P&amp;L", align: "r", fmt: pl }],
        rows: TERMS.map(([term, imp, clicks, v], i) => ({ p: P[i % 2], sp: "Products", term, imp, clicks, pl: v })), sum: rs => ({ imp: rs.reduce((a, r) => a + r.imp, 0), clicks: rs.reduce((a, r) => a + r.clicks, 0), pl: rs.reduce((a, r) => a + r.pl, 0) }) });
      const c2 = SP.grid({ id: "i2", search: false, noFoot: true, cls: "fit", cols: [smallThumb, { key: "sp", label: "Sponsored" }, { key: "term", label: "Search term" }, { key: "clicks", label: "Clicks", align: "r" }, { key: "spend", label: "Spend", align: "r", fmt: money }, { key: "cpc", label: "CPC", align: "r", fmt: money }, { key: "conv", label: "Conversion", align: "r", fmt: v => pct(v) }, { key: "acos", label: "ACOS", align: "r", fmt: v => pct(v) }, { key: "pl", label: "P&amp;L", align: "r", fmt: pl }],
        rows: [{ p: P[0], sp: "Products", term: "cordless jump rope", clicks: 28, spend: 25.87, cpc: 0.92, conv: 3.57, acos: 123.25, pl: -24.8 }], sum: rs => ({ ...rs[0], p: null, sp: null, term: null }) });
      const c3 = SP.grid({ id: "i3", search: false, emptyFoot: false, cls: "fit", empty: "No results found", cols: [smallThumb, { key: "sp", label: "Sponsored" }, { key: "term", label: "Search term" }, { key: "orders", label: "Orders", align: "r" }, { key: "spend", label: "Spend", align: "r" }, { key: "cpc", label: "CPC", align: "r" }, { key: "conv", label: "Conversion", align: "r" }, { key: "acos", label: "ACOS", align: "r" }, { key: "pl", label: "P&amp;L", align: "r" }], rows: [] });
      const c4 = SP.grid({ id: "i4", search: false, noFoot: true, cls: "fit", cols: [{ key: "camp", label: "Campaign", w: 200 }, { key: "ag", label: "Ad group", w: 160 }, { key: "kw", label: "Keyword", w: 110 }, { key: "clicks", label: "Clicks", align: "r" }, { key: "bid", label: "Current bid", align: "r", fmt: money }, { key: "cpc", label: "CPC", align: "r", fmt: money }, { key: "pl", label: "P&amp;L", align: "r", fmt: pl }],
        rows: [{ camp: `SD-BROAD-VIDEO - ${P[0].asin}`, ag: `${P[0].asin} - Blue`, kw: "audience: interested shoppers", clicks: 92, bid: 0.2, cpc: 0.3, pl: -27.65 }, { camp: `SP-EXACT-RANK - ${P[1].asin}`, ag: "Exact", kw: "training rope with handles", clicks: 23, bid: 1, cpc: 1.19, pl: -27.37 }],
        sum: rs => ({ clicks: rs.reduce((a, r) => a + r.clicks, 0), cpc: rs.reduce((a, r) => a + r.cpc, 0) / rs.length, pl: rs.reduce((a, r) => a + r.pl, 0) }) });
      const insights = `${SP.panel(`<div class="frow">${ctl.range("", 30)}${ctl.products()}${ctl.apply()}</div>`, "")}
        ${card("Search Terms with 0 Sales", c1, "[Tip]: You can remove poor search terms automatically with [Automation].", "st0")}
        ${card("Search Terms with High ACOS", c2, "[Tip]: Use [Automation] strategies to improve your advertising results.", "acos")}
        ${card("Performing Search Terms", c3, "[Tip]: Use [Mass Campaigns] to give each keyword its own campaign, then add automation to scale sales.", "perf")}
        ${card("Keywords with 0 Sales", c4, "[Tip]: Pause or lower bids on keywords that keep spending without sales.", "kw0")}`;
      const avail = `<div class="reports">${reports.map(([h, t, d]) => `<a class="report" href="${h}"><b>${t}</b><span>${d}</span></a>`).join("")}</div>`;
      return `${SP.tabs("ai", ["Actionable insights", "Available reports"])}${SP.panels("ai", [insights, avail])}`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        const ed = e.target.closest("[data-edit]");
        if (ed) SP.modal("Edit insight filter", `<label class="field"><span>Minimum clicks</span><input type="number" value="10"></label><label class="field"><span>Maximum orders</span><input type="number" value="0"></label><label class="field"><span>Look-back window (days)</span><input type="number" value="30"></label>`, () => SP.toast("Filter saved."));
        if (e.target.closest("[data-apply]")) SP.toast("Insights updated for the chosen dates.");
      });
    },
  };
  SP.pages["/Ads/Insights"] = SP.pages["/Ads"];

  // ---------- Performance ----------
  const perfRows = (() => {
    const base = [[1, "Products", 119089, 883, 30, 30, 690.7, 721.31], [0, "Products", 68401, 251, 12, 13, 297.87, 238.67], [0, "Brands", 14676, 153, 9, 9, 210.91, 141.8], [1, "Brands", 20073, 145, 3, 3, 74.97, 134.05], [1, "Display", 46415, 248, 2, 2, 45.98, 90.74], [0, "Display", 9948, 92, 0, 0, 0, 27.65]];
    return base.map(([i, sp, imp, clicks, orders, units, sales, spend]) => ({ p: P[i], sp, imp, clicks, orders, units, sales, conv: clicks ? (orders / clicks) * 100 : 0, spend, acos: sales ? (spend / sales) * 100 : 0, cpc: spend / clicks }));
  })();
  const perfCols = [{ key: "p", label: "Product", muted: true, fmt: p => SP.productCell(p) }, { key: "sp", label: "Sponsored", filter: true }, { key: "imp", label: "Impressions", align: "r", filter: true, fmt: int }, { key: "clicks", label: "Clicks", align: "r", filter: true }, { key: "orders", label: "Orders", align: "r", filter: true, fmt: v => v || "" }, { key: "units", label: "Units", align: "r", filter: true, fmt: v => v || "" }, { key: "sales", label: "Sales", align: "r", filter: true, fmt: v => (v ? money(v) : "") }, { key: "conv", label: "Conversion", align: "r", filter: true, fmt: v => (v ? pct(v) : "") }, { key: "spend", label: "Spend", align: "r", filter: true, fmt: money }, { key: "acos", label: "ACOS", align: "r", fmt: v => (v ? pct(v) : "") }, { key: "cpc", label: "CPC", align: "r", fmt: money }];
  const sumPerf = rs => { const s = { imp: 0, clicks: 0, orders: 0, units: 0, sales: 0, spend: 0 }; rs.forEach(r => Object.keys(s).forEach(k => (s[k] += r[k]))); return { ...s, conv: (s.orders / s.clicks) * 100, acos: (s.spend / s.sales) * 100, cpc: s.spend / s.clicks }; };
  const learnFilters = (extra = []) => SP.actions(Object.assign([{ yt: true, label: "Learn", act: "learn" }, { icon: "funnel", label: "Filters", act: "filters" }, { icon: "download", label: "Download as CSV", act: "csv", caret: extra.caret }], { extra: extra.html || "" }));

  SP.pages["/Ads/Performance"] = {
    title: "Performance",
    render() {
      const dims = ["Products", "Ad types", "Portfolios", "Campaigns", "Ad groups", "Product ads", "Keywords", "Match types", "Placements"];
      return `${learnFilters()}
        ${SP.panel(`<div class="frow">${ctl.range("", 30)}${ctl.products()}${ctl.select("Select filter", ["No filter", "Spend > $10", "ACOS > 100%", "Zero orders"])}${ctl.apply()}</div>`)}
        <div class="scrolltabs"><button class="st-arrow" data-st="-1" aria-label="Scroll tabs left">◂</button>${SP.tabs("perf", dims)}<button class="st-arrow" data-st="1" aria-label="Scroll tabs right">▸</button></div>
        ${SP.grid({ id: "perf", cols: perfCols, rows: perfRows, sum: sumPerf, toolsBefore: "", tools: `<div class="anchor"><button class="plain-btn" data-view>${svg(I.columns)}Default view ${SP.caret}</button></div>` })}
        ${SP.meta("Updated just now")}`;
    },
    wire(root) {
      root.addEventListener("tab", e => {
        if (e.detail.id !== "perf") return;
        const g = SP._grids.perf, dim = ["Products", "Ad types", "Portfolios", "Campaigns", "Ad groups", "Product ads", "Keywords", "Match types", "Placements"][e.detail.i];
        if (e.detail.i === 0) { g.cols = perfCols; g.rows = perfRows; }
        else {
          const names = { "Ad types": ["Sponsored Products", "Sponsored Brands", "Sponsored Display"], Portfolios: ["Main portfolio", "No portfolio"], Campaigns: ["SP-AUTO-RANK", "SP-EXACT-RANK", "SB-VIDEO-BRAND", "SD-BROAD-VIDEO"], "Ad groups": ["Auto", "Exact", "Broad", "Video"], "Product ads": P.slice(0, 2).map(p => p.sku), Keywords: ["training rope", "jump rope for women", "home gym equipment", "cordless battle rope"], "Match types": ["Exact", "Phrase", "Broad", "Auto"], Placements: ["Top of search", "Product pages", "Rest of search"] }[dim];
          const r = SP.rng(e.detail.i + 3);
          g.cols = [{ key: "name", label: dim.replace(/s$/, ""), filter: true }, ...perfCols.slice(2)];
          g.rows = names.map(n => { const imp = Math.round(5000 + r() * 90000), clicks = Math.round(imp * (0.003 + r() * 0.008)), orders = Math.round(clicks * r() * 0.06), sales = orders * 23.4, spend = clicks * (0.6 + r() * 0.6); return { name: n, imp, clicks, orders, units: orders, sales, conv: clicks ? (orders / clicks) * 100 : 0, spend, acos: sales ? (spend / sales) * 100 : 0, cpc: spend / clicks }; });
        }
        g.sortKey = null; SP.refreshGrid("perf");
      });
      root.addEventListener("click", e => {
        const st = e.target.closest("[data-st]"); if (st) $(".ptabs", st.parentElement).scrollBy({ left: +st.dataset.st * 200, behavior: "smooth" });
        if (e.target.closest("[data-act=learn]")) SP.modal("Learn", `<div class="video-ph">${svg(I.play)}</div><p>A short walkthrough of this report would play here.</p>`);
        if (e.target.closest("[data-act=filters]")) SP.modal("Filters", `<label class="field"><span>Minimum spend ($)</span><input type="number" value="0"></label><label class="field"><span>Maximum ACOS (%)</span><input type="number" placeholder="Any"></label>`, () => SP.toast("Filter saved."));
        const v = e.target.closest("[data-view]"); if (v) { e.stopPropagation(); SP.popover(v, [{ label: "Default view" }, { label: "Compact view" }, { label: "Profit view" }], it => (v.firstChild.nextSibling.textContent = it.label)); }
        if (e.target.closest("[data-apply]")) SP.toast("Report updated.");
      });
    },
  };

  // ---------- Search terms ----------
  SP.pages["/Ads/SearchTerms"] = {
    title: "Search terms",
    render() {
      const rows = [[1, 52489, 1186, 31, 651.69, 1092.7], [0, 15376, 645, 31, 684.69, 644.6]].map(([i, imp, clicks, orders, sales, spend]) => ({ _k: P[i].asin, p: P[i], tracked: "", imp, clicks, orders, sales, conv: (orders / clicks) * 100, spend }));
      const terms = TERMS.map(([t, imp, clicks, v], i) => ({ term: t, p: P[i % 2], imp, clicks, orders: i === 1 ? 2 : 0, spend: -v + clicks * 0.1, rank: i < 3 ? `#${i * 7 + 3}` : "" }));
      const tracker = `<span class="tracker"><span>${svg(I.keyword)}<b>Rank tracker</b></span><span>Tracking keywords: <b data-tc>0/30</b></span><span>Available: <b data-ta>30</b></span></span>`;
      return `${learnFilters({ caret: true, html: tracker })}
        ${SP.panel(`<div class="frow">${ctl.range("", 90, "Last 90 Days")}${ctl.products()}${ctl.select("Select filter", ["No filter", "Zero sales", "High ACOS"])}</div><div class="frow">${ctl.apply("Update")}</div>`)}
        ${SP.tabs("stt", ["Products", "Search terms"])}
        ${SP.panels("stt", [
          SP.grid({ id: "stp", columns: true, details: r => `<div class="detpanel">${TERMS.slice(0, 4).map(t => `<span class="chip-s">${t[0]}</span>`).join("")}</div>`, cols: [{ key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p) }, { key: "asin", label: "ASIN", fmt: (v, r) => `<span class="ellip w150">${SP.esc(r.p.title)}</span><small class="sub">${r.p.asin}, ${r.p.sku}</small>` }, { key: "tracked", label: "Tracked<br>keywords", align: "r" }, { key: "imp", label: "Impressions", align: "r", filter: true, fmt: int }, { key: "clicks", label: "Clicks", align: "r", filter: true, fmt: int }, { key: "orders", label: "Orders", align: "r", filter: true }, { key: "sales", label: "Sales", align: "r", filter: true, fmt: money }, { key: "conv", label: "Conversion", align: "r", filter: true, fmt: v => pct(v) }, { key: "spend", label: "Spend", align: "r", filter: true, fmt: money }], rows, sum: rs => ({ imp: rs.reduce((a, r) => a + r.imp, 0), clicks: rs.reduce((a, r) => a + r.clicks, 0), orders: rs.reduce((a, r) => a + r.orders, 0), sales: rs.reduce((a, r) => a + r.sales, 0), conv: 3.39, spend: rs.reduce((a, r) => a + r.spend, 0) }) }),
          SP.grid({ id: "stt", columns: true, cols: [{ key: "term", label: "Search term", filter: true }, { key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p, "sm") }, { key: "imp", label: "Impressions", align: "r", fmt: int }, { key: "clicks", label: "Clicks", align: "r" }, { key: "orders", label: "Orders", align: "r" }, { key: "spend", label: "Spend", align: "r", fmt: money }, { key: "rank", label: "Rank", align: "r" }, { key: "term", label: "Track", muted: true, fmt: t => `<button class="link-btn" data-track="${SP.esc(t)}">Track</button>` }], rows: terms }),
        ])}
        ${SP.meta("Updated just now")}`;
    },
    wire(root) {
      let n = 0;
      root.addEventListener("click", e => {
        const t = e.target.closest("[data-track]");
        if (t && !t.disabled) { n++; t.textContent = "Tracking"; t.disabled = true; $("[data-tc]", root).textContent = `${n}/30`; $("[data-ta]", root).textContent = 30 - n; }
        if (e.target.closest("[data-apply]")) SP.toast("Search terms updated.");
      });
    },
  };

  // ---------- Best metrics ----------
  SP.pages["/Ads/BestMetrics"] = {
    title: "Best metrics",
    render() {
      return `${SP.actions([{ icon: "download", label: "Download as CSV", act: "csv" }])}
        ${SP.note("Note: Only keywords and targets with 2 or more orders are used to find the best results.")}
        ${SP.panel(`<div class="frow">${ctl.range("", 30)}${ctl.apply()}</div>`)}
        ${SP.grid({ id: "bm", columns: true, cols: [{ key: "type", label: "Type", filter: true }, { key: "camp", label: "Campaign", filter: true, w: 180, fmt: v => `<span class="clamp3">${v}</span>` }, { key: "ag", label: "Ad group", filter: true, w: 150, fmt: v => `<span class="clamp3">${v}</span>` }, { key: "kw", label: "Keyword", filter: true }, { key: "st", label: "<span class='dot g'></span>", filter: true, sort: false, fmt: () => "<span class='dot g'></span>" }, { key: "match", label: "Match", filter: true }, { key: "best", label: "Best metrics", filter: true }],
          rows: [{ type: "SP Manual", camp: "Rope bundle | US | Rank | \"training rope for home\"", ag: "Rope bundle | US | Rank | \"training rope for home\"", kw: "training rope for home", match: "exact", best: "Conversion, CTR, Orders" }] })}
        ${SP.meta("Updated just now")}`;
    },
  };

  // ---------- Competing keywords ----------
  SP.pages["/Ads/CompetingKeywords"] = {
    title: "Competing keywords",
    render() {
      const kws = ["training rope with handles", "training rope with handles", "weighted training rope", "weighted training rope", "cordless battle rope", "ropeless jump rope", "ropeless jump rope", "cordless battle rope", "training rope for home gym", "weighted jump rope", "home gym rope", "battle rope 30 ft", "heavy jump rope", "rope workout", "fitness rope", "gym rope", "battle ropes for exercise", "jump rope adult", "skipping rope", "rope trainer", "anchor rope"];
      const r = SP.rng(9);
      const rows = kws.map((kw, i) => { const imp = Math.round(13000 / (i + 1) + r() * 400), clicks = Math.round(imp * (0.004 + r() * 0.004)), orders = r() < 0.6 ? Math.round(r() * 3) : 0; return { _k: `${i}`, asin: P[i % 2 ? 0 : 1].asin, sp: "Brands", kw, match: "broad", found: i < 8 ? 5 : 2, imp, clicks, orders: orders || null, units: orders || null }; });
      return `${SP.panel(`<div class="frow">${ctl.range("", 30)}${ctl.products()}${ctl.apply()}</div>`)}
        ${SP.grid({ id: "ck", columns: true, pageSize: 10, details: r => `<div class="detpanel">Found in ${r.found} campaigns: ${["SB-VIDEO", "SB-HEADLINE", "SP-AUTO", "SP-BROAD", "SP-EXACT"].slice(0, r.found).map(c => `<span class="chip-s">${c}</span>`).join("")}</div>`, cols: [{ key: "asin", label: "ASIN", filter: true }, { key: "sp", label: "Sponsored", filter: true }, { key: "kw", label: "Keyword", filter: true, w: 120, fmt: v => `<span class="clamp2">${v}</span>` }, { key: "match", label: "Match", filter: true }, { key: "found", label: "Found", align: "r" }, { key: "imp", label: "Impressions", align: "r", filter: true, fmt: int }, { key: "clicks", label: "Clicks", align: "r", filter: true }, { key: "orders", label: "Orders", align: "r", filter: true, fmt: v => v || "" }, { key: "units", label: "Units", align: "r", filter: true, fmt: v => v || "" }], rows, sortKey: "found" })}
        ${SP.meta("Updated just now")}`;
    },
  };

  // ---------- Negative keywords ----------
  SP.pages["/Ads/NegativeKeywords"] = {
    title: "Negative keywords",
    render() {
      const cols = [{ key: "asin", label: "ASIN", filter: true, sort: false }, { key: "camp", label: "Campaign", filter: true }, { key: "ag", label: "Ad group", filter: true }, { key: "kw", label: "Keyword", filter: true }, { key: "units", label: "Units", align: "r", filter: true }, { key: "sales", label: "Sales", align: "r", filter: true }, { key: "spend", label: "Spend", align: "r", filter: true }, { key: "acos", label: "ACOS", align: "r", filter: true }];
      const tools = `<button class="btn-red" data-remove>Remove</button>`;
      return `${SP.panel(`<div class="frow">${ctl.range("", 7, "Last 7 Days")}${ctl.products()}${ctl.apply("Update")}</div>`)}
        ${SP.tabs("nk", ["Sponsored Products", "Sponsored Brands"])}
        ${SP.panels("nk", [SP.grid({ id: "nk1", check: true, columns: true, toolsBefore: tools, cols, rows: [], empty: "No negative keywords found." }), SP.grid({ id: "nk2", check: true, columns: true, toolsBefore: tools, cols, rows: [], empty: "No negative keywords found." })])}`;
    },
    wire(root) { root.addEventListener("click", e => { if (e.target.closest("[data-remove]")) SP.toast("Select negative keywords to remove first."); }); },
  };

  // ---------- Main words ----------
  SP.pages["/Ads/MainKeywords"] = {
    title: "Main words",
    render() {
      const words = ["rope", "training", "weighted", "home", "gym", "cordless", "jump", "battle", "workout", "fitness", "women", "handles"];
      return `${learnFilters()}
        ${SP.panel(`<div class="frow">${ctl.range("", 90, "Last 90 Days")}${ctl.products()}${ctl.select("Select filter", ["No filter", "Top words"])}</div><div class="frow">${ctl.apply("Update")}</div>`)}
        ${SP.grid({ id: "mw", columns: true, cls: "fit", details: r => `<div class="detpanel">${words.map((w, i) => `<span class="chip-s">${w} <b>${Math.round(r.words / (i + 2))}</b></span>`).join("")}</div>`, cols: [thumbCol, { key: "asin", label: "ASIN", filter: true, fmt: (v, r) => `${v}<small class="sub">${r.p.sku}</small>` }, { key: "title", label: "Title", filter: true, w: 260, fmt: v => `<span class="clamp2">${SP.esc(v)}</span>` }, { key: "words", label: "Words", align: "r", filter: true }], rows: [{ _k: "a", p: P[1], asin: P[1].asin, title: P[1].title, words: 479 }, { _k: "b", p: P[0], asin: P[0].asin, title: P[0].title, words: 425 }] })}
        ${SP.meta("Updated just now")}`;
    },
  };

  // ---------- Dead keywords ----------
  SP.pages["/Ads/DeadKeywords"] = {
    title: "Dead keywords",
    render() {
      return `${SP.panel(`<div class="frow">${ctl.range("", 90, "Last 90 Days")}${ctl.products()}${ctl.apply()}</div>`)}
        ${SP.grid({ id: "dk", columns: true, cols: [{ key: "camp", label: "Campaign", filter: true }, { key: "ag", label: "Ad group", filter: true }, { key: "kw", label: "Keyword", filter: true }, { key: "match", label: "Match", filter: true }, { key: "imp", label: "Impressions", align: "r", filter: true }, { key: "clicks", label: "Clicks", align: "r", filter: true }, { key: "spend", label: "Spend", align: "r", filter: true }, { key: "orders", label: "Orders", align: "r", filter: true }, { key: "units", label: "Units", align: "r", filter: true }], rows: [], empty: "No records found.<br>If you connected your ads recently (within the chosen dates), there may be no dead keywords yet." })}
        ${SP.meta("Updated just now")}`;
    },
  };

  // ---------- Advertising trend ----------
  const AD_METRICS = [["PPC Sales", "ppcSales", money, null], ["PPC Cost", "ppcCost", money, null], ["Profits", "profits", money, "up", { link: true, negRed: true }], ["Profit Margin", "margin", v => `${v.toFixed(1)}%`, "up"], ["ACOS", "acos", v => pct(v), "down"], ["Orders", "ppcOrders", int, null], ["Units", "ppcUnits", int, null], ["Conversion", "ppcConversion", v => pct(v), "up"], ["CPC", "cpc", money, "down"], ["Impressions", "impressions", int, null], ["Clicks", "clicks", int, null], ["CTR", "ctr", v => pct(v), null], ["Cost Per Order", "costPerOrder", money, null], ["Avg Sales Price", "asp", money, null, { hl: 19.5 }]];
  function adTrend(st, scale, seedOff) {
    const cols = [];
    for (let i = st.cols - 1; i >= 0; i--) {
      const end = SP.addDays(st.last, -i * st.days), start = SP.addDays(end, -st.days + 1);
      const p = SP.period(Math.floor(start / 864e5) + seedOff, st.days);
      for (const k of ["ppcSales", "ppcCost", "ppcOrders", "ppcUnits", "impressions", "clicks"]) p[k] *= scale;
      p.profits = p.ppcSales * 0.35 - p.ppcCost; p.margin = p.ppcSales ? (p.profits / p.ppcSales) * 100 : 0;
      cols.push({ start, end, p });
    }
    const sum = SP.sumPeriods(cols.map(c => c.p));
    return SP.trend({ corner: "Metrics", heads: cols.map(c => ({ top: SP.dd(c.start), bottom: SP.dd(c.end) })), rows: AD_METRICS.map(([label, key, fmt, heat, o = {}]) => ({ label, key, fmt, heat, ...o, summary: sum[key], values: cols.map(c => c.p[key]) })) });
  }
  SP.pages["/Ads/AdvertisingTrend"] = {
    title: "Advertising trend",
    render() {
      return `${SP.panel(`<div class="frow">${ctl.num("Columns:", 8, "cols")}${ctl.num("Days per column:", 7, "days")}${ctl.date("Last date:", SP.lastDate)}${ctl.products()}${ctl.apply()}</div>`)}<div id="adt"></div>`;
    },
    wire(root) {
      const st = { cols: 8, days: 7, last: SP.lastDate };
      const draw = () => { $("#adt", root).innerHTML = `<h4 class="ttl">Advertising trend for Sponsored Products</h4>${adTrend(st, 1, 0)}<h4 class="ttl">Advertising trend for Sponsored Brands</h4>${adTrend(st, 0.25, 77)}`; SP.paintHeat(root); };
      draw();
      root.addEventListener("click", e => {
        if (!e.target.closest("[data-apply]")) return;
        $$("[data-k]", root).forEach(i => { if (i.dataset.k === "cols") st.cols = Math.min(16, Math.max(1, +i.value || 1)); if (i.dataset.k === "days") st.days = Math.max(1, +i.value || 1); if (i.dataset.k === "last" && i.value) st.last = new Date(i.value + "T00:00:00"); });
        draw();
      });
    },
  };

  // ---------- Search term trend ----------
  SP.pages["/Ads/SearchTermTrend"] = {
    title: "Search term trend",
    render() {
      return `${SP.panel(`<div class="frow">${ctl.num("Columns:", 8, "cols")}${ctl.num("Days per column:", 7, "days")}${ctl.date("Last date:", SP.today)}${ctl.select("Select product", P.map(p => p.short))}</div><div class="frow">${ctl.text("Enter search term", "term")}${ctl.apply()}</div>`)}
        <div id="stt-out"><p class="lead">Choose a product and enter a search term to see its trend.</p></div>`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (!e.target.closest("[data-apply]")) return;
        const term = $("[data-k=term]", root).value.trim(), prod = $("[data-select]", root).dataset.value;
        if (!term || !prod) { $("#stt-out", root).innerHTML = `<p class="lead">Choose a product and enter a search term to see its trend.</p>`; return; }
        const st = { cols: +$("[data-k=cols]", root).value || 8, days: +$("[data-k=days]", root).value || 7, last: new Date(($("[data-k=last]", root).value || SP.iso(SP.today)) + "T00:00:00") };
        $("#stt-out", root).innerHTML = `<h4 class="ttl">"${SP.esc(term)}" — ${SP.esc(prod)}</h4>${adTrend(st, 0.12, term.length * 13)}`;
        SP.paintHeat(root);
      });
    },
  };

  // ---------- Link ads with ASINs ----------
  SP.pages["/Ads/LinkAdsWithAsin"] = {
    title: "Link ads with ASINs",
    render() {
      const rows = [[1, 8], [0, 6]].map(([i, ads]) => ({ _k: P[i].asin, status: "Active", auto: "Not automated", p: P[i], sku: P[i].sku, asin: P[i].asin, title: P[i].title, ads }));
      const linked = SP.grid({ id: "la", details: r => `<div class="detpanel">${Array.from({ length: Math.min(r.ads, 4) }, (_, i) => `<span class="chip-s">${["SP-AUTO", "SP-EXACT", "SB-VIDEO", "SD-BROAD"][i]} · ${r.sku}</span>`).join("")}</div>`, cols: [{ key: "status", label: "Status", filter: true }, { key: "auto", label: "Automation", filter: true }, thumbCol, { key: "sku", label: "SKU", filter: true, sort: false }, { key: "asin", label: "ASIN", filter: true, sort: false }, { key: "title", label: "Title", sort: false, w: 160, fmt: v => `<span class="clamp4">${SP.esc(v)}</span>` }, { key: "ads", label: "Ads", align: "r" }], rows });
      const adsGrid = SP.grid({ id: "la2", cols: [{ key: "camp", label: "Campaign" }, { key: "ag", label: "Ad group" }, { key: "sku", label: "SKU" }, { key: "asin", label: "Linked ASIN" }], rows: P.slice(0, 2).flatMap(p => ["SP-AUTO", "SP-EXACT", "SB-VIDEO"].map(c => ({ camp: `${c} - ${p.asin}`, ag: c.split("-")[1], sku: p.sku, asin: p.asin }))) });
      const unlinked = id => SP.grid({ id, cols: [{ key: "camp", label: "Campaign" }, { key: "ad", label: "Ad" }, { key: "x", label: "Link to", muted: true, fmt: () => `<button class="link-btn" data-link>Link ASIN</button>` }], rows: [], empty: "Every ad is linked to an ASIN." });
      const bulk = `${SP.step(1, "Download the link template")}<button class="btn-dark sm" data-act="csv">Download</button><hr class="sep">${SP.step(2, "Upload your file")}${SP.fileInput()}<div><button class="btn-dark sm" data-upl>Upload</button></div>`;
      return `${SP.tabs("lk", ["Linked ads", "Unlinked Sponsored Product", "Unlinked Sponsored Display", "Bulk operations"])}
        ${SP.panels("lk", [`${SP.tabs("lk2", ["Products", "Ads"], 0, "sub")}${SP.panels("lk2", [linked, adsGrid])}`, unlinked("lu1"), unlinked("lu2"), bulk])}`;
    },
    wire(root) { root.addEventListener("click", e => { if (e.target.closest("[data-upl]")) SP.toast("Choose a file to upload."); }); },
  };
})();
