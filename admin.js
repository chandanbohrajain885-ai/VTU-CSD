/*
 * admin.js — Department Administration Portal.
 * The browser is NOT trusted: every permission shown here is enforced again
 * in the database by Row Level Security and the workflow trigger (schema.sql).
 */
(function () {
  "use strict";
  var A = window.App;
  var esc = A.esc, isBlank = A.isBlank;
  var CFG = A.config;
  var root = document.getElementById("admin-app");
  var sb = null;
  var S = { user: null, profile: null, perms: [], profiles: [], refs: { faculty: [], events: [] }, myFacultyId: null, booted: false };

  /* ---------- Reference data ---------- */
  var ROLES = [
    ["super_admin", "Super Administrator"], ["hod", "HOD / Chairperson"], ["dept_admin", "Department Administrator"],
    ["faculty", "Faculty Member"], ["research_coordinator", "Research Coordinator"],
    ["event_coordinator", "Event Coordinator"], ["student_coordinator", "Student Coordinator"]
  ];
  var STATUS = { draft: "Draft", pending_review: "Pending review", reviewed: "Reviewed", rejected: "Sent back", published: "Published", archived: "Archived" };
  var STATUS_ORDER = ["draft", "pending_review", "reviewed", "rejected", "published", "archived"];
  var EVENT_CATS = ["Conference", "Workshop", "Seminar", "Faculty development programme", "Technical festival", "Guest lecture", "Industrial visit", "Training programme", "Student competition", "Other"];
  var DOC_CATS = ["Syllabus", "Academic calendar", "Timetable", "Academic regulations", "Examination resources", "Project guidelines", "Laboratory manual", "Department report", "Annual report", "Newsletter", "Event report", "Research document", "Department form", "Placement report", "Placement preparation", "Accreditation & quality assurance", "Other"];
  var ACH_CATS = ["Competition", "Hackathon", "Award", "Certification", "Internship", "Innovation", "Other"];
  var IMG = "image/jpeg,image/png,image/webp";
  var PDF = "application/pdf";
  var ANY = "application/pdf,image/jpeg,image/png,image/webp";

  function F(k, l, t, extra) { var f = { k: k, l: l, t: t || "text" }; for (var x in extra || {}) f[x] = extra[x]; return f; }

  var ENTITIES = {
    notices: { label: "Notices", group: "Updates", title: "title", list: ["title", "category", "notice_date"], order: ["notice_date", false], fields: [
      F("title", "Title", "text", { req: true, max: 200 }), F("category", "Category", "select", { opts: ["Academic", "Examination", "Admission", "Event", "Placement", "Research", "General"] }),
      F("notice_date", "Notice date", "date", { req: true }), F("expires_on", "Expires on", "date", { help: "Notice is hidden from the public board after this date." }),
      F("is_pinned", "Pin to top of notice board", "checkbox"), F("body", "Notice text", "textarea", { rows: 8 }),
      F("link_url", "External link", "url"), F("attachment_url", "Attachment (PDF/image)", "upload", { accept: ANY })] },
    events: { label: "Events", group: "Updates", title: "title", list: ["title", "category", "start_date"], order: ["start_date", false], fields: [
      F("title", "Event title", "text", { req: true, max: 200 }), F("category", "Category", "select", { opts: EVENT_CATS }),
      F("start_date", "Start date", "date", { req: true }), F("end_date", "End date", "date"), F("venue", "Venue"), F("organiser", "Organiser"),
      F("resource_person", "Resource person(s)"), F("description", "Description", "textarea", { rows: 8 }), F("registration_url", "Registration link", "url"),
      F("cover_image_url", "Cover photograph", "upload", { accept: IMG }), F("report_url", "Event report (PDF)", "upload", { accept: PDF }), F("attachments_url", "Other attachment", "upload", { accept: ANY })] },
    gallery: { label: "Gallery", group: "Updates", title: "title", list: ["title", "album", "taken_on"], order: ["taken_on", false], fields: [
      F("title", "Title"), F("image_url", "Photograph", "upload", { req: true, accept: IMG }), F("caption", "Caption / alt text", "text", { help: "Describe the photo for screen-reader users." }),
      F("album", "Album"), F("event_id", "Linked event", "ref", { ref: "events" }), F("taken_on", "Date taken", "date")] },
    dept_content: { label: "Department pages", group: "Department", title: "title", list: ["slug", "title"], order: ["slug", true], fields: [
      F("slug", "Section", "select", { req: true, opts: ["about", "history", "vision", "mission", "objectives", "peo", "po", "pso", "org_structure", "chair_message"], help: "Each section can exist only once." }),
      F("title", "Heading", "text", { req: true }), F("body", "Content", "textarea", { rows: 14, help: "Separate paragraphs with a blank line." })] },
    programmes: { label: "Programmes", group: "Department", title: "name", list: ["code", "name", "level"], order: ["sort_order", true], fields: [
      F("code", "Programme code", "text", { req: true, help: "Unique short code, e.g. MCA. Used to link documents." }), F("name", "Programme name", "text", { req: true }),
      F("level", "Level", "select", { req: true, opts: ["UG", "PG", "Research"] }), F("degree", "Degree"), F("duration", "Duration"),
      F("intake", "Sanctioned intake", "text", { help: "Only the approved sanctioned intake for the stated academic year." }), F("eligibility", "Eligibility", "textarea", { rows: 4 }),
      F("description", "Description", "textarea", { rows: 6 }), F("syllabus_url", "Official syllabus (PDF)", "upload", { accept: PDF }), F("sort_order", "Display order", "number")] },
    faculty: { label: "Faculty", group: "People", title: "full_name", list: ["full_name", "designation"], order: ["sort_order", true], fields: [
      F("full_name", "Full name", "text", { req: true }), F("designation", "Designation"), F("qualification", "Qualification"), F("specialisation", "Specialisation"),
      F("experience", "Experience"), F("email", "Official email", "email"), F("photo_url", "Official photograph", "upload", { accept: IMG }),
      F("research_interests", "Research interests", "text", { help: "Comma-separated, e.g. Computer Vision, IoT" }), F("profile_url", "Research profile link (Scholar/ORCID)", "url"),
      F("memberships", "Professional memberships", "textarea", { rows: 3, help: "One per line." }), F("responsibilities", "Academic responsibilities", "textarea", { rows: 3, help: "One per line." }),
      F("is_leadership", "Show in Leadership section", "checkbox"), F("user_id", "Linked staff login", "profile", { reviewerOnly: true, help: "Lets this faculty member edit their own (unpublished) profile." }),
      F("sort_order", "Display order", "number")] },
    staff: { label: "Non-teaching staff", group: "People", title: "full_name", list: ["full_name", "designation"], order: ["sort_order", true], fields: [
      F("full_name", "Full name", "text", { req: true }), F("designation", "Designation"), F("email", "Official email", "email"),
      F("photo_url", "Photograph", "upload", { accept: IMG }), F("sort_order", "Display order", "number")] },
    alumni: { label: "Alumni", group: "People", title: "full_name", list: ["full_name", "graduation_year", "organisation"], order: ["graduation_year", false], fields: [
      F("full_name", "Full name", "text", { req: true }), F("graduation_year", "Graduation year", "number"), F("programme", "Programme"), F("designation", "Current designation"),
      F("organisation", "Organisation"), F("industry", "Industry"), F("achievements", "Achievements", "textarea", { rows: 3 }), F("testimonial", "Testimonial", "textarea", { rows: 4 }),
      F("photo_url", "Photograph", "upload", { accept: IMG }), F("consent", "Written consent obtained to publish this profile", "checkbox", { help: "Required before publication. Never add personal phone numbers or addresses." })] },
    research_areas: { label: "Research areas", group: "Research", title: "name", list: ["name"], order: ["sort_order", true], fields: [
      F("name", "Research area", "text", { req: true }), F("description", "Short description", "textarea", { rows: 3 }), F("sort_order", "Display order", "number")] },
    publications: { label: "Publications", group: "Research", title: "title", list: ["title", "pub_type", "pub_year"], order: ["pub_year", false], fields: [
      F("title", "Title", "text", { req: true }), F("authors", "Authors", "text", { help: "As printed in the publication." }), F("venue", "Journal / conference / publisher"),
      F("pub_type", "Type", "select", { opts: ["Journal", "Conference", "Book", "Book chapter", "Other"] }), F("pub_year", "Year", "number", { min: 1950, max: 2100 }),
      F("url", "DOI or source link", "url"), F("research_area", "Research domain"), F("faculty_id", "Linked faculty profile", "ref", { ref: "faculty" })] },
    research_projects: { label: "Projects & consultancy", group: "Research", title: "title", list: ["title", "category", "start_year"], order: ["start_year", false], fields: [
      F("title", "Project title", "text", { req: true }), F("category", "Type", "select", { opts: ["Funded research", "Consultancy", "Collaboration", "Internal"] }),
      F("investigator", "Investigator(s)"), F("partner_or_funder", "Funding agency / partner"), F("amount", "Sanctioned amount", "text", { help: "Only from the sanction letter." }),
      F("start_year", "Start year", "number", { min: 1950, max: 2100 }), F("end_year", "End year", "number", { min: 1950, max: 2100 }),
      F("project_status", "Status", "select", { opts: ["Ongoing", "Completed"] }), F("description", "Description", "textarea", { rows: 5 }), F("faculty_id", "Linked faculty profile", "ref", { ref: "faculty" })] },
    ipr: { label: "Patents & copyrights", group: "Research", title: "title", list: ["title", "ipr_type", "ipr_status"], order: ["filed_on", false], fields: [
      F("title", "Title", "text", { req: true }), F("ipr_type", "Type", "select", { opts: ["Patent", "Copyright", "Design", "Trademark"] }),
      F("reference_number", "Application / registration number", "text", { help: "Do not publish IPR without a valid number." }), F("inventors", "Inventors / authors"),
      F("ipr_status", "Status", "select", { opts: ["Filed", "Published", "Granted", "Registered"] }), F("filed_on", "Filing date", "date"), F("faculty_id", "Linked faculty profile", "ref", { ref: "faculty" })] },
    research_scholars: { label: "Research scholars", group: "Research", title: "full_name", list: ["full_name", "programme", "scholar_status"], order: ["year_joined", false], fields: [
      F("full_name", "Scholar name", "text", { req: true }), F("programme", "Programme", "select", { opts: ["Ph.D.", "M.Sc. (Engg) by Research"] }), F("research_area", "Research area"),
      F("guide", "Guide"), F("year_joined", "Year joined", "number", { min: 1950, max: 2100 }), F("scholar_status", "Status", "select", { opts: ["Ongoing", "Awarded"] })] },
    laboratories: { label: "Laboratories", group: "Research", title: "name", list: ["name", "in_charge"], order: ["sort_order", true], fields: [
      F("name", "Laboratory name", "text", { req: true }), F("purpose", "Purpose"), F("description", "Description", "textarea", { rows: 5 }),
      F("equipment", "Equipment", "textarea", { rows: 4, help: "One item per line." }), F("software", "Software and tools", "textarea", { rows: 4, help: "One item per line." }),
      F("workstations", "Number of workstations", "number", { min: 0 }), F("in_charge", "Faculty in charge"), F("photo_url", "Photograph", "upload", { accept: IMG }),
      F("guidelines", "Safety and usage guidelines", "textarea", { rows: 4 }), F("sort_order", "Display order", "number")] },
    student_achievements: { label: "Student achievements", group: "Students", title: "title", list: ["title", "category", "achievement_date"], order: ["achievement_date", false], fields: [
      F("title", "Achievement", "text", { req: true }), F("category", "Category", "select", { opts: ACH_CATS }), F("students", "Student name(s) / approved team name"),
      F("event_name", "Event / competition"), F("achievement_date", "Date", "date"), F("description", "Description", "textarea", { rows: 4 }),
      F("evidence_url", "Evidence (certificate/letter)", "upload", { accept: ANY, help: "Required by policy: keep evidence for every achievement." }), F("photo_url", "Photograph", "upload", { accept: IMG })] },
    student_projects: { label: "Student projects", group: "Students", title: "title", list: ["title", "project_year"], order: ["project_year", false], fields: [
      F("title", "Project title", "text", { req: true }), F("team", "Team"), F("guide", "Guide"), F("project_year", "Year", "number", { min: 1950, max: 2100 }),
      F("description", "Description", "textarea", { rows: 5 }), F("link_url", "Project link", "url")] },
    student_clubs: { label: "Clubs & chapters", group: "Students", title: "name", list: ["name", "club_type"], order: ["name", true], fields: [
      F("name", "Name", "text", { req: true }), F("club_type", "Type", "select", { opts: ["Technical club", "Student chapter"] }), F("coordinator", "Faculty coordinator"),
      F("description", "Description", "textarea", { rows: 4 }), F("link_url", "Link", "url")] },
    placement_records: { label: "Placement records", group: "Students", title: "academic_year", requireYear: true, list: ["academic_year", "eligible", "placed"], order: ["academic_year", false], fields: [
      F("eligible", "Eligible students", "number", { min: 0 }), F("placed", "Students placed", "number", { min: 0 }), F("higher_studies", "Higher studies", "number", { min: 0 }),
      F("entrepreneurs", "Entrepreneurs", "number", { min: 0 }), F("source_doc_url", "Source report (PDF)", "upload", { accept: PDF }),
      F("notes", "Notes", "textarea", { rows: 3, help: "Department-specific figures only — never university-wide totals." })] },
    documents: { label: "Documents", group: "Department", title: "title", list: ["title", "category", "academic_year"], order: ["updated_at", false], fields: [
      F("title", "Document title", "text", { req: true }), F("category", "Category", "select", { req: true, opts: DOC_CATS }),
      F("programme_code", "Programme code (optional)", "text", { help: "Matches the programme code to show this file on the programme page." }),
      F("file_url", "File", "upload", { req: true, accept: ANY }), F("owner", "Document owner", "text", { help: "Office or person responsible for this document." })] }
  };
  var GROUPS = ["Updates", "Department", "People", "Research", "Students"];

  /* ---------- Generic helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function main(html) { var m = $("#admin-main"); if (m) { m.innerHTML = html; window.scrollTo(0, 0); m.focus({ preventScroll: true }); } }
  function role() { return S.profile ? S.profile.role : null; }
  function isReviewer() { return ["super_admin", "hod", "dept_admin"].indexOf(role()) !== -1; }
  function isApprover() { return ["super_admin", "hod"].indexOf(role()) !== -1; }
  function canWrite(t) { return isReviewer() || S.perms.indexOf(t) !== -1; }
  function visibleEntities() { return Object.keys(ENTITIES).filter(canWrite); }
  function statusBadge(s) { return '<span class="status status-' + esc(s) + '">' + esc(STATUS[s] || s) + "</span>"; }
  function personName(id) {
    if (!id) return "";
    var p = S.profiles.filter(function (x) { return x.id === id; })[0];
    return p ? (p.full_name || p.email || "User") : "User " + String(id).slice(0, 8);
  }
  function shortId(id) { return id ? String(id).slice(0, 8) : ""; }
  function fmtDT(d) { var dt = A.parseDate(d); return dt ? dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""; }
  function friendlyError(err) {
    if (!err) return "Something went wrong.";
    var m = err.message || String(err);
    if (/row-level security/i.test(m) || /permission denied/i.test(m)) return "You do not have permission to perform this action.";
    if (/duplicate key/i.test(m)) return "A record with this value already exists (duplicate code or section).";
    if (/violates check constraint "alumni_consent_required"/.test(m)) return "Alumni profiles can be published only after consent is recorded.";
    if (/placed_le_eligible/.test(m)) return "Students placed cannot exceed eligible students.";
    if (/event_dates/.test(m)) return "End date cannot be before the start date.";
    if (/check constraint/i.test(m)) return "One of the values is outside the allowed range. Please check years and numbers.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Network error — check your internet connection and try again.";
    return m;
  }
  var toastTimer = null;
  function toast(msg, kind) {
    var t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show" + (kind ? " toast-" + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, 5000);
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; btn.setAttribute("aria-busy", on ? "true" : "false"); }

  /* ---------- Boot ---------- */
  function boot() {
    if (!A.isConfigured()) {
      root.innerHTML = '<div class="auth-card"><h1>Administration portal</h1><div class="alert alert-info" role="note"><strong>Database not connected.</strong> The public website is running on built-in baseline content. To enable the administration portal:</div>' +
        "<ol><li>Create a Supabase project.</li><li>Run <code>schema.sql</code> in the Supabase SQL Editor.</li><li>Put the project URL and anon key in <code>config.js</code> and redeploy.</li><li>Create the first user and promote them to Super Administrator (see README).</li></ol>" +
        '<p><a href="/">&larr; Back to website</a></p></div>';
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      root.innerHTML = '<div class="auth-card"><div class="alert alert-error" role="alert">The Supabase client library (supabase.min.js) failed to load.</div></div>';
      return;
    }
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "vtu-cse-admin" }
    });
    sb.auth.onAuthStateChange(function (event, session) {
      /* Defer: never await Supabase calls inside this callback. */
      setTimeout(function () {
        if (event === "PASSWORD_RECOVERY") { renderRecovery(); return; }
        if (event === "SIGNED_OUT") { S.user = null; S.profile = null; S.booted = false; renderLogin(); return; }
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && !S.booted) { start(session.user); return; }
        if (event === "INITIAL_SESSION" && !session) renderLogin();
      }, 0);
    });
    window.addEventListener("hashchange", function () { if (S.booted) route(); });
  }

  /* ---------- Login / recovery ---------- */
  var fails = 0, lockedUntil = 0;
  function renderLogin(msg) {
    root.innerHTML = '<div class="auth-card"><h1>Staff login</h1><p class="muted">' + esc(A.dept.name || "") + " — administration portal</p>" +
      (msg ? '<div class="alert alert-info" role="status">' + esc(msg) + "</div>" : "") +
      '<div id="login-err" class="alert alert-error hidden" role="alert"></div>' +
      '<form id="login-form" novalidate><div class="field"><label for="l-email">Email</label><input id="l-email" type="email" autocomplete="username" required maxlength="120"></div>' +
      '<div class="field"><label for="l-pass">Password</label><input id="l-pass" type="password" autocomplete="current-password" required maxlength="128"></div>' +
      '<button class="btn btn-primary btn-block" type="submit" id="l-btn">Sign in</button></form>' +
      '<p><button type="button" class="link-btn" id="l-forgot">Forgot password?</button></p>' +
      '<p class="small muted">Accounts are created by the Super Administrator. Public sign-up is disabled.</p><p><a href="/">&larr; Back to website</a></p></div>';
    var err = $("#login-err");
    function showErr(m) { err.textContent = m; err.classList.remove("hidden"); }
    $("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (Date.now() < lockedUntil) { showErr("Too many failed attempts. Try again in " + Math.ceil((lockedUntil - Date.now()) / 1000) + " seconds."); return; }
      var email = $("#l-email").value.trim(), pass = $("#l-pass").value;
      if (!email || !pass) { showErr("Enter your email and password."); return; }
      var btn = $("#l-btn"); busy(btn, true);
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        busy(btn, false);
        if (res.error) {
          fails++;
          if (fails >= 5) { lockedUntil = Date.now() + 60000 * Math.min(fails - 4, 10); }
          showErr("Sign-in failed. Check your email and password.");
          return;
        }
        fails = 0;
      }, function (e2) { busy(btn, false); showErr(friendlyError(e2)); });
    });
    $("#l-forgot").addEventListener("click", function () {
      var email = $("#l-email").value.trim();
      if (!email) { showErr("Enter your email address above first, then click “Forgot password?”."); return; }
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/admin" }).then(function () {
        renderLogin("If that email belongs to a staff account, a password reset link has been sent.");
      });
    });
  }

  function passwordProblem(p) {
    if (p.length < 10) return "Use at least 10 characters.";
    if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Use both letters and numbers.";
    return "";
  }
  function renderRecovery() {
    root.innerHTML = '<div class="auth-card"><h1>Set a new password</h1><div id="r-err" class="alert alert-error hidden" role="alert"></div>' +
      '<form id="r-form" novalidate><div class="field"><label for="r-p1">New password</label><input id="r-p1" type="password" autocomplete="new-password" required minlength="10" maxlength="128"></div>' +
      '<div class="field"><label for="r-p2">Confirm new password</label><input id="r-p2" type="password" autocomplete="new-password" required maxlength="128"></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Update password</button></form></div>';
    $("#r-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var p1 = $("#r-p1").value, p2 = $("#r-p2").value, err = $("#r-err");
      var prob = passwordProblem(p1) || (p1 !== p2 ? "Passwords do not match." : "");
      if (prob) { err.textContent = prob; err.classList.remove("hidden"); return; }
      sb.auth.updateUser({ password: p1 }).then(function (res) {
        if (res.error) { err.textContent = friendlyError(res.error); err.classList.remove("hidden"); return; }
        S.booted = false;
        sb.auth.getUser().then(function (u) { if (u.data && u.data.user) start(u.data.user); else renderLogin("Password updated. Please sign in."); });
      });
    });
  }

  /* ---------- Session start ---------- */
  function start(user) {
    S.booted = true;
    S.user = user;
    root.innerHTML = '<div class="auth-card"><p class="loading">Loading your account…</p></div>';
    sb.from("profiles").select("*").eq("id", user.id).maybeSingle().then(function (res) {
      if (res.error || !res.data || !res.data.is_active) {
        root.innerHTML = '<div class="auth-card"><h1>Account pending activation</h1><p>Your login exists, but your account has not been activated or assigned a role yet. Ask the Super Administrator or HOD to activate it.</p>' +
          '<button class="btn" type="button" id="so">Sign out</button></div>';
        $("#so").addEventListener("click", signOut);
        return;
      }
      S.profile = res.data;
      return Promise.all([
        sb.from("role_permissions").select("entity").eq("role", S.profile.role),
        sb.from("profiles").select("id,email,full_name,role,is_active").order("full_name"),
        loadRefs(),
        S.profile.role === "faculty" ? sb.from("faculty").select("id").eq("user_id", user.id).limit(1) : Promise.resolve({ data: [] })
      ]).then(function (r) {
        S.perms = (r[0].data || []).map(function (x) { return x.entity; });
        S.profiles = r[1].data || [];
        S.myFacultyId = r[3].data && r[3].data[0] ? r[3].data[0].id : null;
        shell();
        route();
      });
    }).catch(function (e) {
      root.innerHTML = '<div class="auth-card"><div class="alert alert-error" role="alert">' + esc(friendlyError(e)) + "</div></div>";
    });
  }
  function loadRefs() {
    return Promise.all([
      sb.from("faculty").select("id,full_name").order("full_name"),
      sb.from("events").select("id,title,start_date").order("start_date", { ascending: false }).limit(500)
    ]).then(function (r) {
      S.refs.faculty = (r[0].data || []).map(function (x) { return { id: x.id, label: x.full_name }; });
      S.refs.events = (r[1].data || []).map(function (x) { return { id: x.id, label: x.title + (x.start_date ? " (" + x.start_date + ")" : "") }; });
    });
  }
  function signOut() { sb.auth.signOut().then(function () { S.booted = false; renderLogin("You have signed out."); }); }

  function shell() {
    var ents = visibleEntities();
    var nav = '<li><a href="#/">Dashboard</a></li><li><a href="#/register">Verification register</a></li>';
    if (role() === "faculty") nav += '<li><a href="#/my-profile">My faculty profile</a></li>';
    GROUPS.forEach(function (g) {
      var items = ents.filter(function (k) { return ENTITIES[k].group === g; });
      if (!items.length) return;
      nav += '<li class="nav-group">' + esc(g) + "</li>" + items.map(function (k) { return '<li><a href="#/e/' + k + '">' + esc(ENTITIES[k].label) + "</a></li>"; }).join("");
    });
    nav += '<li class="nav-group">Administration</li>';
    if (isApprover()) nav += '<li><a href="#/users">Users &amp; roles</a></li>';
    if (isReviewer()) nav += '<li><a href="#/audit">Audit log</a></li>';
    nav += '<li><a href="#/account">My account</a></li>';
    var roleName = (ROLES.filter(function (r) { return r[0] === role(); })[0] || [, role()])[1];
    var logo = A.safeUrl(CFG.LOGO_URL);
    root.innerHTML = '<header class="admin-bar"><div class="admin-bar-inner"><a class="admin-brand" href="#/">' + (logo ? '<img src="' + esc(logo) + '" alt="" class="admin-logo">' : "") + esc(A.dept.shortName || "CSE") + " Admin</a>" +
      '<span class="admin-user">' + esc(S.profile.full_name || S.user.email) + ' · <span class="muted">' + esc(roleName) + "</span></span>" +
      '<a class="btn btn-small btn-ghost-light" href="/" target="_blank" rel="noopener">View site</a><button class="btn btn-small" type="button" id="so">Sign out</button></div></header>' +
      '<div class="admin-layout"><nav class="admin-nav" aria-label="Administration"><ul>' + nav + "</ul></nav>" +
      '<main id="admin-main" class="admin-main" tabindex="-1"></main></div><div id="toast" class="toast" role="status" aria-live="polite"></div>';
    $("#so").addEventListener("click", signOut);
  }

  function route() {
    var h = location.hash || "#/";
    if (h.indexOf("#/") !== 0) h = "#/";
    var parts = h.slice(2).split("/").filter(Boolean);
    $$(".admin-nav a").forEach(function (a) {
      var href = a.getAttribute("href");
      var on = href === "#/" ? parts.length === 0 : h === href || h.indexOf(href + "/") === 0;
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (!parts.length) return dashboard();
    if (parts[0] === "register") return register();
    if (parts[0] === "users" && isApprover()) return users();
    if (parts[0] === "audit" && isReviewer()) return audit();
    if (parts[0] === "account") return account();
    if (parts[0] === "my-profile") {
      if (S.myFacultyId) return editor("faculty", S.myFacultyId);
      return main('<h1>My faculty profile</h1><div class="alert alert-info" role="note">No faculty profile is linked to your login yet. Ask the Department Administrator to link your profile (Faculty → Linked staff login).</div>');
    }
    if (parts[0] === "e" && ENTITIES[parts[1]]) {
      var t = parts[1];
      if (!parts[2]) return canWrite(t) ? listView(t) : denied();
      if (parts[2] === "new") return canWrite(t) && !(t === "faculty" && !isReviewer()) ? editor(t, null) : denied();
      return editor(t, parts[2]);
    }
    return main('<h1>Not found</h1><p><a href="#/">Go to dashboard</a></p>');
  }
  function denied() { main('<h1>Access denied</h1><div class="alert alert-error" role="alert">Your role does not have access to this section.</div>'); }

  /* ---------- Dashboard & register ---------- */
  function fetchSummary(t) {
    var e = ENTITIES[t];
    var cols = ["id", "status", "verification_status", "updated_at", "created_by", "source", "academic_year", "verified_by", "approved_by", e.title];
    cols = cols.filter(function (c, i) { return cols.indexOf(c) === i; });
    return sb.from(t).select(cols.join(",")).order("updated_at", { ascending: false }).limit(1000).then(function (res) {
      return { t: t, rows: res.data || [], error: res.error };
    });
  }
  function dashboard() {
    main('<h1>Dashboard</h1><p class="loading">Loading content summary…</p>');
    var ents = visibleEntities();
    Promise.all(ents.map(fetchSummary)).then(function (all) {
      var queue = [];
      var rowsHtml = all.map(function (g) {
        var c = {}; STATUS_ORDER.forEach(function (s) { c[s] = 0; }); var unv = 0;
        g.rows.forEach(function (r) {
          c[r.status] = (c[r.status] || 0) + 1;
          if (r.verification_status !== "verified") unv++;
          var title = r[ENTITIES[g.t].title] || "(untitled)";
          if (isApprover() && r.status === "reviewed") queue.push([g.t, r, "Ready to publish"]);
          else if (isReviewer() && r.status === "pending_review") queue.push([g.t, r, "Needs review"]);
          else if (!isReviewer() && r.status === "rejected" && r.created_by === S.user.id) queue.push([g.t, r, "Sent back to you"]);
          if (!isReviewer() && r.status === "draft" && r.created_by === S.user.id) queue.push([g.t, r, "Your draft"]);
          r._title = title;
        });
        return '<tr><th scope="row"><a href="#/e/' + g.t + '">' + esc(ENTITIES[g.t].label) + "</a>" + (g.error ? ' <span class="status status-rejected">Load error</span>' : "") + "</th>" +
          STATUS_ORDER.map(function (s) { return "<td>" + (c[s] || "") + "</td>"; }).join("") + '<td class="' + (unv ? "warn" : "") + '">' + unv + "</td></tr>";
      }).join("");
      var qHtml = queue.length ? '<ul class="queue">' + queue.slice(0, 50).map(function (q) {
        return '<li><a href="#/e/' + q[0] + "/" + encodeURIComponent(q[1].id) + '">' + esc(q[1]._title) + '</a> <span class="muted small">' + esc(ENTITIES[q[0]].label) + "</span> " + statusBadge(q[1].status) + ' <span class="tag">' + esc(q[2]) + "</span></li>";
      }).join("") + "</ul>" : '<p class="empty">Nothing is waiting for your action.</p>';
      main("<h1>Dashboard</h1>" +
        '<div class="alert alert-info" role="note"><strong>Workflow:</strong> Contributor creates a draft → submits for review → Department Administrator reviews &amp; verifies → HOD/Chairperson publishes. Only published, verified content with a source appears on the public website.</div>' +
        '<section class="panel"><h2>Awaiting your action</h2>' + qHtml + "</section>" +
        '<section class="panel"><h2>Content by status</h2><div class="table-wrap"><table><thead><tr><th scope="col">Section</th>' + STATUS_ORDER.map(function (s) { return '<th scope="col">' + esc(STATUS[s]) + "</th>"; }).join("") + '<th scope="col">Unverified</th></tr></thead><tbody>' + rowsHtml + "</tbody></table></div></section>");
    });
  }

  function csvCell(v) {
    var s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; /* formula-injection guard */
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function register() {
    main('<h1>Content verification register</h1><p class="loading">Loading…</p>');
    var ents = visibleEntities();
    Promise.all(ents.map(fetchSummary)).then(function (all) {
      var rows = [];
      all.forEach(function (g) {
        g.rows.forEach(function (r) {
          rows.push({ id: r.id, entity: ENTITIES[g.t].label, t: g.t, title: r[ENTITIES[g.t].title] || "(untitled)", source: r.source || "", year: r.academic_year || "",
            ver: r.verification_status, verifiedBy: personName(r.verified_by), approval: r.approved_by ? "Approved by " + personName(r.approved_by) : "Pending",
            updated: r.updated_at, status: r.status });
        });
      });
      var html = '<h1>Content verification register</h1><p class="muted">Every record, its source, verification and publication status. Information without a reliable source and an authorised approver must not be published.</p>' +
        '<div class="toolbar"><div class="field inline"><label for="rg-f">Show</label><select id="rg-f"><option value="">All records</option><option value="unverified">Unverified only</option><option value="nosource">Missing source</option><option value="published-unverified">Published but unverified</option></select></div>' +
        '<button class="btn" type="button" id="rg-csv">Export CSV</button></div><div class="table-wrap"><table><thead><tr><th scope="col">Content ID</th><th scope="col">Section</th><th scope="col">Title</th><th scope="col">Source</th><th scope="col">Academic year</th><th scope="col">Verification</th><th scope="col">Verified by</th><th scope="col">Approval</th><th scope="col">Last updated</th><th scope="col">Publication</th></tr></thead><tbody id="rg-body"></tbody></table></div>';
      main(html);
      function filtered() {
        var f = $("#rg-f").value;
        return rows.filter(function (r) {
          if (f === "unverified") return r.ver !== "verified";
          if (f === "nosource") return isBlank(r.source);
          if (f === "published-unverified") return r.status === "published" && r.ver !== "verified";
          return true;
        });
      }
      function draw() {
        var list = filtered();
        $("#rg-body").innerHTML = list.length ? list.map(function (r) {
          return '<tr><td><code>' + esc(shortId(r.id)) + "</code></td><td>" + esc(r.entity) + '</td><td><a href="#/e/' + r.t + "/" + encodeURIComponent(r.id) + '">' + esc(r.title) + "</a></td><td>" + (r.source ? esc(r.source) : '<span class="warn">Missing</span>') +
            "</td><td>" + esc(r.year) + "</td><td>" + (r.ver === "verified" ? '<span class="status status-published">Verified</span>' : '<span class="status status-pending_review">Pending</span>') + "</td><td>" + esc(r.verifiedBy) +
            "</td><td>" + esc(r.approval) + "</td><td>" + esc(fmtDT(r.updated)) + "</td><td>" + statusBadge(r.status) + "</td></tr>";
        }).join("") : '<tr><td colspan="10" class="empty">No records.</td></tr>';
      }
      $("#rg-f").addEventListener("input", draw);
      $("#rg-csv").addEventListener("click", function () {
        var head = ["Content ID", "Section", "Title", "Source", "Academic year", "Verification", "Verified by", "Approval", "Last updated", "Publication status"];
        var lines = [head.map(csvCell).join(",")].concat(filtered().map(function (r) {
          return [r.id, r.entity, r.title, r.source, r.year, r.ver, r.verifiedBy, r.approval, r.updated, STATUS[r.status] || r.status].map(csvCell).join(",");
        }));
        var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "verification-register-" + A.todayISO() + ".csv";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      });
      draw();
    });
  }

  /* ---------- Entity list ---------- */
  function listView(t) {
    var e = ENTITIES[t];
    main("<h1>" + esc(e.label) + '</h1><p class="loading">Loading…</p>');
    sb.from(t).select("*").order(e.order[0], { ascending: e.order[1] !== false, nullsFirst: false }).limit(1000).then(function (res) {
      if (res.error) { main("<h1>" + esc(e.label) + '</h1><div class="alert alert-error" role="alert">' + esc(friendlyError(res.error)) + "</div>"); return; }
      var rows = res.data || [];
      var canNew = canWrite(t) && !(t === "faculty" && !isReviewer());
      var cols = e.list.map(function (k) { var f = e.fields.filter(function (x) { return x.k === k; })[0]; return [k, f ? f.l : k === "academic_year" ? "Academic year" : k]; });
      main('<div class="title-row"><h1>' + esc(e.label) + "</h1>" + (canNew ? '<a class="btn btn-primary" href="#/e/' + t + '/new">Add new</a>' : "") + "</div>" +
        '<div class="toolbar"><div class="field inline"><label for="ls-q">Search</label><input id="ls-q" type="search" maxlength="80"></div>' +
        '<div class="field inline"><label for="ls-s">Status</label><select id="ls-s"><option value="">All</option>' + STATUS_ORDER.map(function (s) { return '<option value="' + s + '">' + esc(STATUS[s]) + "</option>"; }).join("") + "</select></div>" +
        '<label class="check"><input type="checkbox" id="ls-mine"> Only my records</label></div>' +
        '<div class="table-wrap"><table><thead><tr>' + cols.map(function (c) { return '<th scope="col">' + esc(c[1]) + "</th>"; }).join("") +
        '<th scope="col">Status</th><th scope="col">Verified</th><th scope="col">Updated</th></tr></thead><tbody id="ls-body"></tbody></table></div>');
      function draw() {
        var q = $("#ls-q").value.toLowerCase(), s = $("#ls-s").value, mine = $("#ls-mine").checked;
        var list = rows.filter(function (r) {
          if (s && r.status !== s) return false;
          if (mine && r.created_by !== S.user.id) return false;
          if (q && cols.map(function (c) { return r[c[0]]; }).join(" ").toLowerCase().indexOf(q) === -1) return false;
          return true;
        });
        $("#ls-body").innerHTML = list.length ? list.map(function (r) {
          return "<tr>" + cols.map(function (c, i) {
            var v = r[c[0]]; v = v === true ? "Yes" : v === false ? "" : v;
            return i === 0 ? '<td><a href="#/e/' + t + "/" + encodeURIComponent(r.id) + '">' + esc(isBlank(v) ? "(untitled)" : v) + "</a></td>" : "<td>" + esc(v) + "</td>";
          }).join("") + "<td>" + statusBadge(r.status) + "</td><td>" + (r.verification_status === "verified" ? "Yes" : '<span class="warn">No</span>') + "</td><td>" + esc(fmtDT(r.updated_at)) + "</td></tr>";
        }).join("") : '<tr><td colspan="' + (cols.length + 3) + '" class="empty">No records found.</td></tr>';
      }
      ["#ls-q", "#ls-s", "#ls-mine"].forEach(function (x) { $(x).addEventListener("input", draw); });
      draw();
    });
  }

  /* ---------- Editor ---------- */
  function fieldHtml(f, v, t) {
    var id = "f_" + f.k;
    var reqMark = f.req ? ' <span class="req" aria-hidden="true">*</span><span class="sr-only"> (required)</span>' : "";
    var help = f.help ? '<p class="help" id="' + id + '_h">' + esc(f.help) + "</p>" : "";
    var desc = f.help ? ' aria-describedby="' + id + '_h"' : "";
    var req = f.req ? " required" : "";
    var val = v === null || v === undefined ? "" : v;
    if (f.t === "checkbox") {
      return '<div class="field field-check"><label class="check"><input type="checkbox" id="' + id + '"' + (v ? " checked" : "") + desc + "> " + esc(f.l) + "</label>" + help + "</div>";
    }
    var label = '<label for="' + id + '">' + esc(f.l) + reqMark + "</label>";
    var input;
    switch (f.t) {
      case "textarea":
        input = '<textarea id="' + id + '" rows="' + (f.rows || 4) + '"' + req + desc + ' maxlength="20000">' + esc(val) + "</textarea>"; break;
      case "select":
        input = '<select id="' + id + '"' + req + desc + '><option value="">— Select —</option>' + f.opts.map(function (o) {
          return '<option value="' + esc(o) + '"' + (String(o) === String(val) ? " selected" : "") + ">" + esc(o) + "</option>";
        }).join("") + "</select>"; break;
      case "ref":
      case "profile":
        var opts = f.t === "ref" ? S.refs[f.ref] : S.profiles.map(function (p) { return { id: p.id, label: (p.full_name || "(no name)") + " — " + (p.email || "") }; });
        input = '<select id="' + id + '"' + desc + '><option value="">— None —</option>' + opts.map(function (o) {
          return '<option value="' + esc(o.id) + '"' + (o.id === val ? " selected" : "") + ">" + esc(o.label) + "</option>";
        }).join("") + "</select>"; break;
      case "number":
        input = '<input type="number" id="' + id + '" step="1" inputmode="numeric" value="' + esc(val) + '"' + (f.min !== undefined ? ' min="' + f.min + '"' : "") + (f.max !== undefined ? ' max="' + f.max + '"' : "") + req + desc + ">"; break;
      case "date":
        input = '<input type="date" id="' + id + '" value="' + esc(String(val).slice(0, 10)) + '"' + req + desc + ">"; break;
      case "upload":
        input = '<div class="upload"><input type="url" id="' + id + '" value="' + esc(val) + '" placeholder="https://… (or upload a file)"' + req + desc + ' maxlength="1000">' +
          '<label class="btn btn-small file-btn">Upload file<input type="file" class="file-input" data-target="' + id + '" data-entity="' + esc(t) + '" accept="' + esc(f.accept || ANY) + '"></label>' +
          '<span class="upload-status small muted" id="' + id + '_st"></span></div>' +
          '<p class="help">Uploads are PUBLIC. ' + (f.accept === IMG ? "JPG, PNG or WebP" : f.accept === PDF ? "PDF only" : "PDF, JPG, PNG or WebP") + ', max ' + esc(CFG.MAX_UPLOAD_MB || 10) + ' MB. Never upload confidential records.</p>'; break;
      default:
        input = '<input type="' + (f.t === "url" ? "url" : f.t === "email" ? "email" : "text") + '" id="' + id + '" value="' + esc(val) + '"' + req + desc + ' maxlength="' + (f.max || 500) + '">';
    }
    return '<div class="field">' + label + input + help + "</div>";
  }

  function readField(f) {
    var el = document.getElementById("f_" + f.k);
    if (!el) return undefined;
    if (f.t === "checkbox") return el.checked;
    var v = el.value.trim();
    if (v === "") return null;
    if (f.t === "number") return Number(v);
    return v;
  }

  function validate(e, data) {
    var errs = [];
    e.fields.forEach(function (f) {
      if (f.reviewerOnly && !isReviewer()) return;
      var v = data[f.k];
      if (f.req && (v === null || v === undefined || v === "")) errs.push(f.l + " is required.");
      if (v === null || v === undefined) return;
      if ((f.t === "url" || f.t === "upload") && !A.safeUrl(v)) errs.push(f.l + " must start with https:// (or be uploaded).");
      if (f.t === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs.push(f.l + " is not a valid email address.");
      if (f.t === "number") {
        if (!Number.isInteger(v)) errs.push(f.l + " must be a whole number.");
        else if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) errs.push(f.l + " is outside the allowed range.");
      }
    });
    if (e.requireYear && isBlank(data.academic_year)) errs.push("Academic year is required for this record.");
    if (!isBlank(data.academic_year) && !/^\d{4}[–-]\d{2}$/.test(data.academic_year)) errs.push("Academic year must look like 2025–26.");
    if (data.start_date && data.end_date && data.end_date < data.start_date) errs.push("End date cannot be before start date.");
    if (typeof data.placed === "number" && typeof data.eligible === "number" && data.placed > data.eligible) errs.push("Students placed cannot exceed eligible students.");
    return errs;
  }

  function editor(t, id) {
    var e = ENTITIES[t];
    main("<h1>" + esc(e.label) + '</h1><p class="loading">Loading…</p>');
    var load = id ? sb.from(t).select("*").eq("id", id).maybeSingle() : Promise.resolve({ data: { status: "draft", verification_status: "pending" }, error: null });
    Promise.resolve(load).then(function (res) {
      if (res.error) { main("<h1>" + esc(e.label) + '</h1><div class="alert alert-error" role="alert">' + esc(friendlyError(res.error)) + "</div>"); return; }
      if (!res.data) { main("<h1>Record not found</h1><p>It may have been deleted, or you do not have access.</p><p><a href=\"#/e/" + t + '">Back to list</a></p>'); return; }
      renderEditor(t, id, res.data);
    });
  }

  function renderEditor(t, id, row) {
    var e = ENTITIES[t];
    var me = S.user.id;
    var isNew = !id;
    var isOwner = isNew || row.created_by === me;
    var ownFaculty = t === "faculty" && role() === "faculty" && row.user_id === me;
    var canEdit = isReviewer() || (row.status !== "published" && ((canWrite(t) && isOwner && t !== "faculty") || ownFaculty));
    var st = row.status || "draft";

    var heading = isNew ? "Add new — " + e.label : (row[e.title] || "Edit record");
    var meta = isNew ? "" : '<p class="meta">' + statusBadge(st) + " · Verification: <strong>" + (row.verification_status === "verified" ? "Verified" + (row.verified_by ? " by " + esc(personName(row.verified_by)) : "") : "Pending") + "</strong>" +
      " · Created by " + esc(personName(row.created_by) || "system seed") + " · Updated " + esc(fmtDT(row.updated_at)) +
      (row.published_at ? " · Published " + esc(fmtDT(row.published_at)) + (row.approved_by ? " by " + esc(personName(row.approved_by)) : "") : "") + " · ID <code>" + esc(shortId(row.id)) + "</code></p>";
    var lockMsg = "";
    if (!canEdit) {
      lockMsg = '<div class="alert alert-info" role="note">' + (row.status === "published"
        ? "This record is published. Only the Department Administrator, HOD or Super Administrator can change it."
        : "You can view this record but not edit it. Only its creator or a reviewer can make changes.") + "</div>";
    }
    var note = !isBlank(row.review_note) ? '<div class="alert alert-warn" role="note"><strong>Reviewer note:</strong> ' + esc(row.review_note) + "</div>" : "";

    var fields = e.fields.filter(function (f) { return !f.reviewerOnly || isReviewer(); }).map(function (f) { return fieldHtml(f, row[f.k], t); }).join("");
    var common =
      '<fieldset class="workflow"><legend>Source &amp; verification</legend>' +
      fieldHtml(F("academic_year", "Academic year", "text", { req: !!e.requireYear, help: "Format 2025–26. Required for statistics; recommended for everything time-bound." }), row.academic_year, t) +
      fieldHtml(F("source", "Source", "text", { help: "Document, person or official web page this information comes from. Required before publication." }), row.source, t) +
      (isReviewer()
        ? fieldHtml(F("verification_status", "I have verified this information against its source", "checkbox", { help: "Required before the HOD can publish. Contributor edits automatically reset verification." }), row.verification_status === "verified", t) +
          fieldHtml(F("review_note", "Review note to contributor", "textarea", { rows: 3, help: "Required when sending content back." }), row.review_note, t)
        : '<p class="help">Verification and review notes are set by the Department Administrator, HOD or Super Administrator.</p>') +
      "</fieldset>";

    var btns = [];
    if (canEdit) {
      if (st === "published") btns.push(["save", "Save changes", "btn-primary"]);
      else {
        btns.push(["draft", isNew ? "Save as draft" : "Save draft", ""]);
        if (["draft", "rejected", "pending_review", "reviewed"].indexOf(st) !== -1 || isNew) btns.push(["submit", st === "pending_review" ? "Save & keep in review" : "Submit for review", "btn-primary"]);
      }
      if (isReviewer() && ["draft", "pending_review", "rejected"].indexOf(st) !== -1) btns.push(["reviewed", "Mark as reviewed", ""]);
      if (isReviewer() && ["pending_review", "reviewed"].indexOf(st) !== -1 && !isNew) btns.push(["sendback", "Send back with note", "btn-warn"]);
      if (isApprover() && st !== "published" && st !== "archived") btns.push(["publish", "Verify & publish", "btn-success"]);
      if (isApprover() && st === "published") btns.push(["archive", "Archive (unpublish)", "btn-warn"]);
      if (isApprover() && st === "archived") btns.push(["restore", "Restore to draft", ""]);
    }
    var canDelete = !isNew && (isReviewer() || (isOwner && st === "draft" && canWrite(t) && t !== "faculty"));

    main('<p><a href="' + (ownFaculty && !isReviewer() ? "#/" : "#/e/" + t) + '">' + (ownFaculty && !isReviewer() ? "&larr; Dashboard" : "&larr; " + esc(e.label)) + "</a></p>" +
      "<h1>" + esc(heading) + "</h1>" + meta + lockMsg + note +
      '<div id="ed-err" class="alert alert-error hidden" role="alert" tabindex="-1"></div>' +
      '<form id="ed-form" novalidate><fieldset class="plain"' + (canEdit ? "" : " disabled") + ">" + fields + common + "</fieldset>" +
      '<div class="actions">' + btns.map(function (b) { return '<button type="button" class="btn ' + b[2] + '" data-act="' + b[0] + '">' + esc(b[1]) + "</button>"; }).join("") +
      (canDelete ? '<button type="button" class="btn btn-danger" data-act="delete">Delete</button>' : "") + "</div></form>");

    if (!canEdit) return;
    $$(".file-input").forEach(function (inp) { inp.addEventListener("change", onUpload); });
    $("#ed-form").addEventListener("submit", function (ev) { ev.preventDefault(); });
    $$("[data-act]").forEach(function (b) { b.addEventListener("click", function () { act(b, t, id, row); }); });
  }

  function showErrors(list) {
    var box = $("#ed-err");
    box.innerHTML = list.length === 1 ? esc(list[0]) : "<ul>" + list.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
    box.classList.remove("hidden");
    box.focus();
  }

  function act(btn, t, id, row) {
    var e = ENTITIES[t];
    var a = btn.getAttribute("data-act");
    if (a === "delete") return doDelete(t, id);

    var data = {};
    e.fields.forEach(function (f) { if (!f.reviewerOnly || isReviewer()) data[f.k] = readField(f); });
    data.academic_year = readField(F("academic_year", "", "text"));
    data.source = readField(F("source", "", "text"));
    if (isReviewer()) {
      data.verification_status = readField(F("verification_status", "", "checkbox")) ? "verified" : "pending";
      data.review_note = readField(F("review_note", "", "textarea"));
    }
    if (data.academic_year) data.academic_year = data.academic_year.replace("-", "–");

    var errs = validate(e, data);
    var next = row.status || "draft";
    if (a === "draft") next = "draft";
    else if (a === "submit") next = "pending_review";
    else if (a === "reviewed") next = "reviewed";
    else if (a === "sendback") { next = "rejected"; if (isBlank(data.review_note)) errs.push("Add a review note explaining what must be corrected."); }
    else if (a === "publish") {
      next = "published";
      if (data.verification_status !== "verified") errs.push("Tick “I have verified this information against its source” before publishing.");
      if (isBlank(data.source)) errs.push("A source is required before publication.");
      if (t === "alumni" && !data.consent) errs.push("Alumni consent must be recorded before publication.");
    } else if (a === "archive") next = "archived";
    else if (a === "restore") next = "draft";
    else if (a === "save" && next === "published") {
      if (data.verification_status !== "verified") errs.push("Published content must remain verified. Tick the verification box, or archive the record first.");
      if (isBlank(data.source)) errs.push("A source is required for published content.");
    }
    if (errs.length) { showErrors(errs); return; }
    if (a === "archive" && !window.confirm("Archive this record? It will be removed from the public website.")) return;
    if (a === "publish" && !window.confirm("Publish this record to the public website?")) return;

    data.status = next;
    busy(btn, true);
    var q = id ? sb.from(t).update(data).eq("id", id).select().maybeSingle() : sb.from(t).insert(data).select().maybeSingle();
    Promise.resolve(q).then(function (res) {
      busy(btn, false);
      if (res.error) { showErrors([friendlyError(res.error)]); return; }
      if (!res.data) { showErrors(["You do not have permission to change this record."]); return; }
      var msg = { draft: "Saved as draft.", submit: "Submitted for review.", reviewed: "Marked as reviewed.", sendback: "Sent back to the contributor.", publish: "Published to the website.", archive: "Archived.", restore: "Restored to draft.", save: "Changes saved." }[a];
      toast(msg, "ok");
      if (t === "faculty" || t === "events") loadRefs();
      if (!id) go("#/e/" + t + "/" + encodeURIComponent(res.data.id));
      else renderEditor(t, id, res.data);
    }, function (err) { busy(btn, false); showErrors([friendlyError(err)]); });
  }

  function doDelete(t, id) {
    if (!window.confirm("Permanently delete this record? This is recorded in the audit log and cannot be undone.")) return;
    sb.from(t).delete().eq("id", id).select().then(function (res) {
      if (res.error) { showErrors([friendlyError(res.error)]); return; }
      if (!res.data || !res.data.length) { showErrors(["You do not have permission to delete this record."]); return; }
      toast("Record deleted.", "ok");
      if (t === "faculty" || t === "events") loadRefs();
      go("#/e/" + t);
    });
  }

  var ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  function onUpload(ev) {
    var inp = ev.target;
    var file = inp.files && inp.files[0];
    var target = document.getElementById(inp.getAttribute("data-target"));
    var stEl = document.getElementById(inp.getAttribute("data-target") + "_st");
    if (!file || !target) return;
    var maxMb = Number(CFG.MAX_UPLOAD_MB) || 10;
    var accept = (inp.getAttribute("accept") || "").split(",");
    if (ALLOWED_TYPES.indexOf(file.type) === -1 || accept.indexOf(file.type) === -1) { stEl.textContent = "File type not allowed for this field."; inp.value = ""; return; }
    if (file.size > maxMb * 1024 * 1024) { stEl.textContent = "File is larger than " + maxMb + " MB."; inp.value = ""; return; }
    var ext = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    var base = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "file";
    var rand = Math.random().toString(36).slice(2, 10);
    var path = inp.getAttribute("data-entity") + "/" + new Date().getFullYear() + "/" + Date.now() + "-" + rand + "-" + base + "." + ext;
    stEl.textContent = "Uploading…";
    inp.disabled = true;
    var bucket = CFG.STORAGE_BUCKET || "dept-public";
    sb.storage.from(bucket).upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type }).then(function (res) {
      inp.disabled = false; inp.value = "";
      if (res.error) { stEl.textContent = "Upload failed: " + friendlyError(res.error); return; }
      var pub = sb.storage.from(bucket).getPublicUrl(path);
      target.value = pub && pub.data ? pub.data.publicUrl : "";
      stEl.textContent = "Uploaded. Remember to save the record.";
    }, function (err) { inp.disabled = false; stEl.textContent = "Upload failed: " + friendlyError(err); });
  }

  /* ---------- Users ---------- */
  function users() {
    main('<h1>Users &amp; roles</h1><p class="loading">Loading…</p>');
    sb.from("profiles").select("*").order("created_at", { ascending: true }).then(function (res) {
      if (res.error) { main('<h1>Users &amp; roles</h1><div class="alert alert-error" role="alert">' + esc(friendlyError(res.error)) + "</div>"); return; }
      S.profiles = res.data || [];
      var amSuper = role() === "super_admin";
      var rows = S.profiles.map(function (p) {
        var self = p.id === S.user.id;
        var locked = self || (!amSuper && p.role === "super_admin");
        var roleOpts = ROLES.filter(function (r) { return amSuper || r[0] !== "super_admin" || p.role === "super_admin"; }).map(function (r) {
          return '<option value="' + r[0] + '"' + (p.role === r[0] ? " selected" : "") + ">" + esc(r[1]) + "</option>";
        }).join("");
        return '<tr data-id="' + esc(p.id) + '"><td><input type="text" class="u-name" aria-label="Full name for ' + esc(p.email || "") + '" value="' + esc(p.full_name || "") + '" maxlength="120"' + (locked && !self ? " disabled" : "") + "></td><td>" + esc(p.email || "") +
          '</td><td><select class="u-role" aria-label="Role for ' + esc(p.email || "") + '"' + (locked ? " disabled" : "") + ">" + roleOpts + '</select></td><td><label class="check"><input type="checkbox" class="u-active"' + (p.is_active ? " checked" : "") + (locked ? " disabled" : "") + "> Active</label></td>" +
          '<td><button type="button" class="btn btn-small u-save"' + (locked && !self ? " disabled" : "") + ">Save</button>" + (self ? ' <span class="small muted">(you)</span>' : "") + "</td></tr>";
      }).join("");
      main('<h1>Users &amp; roles</h1><div class="alert alert-info" role="note"><strong>Adding a user:</strong> Supabase dashboard → Authentication → Users → “Add user” (or invite). The person then appears here as inactive; assign a role and activate. Deactivate staff who leave the department immediately. Keep at least two people able to administer the website.</div>' +
        '<div class="table-wrap"><table><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>");
      $$(".u-save").forEach(function (b) {
        b.addEventListener("click", function () {
          var tr = b.closest("tr"), pid = tr.getAttribute("data-id");
          var upd = { full_name: $(".u-name", tr).value.trim() };
          if (!$(".u-role", tr).disabled) { upd.role = $(".u-role", tr).value; upd.is_active = $(".u-active", tr).checked; }
          busy(b, true);
          sb.from("profiles").update(upd).eq("id", pid).select().maybeSingle().then(function (r) {
            busy(b, false);
            if (r.error) { toast(friendlyError(r.error), "err"); return; }
            if (!r.data) { toast("You do not have permission to change this user.", "err"); return; }
            toast("User updated.", "ok");
          });
        });
      });
    });
  }

  /* ---------- Audit ---------- */
  function audit() {
    main('<h1>Audit log</h1><p class="loading">Loading…</p>');
    sb.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(300).then(function (res) {
      if (res.error) { main('<h1>Audit log</h1><div class="alert alert-error" role="alert">' + esc(friendlyError(res.error)) + "</div>"); return; }
      var rows = (res.data || []).map(function (l) {
        var label = ENTITIES[l.table_name] ? ENTITIES[l.table_name].label : l.table_name;
        var link = ENTITIES[l.table_name] && l.action !== "DELETE" ? '<a href="#/e/' + esc(l.table_name) + "/" + encodeURIComponent(l.record_id) + '"><code>' + esc(shortId(l.record_id)) + "</code></a>" : "<code>" + esc(shortId(l.record_id)) + "</code>";
        var change = l.old_status !== l.new_status && (l.old_status || l.new_status) ? esc(STATUS[l.old_status] || l.old_status || "—") + " → " + esc(STATUS[l.new_status] || l.new_status || "—") : "";
        return "<tr><td>" + esc(fmtDT(l.created_at)) + "</td><td>" + esc(personName(l.actor) || "System") + "</td><td>" + esc(l.action) + "</td><td>" + esc(label) + "</td><td>" + link + "</td><td>" + change +
          '</td><td class="small">' + esc((l.changed_fields || []).join(", ")) + "</td></tr>";
      }).join("");
      main('<h1>Audit log</h1><p class="muted">Latest 300 changes. Entries are written by the database and cannot be edited or deleted through this portal.</p><div class="table-wrap"><table><thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Section</th><th scope="col">Record</th><th scope="col">Status change</th><th scope="col">Fields changed</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="7" class="empty">No entries yet.</td></tr>') + "</tbody></table></div>");
    });
  }

  /* ---------- Account ---------- */
  function account() {
    main('<h1>My account</h1><dl class="facts"><div><dt>Email</dt><dd>' + esc(S.user.email || "") + "</dd></div><div><dt>Role</dt><dd>" + esc((ROLES.filter(function (r) { return r[0] === role(); })[0] || [, role()])[1]) + "</dd></div></dl>" +
      '<section class="panel"><h2>Change password</h2><div id="pw-err" class="alert alert-error hidden" role="alert"></div><form id="pw-form" novalidate>' +
      '<div class="field"><label for="pw1">New password</label><input id="pw1" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div>' +
      '<div class="field"><label for="pw2">Confirm new password</label><input id="pw2" type="password" autocomplete="new-password" maxlength="128" required></div>' +
      '<button class="btn btn-primary" type="submit">Update password</button></form></section>');
    $("#pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var p1 = $("#pw1").value, p2 = $("#pw2").value, err = $("#pw-err");
      var prob = passwordProblem(p1) || (p1 !== p2 ? "Passwords do not match." : "");
      if (prob) { err.textContent = prob; err.classList.remove("hidden"); return; }
      sb.auth.updateUser({ password: p1 }).then(function (res) {
        if (res.error) { err.textContent = friendlyError(res.error); err.classList.remove("hidden"); return; }
        err.classList.add("hidden"); $("#pw-form").reset(); toast("Password updated.", "ok");
      });
    });
  }

  boot();
})();
