/* Sales section: trend views, orders, returns, refund rate, event tags. */
(() => {
  "use strict";
  const SP = window.SP, { $, $$, svg, ICON: I, money, pct, int, ctl } = SP;
  const hash = d => Math.floor(d.getTime() / 864e5);

  const INFO = {
    orgO: "Orders minus PPC orders.", orgU: "Units minus PPC units.", ppcPct: "PPC sales divided by total sales, capped at 100%.",
    ppcO: "Orders made within 7-14 days of an ad click, not on a specific date.", ppcU: "Units sold within 7-14 days of an ad click.",
    cost: "Brand collection ads are left out when products are selected.", tacos: "PPC cost divided by total sales without VAT.",
  };
  const p2 = v => pct(v, 2);
  SP.SALES_METRICS = [
    ["Sales", "sales", money, "up"], ["Profits", "profits", money, "up", { link: true, negRed: true }], ["Orders", "orders", int, "up"], ["Units", "units", int, "up"],
    ["Organic Orders", "orgOrders", int, "up", { info: INFO.orgO }], ["Organic Units", "orgUnits", int, "up", { info: INFO.orgU }], ["Promotions", "promos", int, null], ["Refunds", "refunds", int, null],
    ["Refunds/Units", "refundRate", p2, null], ["Sessions", "sessions", int, "up"], ["Conversion", "conversion", p2, "up"], ["Unit Session %", "unitSession", p2, "up"],
    ["PPC Sales %", "ppcSalesPct", p2, "down", { info: INFO.ppcPct }], ["PPC Orders", "ppcOrders", int, null, { info: INFO.ppcO }], ["PPC Units", "ppcUnits", int, null, { info: INFO.ppcU }], ["PPC Sales", "ppcSales", money, null],
    ["PPC Cost", "ppcCost", money, null, { info: INFO.cost }], ["PPC Impressions", "impressions", int, null], ["PPC Clicks", "clicks", int, null], ["PPC CTR %", "ctr", p2, null],
    ["PPC Cost Per Click", "cpc", money, null], ["PPC Conversion", "ppcConversion", p2, "up"], ["ACOS", "acos", p2, "down"], ["TACOS", "tacos", p2, "down", { info: INFO.tacos }],
    ["Avg Sales Price", "asp", money, null], ["Payout", "payout", money, "up", { negRed: true }], ["ROI", "roi", p2, "up", { negRed: true }], ["Margin", "margin", p2, "up", { negRed: true }],
  ];

  // Build periods for each kind of trend view.
  function columns(st) {
    const out = [];
    if (st.kind === "moving") {
      for (const w of [365, 180, 90, 60, 30, 14, 7]) {
        const start = SP.addDays(st.last, -w + 1);
        const p = SP.period(w * 7 + 3, w);
        for (const k of ["sales", "profits", "orders", "units", "orgOrders", "orgUnits", "promos", "refunds", "sessions", "ppcOrders", "ppcUnits", "ppcSales", "ppcCost", "impressions", "clicks", "payout"]) p[k] /= w;
        out.push({ top: `${w} Days`, bottom: `${SP.dash(start)}<br>${SP.dash(st.last)}`, label: SP.dash(start), start, end: st.last, p });
      }
    } else if (st.kind === "monthly") {
      for (let i = st.cols - 1; i >= 0; i--) {
        const first = new Date(st.last.getFullYear(), st.last.getMonth() - i, 1);
        const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0);
        const end = lastDay > st.last ? st.last : lastDay;
        const days = Math.round((end.getTime() - first.getTime()) / 864e5) + 1;
        out.push({ top: SP.dd(first), bottom: SP.dd(end), label: SP.dash(first), start: first, end, p: SP.period(hash(first), days) });
      }
    } else {
      for (let i = st.cols - 1; i >= 0; i--) {
        const end = SP.addDays(st.last, -i * st.days), start = SP.addDays(end, -st.days + 1);
        out.push({ top: SP.dd(start), bottom: SP.dd(end), label: SP.dash(start), start, end, p: SP.period(hash(start) * (st.days === 1 ? 3 : 1), st.days), link: st.days > 1 });
      }
    }
    if (st.reverse) out.reverse();
    if (st.hideRefund) out.forEach(c => (c.p = { ...c.p, profits: c.p.profits + c.p.refunds * 9.5, refunds: 0, refundRate: 0 }));
    return out;
  }

  function trendView(st) {
    const cols = columns(st);
    const sum = SP.sumPeriods(cols.map(c => c.p));
    const rows = SP.SALES_METRICS.filter(m => !st.hidden.has(m[1])).map(([label, key, fmt, heat, o = {}]) => ({
      label, key, fmt, heat, ...o, summary: sum[key], values: cols.map(c => c.p[key]),
    }));
    const u = cols.reduce((a, c) => ({ org: a.org + c.p.orgUnits, ppc: a.ppc + c.p.ppcUnits, promo: a.promo + c.p.promos }), { org: 0, ppc: 0, promo: 0 });
    const tot = Math.round(u.org + u.ppc) || 1;
    const chartCols = st.reverse ? cols.slice().reverse() : cols;
    const salesChart = SP.areaChart({
      title: `${int(tot)} Units: ${Math.round((u.org / tot) * 100)}% Organic (${int(u.org)} units), ${Math.round((u.ppc / tot) * 100)}% PPC (${int(u.ppc)} units), ${Math.round((u.promo / tot) * 100)}% Promotion (${int(u.promo)} units)`,
      labels: chartCols.map(c => c.label),
      series: [
        { name: "Organic", type: "area", color: "#5b5cf0", values: chartCols.map(c => c.p.orgUnits) },
        { name: "PPC", type: "area", color: "#f5c27c", opacity: 0.85, values: chartCols.map(c => c.p.ppcUnits) },
        { name: "Promotion", type: "line", color: "#2e7d32", values: chartCols.map(c => c.p.promos) },
      ],
    });
    const profitChart = SP.areaChart({
      title: `Sales ${money(sum.sales)} · Profits ${money(sum.profits)}`,
      labels: chartCols.map(c => c.label),
      series: [
        { name: "Sales", type: "area", color: "#8fb5ea", values: chartCols.map(c => Math.max(0, c.p.sales)) },
        { name: "Payout", type: "line", color: "#2e7d32", values: chartCols.map(c => Math.max(0, c.p.payout)) },
      ],
    });
    const chart = st.showChart ? `${SP.tabs("trendchart", ["Sales", "Profits"], st.chartTab)}${SP.panels("trendchart", [salesChart, profitChart], st.chartTab)}` : "";
    const heads = cols.map(c => ({ top: c.top, bottom: c.bottom, link: c.link, key: SP.iso(c.end) }));
    const tbl = SP.trend({ id: "trend", heads, rows, analysis: st.kind !== "weekly", heatOn: st.heat, noSummary: st.kind === "moving" });
    return { chart, tbl, cols };
  }

  function trendPage(kind) {
    return {
      render() {
        const st = (this.st = { kind, cols: kind === "monthly" ? 5 : 8, days: 7, last: SP.lastDate, reverse: false, hideRefund: false, showChart: true, chartTab: 0, heat: true, hidden: new Set() });
        const acts = kind === "moving" ? [] : [{ icon: "history", label: "Reverse trends", act: "reverse" }, { icon: "card", label: "Hide refund balance", act: "refund" }];
        const fields = kind === "weekly" ? ctl.num("Columns:", 8, "cols") + ctl.num("Days per column:", 7, "days") : kind === "monthly" ? ctl.num("Months:", 5, "cols") : "";
        const tools = `<div class="trend-tools">${kind !== "moving" ? `<div class="anchor"><button class="btn-outline metrics" data-metrics>${svg(I.menu)}Metrics <span class="mc">28/28</span></button></div>` : ""}<button class="act" data-act="tcsv">${svg(I.download)}Download as CSV</button><button class="act" data-act="pcsv">${svg(I.download)}Download product trend</button>${kind !== "moving" ? `<button class="act" data-act="heat">${svg(I.pulse)}<span>Color by best performance</span></button>` : ""}</div>`;
        return `${acts.length ? SP.actions(acts) : ""}
          ${SP.panel(`<div class="frow">${fields}${ctl.date("Last date:", st.last)}${ctl.products()}${ctl.apply()}</div><div class="frow">${ctl.toggle("Show chart")}</div>`)}
          ${kind === "weekly" ? SP.note("Note: Figures follow your marketplace's time zone, not your computer's clock.") : ""}
          <div id="chart-area"></div>${tools}<div id="trend-area"></div>`;
      },
      wire(root) {
        const st = this.st;
        const draw = () => {
          const v = trendView(st);
          $("#chart-area", root).innerHTML = v.chart;
          $("#trend-area", root).innerHTML = v.tbl;
          SP.paintHeat(root);
          const mc = $(".mc", root); if (mc) mc.textContent = `${28 - st.hidden.size}/28`;
          this.view = v;
        };
        draw();
        root.addEventListener("tab", e => { if (e.detail.id === "trendchart") st.chartTab = e.detail.i; });
        root.addEventListener("click", e => {
          const a = e.target.closest("[data-act]"), act = a && a.dataset.act;
          if (act === "reverse") { st.reverse = !st.reverse; a.lastChild.textContent = st.reverse ? "Normal trends" : "Reverse trends"; draw(); }
          else if (act === "refund") { st.hideRefund = !st.hideRefund; a.lastChild.textContent = st.hideRefund ? "Show refund balance" : "Hide refund balance"; draw(); }
          else if (act === "heat") { st.heat = !st.heat; $("span", a).textContent = st.heat ? "Color by best performance" : "Remove colors"; $("#trend", root).classList.toggle("noheat", !st.heat); }
          else if (act === "tcsv") SP.downloadCSV("sales-trend.csv", [["Metric", ...this.view.cols.map(c => `${SP.iso(c.start)} - ${SP.iso(c.end)}`)], ...SP.SALES_METRICS.map(([l, k]) => [l, ...this.view.cols.map(c => c.p[k].toFixed(2))])]);
          else if (act === "pcsv") SP.downloadCSV("product-trend.csv", [["ASIN", "SKU", ...this.view.cols.map(c => SP.iso(c.end))], ...SP.PRODUCTS.map((p, i) => [p.asin, p.sku, ...this.view.cols.map(c => (c.p.sales * [0.5, 0.35, 0.15][i]).toFixed(2))])]);
          const m = e.target.closest("[data-metrics]");
          if (m) { e.stopPropagation(); SP.popover(m, SP.SALES_METRICS.map(([l, k]) => ({ label: l, k, on: !st.hidden.has(k) })), (it, on) => { on ? st.hidden.delete(it.k) : st.hidden.add(it.k); draw(); }, { multi: true }); }
          const col = e.target.closest("[data-col]");
          if (col && col.dataset.col) { e.preventDefault(); st.days = 1; st.cols = 7; st.last = new Date(col.dataset.col + "T00:00:00"); syncInputs(); draw(); }
          if (e.target.closest("[data-apply]")) { read(); draw(); }
        });
        root.addEventListener("change", e => { if (e.target.matches("[data-toggle]")) { st.showChart = e.target.checked; draw(); } });
        const syncInputs = () => { $$("[data-k]", root).forEach(i => { if (i.dataset.k === "cols") i.value = st.cols; if (i.dataset.k === "days") i.value = st.days; if (i.dataset.k === "last") i.value = SP.iso(st.last); }); };
        const read = () => $$("[data-k]", root).forEach(i => {
          if (i.dataset.k === "cols") st.cols = Math.min(24, Math.max(1, +i.value || 1));
          if (i.dataset.k === "days") st.days = Math.min(90, Math.max(1, +i.value || 1));
          if (i.dataset.k === "last" && i.value) st.last = new Date(i.value + "T00:00:00");
        });
      },
    };
  }
  SP.trendPage = trendPage;
  SP.pages["/Sales/SalesTrend"] = { title: "Sales trend", ...trendPage("weekly") };
  SP.pages["/Sales"] = SP.pages["/Sales/SalesTrend"];
  SP.pages["/Sales/MonthlyTrend"] ={ title: "Monthly trend", ...trendPage("monthly") };
  SP.pages["/Sales/MovingAverageTrend"] = { title: "Moving average trend", ...trendPage("moving") };

  // ---------- Dayparting ----------
  const HOURS = ["12am", ...Array.from({ length: 11 }, (_, i) => `${i + 1}am`), "12pm", ...Array.from({ length: 11 }, (_, i) => `${i + 1}pm`)];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function partTable(labels, seed, perProduct) {
    const r = SP.rng(seed);
    const raw = labels.map((_, i) => Math.max(0, Math.sin((i / labels.length) * Math.PI * 2 - 1.2) + 1) * r() * 1.2);
    const peak = Math.max(...raw) || 1, tot = raw.reduce((a, b) => a + b, 0) || 1;
    const rowsFor = (name, mult) => [
      ["Avg Orders", raw.map(v => (v * mult).toFixed(1))], ["Avg Units", raw.map(v => (v * mult * 1.02).toFixed(1))],
      ["Avg Sales %", raw.map(v => `${((v / tot) * 100).toFixed(1)}%`)], [`<span class="i">${svg(I.info)}</span> Peak Sales %`, raw.map(v => `${Math.round((v / peak) * 100)}%`)],
    ].map(([l, vals]) => `<tr><th class="r rowlab2">${l}</th>${vals.map((v, i) => `<td class="r" style="${raw[i] === peak && l.includes("Peak") ? "font-weight:600" : ""}">${raw[i] ? v : ""}</td>`).join("")}</tr>`).join("");
    const head = `<tr><th class="corner"></th>${labels.map(l => `<th class="r">${l}</th>`).join("")}</tr>`;
    const body = perProduct ? SP.PRODUCTS.slice(0, 2).map((p, i) => `<tr class="psep"><td colspan="${labels.length + 1}">${SP.thumb(p, "xs")} ${p.short} <small>${p.asin}</small></td></tr>${rowsFor(p.short, i ? 0.4 : 0.6)}`).join("") : rowsFor("", 1);
    return `<div class="trend-wrap"><table class="part">${head}${body}</table></div>`;
  }
  SP.pages["/Sales/DayParting"] = {
    title: "Dayparting trend",
    render() {
      const tabs = ["Hourly sales", "Hourly sales (product)", "Day of week sales", "Day of week sales (product)", "Hour of week sales"];
      const how = labelsDays => partTable(labelsDays, 7);
      const week = `<div class="trend-wrap"><table class="part"><tr><th class="corner"></th>${HOURS.map(h => `<th class="r">${h}</th>`).join("")}</tr>${DAYS.map((d, j) => { const r = SP.rng(j + 11); return `<tr><th class="r rowlab2">${d}</th>${HOURS.map((_, i) => { const v = Math.max(0, Math.sin((i / 24) * Math.PI * 2 - 1.2) + 0.6) * r(); return `<td class="r" style="background:rgba(91,92,240,${(v / 1.6).toFixed(2)});color:${v > 1 ? "#fff" : "inherit"}">${v ? (v * 10).toFixed(0) + "%" : ""}</td>`; }).join("")}</tr>`; }).join("")}</table></div>`;
      return `${SP.panel(`<div class="frow">${ctl.num("Weeks:", 4, "weeks")}${ctl.date("Last date:", SP.lastDate)}${ctl.products()}${ctl.apply()}</div>`)}
        ${SP.note(`<b>Note:</b><ul><li>Hours follow your marketplace's time zone, not your computer's.</li><li>Averages include all orders (organic and PPC) over the chosen weeks.</li></ul>`)}
        ${SP.tabs("dp", tabs)}${SP.panels("dp", [partTable(HOURS, 3), partTable(HOURS, 5, true), how(DAYS), partTable(DAYS, 9, true), week])}
        ${SP.meta("Processed: 65 ms")}`;
    },
    wire(root) {
      root.addEventListener("click", e => { if (e.target.closest("[data-apply]")) { const w = +$("[data-k=weeks]", root).value || 4; SP.toast(`Showing averages over the last ${w} week${w > 1 ? "s" : ""}.`); } });
    },
  };

  // ---------- Orders ----------
  const ORDERS = (() => {
    const r = SP.rng(42), out = [];
    for (let i = 0; i < 26; i++) {
      const p = SP.PRODUCTS[Math.floor(r() * 2.6)];
      const d = SP.addDays(SP.today, -Math.floor(i * 1.15));
      d.setHours(Math.floor(r() * 24), Math.floor(r() * 60), Math.floor(r() * 60));
      const id = `${100 + Math.floor(r() * 900)}-${String(Math.floor(r() * 1e7)).padStart(7, "0")}-${String(Math.floor(r() * 1e7)).padStart(7, "0")}`;
      out.push({ _k: id, p, asin: p.asin, sku: p.sku, order: id, status: i < 2 ? "Pending" : r() < 0.08 ? "Cancelled" : "Shipped", date: d, purchase: `${SP.dash(d)} ${d.toLocaleTimeString("en-US")}`, units: 1, sales: p.price, fulfil: "Amazon", promo: r() < 0.2 });
    }
    return out;
  })();
  SP.ORDERS = ORDERS;
  const orderCols = [
    { key: "p", label: "Product", muted: true, fmt: (p) => SP.thumb(p) }, { key: "asin", label: "ASIN", filter: true, w: 110 }, { key: "sku", label: "SKU", filter: true },
    { key: "order", label: "Order Id", filter: true, sort: false }, { key: "status", label: "Status", filter: true }, { key: "purchase", label: "Purchase date", filter: true, w: 170 },
    { key: "units", label: "Units", align: "r", filter: true }, { key: "sales", label: "Sales", align: "r", filter: true, fmt: money }, { key: "fulfil", label: "Fulfillment", filter: true },
  ];
  SP.pages["/Sales/Orders"] = {
    title: "Search orders",
    render() {
      return `${SP.actions([{ icon: "download", label: "Download as CSV", act: "ocsv" }])}
        ${SP.panel(`<div class="frow">${ctl.range(`Today: ${SP.shortDate(SP.today)}`, 1)}${ctl.products()}${ctl.text("Order Id", "oid")}<label class="chk"><span>Item promo</span><input type="checkbox" data-k="promo"></label>${ctl.apply()}</div>`)}
        ${SP.grid({ id: "orders", cols: orderCols, rows: ORDERS.filter(o => o.date >= SP.today), columns: true, footExtra: rows => `<p>${rows.length} Orders, ${rows.reduce((a, r) => a + r.units, 0)} Units</p>` })}${SP.meta("Processed: 51 ms")}`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (e.target.closest("[data-apply]")) {
          const days = +$("[data-range]", root).dataset.range || 1, from = SP.addDays(SP.today, -days + 1);
          const oid = $("[data-k=oid]", root).value.trim(), promo = $("[data-k=promo]", root).checked;
          const sel = $("[data-products]", root)._sel;
          SP._grids.orders.rows = ORDERS.filter(o => o.date >= from && (!oid || o.order.includes(oid)) && (!promo || o.promo) && (!sel || !sel.size || sel.has(o.asin)));
          SP.refreshGrid("orders");
        }
        if (e.target.closest("[data-act=ocsv]")) SP.downloadCSV("orders.csv", [["Order Id", "ASIN", "SKU", "Status", "Purchase date", "Units", "Sales"], ...SP._grids.orders.rows.map(o => [o.order, o.asin, o.sku, o.status, o.purchase, o.units, o.sales])]);
      });
    },
  };

  // ---------- Customer returns ----------
  const RETURNS = [
    { p: SP.PRODUCTS[1], disp: ["3 x Sellable", "1 x Defective", "1 x Customer Damaged"], reason: ["3 x Unwanted Item", "2 x Not As Described"], status: ["4 x Unit returned to inventory", "1 x Liquidated"], comments: ["Changed mind, no longer needed", "Changed mind", "Not as expected, missing parts", "Changed mind"] },
    { p: SP.PRODUCTS[0], disp: ["3 x Sellable", "1 x Customer Damaged"], reason: ["2 x Not As Described", "1 x Ordered Wrong Item", "1 x Unwanted Item"], status: ["3 x Unit returned to inventory", "1 x Liquidated"], comments: ["Colour differs from the photos", "Wrong length ordered", "Ordered too many"] },
  ];
  SP.pages["/Sales/CustomerReturns"] = {
    title: "Customer returns",
    render() {
      const li = a => a.map(x => `<p>${x}</p>`).join("");
      const insights = RETURNS.map((r, i) => `<div class="rcard"><div class="rcard-head">${SP.thumb(r.p)}<span>[${r.p.asin}] ${r.p.title}</span></div><table class="rtable"><tr><th>Disposition</th><th>Reason</th><th>Status</th><th>Customer comments</th></tr><tr><td>${li(r.disp)}</td><td>${li(r.reason)}</td><td>${li(r.status)}</td><td>${li(r.comments.map((c, j) => `${SP.dash(SP.addDays(SP.today, -(j * 5 + i * 2 + 1)))}: ${c}`))}</td></tr></table></div>`).join("");
      const rows = RETURNS.flatMap((r, i) => r.comments.map((c, j) => ({ p: r.p, asin: r.p.asin, order: SP.ORDERS[(i * 4 + j + 3) % SP.ORDERS.length].order, date: SP.dash(SP.addDays(SP.today, -(j * 5 + i * 2 + 1))), qty: 1, reason: r.reason[j % r.reason.length].replace(/^\d+ x /, ""), disp: r.disp[j % r.disp.length].replace(/^\d+ x /, ""), comment: c })));
      return `${SP.panel(`<div class="frow">${ctl.range("", 30, "Last 30 Days")}${ctl.products()}${ctl.apply()}</div>`)}
        ${SP.tabs("ret", ["Return insights", "Return orders"])}
        ${SP.panels("ret", [insights, SP.grid({ id: "returns", cols: [{ key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p) }, { key: "asin", label: "ASIN", filter: true }, { key: "order", label: "Order Id" }, { key: "date", label: "Return date" }, { key: "qty", label: "Qty", align: "r" }, { key: "reason", label: "Reason", filter: true }, { key: "disp", label: "Disposition", filter: true }, { key: "comment", label: "Customer comments", sort: false }], rows })])}
        ${SP.meta("Processed: 26 ms")}`;
    },
    wire(root) { root.addEventListener("click", e => { if (e.target.closest("[data-apply]")) SP.toast("Filter applied to returns."); }); },
  };

  // ---------- Refund rate ----------
  SP.pages["/Sales/RefundRate"] = {
    title: "Refund rate",
    render() {
      const rows = [[0, 56, 4], [1, 53, 3]].map(([i, sold, ref]) => ({ p: SP.PRODUCTS[i], title: SP.PRODUCTS[i].title, asin: SP.PRODUCTS[i].asin, sold, ref, rate: (ref / sold) * 100 }));
      return `${SP.actions([{ icon: "download", label: "Download as CSV", act: "csv" }])}
        ${SP.panel(`<div class="frow">${ctl.range("", 30, "Last 30 Days")}${ctl.apply()}</div>`)}
        ${SP.note("Note: Refunded quantity counts units sold during the selected period.")}
        ${SP.grid({ id: "refund", columns: true, sortKey: "rate", cls: "fit", cols: [{ key: "p", label: "Product", fmt: p => (p ? SP.thumb(p) : "") }, { key: "title", label: "Title", w: 230, fmt: (v, r) => (r.p ? `<span class="clamp2">${SP.esc(v)}</span>` : "<b>▾ Group:</b>") }, { key: "asin", label: "ASIN", w: 100 }, { key: "sold", label: "Units sold", align: "r" }, { key: "ref", label: "Refunded", align: "r" }, { key: "rate", label: "Refund rate", align: "r", fmt: v => pct(v), cls: "shade" }],
          rows, sumTop: true, sum: rs => { const s = rs.reduce((a, r) => ({ sold: a.sold + r.sold, ref: a.ref + r.ref }), { sold: 0, ref: 0 }); return { p: "", title: "", sold: s.sold, ref: s.ref, rate: (s.ref / s.sold) * 100 }; } })}
        ${SP.meta("Processed: 25 ms")}`;
    },
  };

  // ---------- Event tags ----------
  const TAG_KEY = "sp-tags";
  const loadTags = () => { try { return JSON.parse(localStorage.getItem(TAG_KEY)) || []; } catch { return []; } };
  SP.pages["/Sales/Tag"] = {
    title: "Tags",
    render() {
      return `<div class="actions"><button class="btn-outline add" data-newtag>${svg(I.plus)}Create tag</button></div>
        ${SP.panel(`<div class="frow">${ctl.products()}${ctl.apply()}</div>`)}
        <div id="tags-area"></div>`;
    },
    wire(root) {
      const draw = () => {
        const tags = loadTags();
        $("#tags-area", root).innerHTML = tags.length
          ? SP.grid({ id: "tags", search: false, cols: [{ key: "name", label: "Tag" }, { key: "date", label: "Date" }, { key: "products", label: "Products" }, { key: "_k", label: "", sort: false, muted: true, fmt: k => `<button class="link-btn" data-del="${k}">Delete</button>` }], rows: tags })
          : `<p class="lead">Create tags to mark events for your products.</p><p class="lead">Tags show up in the sales trend, so you can see how they affect your sales.</p>`;
      };
      draw();
      root.addEventListener("click", e => {
        if (e.target.closest("[data-newtag]")) {
          SP.modal("Create tag", `<label class="field"><span>Tag name</span><input name="name" placeholder="e.g. Price drop"></label><label class="field"><span>Date</span><input type="date" name="date" value="${SP.iso(SP.today)}"></label><label class="field"><span>Products</span><select name="product"><option>All products</option>${SP.PRODUCTS.map(p => `<option>${p.short}</option>`).join("")}</select></label>`, m => {
            const name = $("[name=name]", m).value.trim();
            if (!name) { $("[name=name]", m).focus(); return false; }
            const tags = loadTags(); tags.push({ _k: String(Date.now()), name, date: $("[name=date]", m).value, products: $("[name=product]", m).value });
            localStorage.setItem(TAG_KEY, JSON.stringify(tags)); draw(); SP.toast("Tag created.");
          }, "Create");
        }
        const d = e.target.closest("[data-del]");
        if (d) { localStorage.setItem(TAG_KEY, JSON.stringify(loadTags().filter(t => t._k !== d.dataset.del))); draw(); }
      });
    },
  };
})();
