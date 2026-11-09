// Avatar Weather Card - admin panel (v0.14.0): settings + images.
import { PART_KEYS, defaultParts, composePrompt, composeOutfit, WARDROBE, CATEGORIES, BAND_NAMES, defaultEnabled, presetIds, GENDERS, SKY_TAGS, COLORS, COLOR_FAMILIES, defaultColors, wardrobeGaps, ACTIVITIES, defaultActivities, DEFAULT_PREFS } from "./prompts.js?v=0.1.0-2";
import { createSelector, aggregateWeather, solarMoment, sunriseMinutes } from "./selector.js?v=0.1.0-2";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

class AvatarWeatherPanel extends HTMLElement {
  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._init(); else if (this._cfg && this._tab === "settings") this._updateResult();
  }
  set narrow(v) { this._narrow = v; }
  set panel(p) { this._panel = p; }

  async _init() {
    this.attachShadow({ mode: "open" });
    this._initLightbox();
    try {
      this._cfg = await this._hass.callWS({ type: "avatar_weather_card/config_get" });
    } catch (e) {
      this.shadowRoot.innerHTML = `<p style="padding:24px">Cannot load configuration: ${esc(e.message)}</p>`;
      return;
    }
    this._tab = "settings";
    try { this._lib = await this._hass.callWS({ type: "avatar_weather_card/images_list" }); } catch (e) { this._lib = { slots: {} }; }
    this._render();
  }

  // Click any picture to see it big. Arrows (or the keys, or a swipe) step through the visible pictures; Esc, the cross or a click outside closes.
  _initLightbox() {
    const root = this.shadowRoot;
    const IMG = 'img[src*="/avatar_weather_card_images/"], img[src*="/avatar_weather_card_reference/"]';
    const nameOf = (src) => { const m = /\/([^\/?#]+)\.(?:webp|png)(?:[?#]|$)/.exec(src || ""); return m ? decodeURIComponent(m[1]) : ""; };
    const make = () => {
      const d = document.createElement("dialog");
      d.className = "lb";
      d.innerHTML = '<figure><div class="lbstage"><button type="button" class="s lbnav lbprev" aria-label="Previous">\u2039</button><img alt="">' +
        '<button type="button" class="s lbnav lbnext" aria-label="Next">\u203a</button></div>' +
        '<figcaption><code></code><span class="lbcount"></span><button type="button" class="s lbclose" aria-label="Close">\u2715</button></figcaption></figure>';
      root.appendChild(d);
      let x0 = null;
      d.addEventListener("click", (e) => {
        if (e.target.closest(".lbprev")) this._lbShow(this._lbAt - 1);
        else if (e.target.closest(".lbnext")) this._lbShow(this._lbAt + 1);
        else if (e.target === d || e.target.closest(".lbclose")) d.close();
      });
      d.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); this._lbShow(this._lbAt + 1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); this._lbShow(this._lbAt - 1); }
      });
      d.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      d.addEventListener("touchend", (e) => {
        if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 50) this._lbShow(this._lbAt + (dx < 0 ? 1 : -1));
      });
      return d;
    };
    this._lbShow = (i) => {
      const d = this._lbDlg, n = this._lbSeq.length;
      this._lbAt = (i + n) % n;
      const it = this._lbSeq[this._lbAt];
      const big = d.querySelector(".lbstage img");
      big.removeAttribute("src"); big.src = it.src; big.alt = it.name;
      d.querySelector("code").textContent = it.name;
      d.querySelector(".lbcount").textContent = n > 1 ? `${this._lbAt + 1} / ${n}` : "";
    };
    root.addEventListener("click", (e) => {
      const img = e.target.closest && e.target.closest(IMG);
      if (!img || (this._lbDlg && this._lbDlg.contains(img))) return;
      if (!this._lbDlg || !this._lbDlg.isConnected) this._lbDlg = make();
      const seq = [], seen = {};
      root.querySelectorAll(IMG).forEach((im) => {
        if (this._lbDlg.contains(im) || im.closest("[hidden]")) return;
        const src = im.getAttribute("src"), key = src.split("?")[0];
        if (!seen[key]) { seen[key] = 1; seq.push({ src, name: nameOf(src) }); }
      });
      const at = img.getAttribute("src"), k = at.split("?")[0];
      let i = seq.findIndex((x) => x.src.split("?")[0] === k);
      if (i < 0) { seq.unshift({ src: at, name: nameOf(at) }); i = 0; }
      this._lbSeq = seq;
      this._lbDlg.classList.toggle("single", seq.length < 2);
      this._lbShow(i);
      if (!this._lbDlg.open) this._lbDlg.showModal();
    });
  }

  _ids(domain) {
    return Object.keys(this._hass.states).filter((e) => e.startsWith(domain + ".")).sort();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; min-height:100vh; box-sizing:border-box; padding:24px; background:var(--primary-background-color);
                color:var(--primary-text-color); font-family:var(--paper-font-body1_-_font-family, sans-serif) }
        h1 { margin:0 0 4px } h2 { margin:28px 0 6px; font-size:18px } p.h { margin:0 0 10px; opacity:.65; font-size:14px }
        section { max-width:900px } label { display:block; padding:4px 0 }
        small { opacity:.55 } input, select, textarea { font:inherit; padding:6px 8px; border-radius:6px; color:inherit;
                background:var(--card-background-color); border:1px solid var(--divider-color) }
        textarea { width:100%; box-sizing:border-box; min-height:70px } table { border-collapse:collapse; width:100% }
        td { padding:3px 6px 3px 0 } button { font:inherit; padding:8px 16px; border-radius:8px; cursor:pointer; border:0;
                background:var(--primary-color); color:var(--text-primary-color,#fff) }
        button.s { background:transparent; color:var(--primary-text-color); border:1px solid var(--divider-color); padding:4px 10px }
        #msg { margin-left:12px } .err { color:var(--error-color) }
        .tabs { display:flex; gap:8px; margin:12px 0 4px } .tabs button { background:transparent; color:var(--primary-text-color); border:1px solid var(--divider-color) }
        .tabs button.on { background:var(--primary-color); color:var(--text-primary-color,#fff); border-color:transparent }
        .drop { border:2px dashed var(--divider-color); border-radius:12px; padding:22px; text-align:center; margin:8px 0 }
        .drop.over { border-color:var(--primary-color) } .log div { font-size:13px; padding:1px 0 }
        [hidden] { display:none !important }
        table.grid2 { width:auto; border-collapse:separate; border-spacing:3px } .gh { font-size:10px; opacity:.6; text-align:center; padding:0 2px } .gh2 { font-size:12px; padding-right:8px; opacity:.8 }
        .gc { width:46px; height:28px; border-radius:6px; text-align:center; font-size:12px; cursor:pointer; background:var(--card-background-color); border:1px solid var(--divider-color) }
        .gc.ok { background:#2e8b57; color:#fff; border-color:transparent } .gc.na { opacity:.3; cursor:default } .gc.sel { outline:3px solid var(--primary-color) }
        table.covt { width:auto } .covt { border-collapse:separate; border-spacing:3px; font-size:12px } .covt th { font-weight:500; opacity:.75; text-align:left; white-space:nowrap; padding:0 4px }
        .covt thead th { writing-mode:vertical-rl; transform:rotate(180deg); height:76px; padding:2px 0 } .covt td { width:26px; height:22px; border-radius:4px; padding:0 }
        .covt .cell { all:unset; display:block; width:100%; height:22px; cursor:pointer; border-radius:4px } .covt .cell.sel, .covt .cell:focus-visible { outline:2px solid var(--primary-text-color); outline-offset:1px } .covt .cell.over { outline:3px solid var(--primary-color) }
        .q0, .covlegend i.q0 { background:#2e8b57 } .q1, .covlegend i.q1 { background:#8bbf6a } .q2, .covlegend i.q2 { background:#e0b13a } .q3, .covlegend i.q3 { background:#d9534f } .q4, .covlegend i.q4 { background:rgba(128,128,128,.12); box-shadow:inset 0 0 0 1px rgba(128,128,128,.6) } .q-na { opacity:.2 }
        .covlegend { display:flex; flex-wrap:wrap; gap:14px; font-size:12px; margin:6px 0; opacity:.85 } .covlegend i { display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:5px; vertical-align:-2px }
        .covmode { display:inline-flex; margin:8px 0 2px; border:1px solid var(--divider-color); border-radius:999px; overflow:hidden } .covmode button { border:0; border-radius:0; background:transparent; color:var(--primary-text-color); padding:4px 12px } .covmode button[aria-pressed="true"] { background:var(--primary-color); color:var(--text-primary-color,#fff) }
        .group { border:1px solid var(--divider-color); border-radius:12px; margin:10px 0; padding:2px 14px } .ghead { display:flex; align-items:center; justify-content:space-between } .ghead h3 { margin:0; flex:1 } .gtog { all:unset; cursor:pointer; padding:10px 0; font-size:16px; font-weight:600; display:block; width:100% } .gtog::before { content:"▸ " } .gtog[aria-expanded="true"]::before { content:"▾ " }
        .gcount { opacity:.7; font-size:13px } .gintro { font-size:13px; opacity:.8 } .gbody { padding-bottom:12px } .covinfo { font-size:13px; min-height:18px }
        ul.slots { list-style:none; padding:0; margin:10px 0 0 } li.slot { display:flex; align-items:center; gap:12px; padding:6px 0; border-top:1px solid var(--divider-color) } li.slot .thumb img { height:84px; width:60px; object-fit:contain; background:repeating-conic-gradient(#8883 0 25%, transparent 0 50%) 50%/14px 14px; border-radius:6px }
        li.slot .meta { flex:1 } li.slot .cond { margin:2px 0; font-size:13px; opacity:.8 } .chip { font-size:11px; padding:2px 8px; border-radius:999px } .c-done { background:#2e8b5733; color:#2e8b57 }
        summary { cursor:pointer; padding:6px 0 } details label { display:inline-block; margin:4px 14px 4px 0 }
        .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:10px; margin-top:10px }
        .card { background:var(--card-background-color); border-radius:10px; padding:6px; text-align:center; font-size:11px; word-break:break-all }
        img[src*="/avatar_weather_card_images/"], img[src*="/avatar_weather_card_reference/"] { cursor:zoom-in }
        dialog.lb { border:0; padding:0; background:transparent; max-width:100vw; max-height:100vh; color:var(--primary-text-color) }
        dialog.lb::backdrop { background:rgba(10,14,20,.78) }
        dialog.lb figure { margin:0; background:var(--card-background-color,#fff); border:1px solid var(--divider-color); border-radius:10px; padding:14px }
        dialog.lb .lbstage { position:relative }
        dialog.lb img { display:block; max-width:calc(100vw - 64px); max-height:calc(100vh - 110px); width:auto; height:auto; margin:0 auto; cursor:default; border-radius:6px;
                background:repeating-conic-gradient(#8883 0 25%, transparent 0 50%) 50%/18px 18px }
        dialog.lb figcaption { display:flex; align-items:center; gap:12px; margin-top:10px } dialog.lb code { font-size:13px; overflow-wrap:anywhere }
        dialog.lb .lbclose { margin-left:auto; padding:4px 11px } dialog.lb .lbcount { opacity:.7; font-size:13px; white-space:nowrap }
        dialog.lb .lbnav { position:absolute; top:50%; transform:translateY(-50%); width:44px; height:64px; padding:0 0 4px; font-size:34px; line-height:1; border-radius:10px;
                background:color-mix(in srgb, var(--card-background-color,#fff) 82%, transparent); color:var(--primary-text-color); border:1px solid var(--divider-color) }
        dialog.lb .lbprev { left:0 } dialog.lb .lbnext { right:0 } dialog.lb.single .lbnav { display:none }
        .card img { width:100%; height:110px; object-fit:contain; background:repeating-conic-gradient(#8883 0 25%, transparent 0 50%) 50%/14px 14px; border-radius:6px }
      </style>
      <section>
        <h1>Avatar Weather Card</h1>
        <div class="tabs"><button data-t="settings" class="${this._tab === "settings" ? "on" : ""}">Settings</button><button data-t="avatar" class="${this._tab === "avatar" ? "on" : ""}">Prompt</button><button data-t="images" class="${this._tab === "images" ? "on" : ""}">Images</button></div>
        <div id="body"></div>
      </section>`;
    this.shadowRoot.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { this._tab = b.dataset.t; this._render(); }));
    if (this._tab === "images") this._renderImages(); else if (this._tab === "avatar") this._renderAvatar(); else this._renderSettings();
  }

  // Copy a picture to the clipboard as PNG (flattened on light grey so transparency does not turn black in the generator). Needs https or localhost.
  async _copyImage(url, msg) {
    const say = (t) => { if (msg) msg.textContent = t; };
    if (!navigator.clipboard || !window.ClipboardItem) { say("The browser only allows this on https: use Download the original, or open Home Assistant through its https address."); return; }
    try {
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext("2d"); g.fillStyle = "#cfcfcf"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0);
      const png = await new Promise((res) => c.toBlob(res, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      say("Image copied ✓ (paste it into the generator)");
    } catch (e) { say("Could not copy: " + (e && e.message ? e.message : e)); }
  }

  async _renderAvatar() {
    const body = this.shadowRoot.getElementById("body"), r = this.shadowRoot;
    let ref = null;
    try { ref = await this._hass.callWS({ type: "avatar_weather_card/reference_get" }); } catch (e) { /* older backend */ }
    const desc = (this._cfg.avatar && this._cfg.avatar.description) || "";
    body.innerHTML = `
      <h2>Reference picture <small>(optional, only for engines that take a picture)</small></h2>
      <p class="h">Upload a picture of the character you want (a drawing, an illustration, a render…). It is the <b>reference</b> for every other picture:
        the prompts you will copy into your image generator ask it to keep the same face, hair, build and drawing style, so attach this same file each time.
        Once you have one generated picture you like, you can upload that as the reference instead.</p>
      <p class="h" style="padding:8px 12px;border-radius:8px;background:var(--card-background-color)">If the reference shows a real person, some image generators refuse to use it, and
        you should not share that avatar publicly. Use an invented character for anything you plan to share.</p>
      <div class="drop" id="rdrop">Drop the reference image here or <input type="file" id="rfile" accept="image/png,image/jpeg,image/webp"></div>
      <div id="rmsg" class="h"></div>
      ${ref ? `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
          <img src="/avatar_weather_card_reference/${esc(ref.file)}?v=${ref.v}" style="max-height:340px;max-width:100%;border-radius:10px;background:repeating-conic-gradient(#8883 0 25%, transparent 0 50%) 50%/14px 14px">
          <div><div><b>${esc(ref.file)}</b></div><small>${ref.w} × ${ref.h} px, ${(ref.bytes / 1024).toFixed(0)} KB</small>
            <p><a href="/avatar_weather_card_reference/${esc(ref.file)}?v=${ref.v}" download="${esc(ref.file)}"><button class="s" type="button">Download the original</button></a>
            <button class="s" id="rcopy" type="button">Copy image to clipboard</button> <button class="s" id="rdel">Remove</button> <span id="rcmsg" style="margin-left:8px"></span></p></div></div>` : `<p class="h">No reference picture yet.</p>`}
      <h2>Character</h2>
      <h3 style="margin:14px 0 2px">Notes about the character <small>(optional)</small></h3>
      <p class="h">Anything the picture does not show, in a few words: age, hair colour, things the character always wears or never wears… These notes are added to the prompts.</p>
      <textarea id="adesc" maxlength="1500" placeholder="e.g. woman in her thirties, long dark hair, always wears small silver earrings">${esc(desc)}</textarea>
      <p><button id="asave">Save notes</button><span id="amsg" style="margin-left:12px"></span></p>
      <h3 style="margin:22px 0 2px">Fixed parts of every prompt</h3>
      <p class="h">These sections are the same in every picture, so they are written once here. Edit any of them; “Reset” brings back the built-in text. <code>{notes}</code> and <code>{surface}</code> are filled in automatically.</p>
      <div id="parts"></div>
      <p><button id="psave">Save prompt parts</button><span id="pmsg" style="margin-left:12px"></span></p>
      <h2>Wardrobe</h2>
      <p class="h">Tick the clothes you like. For every picture the prompt generator picks an outfit at random from the ticked options that suit the temperature and the time of day (the small text says when each one is used). Untick what the character would never wear.</p>
      <div id="wardrobe"></div>
      <h2>Colours</h2>
      <p class="h">Tick the colours the character may wear. Where a colour makes sense (coats, tops, skirts, scarves, bags…) the generator picks one of the ticked ones at random. Jeans, white sneakers and the like keep their own colour.</p>
      <div id="colors"></div>
      <h2>Weekend activities</h2>
      <p class="h">In the weekend pictures (weekends and holidays) the character is doing something. Tick the activities you like: the generator picks one at random among the ticked ones that suit the temperature, the weather and the time of day (weekend pictures without any suitable activity just get a relaxed look).</p>
      <div id="activities"></div>
      <h2>Picture background</h2>
      <p class="h">Transparent is best: generators such as ChatGPT can deliver a PNG already cut out, and the picture can be uploaded as it is. Solid colour is for generators that cannot (the colour is removed afterwards).</p>
      <p><label>Background <select id="wd-bg"><option value="transparent"${(((this._cfg.avatar || {}).prefs || {}).bg || "transparent") === "transparent" ? " selected" : ""}>Transparent (PNG with alpha)</option><option value="solid"${((this._cfg.avatar || {}).prefs || {}).bg === "solid" ? " selected" : ""}>Solid colour</option></select></label>
      <label style="margin-left:12px">Colour <input type="color" id="wd-bgcolor" value="${esc(((this._cfg.avatar || {}).prefs || {}).bgColor || "#808080")}"></label></p>
      <p><label>Always add to every prompt <input id="wd-extra" size="70" maxlength="500" value="${esc(((this._cfg.avatar || {}).prefs || {}).extra || "")}" placeholder="e.g. never wears hats"></label></p>
      <p><button id="wsave">Save wardrobe, colours and activities</button><span id="wmsg" style="margin-left:12px"></span></p>`;
    const send = async (f) => {
      const msg = r.getElementById("rmsg"); msg.textContent = `${f.name} …`;
      const fd = new FormData(); fd.append("file", f);
      try {
        const resp = await fetch("/api/avatar_weather_card/reference", { method: "POST", headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` }, body: fd });
        const j = await resp.json();
        if (resp.ok) this._renderAvatar(); else { msg.className = "h err"; msg.textContent = `${f.name}: ${j.message}`; }
      } catch (e) { msg.className = "h err"; msg.textContent = e.message; }
    };
    r.getElementById("rfile").onchange = (e) => e.target.files[0] && send(e.target.files[0]);
    const drop = r.getElementById("rdrop");
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) send(e.dataTransfer.files[0]); };
    const rc = r.getElementById("rcopy");
    if (rc) rc.onclick = () => this._copyImage(`/avatar_weather_card_reference/${ref.file}?v=${ref.v}`, r.getElementById("rcmsg"));
    const del = r.getElementById("rdel");
    if (del) del.onclick = async () => { if (!confirm("Remove the reference picture?")) return; await this._hass.callWS({ type: "avatar_weather_card/reference_delete" }); this._renderAvatar(); };
    const saved = (this._cfg.avatar || {}).wardrobe;
    const on = new Set(saved || defaultEnabled());
    const when = (w) => `${w.g !== "u" ? GENDERS[w.g] + ", " : ""}${BAND_NAMES[w.lo]}${w.lo === w.hi ? "" : " – " + BAND_NAMES[w.hi]}${w.when === "any" ? "" : ", " + w.when}${w.sky ? ", " + SKY_TAGS[w.sky] + " weather" : ""}`;
    const f = (this._wdF = this._wdF || { gender: new Set(), time: new Set(), band: new Set(), sky: new Set(), q: "", only: false });
    const some = (set, test) => !set.size || [...set].some(test);   // within a filter group any tick matches; the groups combine (AND)
    const shown = (w) => some(f.gender, (g) => w.g === g) && some(f.time, (t) => w.when === "any" || w.when === t)
      && some(f.band, (b) => +b >= w.lo && +b <= w.hi) && (!f.sky.size || (f.only ? f.sky.has(w.sky) : !w.sky || f.sky.has(w.sky)))
      && (!f.q || (w.text + " " + w.id).toLowerCase().includes(f.q.toLowerCase()));
    const catLabel = Object.fromEntries(CATEGORIES);
    const groups = [...CATEGORIES.map(([cat, label]) => [cat, label, WARDROBE.filter((w) => w.cat === cat && !w.trad)]),
      ["trad", "Traditional and cultural dress (all optional, nothing ticked by default)", WARDROBE.filter((w) => w.trad)]];
    const drawWardrobe = () => {
      r.getElementById("wardrobe").innerHTML = `<p style="margin:0 0 8px">Start from: <button class="s" data-preset="neutral">Neutral set</button> <button class="s" data-preset="feminine">Feminine set</button> <button class="s" data-preset="masculine">Masculine set</button> <button class="s" data-preset="none">Clear all</button>
        </p>
        <div style="margin:0 0 8px;font-size:13px"><b>Filter</b> <small>(tick several; empty = no filter)</small>
          ${[["gender", "Who", [["f", "feminine"], ["m", "masculine"], ["u", "unisex"]]], ["time", "When", [["day", "daytime"], ["evening", "evening and night"]]],
             ["band", "Temperature", BAND_NAMES.map((n, i) => [String(i), n])], ["sky", "Weather", Object.entries(SKY_TAGS)]].map(([k, label, opts]) =>
            `<div style="margin:2px 0"><span style="display:inline-block;width:90px;opacity:.6">${label}</span>${opts.map(([v, l]) => `<label style="display:inline-block;margin-right:12px"><input type="checkbox" data-f="${k}" value="${v}" ${f[k].has(v) ? "checked" : ""}> ${l}</label>`).join("")}${k === "sky" && f.sky.size ? `<label style="display:inline-block;margin-left:6px"><input type="checkbox" id="wf-only" ${f.only ? "checked" : ""}> only made for this weather</label>` : ""}</div>`).join("")}
          <div style="margin:4px 0"><input id="wf-q" placeholder="search…" value="${esc(f.q)}" size="18"> <button class="s" id="wf-clear">Clear filters</button></div></div></p>` + groups.map(([cat, label, all]) => {
        const items = all.filter(shown).sort((a, b) => (f.sky.size ? (f.sky.has(b.sky) ? 1 : 0) - (f.sky.has(a.sky) ? 1 : 0) : 0)), n = all.filter((w) => on.has(w.id)).length;
        return `<details ${(this._wdOpen && this._wdOpen[cat]) || (f.q && items.length) ? "open" : ""} data-cat="${cat}"><summary><b>${label}</b> <small>${n} of ${all.length} ticked</small></summary>
          <p style="margin:4px 0"><button class="s" data-all="${cat}">All shown</button> <button class="s" data-none="${cat}">None</button></p>
          ${items.map((w) => `<label style="display:block;padding:2px 0"><input type="checkbox" data-w="${w.id}" ${on.has(w.id) ? "checked" : ""}> ${esc(w.text)} <small>(${esc((cat === "trad" ? catLabel[w.cat] + ", " : "") + when(w))})</small></label>`).join("") || "<small>nothing to show with this filter</small>"}</details>`;
      }).join("");
      const gaps = wardrobeGaps([...on]);
      if (gaps.length) {
        const g = {}; gaps.forEach((x) => { (g[x.cat] = g[x.cat] || []).push(`${x.band}${x.evening ? " (evening)" : ""}`); });
        r.getElementById("wardrobe").insertAdjacentHTML("afterbegin", `<div class="err" style="margin-bottom:8px;font-size:13px">Nothing ticked for: ${Object.entries(g).map(([c, b]) => `<b>${esc(c)}</b> for ${esc(b.join(", "))}`).join("; ")}. Those pictures will be generated without that item.</div>`);
      }
      r.querySelectorAll("#wardrobe details").forEach((d) => (d.ontoggle = () => { (this._wdOpen = this._wdOpen || {})[d.dataset.cat] = d.open; }));
      r.querySelectorAll("#wardrobe [data-w]").forEach((c) => (c.onchange = () => { c.checked ? on.add(c.dataset.w) : on.delete(c.dataset.w); drawWardrobe(); }));
      r.querySelectorAll("[data-all]").forEach((b) => (b.onclick = () => { const k = b.dataset.all; WARDROBE.filter((w) => (k === "trad" ? w.trad : w.cat === k && !w.trad) && shown(w)).forEach((w) => on.add(w.id)); this._wdOpen = { ...(this._wdOpen || {}), [k]: true }; drawWardrobe(); }));
      r.querySelectorAll("[data-none]").forEach((b) => (b.onclick = () => { const k = b.dataset.none; WARDROBE.filter((w) => (k === "trad" ? w.trad : w.cat === k && !w.trad)).forEach((w) => on.delete(w.id)); this._wdOpen = { ...(this._wdOpen || {}), [k]: true }; drawWardrobe(); }));
      r.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => { on.clear(); if (b.dataset.preset !== "none") presetIds(b.dataset.preset).forEach((i) => on.add(i)); drawWardrobe(); }));
      r.querySelectorAll("[data-f]").forEach((c) => (c.onchange = () => { const s = f[c.dataset.f]; c.checked ? s.add(c.value) : s.delete(c.value); if (!f.sky.size) f.only = false; drawWardrobe(); }));
      const only = r.getElementById("wf-only"); if (only) only.onchange = (e) => { f.only = e.target.checked; drawWardrobe(); };
      r.getElementById("wf-clear").onclick = () => { ["gender", "time", "band", "sky"].forEach((k) => f[k].clear()); f.q = ""; f.only = false; drawWardrobe(); };
      const q = r.getElementById("wf-q"); q.oninput = (e) => { f.q = e.target.value; drawWardrobe(); const n = r.getElementById("wf-q"); n.focus(); n.setSelectionRange(f.q.length, f.q.length); };
    };
    drawWardrobe();
    const cOn = new Set((this._cfg.avatar || {}).colors || defaultColors());
    const drawColors = () => {
      r.getElementById("colors").innerHTML = `<p style="margin:0 0 6px"><button class="s" data-call="all">All colours</button> <button class="s" data-call="none">None</button> <button class="s" data-call="default">Defaults</button></p>` +
        COLOR_FAMILIES.map((fam, i) => `<div style="margin:4px 0"><small style="opacity:.6;display:inline-block;width:150px">${fam}</small>${COLORS.filter((c) => c.fam === i).map((c) => `<label style="display:inline-block;margin:2px 12px 2px 0"><input type="checkbox" data-c="${c.id}" ${cOn.has(c.id) ? "checked" : ""}> <span style="display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:-1px;background:${c.hex};border:1px solid #8886"></span> ${esc(c.name)}</label>`).join("")}</div>`).join("");
      r.querySelectorAll("#colors [data-c]").forEach((c) => (c.onchange = () => { c.checked ? cOn.add(c.dataset.c) : cOn.delete(c.dataset.c); }));
      r.querySelectorAll("#colors [data-call]").forEach((b) => (b.onclick = () => { cOn.clear(); (b.dataset.call === "all" ? COLORS.map((c) => c.id) : b.dataset.call === "default" ? defaultColors() : []).forEach((i) => cOn.add(i)); drawColors(); }));
    };
    drawColors();
    const aOn = new Set((this._cfg.avatar || {}).activities || defaultActivities());
    const SK = { d: "dry", s: "sunny", w: "rain", n: "snow" };
    const drawActs = () => {
      r.getElementById("activities").innerHTML = `<p style="margin:0 0 6px"><button class="s" data-aall="all">All</button> <button class="s" data-aall="none">None</button> <button class="s" data-aall="default">Defaults</button></p>` +
        [["day", "Daytime"], ["evening", "Evening and night"]].map(([wh, label]) => `<div style="margin:6px 0 2px"><b>${label}</b></div>` + ACTIVITIES.filter((a) => a.when === wh).map((a) =>
          `<label style="display:block;padding:2px 0"><input type="checkbox" data-a="${a.id}" ${aOn.has(a.id) ? "checked" : ""}> ${esc(a.text)} <small>(${BAND_NAMES[a.lo]}${a.lo === a.hi ? "" : " – " + BAND_NAMES[a.hi]}; ${[...a.skies].map((c) => SK[c]).join(", ")})</small></label>`).join("")).join("");
      r.querySelectorAll("#activities [data-a]").forEach((c) => (c.onchange = () => { c.checked ? aOn.add(c.dataset.a) : aOn.delete(c.dataset.a); }));
      r.querySelectorAll("#activities [data-aall]").forEach((b) => (b.onclick = () => { aOn.clear(); (b.dataset.aall === "all" ? ACTIVITIES.map((a) => a.id) : b.dataset.aall === "default" ? defaultActivities() : []).forEach((i) => aOn.add(i)); drawActs(); }));
    };
    drawActs();
    r.getElementById("wsave").onclick = async () => {
      const m = r.getElementById("wmsg");
      const av = { ...(this._cfg.avatar || {}), wardrobe: [...on], colors: [...cOn], activities: [...aOn], prefs: { ...((this._cfg.avatar || {}).prefs || {}), extra: r.getElementById("wd-extra").value, bg: r.getElementById("wd-bg").value, bgColor: r.getElementById("wd-bgcolor").value } };
      try {
        this._cfg = await this._hass.callWS({ type: "avatar_weather_card/config_set", config: { ...this._cfg, avatar: av } });
        m.className = ""; m.textContent = "Saved ✓";
      } catch (e) { m.className = "err"; m.textContent = e.message || "Error"; }
    };
    // ---- the fixed parts of the prompt
    {
      const prefsNow = (this._cfg.avatar || {}).prefs || {};
      const saved = (prefsNow.parts && Object.keys(prefsNow.parts).length) ? prefsNow.parts : (() => { try { return JSON.parse(localStorage.getItem("awc_prompt_parts") || "{}"); } catch (e) { return {}; } })();
      const defs = defaultParts({ ...prefsNow, bg: r.getElementById("wd-bg").value, bgColor: r.getElementById("wd-bgcolor").value }, true);
      r.getElementById("parts").innerHTML = PART_KEYS.map(([k, label, hint]) => `<div style="margin:12px 0"><b>${esc(label)}</b> <small>${esc(hint)}</small>
        <textarea data-part="${k}" rows="${k === "background" ? 8 : k === "pose" || k === "base" || k === "character" ? 5 : 3}" style="width:100%;box-sizing:border-box">${esc(saved[k] || defs[k])}</textarea>
        <button class="s" type="button" data-preset="${k}">Reset</button> <small data-pstate="${k}">${saved[k] ? "edited" : "built-in text"}</small></div>`).join("");
      const mark = (ta) => { const st2 = r.querySelector(`[data-pstate="${ta.dataset.part}"]`); st2.textContent = ta.value.trim() === defs[ta.dataset.part].trim() ? "built-in text" : "edited"; };
      r.querySelectorAll("#parts textarea").forEach((ta) => (ta.oninput = () => mark(ta)));
      r.querySelectorAll("#parts [data-preset]").forEach((b) => (b.onclick = () => { const ta = r.querySelector(`#parts textarea[data-part="${b.dataset.preset}"]`); ta.value = defs[b.dataset.preset]; mark(ta); }));
      r.getElementById("psave").onclick = async () => {
        const m = r.getElementById("pmsg"), parts = {};
        r.querySelectorAll("#parts textarea").forEach((ta) => { const v = ta.value.trim(); if (v && v !== defs[ta.dataset.part].trim()) parts[ta.dataset.part] = v; });
        try { localStorage.setItem("awc_prompt_parts", JSON.stringify(parts)); } catch (e) { /* private mode */ }
        try {
          const av = { ...(this._cfg.avatar || {}), prefs: { ...((this._cfg.avatar || {}).prefs || {}), parts } };
          this._cfg = await this._hass.callWS({ type: "avatar_weather_card/config_set", config: { ...this._cfg, avatar: av } });
          const kept = ((this._cfg.avatar || {}).prefs || {}).parts;
          m.className = ""; m.textContent = kept ? "Saved ✓" : "Saved in this browser only (Home Assistant needs the updated store.py and a restart to keep it)";
        } catch (e) { m.className = "err"; m.textContent = (e.message || "Error") + " — kept in this browser only"; }
      };
    }
    r.getElementById("asave").onclick = async () => {
      const m = r.getElementById("amsg");
      try {
        this._cfg = await this._hass.callWS({ type: "avatar_weather_card/config_set", config: { ...this._cfg, avatar: { ...(this._cfg.avatar || {}), description: r.getElementById("adesc").value } } });
        m.className = ""; m.textContent = "Saved ✓";
      } catch (e) { m.className = "err"; m.textContent = e.message || "Error"; }
    };
  }

  // Asks, inline, a question with three answers: yes (back up first), no (go on without a backup), cancel.
  _ask(msgEl, html, yesText, noText, cb) {
    msgEl.className = "h";
    msgEl.innerHTML = `<div style="padding:10px 14px;margin:8px 0;border-radius:10px;border:1px solid var(--warning-color,#e8a400)">${html}
      <p style="margin:8px 0 0"><button data-c="yes">${yesText}</button> <button class="s" data-c="no">${noText}</button> <button class="s" data-c="cancel">Cancel</button></p></div>`;
    msgEl.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { msgEl.innerHTML = ""; if (b.dataset.c !== "cancel") cb(b.dataset.c === "yes"); }));
  }

  // The picture series: what the catalog offers and the zips dropped in the incoming folder. Installing one REPLACES the pictures.
  async _renderSeries(box) {
    const esc2 = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    let d;
    try { d = await this._hass.callWS({ type: "avatar_weather_card/series_catalog" }); } catch (e) { box.innerHTML = `<h2>Picture series</h2><p class="err">${esc2(e.message || "Could not read the series")}</p>`; return; }
    const lib = d.library || { count: 0, series: null }, cat = d.catalog || [];
    const card = (x, extra) => `<div style="padding:10px 14px;margin:8px 0;border-radius:10px;background:var(--card-background-color)">${x}${extra || ""}</div>`;
    const mb = (b) => (b ? ` · ${(b / 1048576).toFixed(1)} MB` : "");
    const rows = cat.map((c) => {
      const cur = lib.series && lib.series.id === c.id, upd = cur && c.version && lib.series.version !== c.version;
      return card(`<b>${esc2(c.name || c.id)}</b> <small>${esc2(c.version)}</small>${cur ? ` <span class="chip c-done">${upd ? "update available" : "in use"}</span>` : ""}
        <div class="h">${esc2(c.description)}</div><small>${c.count || "?"} pictures${mb(c.bytes)}${c.license ? " · " + esc2(c.license) : ""}${c.author ? " · " + esc2(c.author) : ""}</small>
        ${c.attribution ? `<div><small>${esc2(c.attribution)}</small></div>` : ""}`,
        `<p style="margin:8px 0 0"><button data-si="${esc2(c.id)}" data-name="${esc2(c.name || c.id)}" ${c.zip_url ? "" : "disabled"}>${cur ? (upd ? "Update" : "Reinstall") : "Install"}</button></p>`);
    });
    const files = (d.incoming || []).map((f) => card(`<code>${esc2(f.file)}</code> <small>${(f.bytes / 1048576).toFixed(1)} MB</small>`, `<p style="margin:8px 0 0"><button class="s" data-sf="${esc2(f.file)}">Install this zip</button></p>`));
    box.innerHTML = `<h2>Picture series</h2>
      <p class="h">A series is a ready-made set of pictures. <b>Installing a series replaces all your pictures</b> with the ones of the series (the ones you have now are deleted); you are asked first whether to keep a backup, which you can restore later from <i>Backups</i> below.
        ${lib.count ? `Right now you have <b>${lib.count}</b> pictures${lib.series ? `, from the series “${esc2(lib.series.name || lib.series.id)}”` : ""}.` : "You have no pictures yet."}</p>
      ${d.error ? `<p class="err">Could not load the list of series (${esc2(d.error)}). You can still add your own pictures, or install a zip: copy it into <code>/config/avatar_weather_card/incoming/</code> and reopen this tab.</p>` : ""}
      ${rows.join("")}
      ${files.length ? `<h3 style="margin:14px 0 2px">Zip files in the incoming folder</h3>${files.join("")}` : ""}
      ${!cat.length && !d.error ? `<p class="h">The catalog has no series yet.</p>` : ""}
      <div id="smsg" class="h"></div>`;
    const msgEl = box.querySelector("#smsg");
    const msg = (t, bad) => { msgEl.className = bad ? "err" : "h"; msgEl.textContent = t; };
    const run = async (text, call) => {
      box.querySelectorAll("button").forEach((b) => (b.disabled = true)); msg(text);
      try { const r = await call(); msg(`Installed “${r.name || r.id}”: ${r.count} pictures${r.skipped ? ` (${r.skipped} files skipped)` : ""}${r.backup ? ", your previous pictures are saved in a backup" : ""} ✓`); setTimeout(() => this._renderImages(), 1500); }
      catch (e) { msg(e.message || "Failed", true); box.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
    };
    // never delete without asking: with pictures in place, ask about the backup; with none, there is nothing to lose
    const go = (label, call, text) => {
      if (!lib.count) return run(text, () => call(false));
      this._ask(msgEl, `Installing <b>${esc2(label)}</b> will <b>delete the ${lib.count} pictures you have now</b> and replace them with the series. Do you want to make a backup of them first?`,
        "Back up, then install", "Install without a backup", (backup) => run(backup ? "Backing up and installing… (can take a minute)" : text, () => call(backup)));
    };
    box.querySelectorAll("[data-si]").forEach((b) => (b.onclick = () => go(`“${b.dataset.name}”`, (backup) => this._hass.callWS({ type: "avatar_weather_card/series_install", series_id: b.dataset.si, backup }), "Downloading and installing… (can take a minute)")));
    box.querySelectorAll("[data-sf]").forEach((b) => (b.onclick = () => go(`the zip ${b.dataset.sf}`, (backup) => this._hass.callWS({ type: "avatar_weather_card/series_install_file", file: b.dataset.sf, backup }), "Installing…")));
  }

  // Backups of the pictures: make one now, restore one, delete one.
  async _renderBackups(box) {
    const esc2 = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    let list, now;
    try { const r = await this._hass.callWS({ type: "avatar_weather_card/backups_list" }); list = r.backups; now = r.library.count; } catch (e) { box.innerHTML = `<h2>Backups</h2><p class="err">${esc2(e.message || "Could not read the backups")}</p>`; return; }
    const rows = list.map((b) => `<div style="padding:10px 14px;margin:8px 0;border-radius:10px;background:var(--card-background-color)">
        <b>${esc2(b.name || b.reason || "Backup")}</b> ${b.damaged ? `<span class="err">damaged</span>` : `<small>${esc2(new Date(b.created * 1000).toLocaleString())} · ${b.count} pictures · ${(b.bytes / 1048576).toFixed(1)} MB${b.series ? " · series " + esc2(b.series) : ""}</small>`}
        ${b.description ? `<div class="h">${esc2(b.description)}</div>` : ""}${b.name && b.reason && b.reason !== "manual backup" ? `<div><small>${esc2(b.reason)}</small></div>` : ""}
        <p style="margin:8px 0 0">${b.damaged ? "" : `<button data-br="${esc2(b.id)}" data-n="${b.count}">Restore</button> `}<button class="s" data-bdl="${esc2(b.id)}">Download</button> <button class="s" data-bd="${esc2(b.id)}">Delete</button></p></div>`);
    box.innerHTML = `<h2>Backups</h2>
      <p class="h">A backup is a copy of all your pictures. Restoring one <b>replaces the pictures you have now</b>. Up to 20 backups are kept; delete the ones you no longer need.</p>
      <p><button id="bnew" ${now ? "" : "disabled"}>Back up my pictures now</button></p>
      <div id="bform" hidden style="padding:10px 14px;margin:8px 0;border-radius:10px;background:var(--card-background-color)">
        <p style="margin:0 0 6px"><label>Name <input id="bname" maxlength="60" style="width:min(360px,100%)" placeholder="e.g. Before trying the new series"></label></p>
        <p style="margin:0 0 6px"><label>Description (optional)<br><textarea id="bdesc" maxlength="300" rows="2" style="width:min(480px,100%)"></textarea></label></p>
        <p style="margin:0"><button id="bcreate">Create backup</button> <button class="s" id="bcancel">Cancel</button></p></div>
      ${rows.join("") || `<p class="h">No backups yet.</p>`}
      <div id="bmsg" class="h"></div>`;
    const msgEl = box.querySelector("#bmsg");
    const msg = (t, bad) => { msgEl.className = bad ? "err" : "h"; msgEl.textContent = t; };
    const call = async (text, fn, after) => {
      box.querySelectorAll("button").forEach((b) => (b.disabled = true)); msg(text);
      try { await fn(); after(); } catch (e) { msg(e.message || "Failed", true); box.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
    };
    const form = box.querySelector("#bform");
    box.querySelector("#bnew").onclick = () => { form.hidden = false; box.querySelector("#bname").value = `Backup ${new Date().toLocaleDateString()}`; box.querySelector("#bname").focus(); box.querySelector("#bname").select(); };
    box.querySelector("#bcancel").onclick = () => { form.hidden = true; };
    box.querySelector("#bcreate").onclick = () => call("Backing up…", () => this._hass.callWS({ type: "avatar_weather_card/backup_create", name: box.querySelector("#bname").value, description: box.querySelector("#bdesc").value }), () => this._renderBackups(box));
    // the zip is not served as a plain file: fetch it with the user's login and save it
    box.querySelectorAll("[data-bdl]").forEach((b) => (b.onclick = () => call("Preparing the download…", async () => {
      const r = await this._hass.fetchWithAuth(`/api/avatar_weather_card/backup/${encodeURIComponent(b.dataset.bdl)}`);
      if (!r.ok) throw new Error(`Download failed (HTTP ${r.status})`);
      const blob = await r.blob(), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `avatar-weather-backup-${b.dataset.bdl}.zip`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    }, () => { msg("Downloaded ✓"); box.querySelectorAll("button").forEach((x) => (x.disabled = false)); })));
    box.querySelectorAll("[data-bd]").forEach((b) => (b.onclick = () => { if (confirm("Delete this backup? This cannot be undone.")) call("Deleting…", () => this._hass.callWS({ type: "avatar_weather_card/backup_delete", backup_id: b.dataset.bd }), () => this._renderBackups(box)); }));
    box.querySelectorAll("[data-br]").forEach((b) => (b.onclick = () => {
      const restore = (backup_first) => call(backup_first ? "Backing up and restoring…" : "Restoring…", () => this._hass.callWS({ type: "avatar_weather_card/backup_restore", backup_id: b.dataset.br, backup_first }), () => this._renderImages());
      if (!now) return restore(false);
      this._ask(msgEl, `Restoring this backup (${b.dataset.n} pictures) will <b>delete the ${now} pictures you have now</b>. Do you want to make a backup of them first?`, "Back up, then restore", "Restore without a backup", restore);
    }));
  }

  async _renderImages() {
    const r = this.shadowRoot, body = r.getElementById("body");
    let lib = { slots: {} };
    try { lib = await this._hass.callWS({ type: "avatar_weather_card/images_list" }); } catch (e) { /* keep empty */ }
    let ref = null; try { ref = await this._hass.callWS({ type: "avatar_weather_card/reference_get" }); } catch (e) { /* older backend */ }
    const prefs = { ...DEFAULT_PREFS, ...((this._cfg.avatar || {}).prefs || {}) };
    const wardrobe = (this._cfg.avatar || {}).wardrobe || null;
    const st = (this._iv = this._iv || { hum: "any", sel: null, open: null, mode: {}, seed: 0 });
    if (!st.open) { try { st.open = JSON.parse(localStorage.getItem("awc_img_open") || "{}"); } catch (e) { st.open = {}; } }
    const saveOpen = () => { try { localStorage.setItem("awc_img_open", JSON.stringify(st.open)); } catch (e) { /* private mode */ } };
    // Outfits chosen by hand per cell: { cellName: { category: wardrobeId | "" } }, kept in this browser only.
    if (!st.ov) { try { st.ov = JSON.parse(localStorage.getItem("awc_outfit_ov") || "{}"); } catch (e) { st.ov = {}; } }
    const saveOv = () => { try { localStorage.setItem("awc_outfit_ov", JSON.stringify(st.ov)); } catch (e) { /* private mode */ } };
    // How the prompts are written (this browser only): for a text-only engine (default) or for one that takes a reference picture.
    if (!st.pm) { try { st.pm = { textOnly: true, styleText: "", ...JSON.parse(localStorage.getItem("awc_prompt_mode") || "{}") }; } catch (e) { st.pm = { textOnly: true, styleText: "" }; } }
    const savePm = () => { try { localStorage.setItem("awc_prompt_mode", JSON.stringify(st.pm)); } catch (e) { /* private mode */ } };
    // The fixed parts of the prompt edited in the Prompt tab: from HA (avatar.prefs.parts), else from this browser.
    const partsNow = () => { const f = ((this._cfg.avatar || {}).prefs || {}).parts; if (f && Object.keys(f).length) return f; try { return JSON.parse(localStorage.getItem("awc_prompt_parts") || "{}"); } catch (e) { return {}; } };
    const MULTI = { headwear: 1, scarf: 1, gloves: 1, accessory: 1 };   // accessories add up (checkboxes); the rest is one item per category (radio buttons)
    const OUTFIT_ROWS = [["outer", "Coat / jacket"], ["top", "Top"], ["dress", "Dress"], ["bottom", "Trousers / skirt"], ["shoes", "Shoes"], ["headwear", "Hat / glasses"], ["scarf", "Scarf"], ["gloves", "Gloves"], ["accessory", "Bag / accessory"]];
    const slots = lib.slots || {}, all = Object.keys(slots).sort();
    const events = this._cfg.special_days.map((d) => d.id).filter(Boolean);
    const sel = createSelector({ events: Object.fromEntries(events.map((e) => [e, ["01-01", "01-01"]])) });
    // Reduced set of slots (2026-11-08): 5 temperatures x 4 skies x 5 moments, fewer skies at night, snow only when cold,
    // the weekend has exactly the same cells as the weekdays. 75 weather cells x 2 (weekday, weekend) + 25 music x 2, instead of ~1100 raw combinations (140 per moment).
    // The finer names (freezing, heatwave, fog, wind, storm, hail, sleet, snowstorm, earlymorning, midday, goldenhour, lateevening) are still
    // valid file names and still chosen by the selector, but the grids no longer ask for them: a live "storm" at midday shows the closest of these.
    const TEMPS = ["cold", "chilly", "mild", "warm", "hot"];
    const SKIES = ["clear", "cloudy", "rain", "snow"];
    const DRYSKY = { clear: 1, cloudy: 1, wind: 1 }, HUMTEMP = { warm: 1, hot: 1, heatwave: 1 };
    const MOM = ["earlymorning", "morning", "afternoon", "evening", "night"];
    const MOMLAB = { earlymorning: "Early morning", morning: "Morning (to 15:00)", afternoon: "Afternoon & golden hour", evening: "Evening & late evening", night: "Night", midday: "Midday", goldenhour: "Golden hour", lateevening: "Late evening", day: "All day (generic, optional)" };
    const FOLD = { midday: "morning", goldenhour: "afternoon", lateevening: "evening" };   // old moment -> the section it now lives in
    const NIGHT_SKY = { clear: 1, rain: 1, snow: 1 };                    // at night cloudy looks like clear
    const plaus = (t, k, m) => (k !== "snow" || t === "cold") && (m !== "night" || NIGHT_SKY[k]);
    const cellOn = (t, k, m) => plaus(t, k, m);   // weekend cells = the same cells as the weekdays
    const NA = `<td class="q-na"></td>`;
    const SECTIONS = [
      ...[...MOM, "day"].map((m) => ({ key: m, title: MOMLAB[m], kind: "band", m })),
      ...(events.length ? [{ key: "events", title: "Special days", kind: "events" }] : []),
      { key: "music", title: "Music", kind: "music" },
    ];
    const INTRO = {
      day: "The generic family: used for morning, midday and afternoon until a band has pictures of its own. Name: <code>&lt;temp&gt;_&lt;sky&gt;_day</code>.",
      events: "One picture per special day and time of day: <code>&lt;day&gt;_&lt;moment&gt;</code>. The weather is ignored on these days. There are no ready-made prompts: write your own.",
      music: "Seated pictures for when music plays: <code>music_&lt;temp&gt;_&lt;moment&gt;</code>. Alternatives <code>_2</code>, <code>_3</code> are rotated. The prompt shows the character in an armchair with headphones.",
    };
    const parsedAll = all.map((n) => sel.parse(n)).filter(Boolean);
    const secOf = (p) => (p.event ? "events" : p.music ? "music" : (p.moment === "any" || p.moment === "day") ? "day" : (FOLD[p.moment] || p.moment));
    const bySec = {}; parsedAll.forEach((p) => (bySec[secOf(p)] = bySec[secOf(p)] || []).push(p));
    const baseSet = new Set(all.map((n) => n.replace(/_\d+$/, "")));
    // pictures that really are humid (the selector may use a normal picture for a humid wish, but the grid must not count that as done)
    const hkey = (t, k, m, wk) => `${t}|${k}|${FOLD[m] || m}|${wk ? 1 : 0}`;
    const humidHave = new Set(parsedAll.filter((p) => p.hum === "humid" && !p.music && !p.event).map((p) => hkey(p.temp, p.sky, p.moment, p.weekend)));
    const humidCell = (t, k) => HUMTEMP[t] && DRYSKY[k];
    const src = (n) => `${(slots[n] || {}).u || `/avatar_weather_card_images/${esc(n)}.webp`}?v=${(slots[n] || {}).v || 0}`;
    const nameOf = (temp, hum, sky, mom, wk) => `${temp}${hum !== "any" ? "_" + hum : ""}_${sky}_${mom}${wk ? "_weekend" : ""}`;
    const exact = (nm) => all.filter((k) => k.replace(/_\d+$/, "") === nm);
    const WORDS = ["exact", "good", "fallback", "weak fallback"];
    const quality = (c, ideal, wk) => {   // thresholds of the coverage grid
      let sc = c.score;
      if (!wk) return sc === 0 ? 0 : sc <= 0.8 ? 1 : sc <= 2 ? 2 : 3;
      if (c.name === ideal) return 0;
      if (c.name.endsWith("_weekend")) sc += 0.5;
      return sc <= 0.8 ? 1 : sc <= 2 ? 2 : 3;
    };
    const pick = (nm, music) => {
      const p = sel.parse(nm); if (!p || !all.length) return null;
      return sel.choose(slots, { event: p.event || null, temp: p.temp, hum: p.hum, sky: p.sky, moment: p.moment, weekend: p.weekend }, !!music, "");
    };
    const cellFor = (nm, wk, music) => {
      const c = pick(nm, music);
      if (!c) return { q: 4, name: null, info: `${nm} → nothing to fall back on` };
      const q = quality(c, nm, wk);
      return { q, name: c.name, info: `${nm} → ${c.name} (${WORDS[q]})` };
    };
    const td = (nm, wk, music, hk = "") => {
      const c = cellFor(nm, wk, music);
      if (hk && !humidHave.has(hk) && c.q < 2) { c.q = 2; c.info = `${nm} → no humid picture yet${c.name ? `, shows ${c.name}` : ""} (fallback)`; }
      return `<td class="q${c.q}"><button type="button" class="cell" data-n="${esc(nm)}" data-pic="${esc(c.name || "")}" data-q="${c.q}" data-info="${esc(c.info)}" aria-label="${esc(c.info)}"></button></td>`;
    };
    const gridFor = (s) => {
      const wk = st.mode[s.key] === "w";
      if (s.kind === "events") {
        return `<table class="covt"><thead><tr><th></th>${MOM.map((m) => `<th>${MOMLAB[m]}</th>`).join("")}</tr></thead><tbody>${events.map((e) => `<tr><th>${esc(e)}</th>${MOM.map((m) => { const nm = `${e}_${m}`, ok = baseSet.has(nm); return `<td class="q${ok ? 0 : 4}"><button type="button" class="cell" data-n="${esc(nm)}" data-pic="${ok ? esc(exact(nm)[0]) : ""}" data-q="${ok ? 0 : 4}" data-info="${esc(nm + (ok ? " → done" : " → missing"))}" aria-label="${esc(nm)}"></button></td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
      }
      if (s.kind === "music") {
        return `<table class="covt"><thead><tr><th></th>${MOM.map((m) => `<th>${MOMLAB[m]}</th>`).join("")}</tr></thead><tbody>${TEMPS.map((t) => `<tr><th>${t}</th>${MOM.map((m) => td(`music_${t}_${m}${wk ? "_weekend" : ""}`, wk, true)).join("")}</tr>`).join("")}</tbody></table>`;
      }
      return `<table class="covt"><thead><tr><th></th>${SKIES.map((k) => `<th>${k}</th>`).join("")}</tr></thead><tbody>${TEMPS.map((t) => `<tr><th>${t}</th>${SKIES.map((k) => (!cellOn(t, k, s.m) || (st.hum !== "any" && !humidCell(t, k))) ? NA : td(nameOf(t, st.hum, k, s.m, wk), wk, false, st.hum === "humid" ? hkey(t, k, s.m, wk) : "")).join("")}</tr>`).join("")}</tbody></table>`;
    };
    const doneOf = (s) => {   // cells (weekday + weekend, plus the humid variants of the warm ones) that have a picture of their own
      if (s.kind === "events") return [events.length * MOM.length, events.reduce((a, e) => a + MOM.filter((m) => baseSet.has(`${e}_${m}`)).length, 0)];
      if (s.kind === "music") { let n = 0, d = 0; for (const t of TEMPS) for (const m of MOM) for (const wk of [false, true]) { n++; if (baseSet.has(`music_${t}_${m}${wk ? "_weekend" : ""}`)) d++; } return [n, d]; }
      if (s.key === "day") return [0, 0];   // the generic family is optional: not counted
      let n = 0, d = 0;
      for (const t of TEMPS) for (const k of SKIES) for (const wk of [false, true]) { if (!cellOn(t, k, s.m)) continue; n++; if (baseSet.has(nameOf(t, "any", k, s.m, wk))) d++; if (humidCell(t, k)) { n++; if (humidHave.has(hkey(t, k, s.m, wk))) d++; } }
      return [n, d];
    };
    const TEMPLAB = { freezing: "freezing", cold: "cold", chilly: "chilly", mild: "mild", warm: "warm", hot: "hot", heatwave: "heatwave" };
    const listFor = (s) => (bySec[s.key] || []).sort((a, b) => (a.name < b.name ? -1 : 1)).map((p) => {
      const what = p.music ? `music · ${p.temp} · ${p.moment}` : p.event ? `${p.event} · ${p.moment}` : `${TEMPLAB[p.temp] || p.temp}${p.hum !== "any" ? " " + p.hum : ""} · ${p.sky} · ${p.moment}`;
      return `<li class="slot"><div class="thumb"><img class="shot" loading="lazy" src="${src(p.name)}" alt=""></div>
        <div class="meta"><code class="sid">${esc(p.name)}</code><p class="cond">${esc(what)}${p.weekend ? " · weekend" : ""}</p></div>
        <span class="chip c-done">Done</span><button class="s" data-pick="${esc(p.base)}" data-sec="${s.key}">Open</button><button class="s" data-del="${esc(p.name)}">Delete</button></li>`;
    }).join("");
    const secHtml = (s) => {
      const [tot, done] = doneOf(s), open = !!st.open[s.key], wk = st.mode[s.key] === "w";
      let inner = "";
      if (open) {
        inner = `<p class="gintro">${INTRO[s.key] || (s.kind === "band" ? "Pictures for this time of day. Where a cell has no picture of its own, the closest one is used." : "")}</p>
          <details class="cov" open><summary>What comes out, by ${s.kind === "events" ? "day and time" : s.kind === "music" ? "temperature and time" : "temperature and weather"}</summary>
            <div class="covmode"><button type="button" data-mode="d" data-sec="${s.key}" aria-pressed="${!wk}">Weekdays</button><button type="button" data-mode="w" data-sec="${s.key}" aria-pressed="${wk}">Weekend</button></div>
            <div class="covlegend"><span><i class="q0"></i>exact</span><span><i class="q1"></i>good</span><span><i class="q2"></i>fallback</span><span><i class="q3"></i>weak fallback</span><span><i class="q4"></i>nothing</span></div>
            <div class="covwrap">${gridFor(s)}</div><p class="covinfo">Tap a cell to see what comes out and to add or replace its picture.</p>
            <div class="covpanel" data-sec="${s.key}" ${st.sel && st.sel.sec === s.key ? "" : "hidden"}></div></details>
          <ul class="slots">${listFor(s) || `<li class="h" style="list-style:none">No pictures yet.</li>`}</ul>`;
      }
      return `<section class="group"><header class="ghead"><h3><button type="button" class="gtog" data-sec="${s.key}" aria-expanded="${open}">${esc(s.title)}</button></h3><span class="gcount">${done} / ${tot}</span></header>${open ? `<div class="gbody">${inner}</div>` : ""}</section>`;
    };
    const totalCells = SECTIONS.reduce((a, s) => a + doneOf(s)[0], 0), totalDone = SECTIONS.reduce((a, s) => a + doneOf(s)[1], 0);
    body.innerHTML = `
      <h2>Images <small>${all.length}</small></h2>
      <p class="h"><b>${totalDone}</b> of ${totalCells} cells have a picture of their own (weekdays, weekend and the humid variants of warm and hot weather); the other cells use the closest picture.
        <b>Drop or paste (Ctrl+V) pictures</b> on a cell or anywhere on this page: they are named automatically after the selected cell (a second picture for the same cell becomes an alternative, <code>_2</code>, <code>_3</code>…).
        A file already named like a slot (<code>mild_rain_afternoon.png</code>) keeps its name and replaces that picture.</p>
      <p><label>Write the prompts for <select id="v-mode"><option value="text" ${st.pm.textOnly ? "selected" : ""}>a text-only engine (no picture attached)</option><option value="ref" ${st.pm.textOnly ? "" : "selected"}>an engine that takes a reference picture</option></select></label></p>
      <p ${st.pm.textOnly ? "" : "hidden"}><small>The fixed parts of the prompt (character, style, pose, background…) are edited in the <b>Prompt</b> tab.</small></p>
      <p><label>Humidity (weather grids) <select id="v-hum">${[["any", "Normal"], ["humid", "Humid"]].map(([v, l]) => `<option value="${v}" ${st.hum === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <small>humid pictures exist only for warm, hot and heatwave, under clear, cloudy or wind</small></p>
      <div id="series"><h2>Picture series</h2><p class="h">Loading…</p></div>
      <div id="backups"><h2>Backups</h2><p class="h">Loading…</p></div>
      <div class="drop" id="idrop">Drop pictures here or <input type="file" id="ifile" multiple accept="image/png,image/webp"></div>
      <div class="log" id="ilog"></div>
      ${SECTIONS.map(secHtml).join("")}`;
    this._renderSeries(r.getElementById("series"));
    this._renderBackups(r.getElementById("backups"));
    const log = r.getElementById("ilog"), say = (t, bad) => { const d = document.createElement("div"); d.textContent = t; if (bad) d.className = "err"; log.appendChild(d); };

    // ---- upload: the name comes from the cell (dropped on it, or the selected one) unless the file is already named like a slot
    const taken = new Set(all);
    const freeName = (nm) => { if (!taken.has(nm)) return nm; let k = 2; while (taken.has(`${nm}_${k}`)) k++; return `${nm}_${k}`; };
    const send = async (files, cellName, secKey) => {
      files = files.filter((f) => /^image\/(png|webp)$/.test(f.type));
      if (!files.length) { say("Only PNG or WebP pictures with a transparent background.", true); return; }
      let done = 0, last = null;
      for (const f of files) {
        const base = f.name.replace(/\.(png|webp)$/i, "").trim().toLowerCase();
        const own = !cellName && sel.parse(base) ? base : null;
        const cellN = cellName || (own ? null : (st.sel && st.sel.nm));
        if (!own && !cellN) { say(`${f.name}: select a cell first (or name the file after a slot, e.g. mild_rain_afternoon.png).`, true); continue; }
        const name = own || freeName(cellN);
        const fd = new FormData(); fd.append("name", name); fd.append("file", f);
        const row = document.createElement("div"); row.textContent = `${f.name} → ${name} …`; log.appendChild(row);
        try {
          const resp = await fetch("/api/avatar_weather_card/upload", { method: "POST", headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` }, body: fd });
          const j = await resp.json();
          if (resp.ok) { row.textContent = `${f.name} → ${name} ✓`; done++; taken.add(name); last = name.replace(/_\d+$/, ""); } else { row.textContent = `${f.name}: ${j.message}`; row.className = "err"; }
        } catch (e) { row.textContent = `${f.name}: ${e.message}`; row.className = "err"; }
      }
      if (done) {
        const p = sel.parse(last), sk = secKey || (p ? secOf(p) : null);
        if (sk) { st.open[sk] = true; saveOpen(); st.sel = { sec: sk, nm: last }; }
        this._renderImages();
      }
    };
    this._sendPictures = (files) => send(files, null, null);
    if (!this._pasteBound) {
      this._pasteBound = true;
      document.addEventListener("paste", (e) => {
        if (this._tab !== "images" || !this.isConnected || !this._sendPictures) return;
        const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.readOnly) return;
        const files = [...((e.clipboardData && e.clipboardData.files) || [])];
        if (files.some((f) => /^image\//.test(f.type))) { e.preventDefault(); this._sendPictures(files); }
      });
    }
    const dropTarget = (e) => e.target.closest && (e.target.closest(".cell") || e.target.closest(".celldrop"));
    body.ondragover = (e) => { e.preventDefault(); const t = dropTarget(e); r.querySelectorAll(".over").forEach((x) => x.classList.remove("over")); if (t) t.classList.add("over"); };
    body.ondragleave = (e) => { const t = dropTarget(e); if (t) t.classList.remove("over"); };
    body.ondrop = (e) => {
      e.preventDefault(); r.querySelectorAll(".over").forEach((x) => x.classList.remove("over"));
      const t = dropTarget(e), files = [...e.dataTransfer.files];
      if (t) send(files, t.dataset.n || (st.sel && st.sel.nm), t.closest("[data-sec]") ? t.closest("[data-sec]").dataset.sec : null); else send(files, null, null);
    };
    r.getElementById("ifile").onchange = (e) => { send([...e.target.files], null, null); e.target.value = ""; };
    r.getElementById("v-hum").onchange = (e) => { st.hum = e.target.value; this._renderImages(); };
    r.getElementById("v-mode").onchange = (e) => { st.pm.textOnly = e.target.value === "text"; savePm(); this._renderImages(); };

    // ---- the panel of the selected cell
    const showPanel = () => {
      r.querySelectorAll(".covpanel").forEach((p) => { p.hidden = true; p.innerHTML = ""; });
      r.querySelectorAll(".cell.sel").forEach((c) => c.classList.remove("sel"));
      if (!st.sel) return;
      const box = r.querySelector(`.covpanel[data-sec="${st.sel.sec}"]`); if (!box) return;
      const nm = st.sel.nm, s = SECTIONS.find((x) => x.key === st.sel.sec) || {};
      const cellBtn = box.closest(".group").querySelector(`.cell[data-n="${nm}"]`);
      if (cellBtn) cellBtn.classList.add("sel");
      const ex = exact(nm), c = ex.length ? null : cellFor(nm, /_weekend$/.test(nm), s.kind === "music");
      const pics = ex.length
        ? `<div style="display:flex;gap:12px;flex-wrap:wrap">${ex.map((n) => `<div class="card" style="width:150px"><img style="height:210px" src="${src(n)}"><div>${esc(n)}</div><button class="s" data-del="${esc(n)}">Delete</button></div>`).join("")}</div>`
        : `<p class="h"><span class="err">No picture of its own yet.</span> ${c && c.name ? `Today this cell shows <code>${esc(c.name)}</code> (${WORDS[c.q]}).` : "There is no other picture to fall back on."}</p>${c && c.name ? `<img style="height:150px;opacity:.6" src="${src(c.name)}">` : ""}`;
      let prompt = "";
      if (s.kind === "events") prompt = `<p class="h">Special days have no ready-made prompt: write it yourself (the prompts of the weather cells can inspire you) and drop the picture on this cell.</p>`;
      else {
        const res = composePrompt({ name: nm, prefs, wardrobe, colors: (this._cfg.avatar || {}).colors || null, activities: (this._cfg.avatar || {}).activities || null, seed: String(st.seed || 0), notes: (this._cfg.avatar || {}).description, hasReference: !!ref && !st.pm.textOnly, textOnly: st.pm.textOnly, parts: partsNow(), override: st.ov[nm] || null });
        this._ptext = res.text;
        let outfitUi = "";
        if (res.outfit) {
          const cur = {}; res.outfit.picks.forEach((x) => (cur[x.cat] = (cur[x.cat] || []).concat(x.id)));
          const edited = !!(st.ov[nm] && Object.keys(st.ov[nm]).length);
          const rows = OUTFIT_ROWS.map(([c, label]) => {
            const opts = res.outfit.options[c].slice();
            (cur[c] || []).forEach((id) => { if (!opts.some((o) => o.id === id)) { const w = WARDROBE.find((x) => x.id === id); if (w) opts.push({ id: w.id, text: w.text }); } });
            if (!opts.length) return "";
            const multi = !!MULTI[c], on = (id) => (cur[c] || []).includes(id);
            const now = (id) => (on(id) ? " <small>(in the prompt now)</small>" : "");
            const item = (type, id, text, chk) => `<label style="display:inline-block;margin:2px 14px 2px 0;white-space:normal"><input type="${type}" name="oc-${c}" data-oc="${c}" value="${esc(id)}" ${chk ? "checked" : ""}> ${esc(text)}${id ? now(id) : ""}</label>`;
            return `<div style="margin:8px 0"><b>${label}</b>${multi ? " <small>(any number)</small>" : ""}<br>${multi ? "" : item("radio", "", "none", !(cur[c] || []).length)}${opts.map((o) => item(multi ? "checkbox" : "radio", o.id, o.text, on(o.id))).join("")}</div>`;
          }).join("");
          outfitUi = `<div id="ioutfit" style="margin:10px 0;padding:10px 12px;border-radius:8px;border:1px solid var(--divider-color,#8884)">
            <div><b>Outfit</b>${edited ? " <small>(edited by hand)</small>" : ""}</div>
            <p class="h">Pick what the character wears in this cell, then press <b>Generate prompt</b>. The options are the ticked wardrobe items that suit this temperature, time and weather; the ones the generator chose are selected. Clothes: one item each. Hats, scarves, gloves and bags: tick as many as you like.</p>
            ${rows}
            <p><button id="iogen">Generate prompt</button> <button class="s" id="ioreset" ${edited ? "" : "disabled"}>Back to the automatic outfit</button></p></div>`;
        }
        prompt = `${res.missing.length ? `<div class="err" style="font-size:13px;margin-top:6px">No wardrobe option ticked for: ${esc(res.missing.join(", "))} (Prompt tab, Wardrobe).</div>` : ""}
          ${res.activity ? `<div class="h" style="margin-top:6px">Weekend activity: <code>${esc(res.activity)}</code></div>` : ""}
          ${outfitUi}
          <p><button id="icopy">Copy prompt</button> <button class="s" id="ipeek">Show / hide</button> <button class="s" id="ireroll">Another outfit</button>${ref && !st.pm.textOnly ? ` <button class="s" id="icopyimg" type="button">Copy reference image</button>` : ""}<span id="imsg" style="margin-left:10px"></span></p>
          <textarea id="itext" readonly style="min-height:200px">${esc(res.text)}</textarea>
          ${ref || st.pm.textOnly ? "" : `<p class="err">No reference picture yet: add one in the Prompt tab, or switch to text-only prompts above.</p>`}`;
      }
      box.hidden = false;
      box.innerHTML = `<div style="padding:12px 14px;border-radius:10px;background:var(--card-background-color);margin-top:8px"><div><b><code>${esc(nm)}</code></b></div>${pics}
        <div class="drop celldrop" data-n="${esc(nm)}" style="padding:14px">Drop or paste (Ctrl+V) the picture for this cell: it will be saved as <code>${esc(freeName(nm))}</code></div>${prompt}</div>`;
      const cp = box.querySelector("#icopy");
      if (cp) {
        const m = box.querySelector("#imsg");
        cp.onclick = async () => { try { await navigator.clipboard.writeText(this._ptext); m.textContent = "Copied ✓"; } catch (e) { const t = box.querySelector("#itext"); t.hidden = false; t.select(); m.textContent = "Press Ctrl+C"; } };
        box.querySelector("#ipeek").onclick = () => { const t = box.querySelector("#itext"); t.hidden = !t.hidden; };
        box.querySelector("#ireroll").onclick = () => { st.seed = (st.seed || 0) + 1; delete st.ov[nm]; saveOv(); showPanel(); };
        const od = box.querySelector("#ioutfit");
        if (od) {
          const clear = (cat) => od.querySelectorAll(`input[name="oc-${cat}"]`).forEach((x) => (x.checked = x.type === "radio" && x.value === ""));
          od.querySelectorAll("input[data-oc]").forEach((inp) => (inp.onchange = () => {
            const c = inp.dataset.oc;
            if (c === "dress" && inp.value) { clear("top"); clear("bottom"); }
            if ((c === "top" || c === "bottom") && inp.value) clear("dress");
          }));
          od.querySelector("#iogen").onclick = () => {
            const ov = {};
            OUTFIT_ROWS.forEach(([c]) => {
              const all = [...od.querySelectorAll(`input[name="oc-${c}"]`)]; if (!all.length) return;
              const on = all.filter((x) => x.checked && x.value).map((x) => x.value);
              ov[c] = MULTI[c] ? on : (on[0] || "");
            });
            st.ov[nm] = ov; saveOv(); showPanel();
          };
          const rs = od.querySelector("#ioreset");
          if (rs) rs.onclick = () => { delete st.ov[nm]; saveOv(); showPanel(); };
        }
        const ci = box.querySelector("#icopyimg");
        if (ci) ci.onclick = () => this._copyImage(`/avatar_weather_card_reference/${ref.file}?v=${ref.v}`, m);
      }
    };
    showPanel();

    // ---- clicks: open/close a section, weekday/weekend, select a cell, open or delete a picture
    body.onclick = async (e) => {
      const t = e.target.closest("button"); if (!t) return;
      if (t.classList.contains("gtog")) { st.open[t.dataset.sec] = !st.open[t.dataset.sec]; saveOpen(); this._renderImages(); return; }
      if (t.dataset.mode) { st.mode[t.dataset.sec] = t.dataset.mode; if (st.sel && st.sel.sec === t.dataset.sec) st.sel = null; this._renderImages(); return; }
      if (t.classList.contains("cell")) {
        const info = t.closest(".covwrap").parentElement.querySelector(".covinfo"); if (info) info.textContent = t.dataset.info;
        st.sel = { sec: t.closest("details").parentElement.parentElement.querySelector(".gtog").dataset.sec, nm: t.dataset.n }; showPanel(); return;
      }
      if (t.dataset.pick) { st.sel = { sec: t.dataset.sec, nm: t.dataset.pick }; showPanel(); const b = r.querySelector(`.covpanel[data-sec="${t.dataset.sec}"]`); if (b) b.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      if (t.dataset.del) {
        if (!confirm(`Delete ${t.dataset.del}?`)) return;
        await this._hass.callWS({ type: "avatar_weather_card/image_delete", name: t.dataset.del });
        this._renderImages();
      }
    };
  }

  _renderSettings() {
    const c = this._cfg;
    const weather = this._ids("weather"), cals = this._ids("calendar");
    const name = (e) => `${esc(this._hass.states[e]?.attributes.friendly_name || e)} <small>${esc(e)}</small>`;
    this.shadowRoot.getElementById("body").innerHTML = `
        <h2>Weather sources</h2>
        <p class="h">Tick the weather entities to use and give each a weight: temperature, humidity and wind are averaged with these weights, and the sky condition is the one with the highest total weight.</p>
        <table id="wt"><tr><td></td><td><small>entity</small></td><td><small>now</small></td><td><small>weight</small></td></tr>
        ${weather.map((e) => { const src = c.weather_sources.find((x) => x.entity === e); const st = this._hass.states[e]; const a = st.attributes || {};
          return `<tr><td><input type="checkbox" data-w="${esc(e)}" ${src ? "checked" : ""}></td><td>${name(e)}</td>
            <td><small>${esc(st.state)}${a.temperature != null ? ", " + esc(a.temperature) + "°" : ""}</small></td>
            <td><input type="number" min="0" max="100" step="0.5" data-wt="${esc(e)}" value="${src ? src.weight : 1}" style="width:70px" ${src ? "" : "disabled"}></td></tr>`; }).join("")}
        </table>
        ${weather.length ? "" : "<p class='h'>No weather entities found.</p>"}
        <div id="result" style="margin-top:12px;padding:12px 14px;border-radius:10px;background:var(--card-background-color)"></div>

        <h2>Public holidays</h2>
        <p class="h">Holiday calendar (HA "Holiday" integration). Holidays use the weekend look.</p>
        <select id="cal"><option value="">— none —</option>${cals.map((e) => `<option value="${esc(e)}" ${c.holiday_calendar === e ? "selected" : ""}>${esc(this._hass.states[e]?.attributes.friendly_name || e)} (${esc(e)})</option>`).join("")}</select>
        <div id="hol" style="margin-top:8px"></div>
        <p class="h" style="margin-top:12px">Extra holidays (local feasts), one per line: MM-DD (every year) or YYYY-MM-DD.</p>
        <textarea id="extra">${esc(c.extra_holidays.join("\n"))}</textarea>
        <div id="extrainfo" class="h" style="margin-top:4px"></div>

        <h2>Special days</h2>
        <p class="h">Dates as MM-DD or "MM-DD HH:MM". The id is the picture-name prefix (e.g. halloween_morning). The first matching row wins.</p>
        <table id="sd"><tr><td><small>id</small></td><td><small>start</small></td><td><small>end</small></td><td></td><td><small>pictures</small></td></tr>
          ${c.special_days.map((d, i) => `<tr><td><input data-k="id" data-i="${i}" value="${esc(d.id)}" size="14"></td><td><input data-k="start" data-i="${i}" value="${esc(d.start)}" size="12"></td><td><input data-k="end" data-i="${i}" value="${esc(d.end)}" size="12"></td><td><button class="s" data-up="${i}" ${i === 0 ? "disabled" : ""} title="Move up">▲</button> <button class="s" data-down="${i}" ${i === c.special_days.length - 1 ? "disabled" : ""} title="Move down">▼</button> <button class="s" data-del="${i}">✕</button></td><td class="sdinfo" data-i="${i}"></td></tr>`).join("")}
        </table>
        <div id="sdwarn" style="margin:6px 0"></div>
        <p><button class="s" id="add">+ Add special day</button></p>

        <h2>Thresholds and times of day</h2>
        <p class="h">These decide which picture is wanted. There are five temperature bands (°C) and they pick the outfit; humidity (humid or normal) only matters when it is warm or hot and the sky is clear or cloudy. The sky is clear, cloudy, rain or snow: fog, wind and a windy condition count as cloudy, storms and hail as rain, sleet and snowstorms as snow.</p>
        <table id="tb" style="width:auto">
          ${(() => {
            const T = c.options.temp_bands;
            const bands = [["hot", "hot (incl. heatwave)"], ["warm", "warm"], ["mild", "mild"], ["chilly", "chilly"], [null, "cold (incl. freezing)"]];
            // From the hottest down: a band row, then the threshold that separates it from the next colder band.
            return bands.map(([k, lbl], i) => `<tr><td class="bn" data-band="${i}" style="padding:6px 18px 6px 0"><b>${lbl}</b> <small class="rng"></small></td><td></td></tr>` +
              (k ? `<tr><td style="text-align:right;padding-right:10px;opacity:.7">threshold</td><td><input type="number" step="0.5" style="width:70px" data-tb="${k}" value="${T[k]}"> °C</td></tr>` : "")).join("");
          })()}
        </table>
        <p style="margin:10px 0 2px"><label>Air counts as <b>humid</b> from <input type="number" min="1" max="101" style="width:64px" data-op="humid_pct" value="${c.options.humid_pct}"> % humidity <small>(below that it is normal)</small></label>
        <label><input type="checkbox" data-op="weekend_looks" ${c.options.weekend_looks ? "checked" : ""}> Use the weekend look on weekends and holidays</label>
        <label>Alternate pictures (_1, _2…) change every <input type="number" min="1" max="1440" style="width:64px" data-op="rotate_minutes" value="${c.options.rotate_minutes}"> minutes</label></p>
        <h2>Times of day</h2>
        <p class="h">Sun entity: <select data-opsel="sun_entity">${this._ids("sun").map((e) => `<option value="${esc(e)}" ${c.options.sun_entity === e ? "selected" : ""}>${esc(e)}</option>`).join("") || `<option value="sun.sun">sun.sun</option>`}</select>
          <small>(if it is missing the first sun.* entity is used)</small></p>
        <p class="h">The evening follows the real sunset. The afternoon picture also covers the golden hour, the evening picture also covers the late evening, and the morning picture runs until the afternoon starts (midday is part of it).</p>
        <label><input type="checkbox" data-op="follow_dawn" ${c.options.follow_dawn ? "checked" : ""}> Morning starts at sunrise
          <input type="number" min="-120" max="240" style="width:64px" data-op="dawn_offset" value="${c.options.dawn_offset}"> min after (negative = before); the “Morning” time below then shows today's start and can't be edited</label>
        <p class="h" style="margin-top:12px">Each moment starts at:</p>
        <table><tr><td></td><td><small>weekdays</small></td><td class="fc" ${c.options.free_moments_enabled ? "" : "hidden"}><small>weekends and holidays</small></td></tr>
          ${[["EARLYMORNING", "Early morning"], ["MORNING", "Morning (and midday)"], ["AFTERNOON", "Afternoon (and golden hour)"], ["SUNSET", "Evening (from sunset, and late evening)"], ["NIGHT", "Night"]].map(([k, lbl]) => k === "SUNSET"
            ? `<tr><td>${lbl}</td><td><input type="time" data-gh="${k}" disabled title="Follows the real sunset"></td><td class="fc" ${c.options.free_moments_enabled ? "" : "hidden"}><input type="time" data-gh="${k}" disabled title="Follows the real sunset"></td></tr>`
            : `<tr><td>${lbl}</td><td><input type="time" data-mo="${k}" value="${c.options.moments[k]}"></td><td class="fc" ${c.options.free_moments_enabled ? "" : "hidden"}><input type="time" data-mf="${k}" value="${c.options.moments_free[k]}"></td></tr>`).join("")}</table>
        <label><input type="checkbox" data-op="free_moments_enabled" ${c.options.free_moments_enabled ? "checked" : ""}> Use different times on weekends and holidays</label>
        <div id="timeline" style="margin-top:10px"></div>

        <p style="margin-top:28px"><button id="save">Save</button><span id="msg"></span></p>`;
    const r = this.shadowRoot;
    r.getElementById("add").onclick = () => { this._collect(); this._cfg.special_days.push({ id: "", start: "", end: "" }); this._render(); };
    r.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { this._collect(); this._cfg.special_days.splice(+b.dataset.del, 1); this._render(); }));
    const move = (i, j) => this._keepScroll(() => { this._collect(); const a = this._cfg.special_days; [a[i], a[j]] = [a[j], a[i]]; this._render(); });
    r.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => move(+b.dataset.up, +b.dataset.up - 1)));
    r.querySelectorAll("[data-down]").forEach((b) => (b.onclick = () => move(+b.dataset.down, +b.dataset.down + 1)));
    r.getElementById("save").onclick = () => this._save();
    r.querySelectorAll("[data-w]").forEach((x) => (x.onchange = () => { r.querySelector(`[data-wt="${x.dataset.w}"]`).disabled = !x.checked; this._updateResult(); }));
    r.querySelectorAll("[data-wt]").forEach((x) => (x.oninput = () => this._updateResult()));
    r.getElementById("cal").onchange = () => { this._updateResult(); this._updateHolidays(); };
    r.getElementById("extra").oninput = () => { this._updateResult(); this._updateExtra(); };
    r.querySelectorAll("#sd input").forEach((x) => x.addEventListener("input", () => { this._collect(); this._updateSpecial(); }));
    r.querySelectorAll("[data-tb],[data-mo],[data-mf],[data-op],[data-opsel]").forEach((x) => x.addEventListener("input", () => {
      if (x.dataset.op === "free_moments_enabled") r.querySelectorAll(".fc").forEach((m) => (m.hidden = !x.checked));
      this._syncMorning(); this._collect(); this._updateResult(); this._updateTimeline(); this._updateRanges();
    }));
    this._updateResult(); this._updateHolidays(); this._updateExtra(); this._syncMorning(); this._updateSpecial(); this._updateTimeline(); this._updateRanges();
    this._hass.callWS({ type: "avatar_weather_card/images_list" }).then((l) => { this._lib = l; this._updateSpecial(); this._updateResult(); }).catch(() => {});
  }

  // The sun entity: the configured one, else the first sun.* that exists.
  _sun() {
    const st = this._hass.states, id = this._cfg.options.sun_entity;
    return st[id] || st[Object.keys(st).find((k) => k.startsWith("sun."))] || null;
  }

  _selOpts() {
    const o = this._cfg.options;
    return { windKmh: o.wind_kmh, humidPct: o.humid_pct, weekendLooks: o.weekend_looks, moments: o.moments,
      tempBands: o.temp_bands, followDawn: o.follow_dawn, dawnOffset: o.dawn_offset, freeMoments: o.free_moments_enabled ? o.moments_free : null };
  }

  // "Morning starts at sunrise": the Morning inputs show today's start (read-only); otherwise the saved time, editable.
  _syncMorning() {
    const r = this.shadowRoot, o = this._cfg.options;
    // Golden hour and evening: read-only, from the real sunset.
    const sd = new Date(((this._sun() || {}).attributes || {}).next_setting), gm = o.golden_minutes;
    if (isFinite(sd) && isFinite(gm) && r.querySelectorAll) {
      const hm = (t) => { t = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };
      const set = sd.getHours() * 60 + sd.getMinutes();
      r.querySelectorAll("[data-gh]").forEach((x) => { x.value = hm(x.dataset.gh === "SUNSET" ? set : set - gm); });
    }
    const follow = r.querySelector('[data-op="follow_dawn"]')?.checked;
    const off = parseFloat(r.querySelector('[data-op="dawn_offset"]')?.value) || 0;
    const rise = sunriseMinutes(this._sun());
    const mins = (v) => { const m = /^(\d\d):(\d\d)$/.exec(v || ""); return m ? +m[1] * 60 + +m[2] : null; };
    const hh = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    [["data-mo", o.moments], ["data-mf", o.moments_free]].forEach(([attr, saved]) => {
      const inp = r.querySelector(`[${attr}="MORNING"]`); if (!inp) return;
      if (follow && rise != null) {
        const early = mins(r.querySelector(`[${attr}="EARLYMORNING"]`).value), aft = mins(r.querySelector(`[${attr}="AFTERNOON"]`).value), mid = aft != null ? aft - 1 : null;
        let t = rise + off;
        if (early != null) t = Math.max(early + 30, t);
        if (mid != null) t = Math.min(mid - 30, t);
        inp.value = hh(Math.max(0, Math.min(1439, Math.round(t)))); inp.disabled = true;
        inp.title = "Follows the sunrise (see the checkbox above)";
      } else { inp.value = saved.MORNING; inp.disabled = false; inp.title = ""; }
    });
  }

  // Re-render without jumping back to the top of the page.
  _keepScroll(fn) {
    let el = this, saved = [];
    while (el) { if (el.scrollTop) saved.push([el, el.scrollTop]); el = el.parentElement || (el.getRootNode() && el.getRootNode().host) || null; }
    fn();
    saved.forEach(([e, t]) => { e.scrollTop = t; });
  }

  _fmtDate(d) { return d.toLocaleDateString(this._hass.locale?.language || undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }

  // Next holidays from the Holiday calendar (next 12 months).
  async _updateHolidays() {
    const box = this.shadowRoot.getElementById("hol"); if (!box) return;
    const cal = this.shadowRoot.getElementById("cal").value;
    if (!cal) { box.innerHTML = ""; return; }
    box.innerHTML = "<small>Loading…</small>";
    try {
      const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(a); b.setFullYear(b.getFullYear() + 1);
      const ev = await this._hass.callApi("GET", `calendars/${cal}?start=${a.toISOString()}&end=${b.toISOString()}`);
      const list = ev.map((e) => ({ d: new Date((e.start.date || e.start.dateTime.slice(0, 10)) + "T00:00:00"), n: e.summary }))
        .sort((x, y) => x.d - y.d);
      box.innerHTML = list.length
        ? `<small>Next holidays from this calendar (${list.length} in the next 12 months):</small><table>${list.slice(0, 8).map((x) => `<tr><td>${esc(this._fmtDate(x.d))}</td><td>${esc(x.n)}</td></tr>`).join("")}</table>`
        : "<small class='err'>This calendar returns no holidays in the next 12 months.</small>";
    } catch (e) { box.innerHTML = `<small class="err">Cannot read the calendar: ${esc(e.message || e)}</small>`; }
  }

  // Extra holidays: validate and show the next occurrence.
  _updateExtra() {
    const box = this.shadowRoot.getElementById("extrainfo"); if (!box) return;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    box.innerHTML = this._cfg.extra_holidays.map((t) => {
      const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(t);
      if (!m) return `<div class="err">${esc(t)}: invalid (use MM-DD or YYYY-MM-DD)</div>`;
      let d = new Date(m[1] ? +m[1] : now.getFullYear(), +m[2] - 1, +m[3]);
      if (d.getMonth() !== +m[2] - 1) return `<div class="err">${esc(t)}: not a real date</div>`;
      if (!m[1] && d < now) d = new Date(now.getFullYear() + 1, +m[2] - 1, +m[3]);
      return `<div>${esc(t)} → ${m[1] && d < now ? "<span class='err'>already past</span>" : esc(this._fmtDate(d))}</div>`;
    }).join("");
  }

  // Special days: picture counts per id, and overlaps between ranges.
  _updateSpecial() {
    const r = this.shadowRoot, rows = this._cfg.special_days, slots = (this._lib && this._lib.slots) || {};
    const days = (d) => {   // day-of-year set (leap year 2024) of a "MM-DD[ HH:MM]" range
      const mk = (t) => { const m = /^(\d{2})-(\d{2})/.exec(t); return m ? Date.UTC(2024, +m[1] - 1, +m[2]) / 864e5 : null; };
      const a = mk(d.start), b = mk(d.end); if (a == null || b == null) return null;
      const set = new Set(), y0 = Date.UTC(2024, 0, 1) / 864e5;
      let x = a; for (let i = 0; i < 400; i++) { set.add(x - y0); if (x === b) break; x = x + 1 > y0 + 365 ? y0 : x + 1; }
      return set;
    };
    r.querySelectorAll(".sdinfo").forEach((td) => {
      const d = rows[+td.dataset.i]; if (!d) return;
      const n = Object.keys(slots).filter((k) => d.id && k.startsWith(d.id + "_")).length;
      td.innerHTML = !d.id ? "" : n ? `<small>${n}</small>` : "<small class='err'>none</small>";
    });
    const warns = [], ids = rows.map((d) => d.id), sets = rows.map(days);
    rows.forEach((d, i) => { if (d.id && ids.indexOf(d.id) !== i) warns.push(`<span class="err">Duplicate id “${esc(d.id)}”.</span>`); });
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const A = sets[i], B = sets[j]; if (!A || !B) continue;
      const common = [...A].filter((x) => B.has(x)).length; if (!common) continue;
      const aInB = common === A.size, bInA = common === B.size;
      if (bInA && !aInB) warns.push(`<span class="err">“${esc(rows[j].id)}” falls inside “${esc(rows[i].id)}” but is listed after it: “${esc(rows[i].id)}” wins. Move “${esc(rows[j].id)}” above.</span>`);
      else if (!aInB && !bInA) warns.push(`<span class="err">“${esc(rows[i].id)}” and “${esc(rows[j].id)}” partly overlap: the first one listed wins on the shared days.</span>`);
      else warns.push(`<small>“${esc(rows[i].id)}” and “${esc(rows[j].id)}” cover the same days: “${esc(rows[i].id)}” wins.</small>`);
    }
    r.getElementById("sdwarn").innerHTML = warns.map((w) => `<div>${w}</div>`).join("");
  }

  // Range text next to each temperature band, from the thresholds.
  _updateRanges() {
    const r = this.shadowRoot, g = (k) => parseFloat(r.querySelector(`[data-tb="${k}"]`)?.value);
    const t = ["hot", "warm", "mild", "chilly"].map(g);
    const txt = [`${t[0]}° and above`, `${t[1]}° to ${t[0]}°`, `${t[2]}° to ${t[1]}°`, `${t[3]}° to ${t[2]}°`, `below ${t[3]}°`];
    r.querySelectorAll("[data-band]").forEach((td) => { td.querySelector(".rng").textContent = "  " + txt[+td.dataset.band]; });
  }

  // Coloured strips of a day: which moment of the day applies at each time (real sunset and sunrise).
  _updateTimeline() {
    const box = this.shadowRoot.getElementById("timeline"); if (!box) return;
    const c = this._cfg, o = c.options, sun = this._sun(), a = (sun && sun.attributes) || {};
    const tod = (iso) => { const d = new Date(iso); return isFinite(d) ? d.getHours() * 60 + d.getMinutes() : null; };
    const rise = tod(a.next_rising), set = tod(a.next_setting);
    const now = new Date(), base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const COL = { night: "#1f2a52", earlymorning: "#8a6fb0", morning: "#e6b84d", midday: "#f2d64b", afternoon: "#e69a3a", goldenhour: "#e0703a", evening: "#8a4b7c", lateevening: "#3a3466" };
    const hh = (m) => { m = m % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
    const strip = (label, free) => {
      // free day: a Saturday of the current week, plain weekday: a Monday
      const day = new Date(base); day.setDate(day.getDate() + ((free ? 6 : 1) - day.getDay() + 7) % 7);
      const sel = createSelector({ ...this._selOpts(), freeMoments: free && o.free_moments_enabled ? o.moments_free : null });
      const segs = []; let prev = null;
      for (let m = 0; m < 1440; m += 5) {
        const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);
        const isDay = rise != null && set != null ? (set > rise ? m >= rise && m < set : m >= rise || m < set) : m >= 420 && m < 1200;
        const solar = isDay && set != null && ((set - m + 1440) % 1440) < o.golden_minutes ? "sunset" : null;
        const k = sel.foldMoment(sel.momentOf({ isDay, solar, sunrise: rise }, d));
        if (prev && prev.k === k) prev.e = m + 5; else segs.push((prev = { k, s: m, e: m + 5 }));
      }
      return `<div style="margin-top:8px"><small>${label}</small></div>
        <div style="display:flex;height:26px;border-radius:6px;overflow:hidden;margin:4px 0">${segs.map((x) => `<div title="${x.k} ${hh(x.s)}–${hh(x.e)}" style="flex:${x.e - x.s};background:${COL[x.k] || "#888"}"></div>`).join("")}</div>
        <small>${segs.map((x) => `${hh(x.s)} ${x.k}`).join(" · ")}</small>`;
    };
    const head = `<small>Sunrise ${rise != null ? hh(rise) : "n/a"}, sunset ${set != null ? hh(set) : "n/a"} (today/tomorrow, from ${esc(sun ? sun.entity_id : "no sun entity")}).</small>`;
    box.innerHTML = head + strip("Weekday", false) + (o.free_moments_enabled ? strip("Weekend / holiday", true) : "");
  }

  // Live result: aggregated weather and the picture it would use right now.
  _updateResult() {
    const r = this.shadowRoot, box = r.getElementById("result");
    if (!box || !this._hass) return;
    this._collect();
    const c = this._cfg, h = this._hass;
    const agg = aggregateWeather(c.weather_sources, h.states);
    if (!c.weather_sources.length || !agg.used.length) { box.innerHTML = "<small>Select at least one weather entity (weight &gt; 0) to see the result.</small>"; return; }
    const now = new Date(), sun = this._sun();
    const events = {}; c.special_days.forEach((d) => { if (d.id && d.start && d.end) events[d.id] = [d.start, d.end]; });
    const holidays = [...c.extra_holidays];
    const cal = c.holiday_calendar && h.states[c.holiday_calendar];
    if (cal && cal.state === "on") { const p = (n) => (n < 10 ? "0" : "") + n; holidays.push(`${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`); }
    const sel = createSelector({ ...this._selOpts(), events, holidays });
    const slots = (this._lib && this._lib.slots) || {};
    const state = { condition: agg.condition, temp: agg.temp, humidity: agg.humidity, wind: agg.wind,
      isDay: sun ? sun.state === "above_horizon" : now.getHours() >= 7 && now.getHours() < 20, solar: solarMoment(sun, Date.now(), c.options.golden_minutes), sunrise: sunriseMinutes(sun) };
    const want = sel.want(slots, state, now);
    const f = (v, u, d = 1) => (v == null ? "–" : v.toFixed(d) + u);
    const res = Object.keys(slots).length ? sel.choose(slots, want, false, String(Math.floor(now.getTime() / 3600000))) : null;
    const wi = sel.want(slots, state, now, false);   // the configured special day counts even if it has no pictures yet
    const hum = want.hum === "humid" ? "_humid" : "";
    const ideal = wi.event ? `${wi.event}_${wi.moment}` : `${want.temp}${hum}_${want.sky}_${want.moment}${want.weekend ? "_weekend" : ""}`;
    const rp = res && sel.parse(res.name);
    const same = !!rp && (rp.event ? rp.event === wi.event && rp.moment === want.moment
      : rp.temp === want.temp && rp.sky === want.sky && rp.moment === want.moment && rp.weekend === want.weekend);
    const humNote = same && rp && !rp.event && want.hum === "humid" && rp.hum === "any" ? " <small>(no humid-specific picture)</small>" : "";
    const noEvPics = wi.event && !want.event;
    const img = res ? `<img src="${(slots[res.name] || {}).u || `/avatar_weather_card_images/${esc(res.name)}.webp`}?v=${(slots[res.name] || {}).v || 0}" style="height:170px;float:right;margin-left:12px;border-radius:8px;background:repeating-conic-gradient(#8883 0 25%, transparent 0 50%) 50%/14px 14px">` : "";
    box.innerHTML = `${img}
      <div><b>Weather now</b> — temperature ${f(agg.temp, "°C")} · humidity ${f(agg.humidity, "%", 0)} · wind ${f(agg.wind, " km/h", 0)} · sky: ${esc(agg.condition)}</div>
      <div style="margin-top:6px"><b>Ideal picture:</b> <code>${esc(ideal)}</code></div>
      <div style="margin-top:4px"><b>Selected picture:</b> ${res ? `<code>${esc(res.name)}</code> ${same ? "<small>(exact match)</small>" + humNote : `<small>(closest available, distance ${res.score.toFixed(1)})</small>`}${noEvPics ? `<div><small class="err">Today is the special day “${esc(wi.event)}” but it has no pictures yet: upload ${esc(wi.event)}_${esc(wi.moment)} (Images tab). Meanwhile the normal pictures are used.</small></div>` : ""}` : "<small>none: no pictures uploaded yet (Images tab)</small>"}</div>
      <div style="clear:both"></div>`;
  }

  _collect() {
    const r = this.shadowRoot, c = this._cfg;
    c.weather_sources = [...r.querySelectorAll("[data-w]")].filter((x) => x.checked).map((x) => {
      const w = parseFloat(r.querySelector(`[data-wt="${x.dataset.w}"]`).value);
      return { entity: x.dataset.w, weight: isFinite(w) ? w : 1 };
    });
    c.holiday_calendar = r.getElementById("cal").value;
    c.extra_holidays = r.getElementById("extra").value.split("\n").map((s) => s.trim()).filter(Boolean);
    r.querySelectorAll("#sd input").forEach((x) => { c.special_days[+x.dataset.i][x.dataset.k] = x.value.trim(); });
    const o = c.options, num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
    r.querySelectorAll("[data-tb]").forEach((x) => { o.temp_bands[x.dataset.tb] = num(x.value, o.temp_bands[x.dataset.tb]); });
    const follow = r.querySelector('[data-op="follow_dawn"]')?.checked;   // while following the dawn the Morning inputs only display today's time
    r.querySelectorAll("[data-mo]").forEach((x) => { if (/^\d\d:\d\d$/.test(x.value) && !(follow && x.dataset.mo === "MORNING")) o.moments[x.dataset.mo] = x.value; });
    r.querySelectorAll("[data-mf]").forEach((x) => { if (/^\d\d:\d\d$/.test(x.value) && !(follow && x.dataset.mf === "MORNING")) o.moments_free[x.dataset.mf] = x.value; });
    r.querySelectorAll("[data-opsel]").forEach((x) => { o[x.dataset.opsel] = x.value; });
    r.querySelectorAll("[data-op]").forEach((x) => { o[x.dataset.op] = x.type === "checkbox" ? x.checked : num(x.value, o[x.dataset.op]); });
    // Values the settings page no longer shows but the backend still checks (heatwave/cold thresholds, midday): kept consistent with the visible ones.
    const hm2 = (v) => { const m = /^(\d\d):(\d\d)$/.exec(v || ""); return m ? +m[1] * 60 + +m[2] : null; };
    const t2s = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
    o.temp_bands.heatwave = o.temp_bands.hot + 6; o.temp_bands.cold = o.temp_bands.chilly - 8;
    [o.moments, o.moments_free].forEach((mo) => { const a = hm2(mo.AFTERNOON); if (a != null && a > 1) mo.MIDDAY = t2s(a - 1); });
    o.dry_pct = o.humid_pct;   // the backend still stores a dry threshold: keep it equal (no separate dry level any more)
  }

  async _save() {
    this._collect();
    const msg = this.shadowRoot.getElementById("msg");
    try {
      this._cfg = await this._hass.callWS({ type: "avatar_weather_card/config_set", config: this._cfg });
      msg.className = ""; msg.textContent = "Saved ✓";
    } catch (e) {
      msg.className = "err"; msg.textContent = e.message || "Error";
    }
  }
}
customElements.define("avatar-weather-panel", AvatarWeatherPanel);
