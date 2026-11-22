/* Products section: details, inventory value, ROI, package, hide/show, custom COGS, bulk operations. */
(() => {
  "use strict";
  const SP = window.SP, { $, money, pct, ctl } = SP;
  const dotted = v => `<span class="dotu">${v}</span>`;
  const P = SP.PRODUCTS;
  const thumbCol = { key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p) };
  const blank = "<span class='dim'>..</span>";

  // ---------- Product details ----------
  SP.pages["/Products"] = {
    title: "Product details",
    render() {
      const rows = P.map(p => ({ _k: p.asin, p, status: "Active", obsolete: "False", price: p.price, title: p.title, asin: p.asin, sku: p.sku, pref: p.sku.replace("DEMO", "PREF") }));
      return `${SP.actions([{ icon: "refresh", label: "Refresh products", act: "refresh" }, { icon: "download", label: "Download as CSV", act: "csv" }])}
        ${SP.note("Tip: You can set a landed cost per ASIN for a start and end date by opening the arrow in the first column.")}
        ${SP.grid({ id: "pd", details: r => detailsPanel(r.p), cols: [{ key: "status", label: "Status", filter: true }, { key: "obsolete", label: "Obsolete", filter: true }, thumbCol, { key: "price", label: "Price", align: "r", filter: true, fmt: money }, { key: "title", label: "Title", filter: true, sort: false, w: 300, fmt: v => `<span class="clamp2 wide">${SP.esc(v)}</span>` }, { key: "asin", label: "ASIN", filter: true, sort: false }, { key: "pref", label: "Preferred SKU", filter: true, sort: false }], rows })}`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (e.target.closest("[data-act=refresh]")) SP.toast("Products refreshed.");
        const save = e.target.closest("[data-savecost]");
        if (save) { SP.toast("Landed cost saved for this sample."); }
      });
    },
  };
  function detailsPanel(p) {
    return `<div class="detpanel"><div class="detgrid">
      <label class="field"><span>Start date</span><input type="date" value="${SP.iso(SP.addDays(SP.today, -60))}"></label>
      <label class="field"><span>End date</span><input type="date"></label>
      <label class="field"><span>Production cost</span><input type="number" step="0.01" value="${p.cost || ""}"></label>
      <label class="field"><span>Freight cost</span><input type="number" step="0.01"></label>
      <button class="btn-dark" data-savecost>Save</button></div></div>`;
  }

  // ---------- Inventory value ----------
  SP.pages["/Products/InventoryValue"] = {
    title: "Inventory value",
    render() {
      const rows = [[0, 150], [1, 78], [2, 0]].map(([i, avail]) => ({ p: P[i], asin: P[i].asin, price: P[i].price, payout: avail ? P[i].price - 12.02 : null, prod: null, freight: null, to3pl: null, toawd: null, tpl: null, tplfba: null, avail: avail || null, value: avail ? avail * (P[i].price - 12.02) : null }));
      const nf = v => (v == null ? blank : v);
      const sc = { group: "Stock location", align: "r", fmt: nf };
      return `${SP.note("Tip: Change a price to project the inventory value at that price. It's only a simulation, so the selling price isn't saved.")}
        ${SP.grid({ id: "inv", cols: [thumbCol, { key: "asin", label: "ASIN", filter: true }, { key: "price", label: "Price", align: "r", fmt: v => `<input class="cellin" type="number" step="0.01" value="${v}" data-price>` }, { key: "payout", label: "Payout", align: "r", fmt: v => (v == null ? "" : money(v)) },
          { key: "prod", label: "Production", ...sc }, { key: "freight", label: "Freight", ...sc }, { key: "to3pl", label: "To 3PL", ...sc }, { key: "toawd", label: "To AWD", ...sc }, { key: "tpl", label: "3PL", ...sc }, { key: "tplfba", label: "3PL to FBA", ...sc }, { key: "avail", label: "Available", ...sc, fmt: v => (v == null ? "" : v) }, { key: "value", label: "Value", align: "r", fmt: v => (v == null ? "" : money(v)) }],
          rows, sumTop: true, sum: rs => ({ avail: rs.reduce((a, r) => a + (r.avail || 0), 0), value: rs.reduce((a, r) => a + (r.value || 0), 0), asin: "<b>▾ Total</b>" }) })}`;
    },
    wire(root) {
      const g = SP._grids.inv;
      g.cols[1].fmt = (v, r) => (r.p ? v : "<b>▾ Total</b>");
      g.cols[0].fmt = p => (p ? SP.thumb(p) : "");
      g.cols[2].fmt = (v, r) => (r.p ? `<input class="cellin" type="number" step="0.01" value="${v}" data-price="${r.asin}">` : "");
      SP.refreshGrid("inv");
      root.addEventListener("change", e => {
        const i = e.target.closest("[data-price]"); if (!i) return;
        const r = g.rows.find(x => x.asin === i.dataset.price);
        r.price = +i.value || 0; if (r.avail) { r.payout = r.price - 12.02; r.value = r.avail * r.payout; }
        SP.refreshGrid("inv");
      });
    },
  };

  // ---------- ROI ----------
  SP.pages["/Products/ROI"] = {
    title: "ROI",
    render() {
      const rows = P.map(p => {
        const payout = p.fee ? p.price - p.fee - p.price * 0.15 : null, cost = p.cost || null;
        const profit = payout != null && cost != null ? payout - cost : null;
        return { _k: p.asin, p, parent: "", asin: p.asin, sku: p.sku, price: p.price, cost, freight: null, expFee: null, fee: p.fee || null, referral: p.price * 0.15, payout, profit, roi: profit != null ? (profit / cost) * 100 : null, margin: profit != null ? (profit / p.price) * 100 : null };
      });
      const addCost = v => (v == null ? `<a href="#" class="dotu link" data-addcost>Add cost</a>` : dotted(money(v)));
      const opt = f => v => (v == null ? "" : f(v));
      return `${SP.actions([{ icon: "refresh", label: "Refresh products", act: "refresh" }, { icon: "download", label: "Download as CSV", act: "csv" }, { icon: "check", label: "Update Expected Fulfillment Fee", act: "fee" }])}
        ${SP.note("Tip: Change the price to simulate fees, payout, profit, ROI and margin. It's only a simulation, so the selling price isn't saved.")}
        ${SP.grid({ id: "roi", cols: [thumbCol, { key: "parent", label: "Parent", filter: true }, { key: "asin", label: "ASIN", filter: true }, { key: "sku", label: "SKU", filter: true }, { key: "price", label: "Selling<br>price", align: "r", filter: true, fmt: v => dotted(money(v)) }, { key: "cost", label: "Production<br>cost", align: "r", fmt: addCost }, { key: "freight", label: "Freight<br>cost", align: "r", fmt: addCost }, { key: "expFee", label: "Expected<br>fulfillment fee", align: "r", muted: true, fmt: () => blank }, { key: "fee", label: "Fulfillment<br>fee", align: "r", filter: true, fmt: opt(money) }, { key: "referral", label: "Referral<br>fee", align: "r", fmt: money }, { key: "payout", label: "Payout", align: "r", fmt: opt(money) }, { key: "profit", label: "Profit", align: "r", fmt: opt(v => `<span class="${v < 0 ? "neg" : ""}">${money(v)}</span>`) }, { key: "roi", label: "ROI", align: "r", fmt: opt(v => pct(v, 1)) }, { key: "margin", label: "Margin", align: "r", fmt: opt(v => pct(v, 1)) }], rows })}`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (e.target.closest("[data-addcost]")) {
          e.preventDefault();
          const tr = e.target.closest("tr"), r = SP._grids.roi.rows.find(x => x._k === tr.dataset.k);
          SP.modal(`Add cost — ${r.sku}`, `<label class="field"><span>Cost per unit ($)</span><input type="number" step="0.01" name="c" value="1.00"></label>`, m => {
            const v = +$("[name=c]", m).value || 0;
            const isFreight = e.target.closest("td").cellIndex === 6;
            r[isFreight ? "freight" : "cost"] = v;
            if (r.payout != null) { r.profit = r.payout - (r.cost || 0) - (r.freight || 0); r.roi = (r.profit / ((r.cost || 0) + (r.freight || 0) || 1)) * 100; r.margin = (r.profit / r.price) * 100; }
            SP.refreshGrid("roi");
          });
        }
        if (e.target.closest("[data-act=fee]")) SP.toast("Expected fulfillment fees updated.");
        if (e.target.closest("[data-act=refresh]")) SP.toast("Products refreshed.");
      });
    },
  };

  // ---------- Package & carton ----------
  SP.pages["/Products/Package"] = {
    title: "Package & carton",
    render() {
      const dims = [[2.874, 8.11, 17.874, 4.34], [2.835, 8.07, 17.795, 4.5], [7.87, 4.72, 2.83, 1.2]];
      const rows = P.map((p, i) => ({ p, parent: "", asin: p.asin, l: dims[i][0], w: dims[i][1], h: dims[i][2], wt: dims[i][3], cl: null, cw: null, ch: null, cwt: null, units: null }));
      const g = (grp, key, label) => ({ key, label, group: grp, align: "r", fmt: v => (v == null ? blank : v) });
      return SP.grid({ id: "pkg", cols: [thumbCol, { key: "parent", label: "Parent", filter: true }, { key: "asin", label: "ASIN", filter: true }, g("Package", "l", "Length<br>(inch)"), g("Package", "w", "Width<br>(inch)"), g("Package", "h", "Height<br>(inch)"), g("Package", "wt", "Weight<br>(lb)"), g("Carton", "cl", "Length<br>(inch)"), g("Carton", "cw", "Width<br>(inch)"), g("Carton", "ch", "Height<br>(inch)"), g("Carton", "cwt", "Weight<br>(lb)"), g("Carton", "units", "Units per<br>carton")], rows });
    },
  };

  // ---------- Hide/show ----------
  SP.pages["/Products/HideShow"] = {
    title: "Hide/show product",
    render() {
      const rows = P.map(p => ({ _k: p.asin, hide: "No", status: "Active", p, price: p.price, title: p.title, asin: p.asin, sku: p.sku }));
      return `<div class="frow tight"><div class="joined">${ctl.select("Hide product?", ["Yes", "No"], "short")}<button class="btn-dark sq" data-update>Update</button></div></div>
        ${SP.grid({ id: "hs", check: true, cols: [{ key: "hide", label: "Hide", filter: true }, { key: "status", label: "Status", filter: true }, thumbCol, { key: "price", label: "Price", align: "r", filter: true, fmt: money }, { key: "title", label: "Title", filter: true, fmt: v => `<span class="clamp2 wide">${SP.esc(v)}</span>` }, { key: "asin", label: "ASIN", filter: true, sort: false }, { key: "sku", label: "SKU", filter: true, sort: false }], rows })}`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (!e.target.closest("[data-update]")) return;
        const v = $("[data-select]", root).dataset.value, sel = SP.gridChecked("hs");
        if (!v) return SP.toast("Choose Yes or No first.");
        if (!sel.length) return SP.toast("Select at least one product.");
        SP._grids.hs.rows.forEach(r => { if (sel.includes(r._k)) r.hide = v; });
        SP._grids.hs.checked.clear(); SP.refreshGrid("hs");
        SP.toast(`${sel.length} product${sel.length > 1 ? "s" : ""} updated.`);
      });
    },
  };

  // ---------- Custom COGS ----------
  SP.pages["/Products/COGS"] = {
    title: "Custom COGS",
    render() {
      return `${SP.actions([{ icon: "refresh", label: "Refresh products", act: "refresh" }, { icon: "download", label: "Download as CSV", act: "csv" }])}
        ${SP.note("Use a CSV file to update your custom COGS in bulk.")}
        ${SP.step(1, "Download the CSV template for your products")}
        <div class="checks"><label><input type="checkbox" checked data-c="inactive"> Include inactive products</label><label><input type="checkbox" checked data-c="hidden"> Include hidden products</label><label><input type="checkbox" checked> Include all countries</label></div>
        <button class="btn-dark sm" data-tpl>Download COGS template</button>
        ${SP.note("Note: Keep the header row as it is; it's used to match the columns to your products.")}
        ${SP.step(2, "Upload your file")}${SP.fileInput()}<div><button class="btn-dark sm" data-upload>Upload custom COGS</button></div>`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (e.target.closest("[data-tpl]")) SP.downloadCSV("cogs-template.csv", [["ASIN", "SKU", "Start date", "End date", "Production cost", "Freight cost"], ...P.map(p => [p.asin, p.sku, "", "", p.cost || "", ""])]);
        if (e.target.closest("[data-upload]")) { const f = $(".file input", root).files[0]; SP.toast(f ? `Read ${f.name} (sample only, nothing saved).` : "Choose a file first."); }
      });
    },
  };

  // ---------- Bulk operations ----------
  SP.pages["/Products/BulkOperations"] = {
    title: "Bulk operations",
    render() {
      return `${SP.step(1, "Download the bulk template file")}<button class="btn-dark sm" data-tpl>Download</button><hr class="sep">
        ${SP.step(2, "Upload your file")}${SP.fileInput()}<div><button class="btn-dark sm" data-upload>Upload</button></div>`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (e.target.closest("[data-tpl]")) SP.downloadCSV("bulk-template.csv", [["ASIN", "SKU", "Hide", "Obsolete", "Price"], ...P.map(p => [p.asin, p.sku, "No", "False", p.price])]);
        if (e.target.closest("[data-upload]")) { const f = $(".file input", root).files[0]; SP.toast(f ? `Read ${f.name} (sample only, nothing saved).` : "Choose a file first."); }
      });
    },
  };
})();
