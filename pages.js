/*
 * pages.js — public page renderers. Every value from the data layer is escaped
 * with esc() and every link passes through safeUrl() before reaching the DOM.
 */
(function () {
  "use strict";
  var A = window.App;
  var esc = A.esc, safeUrl = A.safeUrl, fmtDate = A.fmtDate, isBlank = A.isBlank;
  var DEPT = A.dept;

  /* ---------- UI building blocks ---------- */
  function pageHead(title, lead, parent) {
    var crumbs = '<a href="/">Home</a> <span aria-hidden="true">/</span> ';
    if (parent) crumbs += '<a href="' + esc(parent[0]) + '">' + esc(parent[1]) + '</a> <span aria-hidden="true">/</span> ';
    return '<section class="page-head"><div class="container"><nav class="crumbs" aria-label="Breadcrumb">' + crumbs +
      '<span aria-current="page">' + esc(title) + "</span></nav><h1>" + esc(title) + "</h1>" +
      (lead ? '<p class="lead">' + esc(lead) + "</p>" : "") + "</div></section>";
  }
  function body(html) { return '<div class="container page-body">' + html + "</div>"; }
  function section(title, inner, id, extra) {
    return '<section class="block"' + (id ? ' id="' + esc(id) + '"' : "") + ' aria-labelledby="' + esc((id || slug(title)) + "-h") + '">' +
      '<div class="block-head"><h2 id="' + esc((id || slug(title)) + "-h") + '">' + esc(title) + "</h2>" + (extra || "") + "</div>" + inner + "</section>";
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function empty(msg) { return '<p class="empty">' + esc(msg) + "</p>"; }
  function pending(what) {
    return '<div class="pending" role="note"><strong>Pending departmental approval.</strong> ' + esc(what) + "</div>";
  }
  function errBox(res, what) {
    return res && res.error ? '<div class="alert alert-error" role="alert">Could not load ' + esc(what) + ". Please try again later.</div>" : "";
  }
  function link(url, text, cls) {
    var u = safeUrl(url);
    if (!u) return "";
    var ext = /^https?:/i.test(u);
    return '<a href="' + esc(u) + '"' + (cls ? ' class="' + cls + '"' : "") + (ext ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" +
      esc(text) + (ext ? '<span class="sr-only"> (opens in new tab)</span>' : "") + "</a>";
  }
  function img(url, alt, cls) {
    var u = safeUrl(url);
    if (!u) return "";
    return '<img src="' + esc(u) + '" alt="' + esc(alt || "") + '" loading="lazy" decoding="async"' + (cls ? ' class="' + cls + '"' : "") + ">";
  }
  function facts(pairs) {
    var items = pairs.filter(function (p) { return p[1] !== "" && p[1] !== null && p[1] !== undefined; })
      .map(function (p) { return "<div><dt>" + esc(p[0]) + "</dt><dd>" + p[1] + "</dd></div>"; }).join("");
    return items ? '<dl class="facts">' + items + "</dl>" : "";
  }
  function tbv(v, fallback) {
    return isBlank(v) ? '<span class="tbv">' + esc(fallback || "To verify") + "</span>" : esc(v);
  }
  function badge(text, kind) { return isBlank(text) ? "" : '<span class="badge' + (kind ? " badge-" + kind : "") + '">' + esc(text) + "</span>"; }
  function initials(name) {
    var parts = String(name || "").replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "").split(/[\s.]+/).filter(Boolean);
    return ((parts[0] || "")[0] || "").toUpperCase() + ((parts.length > 1 ? parts[parts.length - 1][0] : "") || "").toUpperCase();
  }
  function avatar(person, cls) {
    var pic = img(person.photo_url, "Photograph of " + (person.full_name || ""), "avatar-img");
    return '<div class="avatar ' + (cls || "") + '">' + (pic || '<span aria-hidden="true">' + esc(initials(person.full_name)) + "</span>") + "</div>";
  }
  function options(values, selected, allLabel) {
    return '<option value="">' + esc(allLabel) + "</option>" + values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (String(v) === String(selected || "") ? " selected" : "") + ">" + esc(v) + "</option>";
    }).join("");
  }
  function lower(v) { return String(v === null || v === undefined ? "" : v).toLowerCase(); }
  function matchesAll(text, q) {
    var hay = lower(text);
    return lower(q).split(/\s+/).filter(Boolean).every(function (t) { return hay.indexOf(t) !== -1; });
  }
  function activeNotices(rows) {
    var today = A.todayISO();
    return rows.filter(function (n) { return isBlank(n.expires_on) || n.expires_on >= today; });
  }
  function isUpcoming(e) { return (e.end_date || e.start_date || "") >= A.todayISO(); }
  function dateRange(a, b) {
    if (!a) return "";
    if (!b || b === a) return fmtDate(a);
    return fmtDate(a) + " – " + fmtDate(b);
  }
  function $(sel) { return document.querySelector(sel); }
  function notFound(what, back) {
    return pageHead(what + " not found") + body('<p class="empty">This ' + esc(what.toLowerCase()) + ' is not available or has not been published.</p><p><a class="btn" href="' + esc(back) + '">Go back</a></p>');
  }
  function setTitle(t) { document.title = t + " | " + (DEPT.name || "") + ", VTU Belagavi"; }

  /* ---------- Shared card renderers ---------- */
  function noticeItem(n) {
    return '<article class="notice">' +
      '<div class="notice-meta"><time datetime="' + esc(n.notice_date || "") + '">' + fmtDate(n.notice_date) + "</time>" + badge(n.category) + (n.is_pinned ? badge("Pinned", "accent") : "") + "</div>" +
      "<h3>" + esc(n.title) + "</h3>" + A.paragraphs(n.body) +
      '<p class="links-row">' + link(n.link_url, "More information") + " " + link(n.attachment_url, "Download attachment") + "</p></article>";
  }
  function eventCard(e) {
    var d = A.parseDate(e.start_date);
    var dateBlock = d ? '<div class="date-block" aria-hidden="true"><span>' + d.getDate() + "</span><small>" +
      esc(d.toLocaleDateString("en-IN", { month: "short", year: "numeric" })) + "</small></div>" : "";
    return '<article class="card event-card">' + dateBlock + '<div class="card-body">' + badge(e.category) +
      '<h3><a href="/activities?id=' + encodeURIComponent(e.id) + '">' + esc(e.title) + "</a></h3>" +
      '<p class="muted">' + dateRange(e.start_date, e.end_date) + (e.venue ? " · " + esc(e.venue) : "") + "</p></div></article>";
  }
  function programmeCard(p) {
    return '<article class="card"><div class="card-body">' + badge(p.level === "Research" ? "Research" : p.level === "UG" ? "Undergraduate" : "Postgraduate") +
      '<h3><a href="/academics?programme=' + encodeURIComponent(p.id) + '">' + esc(p.name) + "</a></h3>" +
      facts([["Degree", esc(p.degree || "")], ["Duration", tbv(p.duration)], ["Intake", tbv(p.intake)]]) + "</div></article>";
  }
  function facultyCard(f) {
    return '<article class="card person-card">' + avatar(f) + '<div class="card-body">' +
      '<h3><a href="/people?id=' + encodeURIComponent(f.id) + '">' + esc(f.full_name) + "</a></h3>" +
      '<p class="muted">' + tbv(f.designation) + "</p>" +
      (f.specialisation ? '<p class="small">' + esc(f.specialisation) + "</p>" : "") + "</div></article>";
  }
  function docRow(d) {
    return "<tr><td>" + esc(d.title) + "</td><td>" + esc(d.category || "") + "</td><td>" + esc(d.academic_year || "") + "</td><td>" +
      fmtDate(d.published_at) + "</td><td>" + esc(d.owner || "") + "</td><td>" + (link(d.file_url, "Download", "btn btn-small") || "—") + "</td></tr>";
  }
  function docTable(rows) {
    if (!rows.length) return empty("No documents published in this category yet.");
    return '<div class="table-wrap"><table><thead><tr><th scope="col">Title</th><th scope="col">Category</th><th scope="col">Academic year</th><th scope="col">Published</th><th scope="col">Owner</th><th scope="col"><span class="sr-only">Download</span></th></tr></thead><tbody>' +
      rows.map(docRow).join("") + "</tbody></table></div>";
  }
  function citation(p) {
    return '<li class="citation">' + (p.authors ? esc(p.authors) + ". " : "") + "<strong>" + esc(p.title) + "</strong>. " +
      (p.venue ? "<em>" + esc(p.venue) + "</em>" : "") + (p.pub_year ? ", " + esc(p.pub_year) : "") + ". " +
      badge(p.pub_type) + " " + link(p.url, "View source") + "</li>";
  }

  /* ======================= PAGES ======================= */

  function home() {
    return Promise.all([
      A.content(),
      A.list("programmes", { order: [["sort_order"], ["name"]] }),
      A.list("research_areas", { order: [["sort_order"], ["name"]] }),
      A.list("notices", { order: [["is_pinned", false], ["notice_date", false]] }),
      A.list("events", { order: [["start_date"]] }),
      A.list("faculty", { order: [["is_leadership", false], ["sort_order"], ["full_name"]] }),
      A.list("student_achievements", { order: [["achievement_date", false]], limit: 3 }),
      A.list("placement_records", { order: [["academic_year", false]], limit: 1 }),
      A.list("documents", { order: [["published_at", false]], limit: 6 })
    ]).then(function (r) {
      var content = r[0].map, progs = r[1], areas = r[2], notices = r[3], events = r[4], fac = r[5], ach = r[6], place = r[7], docs = r[8];
      var about = content.about;
      var intro = about ? A.truncate(String(about.body).split(/\n\s*\n/)[0], 260) : "";
      var heroImg = img(A.config.HERO_IMAGE_URL, A.config.HERO_IMAGE_ALT || "Department of Computer Science and Engineering, VTU Belagavi", "hero-img");
      var factsPanel = '<div class="hero-facts"><dl>' +
        "<div><dt>Established</dt><dd>" + esc(DEPT.established || "") + "</dd></div>" +
        "<div><dt>Campus</dt><dd>" + esc(DEPT.campus || "") + "</dd></div>" +
        "<div><dt>Programmes</dt><dd>" + progs.rows.length + " listed</dd></div>" +
        "<div><dt>Research domains</dt><dd>" + areas.rows.length + "</dd></div></dl></div>";

      var actNotices = activeNotices(notices.rows).slice(0, 5);
      var upcoming = events.rows.filter(isUpcoming).slice(0, 3);
      var leaders = fac.rows.slice(0, 4);
      var latestPlace = place.rows[0];

      var html =
        '<section class="hero"><div class="container hero-inner"><div class="hero-copy">' +
        '<p class="eyebrow">' + esc(DEPT.university || "") + " · " + esc(DEPT.campus || "") + "</p>" +
        "<h1>" + esc(DEPT.name || "") + "</h1>" +
        '<p class="tagline">' + esc(DEPT.tagline || "") + "</p>" +
        (intro ? '<p class="hero-lead">' + esc(intro) + "</p>" : "") +
        '<div class="hero-actions"><a class="btn btn-primary" href="/academics">Explore programmes</a><a class="btn btn-ghost" href="/notices">Notice board</a></div>' +
        "</div>" + (heroImg ? '<div class="hero-media">' + heroImg + "</div>" : factsPanel) + "</div></section>" +

        body(
          '<div class="grid-2">' +
          section("Latest notices", errBox(notices, "notices") + (actNotices.length ? '<div class="notice-list compact">' + actNotices.map(noticeItem).join("") + "</div>" : empty("No notices published yet.")), "notices", '<a href="/notices">All notices</a>') +
          section("Upcoming events", errBox(events, "events") + (upcoming.length ? '<div class="stack">' + upcoming.map(eventCard).join("") + "</div>" : empty("No upcoming events published.")), "events", '<a href="/activities">All activities</a>') +
          "</div>" +

          section("Academic programmes", errBox(progs, "programmes") + (progs.rows.length ? '<div class="grid-3">' + progs.rows.map(programmeCard).join("") + "</div>" : empty("Programme details are being verified.")), "programmes", '<a href="/academics">Academics</a>') +

          section("Research areas", errBox(areas, "research areas") + (areas.rows.length ? '<ul class="chips">' + areas.rows.map(function (a) { return '<li><a href="/research#domains">' + esc(a.name) + "</a></li>"; }).join("") + "</ul>" : empty("Research areas are being verified.")), "research", '<a href="/research">Research &amp; innovation</a>') +

          section("Leadership & faculty", errBox(fac, "faculty") + (leaders.length ? '<div class="grid-4">' + leaders.map(facultyCard).join("") + "</div>" : empty("Faculty profiles are being verified.")), "faculty", '<a href="/people">Faculty directory</a>') +

          '<div class="grid-2">' +
          section("Student achievements", errBox(ach, "achievements") + (ach.rows.length ? '<ul class="plain-list">' + ach.rows.map(function (a) {
            return "<li><strong>" + esc(a.title) + "</strong><br><span class=\"muted\">" + esc(a.students || "") + (a.event_name ? " · " + esc(a.event_name) : "") + (a.achievement_date ? " · " + fmtDate(a.achievement_date) : "") + "</span></li>";
          }).join("") + "</ul>" : empty("No verified achievements published yet.")), "achievements", '<a href="/students">Students</a>') +
          section("Placement highlights", errBox(place, "placements") + (latestPlace ?
            facts([["Academic year", esc(latestPlace.academic_year || "")], ["Students placed", tbv(latestPlace.placed)], ["Eligible students", tbv(latestPlace.eligible)], ["Higher studies", tbv(latestPlace.higher_studies)]]) :
            empty("Department-specific placement figures will appear here once verified records are approved.")), "placements", '<a href="/placements">Placements</a>') +
          "</div>" +

          section("Quick downloads", errBox(docs, "documents") + (docs.rows.length ? '<ul class="plain-list">' + docs.rows.map(function (d) {
            return "<li>" + (link(d.file_url, d.title) || esc(d.title)) + ' <span class="muted">' + esc(d.category || "") + (d.academic_year ? " · " + esc(d.academic_year) : "") + "</span></li>";
          }).join("") + "</ul>" : empty("Syllabus, calendars and forms will be listed here once uploaded.")), "downloads", '<a href="/resources">All resources</a>')
        );
      A.setMain(html);
    });
  }

  var ABOUT_SECTIONS = [
    ["about", "Department introduction"],
    ["history", "History and establishment"],
    ["vision", "Vision"],
    ["mission", "Mission"],
    ["objectives", "Department objectives"],
    ["peo", "Programme educational objectives (PEOs)"],
    ["po", "Programme outcomes (POs)"],
    ["pso", "Programme-specific outcomes (PSOs)"],
    ["org_structure", "Organisational structure"]
  ];

  function about() {
    return Promise.all([A.content(), A.list("faculty", { order: [["sort_order"]] })]).then(function (r) {
      var map = r[0].map;
      var chair = r[1].rows.filter(function (f) { return f.is_leadership; })[0];
      var html = errBox(r[0], "department information");
      var toc = '<nav class="toc" aria-label="On this page"><ul>' + ABOUT_SECTIONS.map(function (s) { return '<li><a href="#' + s[0] + '">' + esc(s[1]) + "</a></li>"; }).join("") +
        '<li><a href="#chair_message">Chairperson\'s message</a></li></ul></nav>';
      var sections = ABOUT_SECTIONS.map(function (s) {
        var c = map[s[0]];
        return section(s[1], c && !isBlank(c.body) ? '<div class="prose">' + A.paragraphs(c.body) + "</div>" : pending("The official " + s[1].toLowerCase() + " will be published after approval by the department."), s[0]);
      }).join("");
      var msg = map.chair_message;
      var chairHtml = (chair ? '<div class="chair">' + avatar(chair, "avatar-lg") + "<div><h3>" + esc(chair.full_name) + '</h3><p class="muted">' + esc(chair.designation || "") + "</p>" +
        link("/people?id=" + encodeURIComponent(chair.id), "View profile") + "</div></div>" : "") +
        (msg && !isBlank(msg.body) ? '<div class="prose">' + A.paragraphs(msg.body) + "</div>" : pending("The Chairperson's message will be published once provided by the department."));
      html += '<div class="layout-side">' + toc + "<div>" + sections + section("Chairperson's message", chairHtml, "chair_message") + "</div></div>";
      A.setMain(pageHead("About the Department", DEPT.name + ", " + DEPT.university + ", " + DEPT.campus + ".") + body(html));
    });
  }

  var ACADEMIC_DOC_CATS = ["Syllabus", "Academic calendar", "Timetable", "Academic regulations", "Examination resources", "Project guidelines"];
  function academics() {
    var id = A.qs("programme");
    return Promise.all([A.list("programmes", { order: [["sort_order"], ["name"]] }), A.list("documents", { order: [["published_at", false]] })]).then(function (r) {
      var progs = r[0], docs = r[1];
      if (id) {
        var p = progs.rows.filter(function (x) { return x.id === id; })[0];
        if (!p) { A.setMain(notFound("Programme", "/academics")); return; }
        setTitle(p.name);
        var related = docs.rows.filter(function (d) { return d.programme_code && d.programme_code === p.code; });
        A.setMain(pageHead(p.name, null, ["/academics", "Academics"]) + body(
          '<div class="grid-2-1"><div>' +
          section("Programme overview", (p.description ? '<div class="prose">' + A.paragraphs(p.description) + "</div>" : pending("A programme description will be added once approved.")) +
            facts([["Level", esc(p.level || "")], ["Degree", esc(p.degree || "")], ["Duration", tbv(p.duration)], ["Sanctioned intake", tbv(p.intake)], ["Eligibility", tbv(p.eligibility, "As per VTU admission norms — to verify")], ["Programme code", esc(p.code || "")]]), "overview") +
          section("Programme documents", docTable(related), "documents") + "</div>" +
          '<aside class="side-card"><h2>Syllabus</h2>' + (link(p.syllabus_url, "Download official syllabus", "btn btn-primary") || '<p class="muted">The official syllabus PDF has not been uploaded yet.</p>') +
          '<p class="small">Always confirm the current scheme and syllabus with the official VTU publication.</p><p><a href="/academics">&larr; All programmes</a></p></aside></div>'
        ));
        return;
      }
      var groups = [["UG", "Undergraduate programmes"], ["PG", "Postgraduate programmes"], ["Research", "Research programmes"]];
      var html = errBox(progs, "programmes") + groups.map(function (g) {
        var rows = progs.rows.filter(function (p) { return p.level === g[0]; });
        return rows.length ? section(g[1], '<div class="grid-3">' + rows.map(programmeCard).join("") + "</div>", slug(g[1])) : "";
      }).join("");
      if (!progs.rows.length && !progs.error) html += empty("Programme details are being verified with the department.");
      html += '<div class="alert alert-info" role="note"><strong>Programme ownership.</strong> Only programmes confirmed as managed by the Department of CSE are listed. Other computing programmes offered on the Belagavi campus (for example B.Tech CSE and B.Tech AI &amp; Data Science) will be added only after the department confirms ownership.</div>';
      html += section("Academic resources", '<ul class="resource-grid">' + ACADEMIC_DOC_CATS.map(function (c) {
        var n = docs.rows.filter(function (d) { return d.category === c; }).length;
        return '<li><a href="/resources?category=' + encodeURIComponent(c) + '"><strong>' + esc(c) + "</strong><span>" + (n ? n + " document" + (n > 1 ? "s" : "") : "Not yet uploaded") + "</span></a></li>";
      }).join("") + "</ul>", "resources");
      A.setMain(pageHead("Academics", "Programmes, curriculum, syllabus and academic resources of the department.") + body(html));
    });
  }

  function people() {
    var id = A.qs("id");
    return Promise.all([
      A.list("faculty", { order: [["is_leadership", false], ["sort_order"], ["full_name"]] }),
      A.list("staff", { order: [["sort_order"], ["full_name"]] })
    ]).then(function (r) {
      var fac = r[0], staff = r[1];
      if (id) return profile(fac.rows.filter(function (f) { return f.id === id; })[0]);

      var designations = A.uniq(fac.rows.map(function (f) { return f.designation; })).sort();
      var areas = A.uniq([].concat.apply([], fac.rows.map(function (f) { return A.splitTags(f.research_interests); }))).sort();
      var leaders = fac.rows.filter(function (f) { return f.is_leadership; });

      var html = errBox(fac, "faculty") +
        (leaders.length ? section("Leadership", '<div class="grid-4">' + leaders.map(facultyCard).join("") + "</div>", "leadership") : "") +
        section("Faculty directory",
          '<form class="filters" id="fac-filters" role="search" aria-label="Filter faculty"><div class="field"><label for="f-q">Name</label><input id="f-q" type="search" placeholder="Search by name" maxlength="60"></div>' +
          '<div class="field"><label for="f-des">Designation</label><select id="f-des">' + options(designations, "", "All designations") + "</select></div>" +
          '<div class="field"><label for="f-area">Research area</label><select id="f-area">' + options(areas, "", "All research areas") + "</select></div></form>" +
          '<p class="muted small" id="fac-count" aria-live="polite"></p><div class="grid-4" id="fac-grid"></div>', "directory") +
        section("Non-teaching staff", errBox(staff, "staff") + (staff.rows.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Name</th><th scope="col">Designation</th><th scope="col">Email</th></tr></thead><tbody>' +
          staff.rows.map(function (s) { return "<tr><td>" + esc(s.full_name) + "</td><td>" + esc(s.designation || "") + "</td><td>" + (s.email ? link("mailto:" + s.email, s.email) : "") + "</td></tr>"; }).join("") +
          "</tbody></table></div>" : empty("Staff details are being verified.")), "staff");
      A.setMain(pageHead("Faculty & Staff", "Faculty, leadership and staff of the department.") + body(html));

      function apply() {
        var q = $("#f-q").value, des = $("#f-des").value, area = $("#f-area").value;
        var rows = fac.rows.filter(function (f) {
          if (q && !matchesAll(f.full_name, q)) return false;
          if (des && f.designation !== des) return false;
          if (area && A.splitTags(f.research_interests).indexOf(area) === -1) return false;
          return true;
        });
        $("#fac-grid").innerHTML = rows.length ? rows.map(facultyCard).join("") : empty("No faculty match these filters.");
        $("#fac-count").textContent = "Showing " + rows.length + " of " + fac.rows.length + " faculty profile" + (fac.rows.length === 1 ? "" : "s") + ".";
      }
      ["#f-q", "#f-des", "#f-area"].forEach(function (s) { $(s).addEventListener("input", apply); });
      $("#fac-filters").addEventListener("submit", function (e) { e.preventDefault(); });
      apply();
    });
  }

  function profile(f) {
    if (!f) { A.setMain(notFound("Faculty profile", "/people")); return Promise.resolve(); }
    setTitle(f.full_name);
    return Promise.all([
      A.list("publications", { order: [["pub_year", false]] }),
      A.list("research_projects", { order: [["start_year", false]] }),
      A.list("ipr", { order: [["filed_on", false]] })
    ]).then(function (r) {
      var pubs = r[0].rows.filter(function (p) { return p.faculty_id === f.id; });
      var projs = r[1].rows.filter(function (p) { return p.faculty_id === f.id; });
      var iprs = r[2].rows.filter(function (p) { return p.faculty_id === f.id; });
      var interests = A.splitTags(f.research_interests);
      var html = '<div class="profile">' + avatar(f, "avatar-xl") + "<div>" +
        facts([["Designation", tbv(f.designation)], ["Qualification", tbv(f.qualification)], ["Specialisation", tbv(f.specialisation)], ["Experience", tbv(f.experience)],
          ["Email", f.email ? link("mailto:" + f.email, f.email) : ""], ["Research profile", link(f.profile_url, "Google Scholar / ORCID / institutional profile")]]) +
        (interests.length ? '<h2 class="h3">Research interests</h2><ul class="chips">' + interests.map(function (i) { return "<li><span>" + esc(i) + "</span></li>"; }).join("") + "</ul>" : "") +
        "</div></div>" +
        (f.responsibilities ? section("Academic responsibilities", '<ul class="plain-list">' + A.splitList(f.responsibilities).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>", "responsibilities") : "") +
        (f.memberships ? section("Professional memberships", '<ul class="plain-list">' + A.splitList(f.memberships).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>", "memberships") : "") +
        section("Publications", pubs.length ? '<ol class="citations">' + pubs.map(citation).join("") + "</ol>" : empty("No verified publications linked to this profile yet."), "publications") +
        section("Research projects", projs.length ? '<ul class="plain-list">' + projs.map(function (p) { return "<li><strong>" + esc(p.title) + '</strong> <span class="muted">' + esc(p.category || "") + (p.start_year ? " · " + esc(p.start_year) + (p.end_year ? "–" + esc(p.end_year) : "") : "") + "</span></li>"; }).join("") + "</ul>" : empty("No verified projects linked to this profile yet."), "projects") +
        section("Patents & copyrights", iprs.length ? '<ul class="plain-list">' + iprs.map(function (p) { return "<li><strong>" + esc(p.title) + '</strong> <span class="muted">' + esc(p.ipr_type || "") + " · " + esc(p.ipr_status || "") + (p.reference_number ? " · " + esc(p.reference_number) : "") + "</span></li>"; }).join("") + "</ul>" : empty("No verified IPR records linked to this profile."), "ipr") +
        '<p><a href="/people">&larr; Back to faculty directory</a></p>';
      A.setMain(pageHead(f.full_name, null, ["/people", "People"]) + body(html));
    });
  }

  function research() {
    return Promise.all([
      A.list("research_areas", { order: [["sort_order"], ["name"]] }),
      A.list("publications", { order: [["pub_year", false], ["title"]] }),
      A.list("research_projects", { order: [["start_year", false]] }),
      A.list("ipr", { order: [["filed_on", false]] }),
      A.list("research_scholars", { order: [["year_joined", false], ["full_name"]] })
    ]).then(function (r) {
      var areas = r[0], pubs = r[1], projs = r[2], ipr = r[3], scholars = r[4];
      var years = A.uniq(pubs.rows.map(function (p) { return p.pub_year; })).sort().reverse();
      var types = A.uniq(pubs.rows.map(function (p) { return p.pub_type; })).sort();
      var doms = A.uniq(pubs.rows.map(function (p) { return p.research_area; })).sort();

      var projectHtml = projs.rows.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Project</th><th scope="col">Type</th><th scope="col">Investigator</th><th scope="col">Funding agency / partner</th><th scope="col">Duration</th><th scope="col">Status</th></tr></thead><tbody>' +
        projs.rows.map(function (p) {
          return "<tr><td>" + esc(p.title) + (p.amount ? '<br><span class="small muted">Amount: ' + esc(p.amount) + "</span>" : "") + "</td><td>" + esc(p.category || "") + "</td><td>" + esc(p.investigator || "") + "</td><td>" + esc(p.partner_or_funder || "") +
            "</td><td>" + esc(p.start_year || "") + (p.end_year ? "–" + esc(p.end_year) : "") + "</td><td>" + esc(p.project_status || "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" : empty("No verified research, consultancy or collaboration projects published yet.");

      var iprHtml = ipr.rows.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Title</th><th scope="col">Type</th><th scope="col">Number</th><th scope="col">Inventors / authors</th><th scope="col">Status</th><th scope="col">Filed</th></tr></thead><tbody>' +
        ipr.rows.map(function (p) { return "<tr><td>" + esc(p.title) + "</td><td>" + esc(p.ipr_type || "") + "</td><td>" + esc(p.reference_number || "") + "</td><td>" + esc(p.inventors || "") + "</td><td>" + esc(p.ipr_status || "") + "</td><td>" + fmtDate(p.filed_on) + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : empty("No verified patents or copyrights published yet. Only records with a valid application or registration number are listed.");

      var scholarHtml = scholars.rows.length ? '<div class="table-wrap"><table><thead><tr><th scope="col">Scholar</th><th scope="col">Programme</th><th scope="col">Research area</th><th scope="col">Guide</th><th scope="col">Joined</th><th scope="col">Status</th></tr></thead><tbody>' +
        scholars.rows.map(function (s) { return "<tr><td>" + esc(s.full_name) + "</td><td>" + esc(s.programme || "") + "</td><td>" + esc(s.research_area || "") + "</td><td>" + esc(s.guide || "") + "</td><td>" + esc(s.year_joined || "") + "</td><td>" + esc(s.scholar_status || "") + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : empty("Research scholar profiles will be listed after approval.");

      var html = '<nav class="anchor-nav" aria-label="Research sections"><a href="#domains">Domains</a><a href="#publications">Publications</a><a href="#projects">Projects &amp; consultancy</a><a href="#ipr">Patents &amp; copyrights</a><a href="#scholars">Research scholars</a><a href="/infrastructure">Laboratories</a></nav>' +
        section("Research domains", errBox(areas, "research areas") + (areas.rows.length ? '<div class="grid-3">' + areas.rows.map(function (a) { return '<article class="card"><div class="card-body"><h3>' + esc(a.name) + "</h3>" + (a.description ? '<p class="muted">' + esc(a.description) + "</p>" : "") + "</div></article>"; }).join("") + "</div>" : empty("Research domains are being verified.")), "domains") +
        section("Publications", errBox(pubs, "publications") +
          '<form class="filters" id="pub-filters" role="search" aria-label="Filter publications"><div class="field"><label for="p-q">Title or author</label><input id="p-q" type="search" maxlength="80" placeholder="Search publications"></div>' +
          '<div class="field"><label for="p-year">Year</label><select id="p-year">' + options(years, "", "All years") + "</select></div>" +
          '<div class="field"><label for="p-type">Type</label><select id="p-type">' + options(types, "", "All types") + "</select></div>" +
          '<div class="field"><label for="p-dom">Research domain</label><select id="p-dom">' + options(doms, "", "All domains") + "</select></div></form>" +
          '<p class="muted small" id="pub-count" aria-live="polite"></p><ol class="citations" id="pub-list"></ol>', "publications") +
        section("Research projects, consultancy & collaborations", errBox(projs, "projects") + projectHtml, "projects") +
        section("Patents & copyrights", errBox(ipr, "IPR records") + iprHtml, "ipr") +
        section("Research scholars", errBox(scholars, "scholars") + scholarHtml, "scholars");
      A.setMain(pageHead("Research & Innovation", "Research domains, publications, funded projects, consultancy and intellectual property.") + body(html));

      function apply() {
        var q = $("#p-q").value, y = $("#p-year").value, t = $("#p-type").value, d = $("#p-dom").value;
        var rows = pubs.rows.filter(function (p) {
          if (q && !matchesAll((p.title || "") + " " + (p.authors || "") + " " + (p.venue || ""), q)) return false;
          if (y && String(p.pub_year) !== y) return false;
          if (t && p.pub_type !== t) return false;
          if (d && p.research_area !== d) return false;
          return true;
        });
        $("#pub-list").innerHTML = rows.length ? rows.map(citation).join("") : '<li class="empty-li">' + (pubs.rows.length ? "No publications match these filters." : "No verified publications have been published yet.") + "</li>";
        $("#pub-count").textContent = pubs.rows.length ? "Showing " + rows.length + " of " + pubs.rows.length + " publications." : "";
      }
      ["#p-q", "#p-year", "#p-type", "#p-dom"].forEach(function (s) { $(s).addEventListener("input", apply); });
      $("#pub-filters").addEventListener("submit", function (e) { e.preventDefault(); });
      apply();
    });
  }

  function infrastructure() {
    return A.list("laboratories", { order: [["sort_order"], ["name"]] }).then(function (labs) {
      var html = errBox(labs, "laboratories") + (labs.rows.length ? '<div class="stack">' + labs.rows.map(function (l) {
        var eq = A.splitList(l.equipment), sw = A.splitList(l.software);
        return '<article class="card lab-card">' + (img(l.photo_url, l.name, "lab-img") || "") + '<div class="card-body"><h2 class="h3">' + esc(l.name) + "</h2>" +
          (l.purpose ? '<p class="muted">' + esc(l.purpose) + "</p>" : "") +
          facts([["Workstations", l.workstations !== null && l.workstations !== undefined ? esc(l.workstations) : ""], ["Faculty in charge", esc(l.in_charge || "")]]) +
          "<details><summary>Facilities, equipment and guidelines</summary>" + (l.description ? '<div class="prose">' + A.paragraphs(l.description) + "</div>" : "") +
          (eq.length ? '<h3 class="h4">Equipment</h3><ul>' + eq.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
          (sw.length ? '<h3 class="h4">Software and tools</h3><ul>' + sw.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
          (l.guidelines ? '<h3 class="h4">Safety and usage guidelines</h3>' + A.paragraphs(l.guidelines) : "") + "</details></div></article>";
      }).join("") + "</div>" : pending("Laboratory names, equipment and photographs will be published after confirmation by the laboratory in-charge."));
      A.setMain(pageHead("Laboratories & Infrastructure", "Teaching and research laboratories, equipment and facilities.") + body(html));
    });
  }

  var ACH_CATS = ["Competition", "Hackathon", "Award", "Certification", "Internship", "Innovation", "Other"];
  function students() {
    return Promise.all([
      A.list("student_achievements", { order: [["achievement_date", false]] }),
      A.list("student_projects", { order: [["project_year", false], ["title"]] }),
      A.list("student_clubs", { order: [["name"]] })
    ]).then(function (r) {
      var ach = r[0], projs = r[1], clubs = r[2];
      var cats = A.uniq(ACH_CATS.concat(ach.rows.map(function (a) { return a.category; }))).filter(function (c) {
        return ach.rows.some(function (a) { return a.category === c; });
      });
      var html = section("Student achievements", errBox(ach, "achievements") +
          (ach.rows.length ? '<div class="filters single"><div class="field"><label for="a-cat">Category</label><select id="a-cat">' + options(cats, "", "All categories") + '</select></div></div><div class="grid-3" id="ach-grid"></div>' : empty("No verified student achievements published yet.")), "achievements") +
        section("Student projects", errBox(projs, "projects") + (projs.rows.length ? '<div class="grid-3">' + projs.rows.map(function (p) {
          return '<article class="card"><div class="card-body"><h3>' + esc(p.title) + '</h3><p class="muted small">' + esc(p.team || "") + (p.guide ? " · Guide: " + esc(p.guide) : "") + (p.project_year ? " · " + esc(p.project_year) : "") + "</p>" +
            (p.description ? "<p>" + esc(A.truncate(p.description, 220)) + "</p>" : "") + link(p.link_url, "View project") + "</div></article>";
        }).join("") + "</div>" : empty("Project showcase will be populated after approval.")), "projects") +
        section("Technical clubs & student chapters", errBox(clubs, "clubs") + (clubs.rows.length ? '<div class="grid-3">' + clubs.rows.map(function (c) {
          return '<article class="card"><div class="card-body">' + badge(c.club_type) + "<h3>" + esc(c.name) + "</h3>" + (c.description ? "<p>" + esc(c.description) + "</p>" : "") +
            (c.coordinator ? '<p class="muted small">Coordinator: ' + esc(c.coordinator) + "</p>" : "") + link(c.link_url, "Learn more") + "</div></article>";
        }).join("") + "</div>" : empty("Club and chapter details are being verified.")), "clubs");
      A.setMain(pageHead("Students", "Achievements, projects, clubs and student chapters.") + body(html));

      function achCard(a) {
        return '<article class="card">' + (img(a.photo_url, a.title, "card-img") || "") + '<div class="card-body">' + badge(a.category) + "<h3>" + esc(a.title) + '</h3><p class="muted small">' +
          esc(a.students || "") + (a.event_name ? " · " + esc(a.event_name) : "") + (a.achievement_date ? " · " + fmtDate(a.achievement_date) : "") + "</p>" +
          (a.description ? "<p>" + esc(A.truncate(a.description, 220)) + "</p>" : "") + link(a.evidence_url, "View evidence") + "</div></article>";
      }
      var sel = $("#a-cat");
      if (sel) {
        var apply = function () {
          var c = sel.value;
          var rows = ach.rows.filter(function (a) { return !c || a.category === c; });
          $("#ach-grid").innerHTML = rows.length ? rows.map(achCard).join("") : empty("No achievements in this category.");
        };
        sel.addEventListener("input", apply);
        apply();
      }
    });
  }

  function placements() {
    return Promise.all([
      A.list("placement_records", { order: [["academic_year", false]] }),
      A.list("documents", { order: [["published_at", false]] })
    ]).then(function (r) {
      var rec = r[0], docs = r[1];
      var table;
      if (rec.rows.length) {
        table = '<div class="table-wrap"><table><caption class="sr-only">Department-level placement statistics by academic year</caption><thead><tr><th scope="col">Academic year</th><th scope="col">Eligible students</th><th scope="col">Students placed</th><th scope="col">Placement rate</th><th scope="col">Higher studies</th><th scope="col">Entrepreneurs</th><th scope="col">Source</th></tr></thead><tbody>' +
          rec.rows.map(function (p) {
            var rate = "";
            if (typeof p.eligible === "number" && typeof p.placed === "number" && p.eligible > 0) {
              var pct = Math.round((p.placed / p.eligible) * 1000) / 10;
              rate = '<meter min="0" max="' + p.eligible + '" value="' + p.placed + '" aria-label="' + pct + ' percent placed"></meter> ' + pct + "%";
            }
            return '<tr><th scope="row">' + esc(p.academic_year || "") + "</th><td>" + tbv(p.eligible) + "</td><td>" + tbv(p.placed) + "</td><td>" + (rate || tbv("")) + "</td><td>" + tbv(p.higher_studies) + "</td><td>" + tbv(p.entrepreneurs) +
              "</td><td>" + (link(p.source_doc_url, "Report") || esc(p.source || "")) + "</td></tr>" + (p.notes ? '<tr class="note-row"><td colspan="7">' + esc(p.notes) + "</td></tr>" : "");
          }).join("") + "</tbody></table></div>";
      } else {
        table = pending("No verified department-level placement records have been approved yet. The reporting framework below shows the periods that will be published.") +
          '<div class="table-wrap"><table><caption class="sr-only">Placement reporting framework</caption><thead><tr><th scope="col">Academic year</th><th scope="col">Eligible students</th><th scope="col">Students placed</th><th scope="col">Higher studies</th><th scope="col">Entrepreneurs</th></tr></thead><tbody>' +
          ["2023–24", "2024–25", "2025–26"].map(function (y) { return '<tr><th scope="row">' + y + "</th>" + '<td><span class="tbv">To verify</span></td>'.repeat(4) + "</tr>"; }).join("") +
          "</tbody></table></div>";
      }
      var prep = docs.rows.filter(function (d) { return d.category === "Placement preparation" || d.category === "Placement report"; });
      var html = '<div class="alert alert-info" role="note"><strong>Department-specific data only.</strong> Figures on this page relate to the Department of CSE and are labelled by academic year. University-wide statistics are published by VTU\'s Centralised Placement Cell. Salary packages and recruiter names are shown only where supported by approved records.</div>' +
        section("Year-wise placement statistics", errBox(rec, "placement records") + table, "statistics") +
        section("Placement reports & preparation resources", docTable(prep), "resources");
      A.setMain(pageHead("Placements & Career Development", "Placements, internships, higher studies and entrepreneurship outcomes.") + body(html));
    });
  }

  var EVENT_CATS = ["Conference", "Workshop", "Seminar", "Faculty development programme", "Technical festival", "Guest lecture", "Industrial visit", "Training programme", "Student competition", "Other"];
  function activities() {
    var id = A.qs("id");
    return Promise.all([A.list("events", { order: [["start_date", false]] }), A.list("gallery", { order: [["taken_on", false]] })]).then(function (r) {
      var events = r[0], gallery = r[1];
      if (id) {
        var e = events.rows.filter(function (x) { return x.id === id; })[0];
        if (!e) { A.setMain(notFound("Event", "/activities")); return; }
        setTitle(e.title);
        var photos = gallery.rows.filter(function (g) { return g.event_id === e.id; });
        var up = isUpcoming(e);
        A.setMain(pageHead(e.title, null, ["/activities", "Activities"]) + body(
          '<div class="grid-2-1"><div>' + (img(e.cover_image_url, e.title, "detail-img") || "") +
          section("About this event", (e.description ? '<div class="prose">' + A.paragraphs(e.description) + "</div>" : empty("Description not provided."))) +
          (photos.length ? section("Photographs", '<div class="gallery-grid">' + photos.map(function (g) { return '<figure>' + img(g.image_url, g.caption || g.title) + (g.caption ? "<figcaption>" + esc(g.caption) + "</figcaption>" : "") + "</figure>"; }).join("") + "</div>") : "") +
          '</div><aside class="side-card">' + badge(up ? "Upcoming" : "Completed", up ? "accent" : "") +
          facts([["Category", esc(e.category || "")], ["Date", dateRange(e.start_date, e.end_date)], ["Venue", esc(e.venue || "")], ["Organiser", esc(e.organiser || "")], ["Resource person", esc(e.resource_person || "")]]) +
          (up ? link(e.registration_url, "Register", "btn btn-primary") : "") +
          '<p class="links-row">' + link(e.report_url, "Event report") + " " + link(e.attachments_url, "Attachments") + '</p><p><a href="/activities">&larr; All activities</a></p></aside></div>'
        ));
        return;
      }
      var cats = EVENT_CATS.filter(function (c) { return events.rows.some(function (e) { return e.category === c; }); });
      var html = errBox(events, "events") +
        '<div class="toolbar"><div class="segmented" role="group" aria-label="Show events"><button type="button" class="seg" data-when="upcoming" aria-pressed="true">Upcoming</button><button type="button" class="seg" data-when="past" aria-pressed="false">Past</button></div>' +
        '<div class="field inline"><label for="e-cat">Category</label><select id="e-cat">' + options(cats, "", "All categories") + "</select></div></div>" +
        '<div class="grid-2" id="ev-list" aria-live="polite"></div>';
      A.setMain(pageHead("Events & Activities", "Conferences, workshops, seminars, FDPs, guest lectures, industrial visits and student competitions.") + body(html));
      var when = "upcoming";
      function apply() {
        var c = $("#e-cat").value;
        var rows = events.rows.filter(function (e) { return (when === "upcoming") === isUpcoming(e) && (!c || e.category === c); });
        if (when === "upcoming") rows = A.sortRows(rows.slice(), [["start_date", true]]);
        $("#ev-list").innerHTML = rows.length ? rows.map(eventCard).join("") : empty(when === "upcoming" ? "No upcoming events published." : "No past events published.");
      }
      Array.prototype.forEach.call(document.querySelectorAll(".seg"), function (b) {
        b.addEventListener("click", function () {
          when = b.getAttribute("data-when");
          Array.prototype.forEach.call(document.querySelectorAll(".seg"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
          apply();
        });
      });
      $("#e-cat").addEventListener("input", apply);
      apply();
    });
  }

  function notices() {
    return A.list("notices", { order: [["is_pinned", false], ["notice_date", false]] }).then(function (res) {
      var cats = A.uniq(res.rows.map(function (n) { return n.category; })).sort();
      var html = errBox(res, "notices") +
        '<div class="toolbar"><div class="field inline"><label for="n-cat">Category</label><select id="n-cat">' + options(cats, "", "All categories") + "</select></div>" +
        '<label class="check"><input type="checkbox" id="n-exp"> Include expired notices</label></div><div class="notice-list" id="n-list" aria-live="polite"></div>';
      A.setMain(pageHead("Notice Board", "Official departmental announcements, academic and examination notices.") + body(html));
      function apply() {
        var c = $("#n-cat").value, exp = $("#n-exp").checked;
        var rows = (exp ? res.rows : activeNotices(res.rows)).filter(function (n) { return !c || n.category === c; });
        $("#n-list").innerHTML = rows.length ? rows.map(noticeItem).join("") : empty("No notices to show.");
      }
      $("#n-cat").addEventListener("input", apply);
      $("#n-exp").addEventListener("change", apply);
      apply();
    });
  }

  function alumni() {
    return A.list("alumni", { order: [["graduation_year", false], ["full_name"]] }).then(function (res) {
      var rows = res.rows.filter(function (a) { return a.consent === true; }); /* DB also enforces consent */
      var years = A.uniq(rows.map(function (a) { return a.graduation_year; })).sort().reverse();
      var progs = A.uniq(rows.map(function (a) { return a.programme; })).sort();
      var testimonials = rows.filter(function (a) { return !isBlank(a.testimonial); });
      var html = errBox(res, "alumni") +
        (rows.length ? '<form class="filters" id="al-f" aria-label="Filter alumni"><div class="field"><label for="al-y">Graduation year</label><select id="al-y">' + options(years, "", "All years") + "</select></div>" +
          '<div class="field"><label for="al-p">Programme</label><select id="al-p">' + options(progs, "", "All programmes") + '</select></div></form><div class="grid-4" id="al-grid"></div>' : empty("Alumni profiles are published only with the alumnus's written consent. None have been published yet.")) +
        (testimonials.length ? section("Alumni testimonials", '<div class="grid-2">' + testimonials.slice(0, 6).map(function (a) {
          return '<blockquote class="quote"><p>' + esc(a.testimonial) + "</p><footer>" + esc(a.full_name) + (a.graduation_year ? ", " + esc(a.graduation_year) : "") + "</footer></blockquote>";
        }).join("") + "</div>", "testimonials") : "") +
        '<p class="small muted">Personal contact details of alumni are never published on this website.</p>';
      A.setMain(pageHead("Alumni", "Alumni profiles, achievements and contributions to the department.") + body(html));
      if (!rows.length) return;
      function card(a) {
        return '<article class="card person-card">' + avatar(a) + '<div class="card-body"><h3>' + esc(a.full_name) + '</h3><p class="muted small">' + esc(a.programme || "") + (a.graduation_year ? " · " + esc(a.graduation_year) : "") + "</p>" +
          "<p>" + esc(a.designation || "") + (a.organisation ? ", " + esc(a.organisation) : "") + "</p>" + (a.achievements ? '<p class="small">' + esc(A.truncate(a.achievements, 160)) + "</p>" : "") + "</div></article>";
      }
      function apply() {
        var y = $("#al-y").value, p = $("#al-p").value;
        var list = rows.filter(function (a) { return (!y || String(a.graduation_year) === y) && (!p || a.programme === p); });
        $("#al-grid").innerHTML = list.length ? list.map(card).join("") : empty("No alumni match these filters.");
      }
      $("#al-y").addEventListener("input", apply);
      $("#al-p").addEventListener("input", apply);
      apply();
    });
  }

  var DOC_CATS = ["Syllabus", "Academic calendar", "Timetable", "Academic regulations", "Examination resources", "Project guidelines", "Laboratory manual",
    "Department report", "Annual report", "Newsletter", "Event report", "Research document", "Department form", "Placement report", "Placement preparation", "Accreditation & quality assurance", "Other"];
  function resources() {
    return A.list("documents", { order: [["published_at", false], ["title"]] }).then(function (res) {
      var initial = A.qs("category") || "";
      var cats = A.uniq(DOC_CATS.concat(res.rows.map(function (d) { return d.category; })));
      var years = A.uniq(res.rows.map(function (d) { return d.academic_year; })).sort().reverse();
      var html = errBox(res, "documents") +
        '<form class="filters" id="d-f" role="search" aria-label="Filter documents"><div class="field"><label for="d-q">Title</label><input id="d-q" type="search" maxlength="80" placeholder="Search documents"></div>' +
        '<div class="field"><label for="d-cat">Category</label><select id="d-cat">' + options(cats, initial, "All categories") + "</select></div>" +
        '<div class="field"><label for="d-y">Academic year</label><select id="d-y">' + options(years, "", "All years") + '</select></div></form><p class="muted small" id="d-count" aria-live="polite"></p><div id="d-list"></div>';
      A.setMain(pageHead("Downloads & Resources", "Syllabus, calendars, reports, newsletters, manuals and departmental forms.") + body(html));
      function apply() {
        var q = $("#d-q").value, c = $("#d-cat").value, y = $("#d-y").value;
        var rows = res.rows.filter(function (d) { return (!q || matchesAll(d.title, q)) && (!c || d.category === c) && (!y || d.academic_year === y); });
        $("#d-list").innerHTML = res.rows.length ? docTable(rows) : empty("No documents have been uploaded yet.");
        $("#d-count").textContent = res.rows.length ? "Showing " + rows.length + " of " + res.rows.length + " documents." : "";
      }
      ["#d-q", "#d-cat", "#d-y"].forEach(function (s) { $(s).addEventListener("input", apply); });
      $("#d-f").addEventListener("submit", function (e) { e.preventDefault(); });
      apply();
    });
  }

  function gallery() {
    return A.list("gallery", { order: [["taken_on", false], ["title"]] }).then(function (res) {
      var albums = A.uniq(res.rows.map(function (g) { return g.album; })).sort();
      var html = errBox(res, "gallery") + (res.rows.length ?
        '<div class="filters single"><div class="field"><label for="g-al">Album</label><select id="g-al">' + options(albums, "", "All albums") + '</select></div></div><div class="gallery-grid" id="g-grid"></div>' +
        '<dialog id="lightbox" aria-label="Image viewer"><figure><img id="lb-img" src="data:," alt=""><figcaption id="lb-cap"></figcaption></figure><button type="button" class="btn" id="lb-close">Close</button></dialog>'
        : empty("Department photographs will be published after approval."));
      A.setMain(pageHead("Gallery", "Photographs and media from departmental events and activities.") + body(html));
      if (!res.rows.length) return;
      var shown = [];
      function apply() {
        var a = $("#g-al").value;
        shown = res.rows.filter(function (g) { return !a || g.album === a; }).filter(function (g) { return safeUrl(g.image_url); });
        $("#g-grid").innerHTML = shown.length ? shown.map(function (g, i) {
          return '<figure><button type="button" class="thumb" data-i="' + i + '" aria-label="Open image: ' + esc(g.title || g.caption || "photo") + '">' + img(g.image_url, g.caption || g.title) + "</button><figcaption>" + esc(g.title || "") + "</figcaption></figure>";
        }).join("") : empty("No photographs in this album.");
      }
      var dlg = $("#lightbox");
      $("#g-grid").addEventListener("click", function (ev) {
        var btn = ev.target.closest(".thumb");
        if (!btn) return;
        var g = shown[Number(btn.getAttribute("data-i"))];
        if (!g) return;
        $("#lb-img").src = safeUrl(g.image_url);
        $("#lb-img").alt = g.caption || g.title || "";
        $("#lb-cap").textContent = [g.title, g.caption, g.taken_on ? fmtDate(g.taken_on) : ""].filter(Boolean).join(" — ");
        if (typeof dlg.showModal === "function") dlg.showModal(); else window.open(safeUrl(g.image_url), "_blank", "noopener");
      });
      $("#lb-close").addEventListener("click", function () { dlg.close(); });
      dlg.addEventListener("click", function (ev) { if (ev.target === dlg) dlg.close(); });
      $("#g-al").addEventListener("input", apply);
      apply();
    });
  }

  function contact() {
    var mapQ = encodeURIComponent((DEPT.university || "") + ", " + (DEPT.campus || ""));
    var uni = safeUrl(DEPT.universityUrl);
    var html = '<div class="grid-2">' +
      section("Department office", "<address>" + (DEPT.addressLines || []).map(esc).join("<br>") + "</address>" +
        facts([["Email", DEPT.email ? link("mailto:" + DEPT.email, DEPT.email) : ""], ["Phone", DEPT.phone ? link("tel:" + String(DEPT.phone).replace(/[^\d+]/g, ""), DEPT.phone) : '<span class="tbv">To be confirmed by the department office</span>']]) +
        '<p><a class="btn btn-primary" href="https://www.google.com/maps/search/?api=1&amp;query=' + esc(mapQ) + '" target="_blank" rel="noopener noreferrer">Open in Google Maps<span class="sr-only"> (opens in new tab)</span></a></p>', "office") +
      section("Quick links", '<ul class="plain-list">' + (uni ? "<li>" + link(uni, "VTU main website") + "</li>" : "") +
        '<li><a href="/notices">Notice board</a></li><li><a href="/resources?category=Academic%20calendar">Academic calendar</a></li><li><a href="/resources?category=Syllabus">Syllabus</a></li><li><a href="/people">Faculty directory</a></li><li><a href="/placements">Placements</a></li></ul>' +
        '<p class="small muted">For admissions, examinations and results, refer to the official VTU website and notifications.</p>', "links") +
      "</div>";
    A.setMain(pageHead("Contact Us", "Location and official contact details of the department.") + body(html));
    return Promise.resolve();
  }

  /* ---------- Global search (client-side over published records) ---------- */
  var SEARCH_SOURCES = [
    ["dept_content", "About the department", ["title", "body"], function (r) { return "/about#" + r.slug; }, "title"],
    ["programmes", "Programmes", ["name", "code", "degree", "description"], function (r) { return "/academics?programme=" + encodeURIComponent(r.id); }, "name"],
    ["faculty", "Faculty", ["full_name", "designation", "specialisation", "research_interests"], function (r) { return "/people?id=" + encodeURIComponent(r.id); }, "full_name"],
    ["research_areas", "Research areas", ["name", "description"], function () { return "/research#domains"; }, "name"],
    ["publications", "Publications", ["title", "authors", "venue"], function () { return "/research#publications"; }, "title"],
    ["research_projects", "Research projects", ["title", "investigator", "partner_or_funder"], function () { return "/research#projects"; }, "title"],
    ["laboratories", "Laboratories", ["name", "purpose", "description"], function () { return "/infrastructure"; }, "name"],
    ["notices", "Notices", ["title", "body", "category"], function () { return "/notices"; }, "title"],
    ["events", "Events", ["title", "description", "category", "venue"], function (r) { return "/activities?id=" + encodeURIComponent(r.id); }, "title"],
    ["documents", "Documents", ["title", "category"], function (r) { return safeUrl(r.file_url) || "/resources"; }, "title"],
    ["student_achievements", "Student achievements", ["title", "students", "event_name"], function () { return "/students"; }, "title"],
    ["alumni", "Alumni", ["full_name", "organisation", "designation"], function () { return "/alumni"; }, "full_name"]
  ];
  function search() {
    var q = (A.qs("q") || "").trim().slice(0, 80);
    var form = '<form class="search-big" action="/search" method="get" role="search"><label for="sq" class="sr-only">Search</label><input id="sq" name="q" type="search" maxlength="80" value="' + esc(q) + '" placeholder="Search faculty, programmes, notices, documents…"><button class="btn btn-primary" type="submit">Search</button></form>';
    if (q.length < 2) {
      A.setMain(pageHead("Search") + body(form + empty("Enter at least two characters to search.")));
      return Promise.resolve();
    }
    return Promise.all(SEARCH_SOURCES.map(function (s) { return A.list(s[0]); })).then(function (all) {
      var total = 0;
      var groups = SEARCH_SOURCES.map(function (s, i) {
        var hits = all[i].rows.filter(function (r) {
          if (s[0] === "alumni" && r.consent !== true) return false;
          return matchesAll(s[2].map(function (k) { return r[k] || ""; }).join(" "), q);
        });
        total += hits.length;
        if (!hits.length) return "";
        return section(s[1] + " (" + hits.length + ")", '<ul class="results">' + hits.slice(0, 20).map(function (r) {
          var url = s[3](r);
          var snippet = s[2].slice(1).map(function (k) { return r[k]; }).filter(function (v) { return !isBlank(v); }).join(" · ");
          return "<li>" + (link(url, r[s[4]] || "Untitled") || esc(r[s[4]])) + (snippet ? '<p class="muted small">' + esc(A.truncate(snippet, 180)) + "</p>" : "") + "</li>";
        }).join("") + "</ul>", "r-" + s[0]);
      }).join("");
      A.setMain(pageHead("Search") + body(form + '<p class="muted" aria-live="polite">' + total + " result" + (total === 1 ? "" : "s") + " for “" + esc(q) + "”.</p>" + (groups || empty("No published information matches your search."))));
    });
  }

  function notFoundPage() {
    A.setMain(pageHead("Page not found") + body('<p class="empty">The page you are looking for does not exist or has moved.</p><p><a class="btn btn-primary" href="/">Go to home page</a> <a class="btn" href="/search">Search the site</a></p>'));
    return Promise.resolve();
  }

  A.start({
    home: home, about: about, academics: academics, people: people, research: research, infrastructure: infrastructure,
    students: students, placements: placements, activities: activities, notices: notices, alumni: alumni,
    resources: resources, gallery: gallery, contact: contact, search: search, notfound: notFoundPage
  });
})();
