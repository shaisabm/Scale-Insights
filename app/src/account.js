/* Account pages: marketplace connections, subscription/billing, sub users. */
(() => {
  "use strict";
  const SP = window.SP, { $, $$, svg, ICON: I } = SP;
  const store = (k, v) => (v === undefined ? JSON.parse(localStorage.getItem(k) || "null") : localStorage.setItem(k, JSON.stringify(v)));
  SP.ICON.user = '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="10" r="3.2"/><path d="M6 18.5c1.5-2.4 3.6-3.4 6-3.4s4.5 1 6 3.4"/>';
  SP.ICON.unlink = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/><path d="M3 3l18 18"/>';

  // ================= Connect marketplaces =================
  const REGIONS = [
    { id: "na", name: "North America", desc: "United States, Canada, Mexico." },
    { id: "eu", name: "Europe", desc: "United Kingdom, Germany, Spain, France, Italy, Netherlands, Sweden." },
    { id: "jp", name: "Japan", desc: "Japan, Australia and Singapore share one advertising account." },
    { id: "au", name: "Australia", desc: "Japan, Australia and Singapore share one advertising account." },
    { id: "sg", name: "Singapore", desc: "Japan, Australia and Singapore share one advertising account." },
  ];
  const CONN_KEY = "sp-connections";
  const conns = () => store(CONN_KEY) || { na: { seller: true, ads: true } };
  const linkBtn = (on, act, region, kind, enabled) => on
    ? `<button class="conn-btn ghost" data-conn="${act}" data-r="${region}" data-kind="${kind}" ${enabled ? "" : "disabled"}>${svg(I.unlink)}Disconnect</button>`
    : `<button class="conn-btn" data-conn="${act}" data-r="${region}" data-kind="${kind}" ${enabled ? "" : "disabled"}>${svg(I.link)}Connect</button>`;
  function regionCard(r, c) {
    const s = c[r.id] || {}, both = s.seller && s.ads;
    const row = (kind, label) => {
      const on = !!s[kind];
      // The seller account can be disconnected only after the ads account; ads can be connected only once the seller is.
      const enabled = kind === "seller" ? !(on && s.ads) : on || !!s.seller;
      return `<div class="conn-row">${on ? `<span class="ok">${svg(I.check)}</span>` : ""}<span class="conn-label">${label} ${on ? "connected" : kind === "seller" ? "disconnected" : "not connected"}</span>${linkBtn(on, on ? "off" : "on", r.id, kind, enabled)}</div>`;
    };
    return `<article class="region ${both ? "live" : ""}"><div class="region-head"><span class="region-globe">${svg(I.globe)}</span><div><h3>${r.name}</h3><p>${r.desc}</p></div></div>${row("seller", "Seller account")}${row("ads", "Ads account")}</article>`;
  }
  SP.pages["/Settings/Onboarding"] = {
    title: "Connect to Amazon", noSub: true, section: "account", noIcon: true,
    render() {
      return `<div class="onb"><div class="regions" id="regions"></div>
        <aside class="discover"><h2>Discover the power of ad automation</h2>
          <a href="#" class="res" data-res="0"><span class="res-img">${svg(I.play)}</span><span>4 quick ways to cut unnecessary ad spend</span></a>
          <a href="#" class="res" data-res="1"><span class="res-img alt">${svg(I.play)}</span><span>Grow your organic sales in 3 simple steps</span></a></aside></div>`;
    },
    wire(root) {
      const draw = () => { const c = conns(); $("#regions", root).innerHTML = REGIONS.map(r => regionCard(r, c)).join(""); };
      draw();
      root.addEventListener("click", e => {
        const b = e.target.closest("[data-conn]");
        if (b) {
          const c = conns(), r = b.dataset.r, kind = b.dataset.kind, region = REGIONS.find(x => x.id === r).name;
          c[r] = c[r] || {};
          if (b.dataset.conn === "on") {
            SP.modal(`Connect ${kind === "seller" ? "seller" : "ads"} account — ${region}`, `<p>You'd now be sent to Amazon to sign in and approve access for ${region}.</p><p class="muted-s">Sample only: no real account is connected.</p>`, () => { c[r][kind] = true; store(CONN_KEY, c); draw(); SP.toast(`${region}: ${kind === "seller" ? "seller" : "ads"} account connected.`); }, "Continue");
          } else {
            SP.modal("Disconnect?", `<p>Disconnect the ${kind === "seller" ? "seller" : "ads"} account for ${region}? Reports and automation for it will stop updating.</p>`, () => { c[r][kind] = false; store(CONN_KEY, c); draw(); }, "Yes");
          }
        }
        const res = e.target.closest("[data-res]");
        if (res) { e.preventDefault(); SP.modal(res.textContent.trim(), `<div class="video-ph">${svg(I.play)}</div><p>The guide would play here.</p>`); }
      });
    },
  };

  // ================= Manage subscriptions =================
  const TIERS = [5, 10, 20, 35, 50, 75, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000];
  // Sample prices (not the original's): a base fee plus a per-ASIN rate that falls as the tier grows.
  const monthly = n => Math.round(59 + n * (n <= 50 ? 5.4 : n <= 500 ? 4.9 : 4.6));
  const PERIODS = { monthly: [1, 1, "/mo"], quarterly: [3, 0.9, "/3 mo"], yearly: [12, 0.8, "/year"] };
  const planCard = (n, per) => {
    const [m, f, unit] = PERIODS[per], price = Math.floor(monthly(n) * m * f);
    return `<div class="plan"><h4>TIER ${n}</h4><div class="price"><span>$</span>${price.toLocaleString("en-US")}<small>${unit}</small></div><ul><li>Sales Analytics</li><li>Restock</li><li>Ads Analytics</li><li>Track 30 Keywords</li><li>${n.toLocaleString("en-US")} Automated<br>ASINs</li></ul><button class="plan-btn" data-plan="${n}" data-per="${per}" data-price="${price}">Select</button></div>`;
  };
  const onePct = `<div class="plan pct"><h4>THE 1% PLAN</h4><div class="price">1%<small>of ad spend</small></div><p>Unlimited automated ASINs for 1% of your monthly ad spend.</p><button class="plan-btn" data-contact>Contact Us</button></div>`;
  const ACCOUNT_TABS = ["Subscription", `${svg(I.keyword)} Keyword tracking plan`, "Change email", "Change name", "Change password", "Two-factor authentication"];
  const form = (fields, btn) => `<form class="acct-form" data-form="${btn}">${fields.map(([l, t, n, v = ""]) => `<label class="field"><span>${l}</span><input type="${t}" name="${n}" value="${v}" autocomplete="${n === "cur" ? "current-password" : t === "password" ? "new-password" : "off"}" required></label>`).join("")}<button class="btn-dark" type="submit">${btn}</button></form>`;
  SP.pages["/Identity/Account/Billing"] = {
    title: "Manage subscriptions", noSub: true, section: "account", icon: "user", iconColor: "#2c3a4f",
    render() {
      const per = ["monthly", "quarterly", "yearly"];
      const subscription = `<section class="subplan"><header>Subscription plan</header><div class="subplan-body">
        <p class="trialnote">Pick a plan to use its features during your trial.<br>You can cancel before the trial ends.<br>You're only charged after the trial.</p>
        <h3>Pricing in USD</h3>
        <div class="ptabs center" data-tabs="per" role="tablist"><button role="tab" data-i="0" class="on">Monthly</button><button role="tab" data-i="1">Quarterly <mark>-10%</mark></button><button role="tab" data-i="2">Yearly <mark>-20%</mark></button></div>
        <div class="plans-box"><div class="ptabs"><button class="on">Automation Plan</button></div>
          ${SP.panels("per", per.map(p => `<div class="plans">${TIERS.map(n => planCard(n, p)).join("")}${onePct}</div>`))}</div>
        <p class="more-asins">Need more automated ASINs? Please <a href="#" data-contact>contact us today!</a></p>
        <form class="coupon" data-coupon><input placeholder="Coupon code" aria-label="Coupon code"><button class="plan-btn" type="submit">Apply Coupon</button></form>
      </div></section>`;
      const tracking = `<section class="subplan"><header>Keyword tracking plan</header><div class="subplan-body"><h3>Track more keywords</h3><div class="plans">${[[100, 19], [300, 39], [1000, 89]].map(([k, p]) => `<div class="plan"><h4>${k} KEYWORDS</h4><div class="price"><span>$</span>${p}<small>/mo</small></div><ul><li>Daily rank checks</li><li>Rank history</li><li>Email alerts</li></ul><button class="plan-btn" data-plan="${k} keywords" data-per="monthly" data-price="${p}">Select</button></div>`).join("")}</div></div></section>`;
      return `${SP.tabs("acct", ACCOUNT_TABS)}${SP.panels("acct", [
        subscription, tracking,
        form([["New email", "email", "email"], ["Confirm email", "email", "email2"]], "Change email"),
        form([["First name", "text", "first", "Demo"], ["Last name", "text", "last", "Seller"]], "Change name"),
        form([["Current password", "password", "cur"], ["New password", "password", "new"], ["Confirm new password", "password", "new2"]], "Change password"),
        `<div class="acct-form"><p>Two-factor authentication adds a second step when you sign in: a code from an authenticator app.</p><p><b>Status:</b> <span id="tfa">Off</span></p><button class="btn-dark" data-2fa>Turn on</button></div>`,
      ])}`;
    },
    wire(root) {
      root.addEventListener("click", e => {
        const p = e.target.closest("[data-plan]");
        if (p) SP.modal("Checkout", `<p><b>${/^\d+$/.test(p.dataset.plan) ? `Tier ${p.dataset.plan}` : p.dataset.plan}</b>, billed ${p.dataset.per}: <b>$${(+p.dataset.price).toLocaleString("en-US")}</b>.</p><p>Your trial continues; you're charged when it ends.</p><p class="muted-s">Sample only: no payment is taken.</p>`, () => SP.toast("Plan selected (sample only)."), "Confirm");
        if (e.target.closest("[data-contact]")) { e.preventDefault(); SP.modal("Contact us", `<label class="field"><span>Your email</span><input type="email" name="em"></label><label class="field"><span>How many ASINs?</span><input type="number" value="3000"></label>`, m => { if (!$("[name=em]", m).value.includes("@")) return false; SP.toast("Message sent (sample only)."); }, "Send"); }
        const t = e.target.closest("[data-2fa]");
        if (t) { const on = $("#tfa", root).textContent === "Off"; $("#tfa", root).textContent = on ? "On" : "Off"; t.textContent = on ? "Turn off" : "Turn on"; SP.toast(on ? "Two-factor authentication turned on." : "Two-factor authentication turned off."); }
      });
      root.addEventListener("submit", e => {
        e.preventDefault();
        const f = e.target;
        if (f.matches("[data-coupon]")) { const v = $("input", f).value.trim(); SP.toast(v ? `Coupon "${v}" isn't valid for this sample.` : "Enter a coupon code."); return; }
        const pw = $$("input[type=password]", f);
        if (pw.length === 3 && pw[1].value !== pw[2].value) return SP.toast("The new passwords don't match.");
        const em = $$("input[type=email]", f);
        if (em.length === 2 && em[0].value !== em[1].value) return SP.toast("The emails don't match.");
        if (f.dataset.form === "Change name") { const n = `${f.first.value} ${f.last.value}`.trim(); $(".user-name").textContent = n; localStorage.setItem("sp-name", n); }
        SP.toast(`${f.dataset.form}: saved (sample only).`); f.reset && f.dataset.form !== "Change name" && f.reset();
      });
    },
  };

  // ================= Users =================
  const USERS_KEY = "sp-users";
  const users = () => store(USERS_KEY) || [{ _k: "owner", name: "Demo Seller", email: "you@example.com", access: "Owner", owner: true }];
  SP.pages["/Settings/User"] = {
    title: "Users", noSub: true, section: "account", noIcon: true, smallTitle: true,
    render() {
      return `<div class="users-head"><h2>Users</h2><button class="btn-outline add" data-new>${svg(I.plus)}New</button></div><div id="users"></div>`;
    },
    wire(root) {
      const draw = () => {
        $("#users", root).innerHTML = `<table class="utable"><thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Password</th><th>Action</th></tr></thead><tbody>${users().map(u => `<tr><td>${SP.esc(u.name)}</td><td>${SP.esc(u.email)}</td><td>${u.owner ? "" : SP.esc(u.access)}</td><td>${u.owner ? "" : "••••••"}</td><td>${u.owner ? "" : `<button class="link-btn" data-edit="${u._k}">Edit</button> <button class="link-btn danger" data-del="${u._k}">Delete</button>`}</td></tr>`).join("")}</tbody></table>`;
      };
      const editor = u => SP.modal(u ? "Edit user" : "New user", `<label class="field"><span>Name</span><input name="name" value="${u ? SP.esc(u.name) : ""}"></label><label class="field"><span>Email</span><input type="email" name="email" value="${u ? SP.esc(u.email) : ""}"></label><label class="field"><span>Access</span><select name="access">${["Full access", "Read only", "Reports only"].map(a => `<option ${u && u.access === a ? "selected" : ""}>${a}</option>`).join("")}</select></label><label class="field"><span>Password</span><input type="password" name="pw" autocomplete="new-password" placeholder="${u ? "Leave blank to keep" : ""}"></label>`, m => {
        const name = $("[name=name]", m).value.trim(), email = $("[name=email]", m).value.trim();
        if (!name || !email.includes("@") || (!u && !$("[name=pw]", m).value)) { SP.toast("Fill in a name, a valid email and a password."); return false; }
        const list = users();
        if (u) Object.assign(list.find(x => x._k === u._k), { name, email, access: $("[name=access]", m).value });
        else list.push({ _k: String(Date.now()), name, email, access: $("[name=access]", m).value });
        store(USERS_KEY, list); draw(); SP.toast(u ? "User updated." : "User added.");
      }, u ? "Save" : "Create");
      draw();
      root.addEventListener("click", e => {
        if (e.target.closest("[data-new]")) editor(null);
        const ed = e.target.closest("[data-edit]"); if (ed) editor(users().find(x => x._k === ed.dataset.edit));
        const d = e.target.closest("[data-del]");
        if (d) SP.modal("Delete user?", `<p>This user will no longer be able to sign in.</p>`, () => { store(USERS_KEY, users().filter(x => x._k !== d.dataset.del)); draw(); }, "Delete");
      });
    },
  };

  // Keep a renamed account name in the top bar on every page.
  const saved = localStorage.getItem("sp-name");
  if (saved) document.addEventListener("DOMContentLoaded", () => { const n = document.querySelector(".user-name"); if (n) n.textContent = saved; });
})();
