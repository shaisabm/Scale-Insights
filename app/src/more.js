/* Mass campaigns, strategy experts and the simple placeholder sections. */
(() => {
  "use strict";
  const SP = window.SP, { $, svg, ICON: I } = SP;
  const P = SP.PRODUCTS;

  // ================= Mass campaigns =================
  // Abstract "campaign tree" illustration drawn in SVG (original artwork, not the site's).
  const tree = (c1, c2, seed) => {
    const r = SP.rng(seed);
    let boxes = "";
    for (let i = 0; i < 9; i++) {
      const x = 40 + (i % 3) * 140 + r() * 30, y = 20 + Math.floor(i / 3) * 50 + r() * 10;
      boxes += `<g transform="translate(${x} ${y}) rotate(-18)"><rect width="96" height="26" rx="6" fill="#fff" fill-opacity=".92"/><rect x="8" y="9" width="${40 + r() * 40}" height="4" rx="2" fill="${c2}" fill-opacity=".6"/><rect x="8" y="16" width="${30 + r() * 30}" height="3" rx="1.5" fill="#9aa3b5"/></g>`;
    }
    return `<svg viewBox="0 0 450 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="450" height="170" fill="url(#g${seed})"/><path d="M0 150 C120 120 160 60 300 70 S420 20 450 10" stroke="#ffffff" stroke-opacity=".35" stroke-width="6" fill="none"/>${boxes}</svg>`;
  };
  const CAMPAIGNS = [
    { path: "/MassCampaigns/BulkAutoCampaigns", title: "Bulk Auto Campaigns (BAC)", c: ["#f2b33d", "#f08a2c"], text: "Launch several automatic campaigns at different default bids to find new traffic at every price point. Automation pauses weak campaigns, negates search terms that don't convert and handles dayparting." },
    { path: "/MassCampaigns/FullyManagedCampaigns", title: "Fully Managed Campaigns (FMC)", c: ["#3d2f2a", "#6b4a33"], text: "Create an automatic campaign, a product and category targeting campaign and manual keyword campaigns, all with automation tuned for performance. Best once a product converts at 15% or more." },
    { path: "/MassCampaigns/KeywordCampaigns", title: "Split Keywords to Campaigns (SKC)", c: ["#2c2a8a", "#7a2d8e"], text: "Want tight control over your best keywords? Split them into separate campaigns in one go, each with automation you can adjust." },
    { path: "/MassCampaigns/ProductCampaigns", title: "Split Products to Campaigns (SPC)", c: ["#2b2d8f", "#6d2c8f"], text: "Want tight control over each ASIN? Split your products into separate campaigns quickly, each with automation you can adjust.", noLearn: true },
    { path: "/MassCampaigns/DayPartingCampaign", title: "Dayparting Campaign (DPC)", c: ["#4b1fa8", "#a22fb3"], text: "Measure how your ads do hour by hour: this creates 24 ad groups with dayparting built in, switching on one ad group each hour." },
  ];
  SP.pages["/MassCampaigns"] = {
    title: "Mass campaigns overview", noSub: true, icon: "globe", iconColor: "#e39255",
    render() {
      return `<p class="lead">Create many scalable campaigns quickly, with ready-made automation you can customise.</p>
        <div class="mc-grid">${CAMPAIGNS.map((c, i) => `<article class="mc-card"><div class="mc-img">${tree(c.c[0], c.c[1], i + 1)}</div><div class="mc-body"><h3>${c.title}</h3><p>${c.text}</p><div class="mc-actions"><a class="btn-dark" href="${c.path}">Create campaigns</a>${c.noLearn ? "" : `<a href="#" class="ul" data-learn="${i}">Learn more</a>`}</div></div></article>`).join("")}
        <button class="mc-video" data-video><span><b>Feature Video</b><small>Tour of what Mass Campaigns can do.</small></span>${svg(I.play, "playbig")}<em>3:23 min</em></button></div>`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        const l = e.target.closest("[data-learn]");
        if (l) { e.preventDefault(); const c = CAMPAIGNS[+l.dataset.learn]; SP.modal(c.title, `<p>${c.text}</p><p>Pick a product on the next page, choose how many campaigns to create and the bids to start from, then review before anything goes live.</p>`); }
        if (e.target.closest("[data-video]")) SP.modal("Feature video", `<div class="video-ph">${svg(I.play)}</div><p>The feature tour would play here.</p>`);
      });
    },
  };
  const ACTION_ICON = {
    "/MassCampaigns/BulkAutoCampaigns": ["#8b84d8", I.layers], "/MassCampaigns/FullyManagedCampaigns": ["#c0392b", I.tree],
    "/MassCampaigns/KeywordCampaigns": ["#e2a03f", I.tree], "/MassCampaigns/ProductCampaigns": ["#e2a03f", I.tree], "/MassCampaigns/DayPartingCampaign": ["#3aa55d", I.alarm],
  };
  CAMPAIGNS.forEach(c => {
    SP.pages[c.path] = {
      title: c.title.replace(/ \(.*\)/, "").replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase()),
      render() {
        const [col, ic] = ACTION_ICON[c.path];
        const rows = P.map(p => ({ _k: p.asin, p, asin: p.asin, sku: p.sku, status: "Active", title: p.title }));
        return SP.grid({ id: "mc", cls: "fit", cols: [{ key: "p", label: "Product", muted: true, fmt: p => SP.thumb(p) }, { key: "asin", label: "ASIN", filter: true, sort: false }, { key: "sku", label: "SKU", filter: true, sort: false }, { key: "status", label: "Status", filter: true, sort: false }, { key: "title", label: "Title", filter: true, sort: false, w: 260, fmt: v => `<span class="clamp2">${SP.esc(v)}</span>` }, { key: "_k", label: "Actions", muted: true, fmt: k => `<span class="rowacts"><button class="ic-btn" data-warn="${k}" title="Check before creating" style="color:#e03131">${svg(I.alert)}</button><button class="ic-btn" data-create="${k}" title="Create campaigns" style="color:${col}">${svg(ic)}</button></span>` }], rows });
      },
      wire(root) {
        root.addEventListener("click", e => {
          const w = e.target.closest("[data-warn]");
          if (w) SP.modal("Before you create", `<p>This product has no production cost yet, so profit-based automation can't judge results. Add a cost under Products → ROI first for the best results.</p>`);
          const b = e.target.closest("[data-create]"); if (!b) return;
          const p = P.find(x => x.asin === b.dataset.create);
          SP.modal(`${c.title} — ${p.short}`, `<label class="field"><span>Number of campaigns</span><input type="number" name="n" value="3" min="1" max="24"></label><div class="detgrid"><label class="field"><span>Starting bid ($)</span><input type="number" step="0.05" value="0.50"></label><label class="field"><span>Bid step ($)</span><input type="number" step="0.05" value="0.25"></label><label class="field"><span>Daily budget ($)</span><input type="number" value="10"></label></div><label class="chk"><input type="checkbox" checked> Turn on recommended automation</label>`, m => {
            SP.toast(`Preview ready: ${+$("[name=n]", m).value || 1} campaigns for ${p.short}. (Sample only; nothing was created.)`);
          }, "Review campaigns");
        });
      },
    };
  });

  // ================= Strategy experts =================
  const COURSES = [
    { id: 124, title: "Protect Profits with Automation", thumb: ["PROTECT PROFITS", "Pause Campaigns", "When Stock Runs Low"], n: 5, by: "In-house team", c: ["#16336b", "#2b5cad"] },
    { id: 147, title: "Stop Paying for Weak Keywords", thumb: ["CUT WASTED SPEND", "Negate Search Terms", "That Never Convert"], n: 4, by: "In-house team", c: ["#1b2d5e", "#33508f"] },
    { id: 115, title: "Find and Keep High-Value Keywords", thumb: ["CAPTURE KEYWORDS", "Harvest Auto Search Terms", "As Exact Match Keywords"], n: 4, by: "In-house team", c: ["#1a3265", "#3a62a8"] },
    { id: 113, title: "Build Single-Keyword Campaigns", thumb: ["SINGLE KEYWORD", "Create Campaigns in Bulk", "With Bidding Presets"], n: 3, by: "In-house team", c: ["#173062", "#2d5aa5"] },
    { id: 110, title: "Master Your Keyword Bids", thumb: ["TUNE YOUR BIDS", "Bring High-ACOS Keywords", "Back to Target"], n: 5, by: "In-house team", c: ["#182f60", "#3159a0"] },
    { id: 103, title: "Win the Ranking Game", thumb: ["WIN RANKINGS", "Find Untapped Keywords", "Worth Ranking For"], n: 3, by: "In-house team", c: ["#1a3163", "#2f57a0"] },
    { id: 78, title: "Four Steps to Rank with PPC", thumb: ["4 STEPS", "TO RANK", "WITH PPC"], n: 6, by: "Guest expert", c: ["#1d2a52", "#28407a"], bold: true },
    { id: 38, title: "Negation, Bidding and Monitoring Methods", thumb: ["EFFECTIVE", "Negation, Bidding and", "Monitoring Methods"], n: 4, by: "Guest expert", c: ["#1d2a52", "#2a4580"], bold: true },
    { id: 35, title: "Advanced Bidding and Import Techniques", thumb: ["ADVANCED", "Bidding and Import", "TECHNIQUES"], n: 3, by: "Guest expert", c: ["#1d2a52", "#2b4682"], bold: true },
  ];
  const VIDEO_TITLES = ["Pause campaigns automatically when stock is low", "Adjust campaign budgets for each day of the week", "Find your best and worst hours and schedule ads to match", "Move converting auto search terms into exact match keywords", "Find more keyword ideas without paying twice for the same terms", "Set bids from your target ACOS", "Review results weekly and adjust"];
  const thumbArt = c => `<div class="sx-thumb" style="background:linear-gradient(135deg,${c.c[0]},${c.c[1]})"><span class="sx-badge">${c.thumb[0]}</span><b class="${c.bold ? "big" : ""}">${c.thumb[1]}</b><i>${c.thumb[2]}</i><span class="sx-count">${c.n} videos</span></div>`;
  SP.pages["/StrategyExperts"] = {
    title: "Strategy experts", noSub: true, hero: true,
    render() {
      const card = c => `<a class="sx-card" href="/StrategyExperts/Post?videoId=${c.id}">${thumbArt(c)}<h4>${c.title}</h4><small>${c.by}</small></a>`;
      return `<div class="sx-hero"><h1>Strategy experts</h1></div>
        <div class="sx-body"><div class="sx-grid">${COURSES.slice(0, 4).map(card).join("")}</div>
        <div class="sx-help">Want help putting this into practice? <a href="#" data-book>Book a call</a><button class="note-x" aria-label="Close">✕</button></div>
        <div class="sx-grid">${COURSES.slice(4).map(card).join("")}</div></div><div class="sx-band"></div>`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        if (e.target.closest(".sx-help .note-x")) e.target.closest(".sx-help").remove();
        if (e.target.closest("[data-book]")) { e.preventDefault(); bookCall(); }
      });
    },
  };
  const bookCall = () => SP.modal("Book a call", `<label class="field"><span>Your email</span><input type="email" name="em" placeholder="you@example.com"></label><label class="field"><span>Preferred time</span><select><option>Morning</option><option>Afternoon</option><option>Evening</option></select></label>`, m => { if (!$("[name=em]", m).value.includes("@")) return false; SP.toast("Request sent (sample only)."); }, "Request call");
  SP.pages["/StrategyExperts/Post"] = {
    title: "Strategy experts", noSub: true, icon: "strategy", iconColor: "#7fbf9a", section: "strategy",
    render() {
      const q = new URLSearchParams(location.search);
      const c = COURSES.find(x => String(x.id) === q.get("videoId")) || COURSES[0];
      this.c = c; this.v = Math.min(c.n, Math.max(1, +q.get("v") || 1));
      return `<div class="sx-post"><div class="sx-player" data-player><button class="sx-play" data-play aria-label="Play">${svg(I.play)}</button><div class="sx-bar"><button data-play aria-label="Play or pause">❚❚</button><div class="sx-track"><span></span></div><span class="sx-time">00:00</span></div></div><div class="sx-info" id="sx-info"></div></div>
        <div class="sx-next"><h3>Next videos in the playlist: <span>${c.title}</span></h3><div class="sx-next-grid" id="sx-next"></div></div>`;
    },
    wire(root) {
      const c = this.c;
      const draw = v => {
        this.v = v;
        $("#sx-info", root).innerHTML = `<a href="/StrategyExperts" class="sx-by">${c.by}</a><h2>${v}: ${VIDEO_TITLES[(v - 1) % VIDEO_TITLES.length].replace(/^./, s => s.toUpperCase())}</h2><p>This lesson walks through setting up the rule step by step: what to trigger it on, which campaigns it applies to, and what it changes, so ad spend stops when it would be wasted.</p><a href="#" data-book class="sx-book">Book a Free Call 👉</a>`;
        $("#sx-next", root).innerHTML = Array.from({ length: c.n }, (_, i) => i + 1).filter(i => i !== v).slice(0, 4).map(i => `<button class="sx-mini" data-v="${i}"><div class="sx-thumb sm" style="background:linear-gradient(135deg,${c.c[0]},${c.c[1]})"><b>${VIDEO_TITLES[(i - 1) % VIDEO_TITLES.length].split(" ").slice(0, 4).join(" ")}</b></div><span>${i}: ${VIDEO_TITLES[(i - 1) % VIDEO_TITLES.length]}</span></button>`).join("");
        history.replaceState(null, "", `/StrategyExperts/Post?videoId=${c.id}&v=${v}`);
      };
      draw(this.v);
      let playing = false, t = 0, h;
      root.addEventListener("click", e => {
        const m = e.target.closest("[data-v]"); if (m) { draw(+m.dataset.v); window.scrollTo({ top: 0, behavior: "smooth" }); t = 0; }
        if (e.target.closest("[data-book]")) { e.preventDefault(); bookCall(); }
        if (e.target.closest("[data-play]")) {
          playing = !playing;
          $("[data-player]", root).classList.toggle("playing", playing);
          clearInterval(h);
          if (playing) h = setInterval(() => { t = Math.min(t + 1, 300); $(".sx-track span", root).style.width = `${(t / 300) * 100}%`; $(".sx-time", root).textContent = `0${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; }, 1000);
        }
      });
    },
  };

  // ================= Sections not part of this round =================
  const placeholder = (title, desc) => ({ title, noSub: true, render: () => `<div class="placeholder"><h2>${title}</h2>${desc}. This section isn't part of this version yet.</div>` });
  SP.pages["/KeywordRanking"] = placeholder("Keyword ranking", "Keyword rank tracker");
  SP.pages["/Automation"] = placeholder("Automation", "Automate ads optimisation");
})();
