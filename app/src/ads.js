/* Restock forecasting and Ads insights sections. */
(() => {
  "use strict";
  const SP = window.SP, { $, $$, svg, ICON: I, money, pct, int, ctl } = SP;
  const P = SP.PRODUCTS;
  const thumbCol = { key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p) };
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
  /** @type {[string, number, number, number][]} */
  const TERMS = [
    ["training rope with handles", 5921, 23, -27.37], ["training rope", 1450, 14, -15.23], ["cordless battle rope", 284, 12, -11.84],
    ["jump rope for women", 1004, 10, -10.59], ["home gym equipment", 374, 11, -10.42], ["home workout rope", 473, 17, -10.15],
  ];
  const insightIds = { st0: "zero-sales", acos: "high-acos", perf: "performing" };
  const insightLink = (id, range = {}) => {
    const initial = SP.rangeFor("Last 30 Days");
    return `/Ads/SearchTerms?${new URLSearchParams({ filterId: insightIds[id], from: range.from || SP.iso(initial.from), to: range.to || SP.iso(initial.to) })}`;
  };
  const card = (title, body, tip, id, range) => `<section class="icard" ${id === "st0" ? "data-zero-card" : id === "acos" ? "data-hacos-card" : id === "perf" ? "data-perf-card" : ""}><header><h3>${title}</h3><button class="link-btn" data-edit="${id}">${svg(I.pencil)}Edit</button><a href="${insightIds[id] ? insightLink(id, range) : "/Ads/DeadKeywords"}" class="see">See details ${svg(I.chevronR)}</a></header><div class="icard-body">${body}</div><footer>${tip}</footer></section>`;
  const reports = [["/Ads/Performance", "Performance", "Spend, sales and conversion by product, campaign, keyword and more."], ["/Ads/SearchTerms", "Search terms", "What shoppers typed before clicking your ads."], ["/Ads/BestMetrics", "Best metrics", "Keywords with the strongest results."], ["/Ads/CompetingKeywords", "Competing keywords", "Keywords where your own ads compete."], ["/Ads/NegativeKeywords", "Negative keywords", "Negatives across campaigns."], ["/Ads/MainKeywords", "Main words", "The words that drive each product."], ["/Ads/DeadKeywords", "Dead keywords", "Keywords with no impressions."], ["/Ads/AdvertisingTrend", "Advertising trend", "Week-by-week advertising results."], ["/Ads/SearchTermTrend", "Search term trend", "How one search term performs over time."]];

  // The card's metrics as [key, label, column heading, format], matching the API's. Break even bid
  // needs product costs, which aren't connected yet, so its filters and column stay disabled.
  const ZERO_METRICS = [
    ["impressions", "Impressions", "Impressions", int], ["clicks", "Clicks", "Clicks", int], ["orders", "Orders", "Orders", int], ["units", "Units", "Units", int],
    ["cpc", "Cost per click", "CPC", money], ["ctr", "CTR %", "CTR", v => pct(v)], ["conversion", "Conversion %", "Conversion", v => pct(v)], ["acos", "ACOS %", "ACOS", v => pct(v)],
    ["roas", "ROAS", "ROAS", v => v.toFixed(2)], ["spend", "Spend", "Spend", money], ["sales", "Sales", "Sales", money], ["pl", "P&L", "P&amp;L", pl], ["breakEvenBid", "Break even bid", "Break even bid", money],
  ];
  const UNAVAILABLE = new Set(["breakEvenBid"]);
  const ZERO_DEFAULTS = { name: "Search Terms with 0 Sales", description: "[Tip]: You can automatically remove poor performing search terms using Automation.", showTracked: true, hideAsins: true, hideKeywords: false, sort: "spend", dir: "desc", filters: { spend: { min: 10 }, orders: { max: 0 } }, track: ["impressions", "clicks", "pl"], order: [] };
  // The High ACOS card runs the same machinery with its own defaults: ACOS at 50% and up, worst first.
  const HIGH_ACOS_DEFAULTS = { name: "Search Terms with High ACOS", description: "[Tip]: Use [Automation] strategies to improve your advertising results.", showTracked: true, hideAsins: true, hideKeywords: false, sort: "acos", dir: "desc", filters: { acos: { min: 50 } }, track: ["impressions", "clicks", "sales", "acos"], order: [] };
  // The Performing Search Terms card runs the same machinery with its own defaults: conversion at
  // 15% and up, best converting first.
  const PERFORMING_DEFAULTS = { name: "Performing Search Terms", description: "[Tip]: Use [Mass Campaigns] to give each keyword its own campaign, then add automation to scale sales.", showTracked: true, hideAsins: true, hideKeywords: false, sort: "conversion", dir: "desc", filters: { conversion: { min: 15 } }, track: ["impressions", "clicks", "orders", "sales", "conversion"], order: [] };
  const zeroDefaults = () => JSON.parse(JSON.stringify(ZERO_DEFAULTS));
  const acosDefaults = () => JSON.parse(JSON.stringify(HIGH_ACOS_DEFAULTS));
  const performingDefaults = () => JSON.parse(JSON.stringify(PERFORMING_DEFAULTS));
  const asinTerm = /^B0[A-Z0-9]{8}$/i;
  // Sample rows with every metric, filtered, sorted and paged by the settings as the API does for real data.
  const zeroRow = ([term, impressions, clicks, loss], i) => ({ term, sponsored: "Products", p: P[i % 2], impressions, clicks, orders: 0, units: 0, spend: -loss, sales: 0, cpc: -loss / clicks, ctr: (clicks / impressions) * 100, conversion: 0, acos: null, roas: 0, pl: loss, breakEvenBid: null });
  // High ACOS sample rows as [term, impressions, clicks, spend, sales, orders]; the last two sit
  // below the card's default 50% filter, and one is an ASIN, so each setting has something to do.
  const ACOS_TERMS = [
    ["weighted jump rope", 4200, 55, 52.31, 35.9, 3], ["jump rope for men", 3100, 38, 30.12, 27.3, 2], ["speed jump rope", 2600, 44, 31.87, 30.1, 2],
    ["B0JUMP99XY", 1500, 22, 21.4, 12.99, 1], ["adjustable jump rope", 5300, 61, 41.2, 49.5, 4], ["fitness rope", 1200, 15, 12.75, 14.2, 1],
    ["boxing jump rope", 900, 12, 10.8, 9.99, 1], ["jump rope workout", 2000, 25, 19.5, 26.4, 2], ["rope skipping", 800, 10, 7.9, 8.5, 1],
    ["jump rope for kids", 3400, 30, 8.2, 25.0, 3], ["leather jump rope", 1100, 14, 5.5, 22.0, 2],
  ];
  const acosRow = ([term, impressions, clicks, spend, sales, orders], i) => ({ term, sponsored: "Products", p: P[i % 2], impressions, clicks, orders, units: orders, spend, sales, cpc: spend / clicks, ctr: (clicks / impressions) * 100, conversion: (orders / clicks) * 100, acos: (spend / sales) * 100, roas: sales / spend, pl: sales - spend, breakEvenBid: null });
  // Performing Search Terms sample rows as [term, impressions, clicks, spend, sales, orders]; the
  // last two sit below the card's default 15% conversion filter, and one is an ASIN.
  /** @type {[string, number, number, number, number, number][]} */
  const PERFORMING_TERMS = [
    ["training rope with handles", 2600, 44, 31.87, 60.1, 9], ["speed jump rope", 2100, 36, 24.5, 48.3, 7],
    ["weighted jump rope", 4200, 55, 52.31, 71.8, 10], ["jump rope for men", 3100, 38, 30.12, 54.6, 8],
    ["B0JUMP99XY", 1500, 22, 21.4, 25.99, 4], ["adjustable jump rope", 5300, 61, 41.2, 95.4, 14],
    ["fitness rope", 1200, 15, 12.75, 28.2, 5], ["boxing jump rope", 900, 12, 10.8, 19.98, 4],
    ["jump rope workout", 2000, 25, 19.5, 46.4, 8], ["rope skipping", 800, 10, 7.9, 16.5, 3],
    ["jump rope for kids", 3400, 30, 8.2, 50.0, 11], ["leather jump rope", 1100, 14, 5.5, 44.0, 8],
    ["digital counting jump rope", 1700, 28, 22.1, 18.2, 2], ["jump rope", 6000, 90, 60.4, 58.5, 9],
  ];
  function sampleInsight(rows, settings, page) {
    const all = rows
      .filter(r => Object.entries(settings.filters).every(([k, f]) => r[k] != null && (f.min == null || r[k] >= f.min) && (f.max == null || r[k] <= f.max))
        && !(settings.hideAsins && asinTerm.test(r.term)) && !(settings.hideKeywords && !asinTerm.test(r.term)))
      .sort((a, b) => {
        const x = a[settings.sort], y = b[settings.sort];
        return x == null || y == null ? Number(x == null) - Number(y == null) : (Number(x) - Number(y)) * (settings.dir === "asc" ? 1 : -1);
      });
    const rowsPage = all.slice(page * 7, page * 7 + 7), sum = k => rowsPage.reduce((n, r) => n + r[k], 0);
    const spend = sum("spend"), clicks = sum("clicks"), impressions = sum("impressions"), orders = sum("orders"), sales = sum("sales");
    return {
      page, pageSize: 7, total: all.length, rows: rowsPage, settings,
      totals: { impressions, clicks, orders, units: sum("units"), spend, sales, cpc: clicks ? spend / clicks : null, ctr: impressions ? (clicks / impressions) * 100 : null, conversion: clicks ? (orders / clicks) * 100 : null, acos: sales ? (spend / sales) * 100 : null, roas: spend ? sales / spend : null, pl: sum("pl"), breakEvenBid: null },
      coverage: { SP_SEARCH: { days: 30, expectedDays: 30 }, SB_SEARCH: { days: 30, expectedDays: 30 } },
    };
  }
  const sampleZero = (settings = zeroDefaults(), page = 0) => sampleInsight(TERMS.map(zeroRow), settings, page);
  const sampleAcos = (settings = acosDefaults(), page = 0) => sampleInsight(ACOS_TERMS.map(acosRow), settings, page);
  const samplePerf = (settings = performingDefaults(), page = 0) => sampleInsight(PERFORMING_TERMS.map(acosRow), settings, page);
  const zeroRows = data => data.rows.map(r => ({ ...r, p: r.p || null, asin: r.asin || "", image: r.image || null, title: r.title || "", products: r.products || [], sp: r.sponsored }));
  // The product's own image (served by this site's /api), else the sample thumbnail or a placeholder.
  // A row naming several products (an ad group advertising them all) shows the first one's photo with
  // a badge counting the rest; hovering or focusing it opens a panel with every product side by side.
  const zeroPhoto = (x, cls) => x.image ? `<img class="${cls}" src="${SP.esc(x.image)}" alt="" loading="lazy">` : `<span class="${cls} zero-none" aria-hidden="true">▣</span>`;
  const zeroProduct = (p, r) => {
    if (r.products.length > 1) {
      // Variants can share a title, so the label names each product by its ASIN too.
      const names = r.products.map(x => (x.title ? `${x.title} (${x.asin})` : x.asin)).join(" + ");
      const panel = r.products.map(x => `<figure>${zeroPhoto(x, "zero-pop-img")}<figcaption>${x.title ? `<span class="clamp2">${SP.esc(x.title)}</span>` : ""}<small>${SP.esc(x.asin)}</small></figcaption></figure>`).join("");
      return `<span class="zero-multi" data-zero-multi tabindex="0" role="img" aria-label="${SP.esc(names)}">${zeroPhoto(r.products[0], "zero-thumb")}<span class="zero-count" aria-hidden="true">+${r.products.length - 1}</span><span class="zero-pop" aria-hidden="true">${panel}</span></span>`;
    }
    return r.image ? `<img class="zero-thumb" src="${SP.esc(r.image)}" alt="${SP.esc(r.title || r.asin)}" title="${SP.esc(r.title || r.asin)}" loading="lazy">`
      : p ? SP.thumb(p, "sm") : `<span class="zero-product" title="${SP.esc(r.asin)}" aria-label="Product image unavailable">▣</span>`;
  };
  const SEARCH_TYPES = { SP_SEARCH: "Sponsored Products", SB_SEARCH: "Sponsored Brands" };
  const day = iso => SP.shortDate(new Date(`${iso}T12:00:00`));
  const zeroPager = data => data.total > 7 ? `<div class="zero-pager" data-zero-pager><button data-zero-prev ${data.page === 0 ? "disabled" : ""}>‹ Previous</button><span>Page ${data.page + 1} of ${Math.ceil(data.total / 7)}</span><button data-zero-next ${data.page >= Math.ceil(data.total / 7) - 1 ? "disabled" : ""}>Next ›</button></div>` : `<div class="zero-pager" data-zero-pager></div>`;
  const zeroStatus = data => {
    if (!SP.usesRealData()) return "";
    const entries = Object.entries(data.coverage || {}), coverage = entries.map(([, c]) => c);
    // Dates Amazon doesn't provide (older than it keeps, or not reported yet) are explained; a sync can't add them.
    const notes = [];
    const older = entries.filter(([, c]) => c.availableFrom && data.from < c.availableFrom);
    if (older.length) notes.push(`Amazon only keeps recent search terms: ${older.map(([k, c]) => `${SEARCH_TYPES[k] || k} from ${day(c.availableFrom)}`).join(", ")}.`);
    const reported = coverage.map(c => c.reportedThrough).filter(Boolean).sort()[0];
    if (reported && data.to > reported) notes.push(`Amazon hasn't reported search terms after ${day(reported)} yet.`);
    // Rows the server couldn't tie to the products advertised on their dates.
    const unmatched = entries.filter(([, c]) => c.unattributedSpend > 0);
    if (unmatched.length) notes.push(`${unmatched.map(([k, c]) => `${SP.money(c.unattributedSpend)} of ${SEARCH_TYPES[k] || k} spend`).join(" and ")} can't be matched to the products it advertised on its dates, so its search terms are left out.`);
    // Synced days only count once the products they belong to can be matched (mapReady).
    const incomplete = !coverage.length || coverage.some(c => c.days < c.expectedDays || c.mapReady === false);
    if (!incomplete) return notes.length ? `<div class="zero-status" data-zero-status>${notes.join(" ")}</div>` : "";
    const reason = coverage.some(c => c.pending) ? "Search term reports are still being prepared."
      : coverage.some(c => c.mapReady === false) && coverage.every(c => c.days >= c.expectedDays) ? "Sponsored Brands search terms can't be matched to products yet."
      : "Search term reports are not fully synced.";
    return `<div class="zero-status" data-zero-status>${[reason, ...notes].join(" ")} <button class="link-btn" data-zero-sync>Sync now</button></div>`;
  };
  // These read as "nothing" when they're 0 (as on most rows of this card), so they're left blank then.
  const BLANK_ZERO = new Set(["orders", "units", "sales", "conversion", "acos", "roas"]);
  // Columns follow the order their headers were dragged into (settings.order); any it doesn't
  // list, such as a metric tracked later, keep their usual order after the ones it does.
  const zeroCols = (s, showIds = false) => {
    const idCell = v => `<span class="clamp2">${SP.esc(v ?? "")}</span>`;
    const cols = [{ key: "p", label: "Product", muted: true, fmt: zeroProduct }, { key: "sp", label: "Sponsored" }, { key: "term", label: "Search term", w: 130, fmt: idCell },
      ...(showIds ? [{ key: "campaignId", label: "Campaign ID", w: 130, fmt: idCell }, { key: "adGroupId", label: "Ad group ID", w: 130, fmt: idCell }] : []),
      ...(s.showTracked ? ZERO_METRICS.filter(([k]) => s.track.includes(k)) : []).map(([key, , label, f]) => ({ key, label, align: "r", fmt: v => (v == null || (v === 0 && BLANK_ZERO.has(key)) ? "" : f(v)) }))];
    const order = s.order || [], rank = c => (order.includes(c.key) ? order.indexOf(c.key) : order.length);
    return cols.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(x => x.c);
  };
  // The pager is the table's last row, so it sits right under the totals at the table's right edge.
  const zeroBody = (data, s, id, showIds = false) => `${zeroStatus(data)}${SP.grid({ id, search: false, noFoot: true, cls: "fit", reorder: true, cols: zeroCols(s, showIds), rows: zeroRows(data), sum: data.totals, below: zeroPager(data) })}`;
  const zeroEdit = s => {
    const sorts = ZERO_METRICS.filter(([k]) => !UNAVAILABLE.has(k)).flatMap(([k, label]) => ["desc", "asc"].map(dir => `<option value="${k}:${dir}" ${s.sort === k && s.dir === dir ? "selected" : ""}>${SP.esc(k === "spend" ? "Cost" : label)} in ${dir === "desc" ? "Descending" : "Ascending"} Order</option>`)).join("");
    const rows = ZERO_METRICS.map(([k, label]) => {
      const off = UNAVAILABLE.has(k) ? ` disabled title="Needs product costs, which aren't connected yet."` : "", f = s.filters[k] || {};
      return `<tr><th>${SP.esc(label)}</th><td><input type="number" step="any" data-min="${k}" value="${f.min ?? ""}"${off}></td><td><input type="number" step="any" data-max="${k}" value="${f.max ?? ""}"${off}></td><td><input type="checkbox" data-track="${k}" ${s.track.includes(k) ? "checked" : ""}${off}></td></tr>`;
    }).join("");
    const box = (k, label) => `<label><input type="checkbox" data-z="${k}" ${s[k] ? "checked" : ""}> ${label}</label>`;
    return `<div class="zero-edit"><label class="field"><span>Name</span><input data-z="name" maxlength="80" value="${SP.esc(s.name)}"></label><label class="field"><span>Description</span><input data-z="description" maxlength="300" value="${SP.esc(s.description)}"></label>${box("showTracked", "Show tracked columns in Overview")}<hr>${box("hideAsins", "Hide ASINs")}${box("hideKeywords", "Hide keywords")}<label class="field"><span>Sort by</span><select data-z="sort">${sorts}</select></label><table><thead><tr><th>Filter conditions</th><th>Min</th><th>Max</th><th>Track</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  // The dialog's values as { settings }, or { error } about the first problem.
  const readZeroEdit = m => {
    const z = k => $(`[data-z=${k}]`, m), filters = {};
    for (const [k, label] of ZERO_METRICS) {
      if (UNAVAILABLE.has(k)) continue;
      const min = $(`[data-min=${k}]`, m).value.trim(), max = $(`[data-max=${k}]`, m).value.trim();
      if (min !== "" && max !== "" && Number(min) > Number(max)) return { error: `The min for ${label} is above its max.` };
      if (min !== "" || max !== "") filters[k] = { ...(min !== "" ? { min: Number(min) } : {}), ...(max !== "" ? { max: Number(max) } : {}) };
    }
    if (!z("name").value.trim()) return { error: "Give the card a name." };
    const [sort, dir] = z("sort").value.split(":");
    return { settings: { name: z("name").value.trim(), description: z("description").value.trim(), showTracked: z("showTracked").checked, hideAsins: z("hideAsins").checked, hideKeywords: z("hideKeywords").checked, sort, dir, filters, track: ZERO_METRICS.map(([k]) => k).filter(k => !UNAVAILABLE.has(k) && $(`[data-track=${k}]`, m).checked) } };
  };

  SP.pages["/Ads"] = {
    title: "Insights overview",
    load: () => {
      if (!SP.usesRealData()) return Promise.resolve({ st0: sampleZero(), acos: sampleAcos(), perf: samplePerf() });
      const r = SP.rangeFor("Last 30 Days"), q = new URLSearchParams({ from: SP.iso(r.from), to: SP.iso(r.to), page: "0" });
      return Promise.all([SP.api.get(`/api/ads/zero-sales?${q}`), SP.api.get(`/api/ads/high-acos?${q}`), SP.api.get(`/api/ads/performing?${q}`)]).then(([st0, acos, perf]) => ({ st0, acos, perf }));
    },
    render(data) {
      const zs = data.st0.settings || zeroDefaults(), as = data.acos.settings || acosDefaults(), ps = data.perf.settings || performingDefaults();
      const c1 = zeroBody(data.st0, zs, "i1");
      const c2 = zeroBody(data.acos, as, "i2");
      const c3 = zeroBody(data.perf, ps, "i3");
      const c4 = SP.grid({ id: "i4", search: false, noFoot: true, cls: "fit", cols: [{ key: "camp", label: "Campaign", w: 200 }, { key: "ag", label: "Ad group", w: 160 }, { key: "kw", label: "Keyword", w: 110 }, { key: "clicks", label: "Clicks", align: "r" }, { key: "bid", label: "Current bid", align: "r", fmt: money }, { key: "cpc", label: "CPC", align: "r", fmt: money }, { key: "pl", label: "P&amp;L", align: "r", fmt: pl }],
        rows: [{ camp: `SD-BROAD-VIDEO - ${P[0].asin}`, ag: `${P[0].asin} - Blue`, kw: "audience: interested shoppers", clicks: 92, bid: 0.2, cpc: 0.3, pl: -27.65 }, { camp: `SP-EXACT-RANK - ${P[1].asin}`, ag: "Exact", kw: "training rope with handles", clicks: 23, bid: 1, cpc: 1.19, pl: -27.37 }],
        sum: rs => ({ clicks: rs.reduce((a, r) => a + r.clicks, 0), cpc: rs.reduce((a, r) => a + r.cpc, 0) / rs.length, pl: rs.reduce((a, r) => a + r.pl, 0) }) });
      const waitingCard = title => `<section class="icard"><header><h3>${title}</h3></header><div class="icard-body"><p>Live data for this insight is not connected yet.</p></div></section>`;
      const insights = `${SP.panel(`<div class="frow">${ctl.range("", 30, "Last 30 Days")}${ctl.apply()}</div>`, "")}
        ${card(SP.esc(zs.name), c1, SP.esc(zs.description), "st0", data.st0)}
        ${card(SP.esc(as.name), c2, SP.esc(as.description), "acos", data.acos)}
        ${card(SP.esc(ps.name), c3, SP.esc(ps.description), "perf", data.perf)}
        ${SP.usesRealData() ? ["Keywords with 0 Sales"].map(waitingCard).join("") : `${card("Keywords with 0 Sales", c4, "[Tip]: Pause or lower bids on keywords that keep spending without sales.", "kw0")}`}`;
      const avail = `<div class="reports">${reports.map(([h, t, d]) => `<a class="report" href="${h}"><b>${t}</b><span>${d}</span></a>`).join("")}</div>`;
      return `${SP.tabs("ai", ["Actionable insights", "Available reports"])}${SP.panels("ai", [insights, avail])}`;
    },
    wire(root, data) {
      const initial = SP.rangeFor("Last 30 Days");
      let range = { from: data.st0.from || SP.iso(initial.from), to: data.st0.to || SP.iso(initial.to) };
      // The three search term cards run the same machinery against their own endpoint and settings.
      const cards = {
        st0: { key: "st0", sel: "[data-zero-card]", grid: "i1", api: "/api/ads/zero-sales", saveApi: "/api/ads/zero-sales-settings", defaults: zeroDefaults, sample: sampleZero },
        acos: { key: "acos", sel: "[data-hacos-card]", grid: "i2", api: "/api/ads/high-acos", saveApi: "/api/ads/high-acos-settings", defaults: acosDefaults, sample: sampleAcos },
        perf: { key: "perf", sel: "[data-perf-card]", grid: "i3", api: "/api/ads/performing", saveApi: "/api/ads/performing-settings", defaults: performingDefaults, sample: samplePerf },
      };
      for (const c of Object.values(cards)) {
        c.el = $(c.sel, root);
        c.current = data[c.key];
        c.settings = c.current.settings || c.defaults();
        c.changes = 0; c.latest = 0; c.pending = 0; c.submits = 0; c.saving = Promise.resolve();
        // What the account last accepted, which a refused dialog save falls back to.
        c.accepted = c.settings;
      }
      // Settings can change the columns, so the whole card is redrawn.
      const update = (c, next) => {
        c.current = next;
        if (next.settings) c.settings = next.settings;
        $("a.see", c.el).href = insightLink(c.key, range);
        $("h3", c.el).textContent = c.settings.name;
        $("footer", c.el).textContent = c.settings.description;
        $(".icard-body", c.el).innerHTML = zeroBody(next, c.settings, c.grid);
      };
      // Settings are saved whole, so saves run one at a time: each starts once the one before has
      // finished and sends the settings as they are then, so it carries every change made before it
      // (a dialog's name and a dragged column order alike) and the last one is what's stored.
      const saveSettings = c => {
        c.pending++;
        const request = c.saving.then(() => SP.api.put(c.saveApi, c.settings)).then(saved => { c.accepted = saved.settings || c.accepted; return saved; });
        c.saving = request.catch(() => {}).finally(() => { c.pending--; });
        return request;
      };
      // Each request gets a number; only the latest one may update the panel, so a slower,
      // superseded response can't replace newer results. A response that began before a local
      // settings change, or arrives while a save is still going, may carry older settings, so the
      // local ones are kept then.
      const fetchPage = (c, page) => {
        const id = ++c.latest, changes = c.changes, saving = c.pending > 0;
        if (!SP.usesRealData()) return update(c, c.sample(c.settings, page));
        const query = new URLSearchParams({ from: range.from, to: range.to, page: String(page) });
        return SP.api.get(`${c.api}?${query}`).then(next => {
          // A save pending at request start can land while the response is under way, so the
          // response may carry the settings from before it even with nothing pending anymore.
          if (id === c.latest) update(c, changes !== c.changes || saving || c.pending ? { ...next, settings: c.settings } : next);
        }, err => { if (id === c.latest) SP.toast(err.message); });
      };
      root.addEventListener("click", e => {
        const ed = e.target.closest("[data-edit]");
        if (ed && cards[ed.dataset.edit]) {
          const c = cards[ed.dataset.edit];
          // Real data saves the settings to the account; sample data keeps them for this page.
          const dialog = SP.modal(`Edit ${SP.esc(c.settings.name)}`, zeroEdit(c.settings), m => {
            const { settings: read, error } = readZeroEdit(m);
            if (error) { SP.toast(error); return false; }
            // The dialog doesn't show the column order, so saving keeps it.
            const next = { ...read, order: c.settings.order || [] };
            if (!SP.usesRealData()) { c.settings = next; fetchPage(c, 0); return; }
            // Applied here first, so a save made meanwhile includes it. If the account refuses it and
            // nothing was submitted from the dialog since, its fields go back to what the account last
            // accepted (a later submit carries them all again); the column order stays either way, and
            // the card is redrawn in case a page load showed the edit meanwhile.
            const submit = ++c.submits;
            c.settings = next;
            c.changes++;
            saveSettings(c).then(() => { m.remove(); fetchPage(c, 0); }, err => {
              if (submit === c.submits) c.settings = { ...c.accepted, order: c.settings.order };
              update(c, { ...c.current, settings: c.settings });
              SP.toast(err.message);
            });
            return false;
          });
          $("[data-z=sort]", dialog).value = `${c.settings.sort}:${c.settings.dir}`;
        } else if (ed) SP.modal("Edit insight filter", `<label class="field"><span>Minimum clicks</span><input type="number" value="10"></label><label class="field"><span>Maximum orders</span><input type="number" value="0"></label><label class="field"><span>Look-back window (days)</span><input type="number" value="30"></label>`, () => SP.toast("Filter saved."));
        // The pager and sync button act on the card they sit in.
        const host = e.target.closest("[data-zero-card],[data-hacos-card],[data-perf-card]");
        const c = host && Object.values(cards).find(x => host.matches(x.sel));
        if (c) {
          if (e.target.closest("[data-zero-next]")) fetchPage(c, c.current.page + 1);
          if (e.target.closest("[data-zero-prev]")) fetchPage(c, c.current.page - 1);
          if (e.target.closest("[data-zero-sync]")) SP.api.post("/api/sync/ads").then(() => fetchPage(c, c.current.page)).catch(err => SP.toast(err.message));
        }
        if (e.target.closest("[data-apply]")) Object.values(cards).forEach(x => fetchPage(x, 0));
      });
      root.addEventListener("rangechange", e => {
        range = { from: e.detail.from, to: e.detail.to };
        Object.values(cards).forEach(c => { $("a.see", c.el).href = insightLink(c.key, range); });
        Object.values(cards).forEach(c => fetchPage(c, 0));
      });
      // A dragged header redraws the card with its new column order, then saves it with the card's
      // settings (to the account with real data, for this page with sample data).
      root.addEventListener("gridreorder", e => {
        const c = Object.values(cards).find(x => x.grid === e.detail.id);
        if (!c) return;
        c.settings = { ...c.settings, order: e.detail.keys };
        c.changes++;
        update(c, { ...c.current, settings: c.settings });
        if (SP.usesRealData()) saveSettings(c).catch(err => SP.toast(err.message));
      });
      // A shared ad group's product panel is fixed to the page beside the photo (CSS shows it), so the
      // table's scrolling wrapper can't clip it. It goes on the right, or the left if there's no room.
      const placePanel = e => {
        const multi = e.target.closest?.("[data-zero-multi]"), pop = multi && $(".zero-pop", multi);
        if (!pop) return;
        const at = multi.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
        pop.style.left = `${at.right + 8 + w <= innerWidth - 8 ? at.right + 8 : Math.max(8, at.left - 8 - w)}px`;
        pop.style.top = `${Math.max(8, Math.min(at.top + at.height / 2 - h / 2, innerHeight - h - 8))}px`;
      };
      root.addEventListener("mouseover", placePanel);
      root.addEventListener("focusin", placePanel);
    },
  };
  SP.pages["/Ads/Insights"] = SP.pages["/Ads"];

  // ---------- Performance ----------
  const perfRows = (() => {
    /** @type {[number, string, number, number, number, number, number, number][]} */
    const base = [[1, "Products", 119089, 883, 30, 30, 690.7, 721.31], [0, "Products", 68401, 251, 12, 13, 297.87, 238.67], [0, "Brands", 14676, 153, 9, 9, 210.91, 141.8], [1, "Brands", 20073, 145, 3, 3, 74.97, 134.05], [1, "Display", 46415, 248, 2, 2, 45.98, 90.74], [0, "Display", 9948, 92, 0, 0, 0, 27.65]];
    return base.map(([i, sp, imp, clicks, orders, units, sales, spend]) => ({ p: P[i], sp, imp, clicks, orders, units, sales, conv: clicks ? (orders / clicks) * 100 : 0, spend, acos: sales ? (spend / sales) * 100 : 0, cpc: spend / clicks }));
  })();
  const perfCols = [{ key: "p", label: "Product", muted: true, fmt: p => SP.productCell(p) }, { key: "sp", label: "Sponsored", filter: true }, { key: "imp", label: "Impressions", align: "r", filter: true, fmt: int }, { key: "clicks", label: "Clicks", align: "r", filter: true }, { key: "orders", label: "Orders", align: "r", filter: true, fmt: v => v || "" }, { key: "units", label: "Units", align: "r", filter: true, fmt: v => v || "" }, { key: "sales", label: "Sales", align: "r", filter: true, fmt: v => (v ? money(v) : "") }, { key: "conv", label: "Conversion", align: "r", filter: true, fmt: v => (v ? pct(v) : "") }, { key: "spend", label: "Spend", align: "r", filter: true, fmt: money }, { key: "acos", label: "ACOS", align: "r", fmt: v => (v ? pct(v) : "") }, { key: "cpc", label: "CPC", align: "r", fmt: money }];
  const sumPerf = rs => { const s = { imp: 0, clicks: 0, orders: 0, units: 0, sales: 0, spend: 0 }; rs.forEach(r => Object.keys(s).forEach(k => (s[k] += r[k]))); return { ...s, conv: (s.orders / s.clicks) * 100, acos: (s.spend / s.sales) * 100, cpc: s.spend / s.clicks }; };
  /** @param {any} [extra] */
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
  const searchFilters = { "": "No filter", "zero-sales": "Search Terms with 0 Sales", "high-acos": "Search Terms with High ACOS", performing: "Performing Search Terms" };
  const searchDefaults = id => ({ "zero-sales": zeroDefaults, "high-acos": acosDefaults, performing: performingDefaults }[id]?.() || { name: "All search terms", filters: {}, hideAsins: false, hideKeywords: false, sort: "clicks", dir: "desc" });
  const searchSum = rows => {
    const sum = { impressions: 0, clicks: 0, orders: 0, units: 0, spend: 0, sales: 0 };
    for (const r of rows) for (const k of Object.keys(sum)) sum[k] += Number(r[k] || 0);
    const ratio = (a, b, scale = 1) => b ? a / b * scale : null;
    return { ...sum, ctr: ratio(sum.clicks, sum.impressions, 100), cpc: ratio(sum.spend, sum.clicks), costPerOrder: ratio(sum.spend, sum.orders),
      conversion: ratio(sum.orders, sum.clicks, 100), acos: ratio(sum.spend, sum.sales, 100), roas: ratio(sum.sales, sum.spend) };
  };
  const searchMetricCols = keys => keys.map(key => {
    const [, , label, format] = ZERO_METRICS.find(([k]) => k === key) || [key, "", "Cost / order", money];
    return { key, label, align: "r", fmt: v => v == null || (v === 0 && BLANK_ZERO.has(key)) ? "" : format(v) };
  });
  const searchText = v => SP.esc(v || "—");
  const searchProductLabel = (v, r) => (r.products || []).map(p => `<span class="clamp2">${SP.esc(p.title || p.asin)}</span><small class="sub">${SP.esc(p.asin)}</small>`).join('<span class="sub">+</span>');
  const detailGrid = (r, id) => `<div class="detpanel search-detail">${r.details.some(d => !d.detailed) ? '<p class="muted">Keyword and match details for some dates are awaiting a report refresh. Their ad-group totals are included below.</p>' : ""}${SP.grid({ id, columns: true, pageSize: 20, cols: [
    { key: "campaignName", label: "Campaign", w: 190, fmt: (v, d) => searchText(v || d.campaignId) },
    { key: "adGroupName", label: "Ad group", w: 140, fmt: (v, d) => searchText(v || d.adGroupId) },
    { key: "keyword", label: "Keyword / target", w: 160, fmt: searchText },
    { key: "matchType", label: "Match", fmt: v => searchText(v?.toLowerCase()) },
    ...searchMetricCols(["impressions", "clicks", "orders", "units", "sales", "conversion", "spend", "cpc", "acos", "roas"]),
    { key: "lastSeen", label: "Last activity", fmt: searchText },
  ], rows: r.details, sum: searchSum })}</div>`;
  const searchTermGrid = (rows, id, withProduct = false, settings = {}) => SP.grid({ id, columns: true, pageSize: 20,
    sortKey: settings.sort || "clicks", dir: settings.dir === "asc" ? 1 : -1,
    details: r => detailGrid(r, `${id}-detail-${r._k}`),
    cols: [...(withProduct ? [{ key: "asin", label: "Products", w: 200, fmt: searchProductLabel }] : []),
      { key: "sponsored", label: "Sponsored" }, { key: "term", label: "Search term", w: 180, fmt: searchText },
      ...searchMetricCols(["impressions", "clicks", "orders", "units", "spend", "sales", "ctr", "cpc", "costPerOrder", "conversion", "acos", "roas", "pl", "breakEvenBid"])],
    rows: rows.map((r, i) => ({ ...r, _k: String(i) })), sum: searchSum });
  const searchPanels = (data, selected = "", tab = 0) => {
    const products = data.products.filter(p => !selected || p.asin === selected), terms = data.rows.filter(r => !selected || r.asin === selected);
    return `${SP.tabs("search-report", ["Products", "Search terms"], tab)}${SP.panels("search-report", [
      SP.grid({ id: "search-products", columns: true, cols: [
        { key: "p", label: "Product", muted: true, fmt: (v, r) => `<span class="search-photos">${r.products.map(p => zeroPhoto(p, "zero-thumb")).join("")}</span>` }, { key: "asin", label: "ASIN", w: 240, fmt: searchProductLabel },
        ...searchMetricCols(["impressions", "clicks", "orders", "sales", "conversion", "spend", "cpc", "ctr", "acos", "roas"])],
      rows: products.map((p, i) => ({ ...p, _k: String(i) })), sum: searchSum,
      details: p => `<div class="detpanel">${searchTermGrid(p.terms, `search-product-${p._k}`, false, data.settings)}</div>` }),
      searchTermGrid(terms, "search-flat", true, data.settings),
    ], tab)}`;
  };
  const searchQuery = () => {
    const params = new URLSearchParams(location.search), range = SP.rangeFor("Last 30 Days");
    return { from: params.get("from") || SP.iso(range.from), to: params.get("to") || SP.iso(range.to), filterId: params.get("filterId") || "" };
  };
  // Sample mode has the same hierarchy, including one group advertising both sample products.
  const sampleSearch = query => {
    const settings = searchDefaults(query.filterId), source = [...TERMS.map(zeroRow), ...ACOS_TERMS.map(acosRow), ...PERFORMING_TERMS.map(acosRow)];
    const products = P.slice(0, 2).map(p => ({ asin: p.asin, title: p.title, image: null }));
    const rows = source.map((r, i) => {
      const items = i % 3 === 2 ? products : [products[i % 2]], sum = searchSum([r]);
      return { ...r, ...sum, asin: items.map(p => p.asin).sort().join(","), title: items[0].title, image: null, products: items,
        details: [{ ...sum, campaignId: `campaign-${i}`, campaignName: `SP | ${r.term}`, adGroupId: `group-${i}`, adGroupName: "Broad", keyword: r.term, matchType: "BROAD", lastSeen: query.to, detailed: true }] };
    });
    const groups = new Map();
    for (const r of rows) {
      const key = JSON.stringify([r.asin, r.sponsored, r.term]), prev = groups.get(key);
      if (prev) { Object.assign(prev, searchSum([prev, r])); prev.details.push(...r.details); }
      else groups.set(key, { ...r, details: [...r.details] });
    }
    const all = [...groups.values()];
    const matched = all.filter(r => Object.entries(settings.filters).every(([k, f]) => r[k] != null && (f.min == null || r[k] >= f.min) && (f.max == null || r[k] <= f.max))
      && !(settings.hideAsins && asinTerm.test(r.term)) && !(settings.hideKeywords && !asinTerm.test(r.term)));
    const sets = [...new Set(matched.map(r => r.asin))].map(asin => {
      const same = all.filter(r => r.asin === asin), first = same[0];
      return { asin, title: first.title, image: null, products: first.products, ...searchSum(same), terms: matched.filter(r => r.asin === asin) };
    });
    return { ...query, settings, products: sets, rows: matched, totals: searchSum(matched), coverage: {}, detailComplete: true };
  };
  const loadSearch = query => SP.usesRealData() ? SP.api.get(`/api/ads/search-terms?${new URLSearchParams(query)}`) : Promise.resolve(sampleSearch(query));
  SP.pages["/Ads/SearchTerms"] = {
    title: "Search terms",
    load: () => loadSearch(searchQuery()),
    render(data) {
      return `${SP.panel(`<div class="frow">${ctl.range("", 30, "Last 30 Days")}<label class="field"><span>Filter</span><select data-search-filter>${Object.entries(searchFilters).map(([id, label]) => `<option value="${id}" ${data.filterId === id ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="field"><span>Products</span><select data-search-product><option value="">All product groups</option>${data.products.map(p => `<option value="${SP.esc(p.asin)}">${SP.esc(p.asin.replaceAll(",", " + "))}</option>`).join("")}</select></label>${ctl.apply("Update")}</div>`)}
        <p class="muted">Search terms combine campaigns and ad groups with the same advertised products and sponsored ad type. Expand a search term to see its campaign, ad group, keyword and match type.</p>
        <div data-search-status>${zeroStatus(data)}${data.detailComplete === false ? '<p class="muted">Some keyword details are awaiting sync. Existing ad-group totals remain available.</p>' : ""}</div>
        <p data-search-error role="alert" hidden></p><div data-search-results>${searchPanels(data)}</div>`;
    },
    wire(root, initial) {
      let query = { from: initial.from, to: initial.to, filterId: initial.filterId || "" }, current = initial, latest = 0, selected = "", tab = 0;
      const range = $("[data-range]", root), error = $("[data-search-error]", root);
      const setRange = () => { Object.assign(range.dataset, { from: query.from, to: query.to, preset: "Custom Range" }); $(".rlabel", range).textContent = `${day(query.from)} – ${day(query.to)}`; };
      setRange();
      $("[data-search-filter]", root).value = query.filterId;
      $("[data-search-product]", root).value = selected;
      const update = async () => {
        const request = ++latest;
        query = { ...query, filterId: $("[data-search-filter]", root).value };
        error.hidden = true;
        root.setAttribute("aria-busy", "true");
        try {
          const next = await loadSearch(query);
          if (request !== latest) return;
          current = next;
          const productSelect = $("[data-search-product]", root);
          if (!next.products.some(p => p.asin === selected)) selected = "";
          productSelect.innerHTML = `<option value="">All product groups</option>${next.products.map(p => `<option value="${SP.esc(p.asin)}">${SP.esc(p.asin.replaceAll(",", " + "))}</option>`).join("")}`;
          productSelect.value = selected;
          $("[data-search-results]", root).innerHTML = searchPanels(next, selected, tab);
          $("[data-search-status]", root).innerHTML = zeroStatus(next) + (next.detailComplete === false ? '<p class="muted">Some keyword details are awaiting sync. Existing ad-group totals remain available.</p>' : "");
          history.replaceState(null, "", `/Ads/SearchTerms?${new URLSearchParams(query)}`);
        } catch (err) { if (request === latest) { error.textContent = err.message; error.hidden = false; } }
        finally { if (request === latest) root.removeAttribute("aria-busy"); }
      };
      root.addEventListener("rangechange", e => { query = { ...query, from: e.detail.from, to: e.detail.to }; update(); });
      root.addEventListener("tab", e => { if (e.detail.id === "search-report") tab = e.detail.i; });
      root.addEventListener("change", e => {
        if (e.target.matches("[data-search-filter]")) update();
        if (e.target.matches("[data-search-product]")) { selected = e.target.value; $("[data-search-results]", root).innerHTML = searchPanels(current, selected, tab); }
      });
      root.addEventListener("click", e => {
        if (e.target.closest("[data-apply]")) update();
        if (e.target.closest("[data-zero-sync]")) SP.api.post("/api/sync/ads").then(update).catch(err => { error.textContent = err.message; error.hidden = false; });
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
  // The Advertising trend page shows live Amazon Ads data: daily totals per ad product from
  // /api/ads/trend, summed into columns here. Profit needs product costs, which aren't
  // connected yet, so those rows are left out.
  const LIVE_METRICS = [["PPC Sales", "ppcSales", money, null], ["PPC Cost", "ppcCost", money, null], ["ACOS", "acos", v => pct(v), "down"], ["Orders", "ppcOrders", int, null], ["Units", "ppcUnits", int, null], ["Conversion", "ppcConversion", v => pct(v), "up"], ["CPC", "cpc", money, "down"], ["Impressions", "impressions", int, null], ["Clicks", "clicks", int, null], ["CTR", "ctr", v => pct(v), null], ["Cost Per Order", "costPerOrder", money, null], ["Avg Sales Price", "asp", money, null]];
  const AD_PRODUCTS = [["SP", "Sponsored Products"], ["SB", "Sponsored Brands"], ["SD", "Sponsored Display"]];
  // Totals for one ad product ("ALL" adds up every ad type, like the Ads console's Performance
  // chart) between two "YYYY-MM-DD" dates, with the ratios worked out from them.
  SP.adTotals = (days, adProduct, from, to) => {
    const t = { ppcSales: 0, ppcCost: 0, ppcOrders: 0, ppcUnits: 0, impressions: 0, clicks: 0 };
    for (const d of days) {
      if ((adProduct !== "ALL" && d.adProduct !== adProduct) || d.date < from || d.date > to) continue;
      t.ppcSales += d.sales; t.ppcCost += d.cost; t.ppcOrders += d.orders; t.ppcUnits += d.units; t.impressions += d.impressions; t.clicks += d.clicks;
    }
    const ratio = (a, b, k = 1) => (b ? (a / b) * k : 0);
    return { ...t, acos: ratio(t.ppcCost, t.ppcSales, 100), ppcConversion: ratio(t.ppcOrders, t.clicks, 100), cpc: ratio(t.ppcCost, t.clicks), ctr: ratio(t.clicks, t.impressions, 100), costPerOrder: ratio(t.ppcCost, t.ppcOrders), asp: ratio(t.ppcSales, t.ppcUnits) };
  };
  // Each ad type's synced dates as contiguous [first, last] ranges, from the API (sample data has
  // no sync info, so there it is the span of each ad type's days).
  function syncedRanges(data) {
    const ranges = {};
    for (const [k, s] of Object.entries(data.synced || {})) ranges[k] = s.ranges || [];
    for (const d of data.days) {
      if (data.synced && data.synced[d.adProduct]) continue;
      const r = (ranges[d.adProduct] ||= [[d.date, d.date]])[0];
      if (d.date < r[0]) r[0] = d.date;
      if (d.date > r[1]) r[1] = d.date;
    }
    return ranges;
  }
  // Ad types the combined table needs: all the ones the sync covers, except any Amazon doesn't
  // offer this account (without sync states, as for sample data: the ones that have data).
  const neededTypes = (data, ranges) => (data.adTypes ? Object.keys(data.adTypes).filter(k => data.adTypes[k].state !== "unsupported") : Object.keys(ranges));
  // A column counts only when every one of its dates is loaded and synced, for each ad type it
  // covers. Synced days with no ad activity still count, as zero.
  function columnKnown(data, ranges, adProduct, from, to) {
    if (from < (data.from || "") || to > (data.to || "9999-12-31")) return false;
    const types = adProduct === "ALL" ? neededTypes(data, ranges) : [adProduct];
    return types.length > 0 && types.every(k => (ranges[k] || []).some(([a, b]) => a <= from && to <= b));
  }
  const TYPE_NAMES = Object.fromEntries(AD_PRODUCTS);
  // Says why the combined table has gaps, or leaves an ad type out.
  function allTypesNote(data) {
    const types = data.adTypes || {};
    const named = (...states) => Object.keys(types).filter(k => states.includes(types[k].state)).map(k => TYPE_NAMES[k] || k);
    const notes = [];
    const waiting = named("pending", "missing"), refused = named("unsupported");
    if (waiting.length) notes.push(`${waiting.join(" and ")} ${waiting.length > 1 ? "haven't" : "hasn't"} finished syncing, so these totals show "—" until ${waiting.length > 1 ? "they do" : "it does"}.`);
    if (refused.length) notes.push(`${refused.join(" and ")} ${refused.length > 1 ? "aren't" : "isn't"} included: Amazon doesn't offer ${refused.length > 1 ? "them" : "it"} for this account.`);
    return notes.length ? `<p class="lead">${notes.join(" ")}</p>` : "";
  }
  function liveTrend(st, data, adProduct) {
    const ranges = syncedRanges(data), cols = [];
    // The combined table sums only the ad types it covers, so a refused type's older rows stay out.
    const needed = neededTypes(data, ranges);
    const days = adProduct === "ALL" ? data.days.filter(d => needed.includes(d.adProduct)) : data.days;
    for (let i = st.cols - 1; i >= 0; i--) {
      const end = SP.addDays(st.last, -i * st.days), start = SP.addDays(end, -st.days + 1), from = SP.iso(start), to = SP.iso(end);
      // A column reaching past the dates we have data for is unknown, not zero.
      const known = columnKnown(data, ranges, adProduct, from, to);
      cols.push({ start, end, from, to, p: known ? SP.adTotals(days, adProduct, from, to) : null });
    }
    const shown = cols.filter(c => c.p);
    const sum = shown.length ? SP.adTotals(days.filter(d => shown.some(c => d.date >= c.from && d.date <= c.to)), adProduct, "", "9999-12-31") : null;
    return SP.trend({ corner: "Metrics", analysis: { width: 104, height: 36 }, heads: cols.map(c => ({ top: SP.dd(c.start), bottom: SP.dd(c.end) })), rows: LIVE_METRICS.map(([label, key, fmt, heat]) => ({ label, key, fmt, heat, summary: sum ? sum[key] : null, values: cols.map(c => (c.p ? c.p[key] : null)) })) });
  }
  // A sync summary as one message: failures first, then reports still being prepared.
  const syncMessage = s => {
    const problems = [...(s.failed ? [`${s.failed} report${s.failed === 1 ? "" : "s"} failed`] : []), ...(s.errors || [])];
    if (problems.length) return `Sync finished with problems: ${problems.join("; ")}.${s.pending ? " Some reports are still being prepared." : ""}`;
    return s.pending ? "Amazon is still preparing some reports. Check back in a few minutes." : "Amazon Ads data is up to date.";
  };
  const syncedNote = data => {
    if (data.sample) return "Sample data. Turn on Real data at the top to see your Amazon Ads numbers.";
    const last = Object.values(data.synced || {}).map(s => s.syncedAt).sort().pop();
    return last ? `Amazon Ads data, last synced ${new Date(last).toLocaleString("en-US")}.` : "Amazon Ads data hasn't synced yet.";
  };
  // Invented days in the /api/ads/trend shape, shown while the Real data switch is off.
  function sampleAdsTrend() {
    const days = [];
    for (let i = 89; i >= 0; i--) {
      const d = SP.addDays(SP.lastDate, -i), seed = Math.floor(d / 864e5);
      for (const { adProduct, scale, seedOff } of [{ adProduct: "SP", scale: 1, seedOff: 0 }, { adProduct: "SB", scale: 0.25, seedOff: 77 }]) {
        const p = SP.period(seed + seedOff, 1);
        days.push({ adProduct, date: SP.iso(d), impressions: Math.round(p.impressions * scale), clicks: Math.round(p.clicks * scale), cost: p.ppcCost * scale, orders: Math.round(p.ppcOrders * scale), units: Math.round(p.ppcUnits * scale), sales: p.ppcSales * scale });
      }
    }
    return { days, synced: {}, sample: true };
  }
  SP.pages["/Ads/AdvertisingTrend"] = {
    title: "Advertising trend",
    load: () => (SP.usesRealData() ? SP.api.get("/api/ads/trend") : Promise.resolve(sampleAdsTrend())),
    render(data) {
      const sync = data.sample ? "" : `<button class="btn-outline add" data-sync>${svg(I.refresh)}Sync now</button>`;
      return `${SP.panel(`<div class="frow">${ctl.num("Columns:", 8, "cols")}${ctl.num("Days per column:", 7, "days")}${ctl.date("Last date:", SP.lastDate)}${ctl.apply()}${sync}</div>`)}<div id="adt"></div>
        ${SP.meta(syncedNote(data))}<p class="lead">Profit and profit margin need product costs, which aren't connected yet.</p>`;
    },
    wire(root, data) {
      const st = { cols: 8, days: 7, last: SP.lastDate };
      let current = data;
      const tooltip = document.createElement("div");
      tooltip.className = "spark-tooltip";
      tooltip.hidden = true;
      root.append(tooltip);
      const draw = () => {
        tooltip.hidden = true;
        // All campaign types first, then each ad type the account has data for.
        const tables = [["ALL", "all campaign types"], ...AD_PRODUCTS.filter(([k]) => current.days.some(d => d.adProduct === k))];
        $("#adt", root).innerHTML = current.days.length
          ? tables.map(([k, name]) => `<h4 class="ttl">Advertising trend for ${name}</h4>${k === "ALL" ? allTypesNote(current) : ""}${liveTrend(st, current, k)}`).join("")
          : `<p class="lead">No Amazon Ads data yet. It syncs every morning, or use Sync now.</p>`;
        SP.paintHeat(root);
      };
      const readControls = () => $$("[data-k]", root).forEach(i => { if (i.dataset.k === "cols") st.cols = Math.min(16, Math.max(1, +i.value || 1)); if (i.dataset.k === "days") st.days = Math.max(1, +i.value || 1); if (i.dataset.k === "last" && i.value) st.last = new Date(i.value + "T00:00:00"); });
      draw();
      root.addEventListener("mouseover", e => {
        const bar = e.target.closest(".spark rect[data-col]");
        if (!bar) return;
        const cell = bar.closest("tr").querySelectorAll("td.heat")[Number(bar.dataset.col)];
        if (!cell) return;
        tooltip.textContent = cell.textContent.trim();
        tooltip.hidden = false;
        const bounds = bar.getBoundingClientRect(), half = tooltip.offsetWidth / 2;
        tooltip.style.left = `${Math.max(half + 8, Math.min(bounds.left + bounds.width / 2, innerWidth - half - 8))}px`;
        tooltip.style.top = `${bounds.top - 4}px`;
      });
      root.addEventListener("mouseout", e => { if (e.target.closest(".spark rect[data-col]")) tooltip.hidden = true; });
      root.addEventListener("scroll", () => { tooltip.hidden = true; }, true);
      // The columns are worked out here from data already loaded, so redraw as soon as a control changes.
      root.addEventListener("change", e => { if (e.target.closest("[data-k]")) { readControls(); draw(); } });
      root.addEventListener("click", async e => {
        if (e.target.closest("[data-sync]")) {
          SP.toast("Syncing with Amazon Ads…");
          try {
            const summary = await SP.api.post("/api/sync/ads");
            current = await SP.api.get("/api/ads/trend");
            draw();
            $(".meta", root).textContent = syncedNote(current);
            SP.toast(syncMessage(summary));
          } catch (err) {
            SP.toast(err.message);
          }
          return;
        }
        if (!e.target.closest("[data-apply]")) return;
        readControls();
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
