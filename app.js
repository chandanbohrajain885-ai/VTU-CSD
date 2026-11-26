/*
 * app.js — shared core: escaping, data access, layout (header/footer), helpers.
 * Public pages use a NON-persistent anonymous Supabase client, so a logged-in
 * staff member browsing the public site never sees unpublished drafts.
 */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var DEPT = CFG.DEPT || {};
  var BASE = window.BASELINE || {};

  /* ---------- Safety helpers ---------- */
  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(v) {
    if (v === null || v === undefined) return "";
    return String(v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }
  /* Only http(s), mailto, tel and site-relative URLs are allowed. Blocks javascript:, data:, //host etc. */
  function safeUrl(u) {
    if (u === null || u === undefined) return "";
    var s = String(u).trim();
    if (!s) return "";
    if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
    if (/^\/(?!\/)/.test(s)) return s;
    return "";
  }
  function isBlank(v) { return v === null || v === undefined || String(v).trim() === ""; }

  /* ---------- Dates ---------- */
  function parseDate(d) {
    if (!d) return null;
    var s = String(d);
    var dt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function fmtDate(d) {
    var dt = parseDate(d);
    if (!dt) return d ? esc(d) : "";
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  /* ---------- Text formatting (always escaped) ---------- */
  function paragraphs(text) {
    if (isBlank(text)) return "";
    return String(text).split(/\n\s*\n/).map(function (p) {
      return "<p>" + esc(p.trim()).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  function splitList(text) {
    if (isBlank(text)) return [];
    return String(text).split(/\n|;/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function splitTags(text) {
    if (isBlank(text)) return [];
    return String(text).split(/[,;\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function truncate(text, n) {
    if (isBlank(text)) return "";
    var s = String(text).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s;
  }
  function qs(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; }
  }
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (!isBlank(v) && !seen[v]) { seen[v] = true; out.push(v); } });
    return out;
  }

  /* ---------- Supabase (public, anonymous, non-persistent) ---------- */
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  var client = null;
  if (configured && window.supabase && typeof window.supabase.createClient === "function") {
    try {
      client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "vtu-cse-public" }
      });
    } catch (e) {
      console.error("Supabase client could not be created:", e);
      client = null;
    }
  }
  var live = !!client;

  function compare(a, b, col, asc) {
    var x = a[col], y = b[col];
    var xn = x === null || x === undefined || x === "";
    var yn = y === null || y === undefined || y === "";
    if (xn && yn) return 0;
    if (xn) return 1;   /* nulls last */
    if (yn) return -1;
    if (typeof x === "boolean") { x = x ? 1 : 0; y = y ? 1 : 0; }
    var r = x < y ? -1 : x > y ? 1 : 0;
    return asc ? r : -r;
  }
  function sortRows(rows, order) {
    if (!order || !order.length) return rows;
    return rows.sort(function (a, b) {
      for (var i = 0; i < order.length; i++) {
        var r = compare(a, b, order[i][0], order[i][1] !== false);
        if (r !== 0) return r;
      }
      return 0;
    });
  }

  function baselineRows(table, opts) {
    var rows = (BASE[table] || []).filter(function (r) { return r.status === "published"; }).slice();
    rows = sortRows(rows, opts.order);
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return rows;
  }
  /* If the database is unreachable or schema.sql has not been run yet, the public
     site shows the built-in baseline instead of empty pages, and says so in the footer. */
  var usedFallback = false;
  function baselineFallback(table, opts, err) {
    usedFallback = true;
    var el = document.getElementById("data-mode");
    if (el) el.textContent = "Database temporarily unavailable — showing built-in baseline content.";
    return { rows: baselineRows(table, opts), error: null, fallback: true, cause: err };
  }

  var LOAD_TIMEOUT_MS = 8000;
  var cache = {};
  /* list(table, {order:[[col, asc]], limit}) -> Promise<{rows, error}> ; published rows only */
  function list(table, opts) {
    opts = opts || {};
    var key = table + "|" + JSON.stringify(opts);
    if (cache[key]) return cache[key];
    var p;
    if (live) {
      var q = client.from(table).select("*").eq("status", "published");
      (opts.order || []).forEach(function (o) {
        q = q.order(o[0], { ascending: o[1] !== false, nullsFirst: false });
      });
      q = q.limit(opts.limit || 1000);
      var ctrl = typeof AbortController === "function" ? new AbortController() : null;
      if (ctrl) q = q.abortSignal(ctrl.signal);
      var timeout = new Promise(function (resolve) {
        setTimeout(function () {
          if (ctrl) ctrl.abort();
          resolve({ data: null, error: { message: "Request timed out after " + (LOAD_TIMEOUT_MS / 1000) + "s" } });
        }, LOAD_TIMEOUT_MS);
      });
      p = Promise.race([Promise.resolve(q), timeout]).then(function (res) {
        if (res.error) {
          console.warn("Database load failed [" + table + "], using baseline content:", res.error.message);
          return baselineFallback(table, opts, res.error);
        }
        return { rows: res.data || [], error: null };
      }, function (err) {
        console.warn("Database unreachable [" + table + "], using baseline content:", err);
        return baselineFallback(table, opts, err);
      });
    } else {
      p = Promise.resolve({ rows: baselineRows(table, opts), error: null });
    }
    cache[key] = p;
    return p;
  }
  function content() {
    return list("dept_content").then(function (res) {
      var map = {};
      res.rows.forEach(function (r) { map[r.slug] = r; });
      return { map: map, error: res.error };
    });
  }

  /* ---------- Layout ---------- */
  var NAV = [
    ["home", "/", "Home"],
    ["about", "/about", "About"],
    ["academics", "/academics", "Academics"],
    ["people", "/people", "People"],
    ["research", "/research", "Research"],
    ["infrastructure", "/infrastructure", "Infrastructure"],
    ["students", "/students", "Students"],
    ["placements", "/placements", "Placements"],
    ["activities", "/activities", "Activities"],
    ["alumni", "/alumni", "Alumni"],
    ["resources", "/resources", "Resources"],
    ["contact", "/contact", "Contact"]
  ];
  var UTIL = [["notices", "/notices", "Notices"], ["gallery", "/gallery", "Gallery"], ["search", "/search", "Search"]];

  function brandMark() {
    var logo = safeUrl(CFG.LOGO_URL);
    if (logo) return '<img class="brand-logo" src="' + esc(logo) + '" alt="' + esc(DEPT.university || "") + ' logo">';
    return '<span class="brand-mark" aria-hidden="true">' + esc(DEPT.shortName || "CSE") + "</span>";
  }

  function renderHeader(page) {
    var host = document.getElementById("site-header");
    if (!host) return;
    var banner = CFG.PROTOTYPE_MODE
      ? '<div class="prototype-banner" role="note"><div class="container">' + esc(CFG.PROTOTYPE_NOTICE || "Prototype website.") + "</div></div>"
      : "";
    var util = UTIL.map(function (n) {
      return '<a href="' + n[1] + '"' + (n[0] === page ? ' aria-current="page"' : "") + ">" + esc(n[2]) + "</a>";
    }).join("") + '<a href="/admin" class="util-login">Staff login</a>';
    var nav = NAV.map(function (n) {
      return '<li><a href="' + n[1] + '"' + (n[0] === page ? ' aria-current="page"' : "") + ">" + esc(n[2]) + "</a></li>";
    }).join("");
    host.innerHTML =
      banner +
      '<div class="topbar"><div class="container topbar-inner"><span class="topbar-uni">' + esc(DEPT.university || "") + ", " + esc(DEPT.campus || "") + "</span>" +
      '<nav class="util-nav" aria-label="Utility">' + util + "</nav></div></div>" +
      '<header class="masthead"><div class="container masthead-inner">' +
      '<a class="brand" href="/">' + brandMark() + '<span class="brand-text"><strong>' + esc(DEPT.name || "") + "</strong><span>" + esc(DEPT.university || "") + ", Belagavi</span></span></a>" +
      '<form class="header-search" action="/search" method="get" role="search"><label class="sr-only" for="header-q">Search the department website</label>' +
      '<input id="header-q" name="q" type="search" placeholder="Search faculty, programmes, notices…" autocomplete="off" maxlength="80"><button type="submit" class="btn btn-small">Search</button></form>' +
      '<button type="button" class="nav-toggle" aria-expanded="false" aria-controls="main-nav">Menu</button>' +
      "</div>" +
      '<nav id="main-nav" class="main-nav" aria-label="Main"><div class="container"><ul>' + nav + "</ul></div></nav></header>";

    var toggle = host.querySelector(".nav-toggle");
    var navEl = host.querySelector("#main-nav");
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      navEl.classList.toggle("open", !open);
    });
  }

  function renderFooter() {
    var host = document.getElementById("site-footer");
    if (!host) return;
    var addr = (DEPT.addressLines || []).map(esc).join("<br>");
    var email = DEPT.email ? '<a href="mailto:' + esc(DEPT.email) + '">' + esc(DEPT.email) + "</a>" : "";
    var phone = DEPT.phone ? '<br><a href="tel:' + esc(String(DEPT.phone).replace(/[^\d+]/g, "")) + '">' + esc(DEPT.phone) + "</a>" : "";
    var uni = safeUrl(DEPT.universityUrl);
    var mode = '<p class="footer-mode" id="data-mode" role="status">' + (live ? (usedFallback ? "Database temporarily unavailable — showing built-in baseline content." : "") : "Showing built-in baseline content (database not connected).") + "</p>";
    host.innerHTML =
      '<footer class="site-footer"><div class="container footer-grid">' +
      '<div><h2 class="footer-title">Contact</h2><address>' + addr + "<br>" + email + phone + "</address></div>" +
      '<div><h2 class="footer-title">Quick links</h2><ul class="footer-links">' +
      (uni ? '<li><a href="' + esc(uni) + '" target="_blank" rel="noopener noreferrer">VTU main website<span class="sr-only"> (opens in new tab)</span></a></li>' : "") +
      '<li><a href="/resources?category=Academic%20calendar">Academic calendar</a></li>' +
      '<li><a href="/resources?category=Syllabus">Syllabus</a></li>' +
      '<li><a href="/research#publications">Research publications</a></li>' +
      '<li><a href="/students">Student resources</a></li>' +
      '<li><a href="/contact">Contact department</a></li></ul></div>' +
      '<div><h2 class="footer-title">Explore</h2><ul class="footer-links">' +
      '<li><a href="/notices">Notice board</a></li><li><a href="/activities">Events &amp; activities</a></li>' +
      '<li><a href="/placements">Placements</a></li><li><a href="/gallery">Gallery</a></li><li><a href="/admin">Staff login</a></li></ul></div>' +
      "</div>" +
      '<div class="footer-bottom"><div class="container"><p>&copy; ' + new Date().getFullYear() + " " + esc(DEPT.name || "") + ", " + esc(DEPT.university || "") + ".</p>" +
      (CFG.DEVELOPER_CREDIT ? "<p>" + esc(CFG.DEVELOPER_CREDIT) + "</p>" : "") + mode + "</div></div></footer>";
  }

  function setMain(html) {
    var main = document.getElementById("main");
    if (main) main.innerHTML = html;
  }

  function start(pages) {
    var page = (document.body && document.body.getAttribute("data-page")) || "home";
    renderHeader(page);
    renderFooter();
    var fn = pages && pages[page];
    if (typeof fn !== "function") return;
    Promise.resolve().then(fn).catch(function (err) {
      console.error(err);
      setMain('<div class="container page-body"><div class="alert alert-error" role="alert">This page could not be displayed. Please refresh, or contact the department.</div></div>');
    });
  }

  window.App = {
    config: CFG,
    dept: DEPT,
    esc: esc,
    safeUrl: safeUrl,
    isBlank: isBlank,
    parseDate: parseDate,
    fmtDate: fmtDate,
    todayISO: todayISO,
    paragraphs: paragraphs,
    splitList: splitList,
    splitTags: splitTags,
    truncate: truncate,
    qs: qs,
    uniq: uniq,
    sortRows: sortRows,
    list: list,
    content: content,
    isLive: function () { return live; },
    isConfigured: function () { return configured; },
    usedFallback: function () { return usedFallback; },
    setMain: setMain,
    start: start
  };
})();
