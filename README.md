# VTU CSE Department Website — Deployment & Handover Guide

Department of Computer Science and Engineering, Visvesvaraya Technological University, Jnana Sangama, Belagavi.
Status: **independent prototype for departmental review**. It is not the official VTU website until the department approves it.

---

## 1. What this is

| Part | What it does |
|---|---|
| Public website (16 pages) | Home, About, Academics, People, Research, Infrastructure, Students, Placements, Activities, Notices, Alumni, Resources, Gallery, Contact, Search, 404 |
| Admin portal (`/admin`) | Secure login, dashboard, content editor for 19 content types, draft → review → approval → publish workflow, verification register (CSV export), users & roles, audit log, password reset |
| Database (`schema.sql`) | Supabase/PostgreSQL with Row Level Security, workflow trigger, audit log, storage bucket with type/size limits |

**Flat structure.** Every file sits at the top level. No build step, no `npm install`, no framework. Vercel serves it as a static site.

### Why not Next.js (as the planning document recommended)?
You asked for a flat zip with no sub-folders. Next.js cannot work without `app/` or `pages/` folders, and Vercel serverless functions need an `api/` folder. So the site is plain HTML/CSS/JS talking directly to Supabase, with all security enforced **inside the database** (RLS + triggers). This is a valid, secure architecture — but be clear about the trade-off: pages are rendered in the browser, so search-engine indexing of dynamic content is weaker than server-rendered Next.js. If SEO becomes a priority, migrate to Next.js in Phase 3 (the database stays the same).

---

## 2. Files

| File | Purpose |
|---|---|
| `index.html` … `404.html` | Page shells (title, meta description, scripts) |
| `admin.html`, `admin.js` | Administration portal |
| `app.js` | Shared core: escaping, data loading, header/footer |
| `pages.js` | Public page renderers |
| `config.js` | **The only file you edit**: Supabase keys, prototype banner, institutional facts |
| `data.js` | Built-in baseline content used when no database is connected |
| `styles.css` | Design system (responsive, accessible) |
| `supabase.min.js` | Official Supabase JS client v2.119.2 (bundled locally; MIT licence in `SUPABASE-JS-LICENSE.txt`) |
| `schema.sql` | Complete database setup — run in Supabase SQL Editor |
| `vercel.json` | Clean URLs + security headers (CSP, HSTS, X-Frame-Options…) |
| `.vercelignore` | Keeps `schema.sql` and this README off the public site |
| `robots.txt`, `favicon.svg` | SEO / branding basics |

---

## 3. Deploy in two stages

### Stage A — Prototype (5 minutes, no database)
1. Create a new GitHub repository. Upload **all files** from the zip to the repository root (include `.vercelignore` — it is a hidden file; on Windows/Mac enable "show hidden files").
2. Vercel → Add New → Project → import the repo. Framework preset: **Other**. Build command: *empty*. Output directory: *empty*. Deploy.
3. The site runs on the baseline content from `data.js`. The admin page will say "Database not connected". This is the version to demonstrate to the department.

### Stage B — Live with administration portal
1. Create a Supabase project (choose the Mumbai region for India).
2. Supabase → **SQL Editor** → New query → paste the whole `schema.sql` → **Run**. It is safe to run again later.
3. Supabase → **Authentication → Providers/Settings**: turn **off** "Allow new users to sign up". (Even if left on, new sign-ups get an inactive account with no permissions — but turn it off.)
4. Supabase → Authentication → **URL Configuration**: Site URL = your Vercel URL; add `https://YOUR-DOMAIN/admin` to Redirect URLs (needed for password reset emails).
5. Supabase → Authentication → Users → **Add user** (your email + strong password).
6. SQL Editor → run (with your email):
   ```sql
   update public.profiles set role = 'super_admin', is_active = true, full_name = 'Your Name'
   where email = 'you@example.com';
   ```
7. **Already done in this build:** `config.js` is connected to project `jsuyshliihapszqpkary.supabase.co` with its publishable key. Until you complete steps 2–6, the public site automatically shows the built-in baseline content (footer says "Database temporarily unavailable") — it will not break.
8. Open `/admin`, sign in. Add the HOD and department administrator in Supabase (Add user), then activate them in **Users & roles**.

> **Never** put the `service_role` / `sb_secret_…` key in `config.js`. The anon key is public by design; the database policies are what protect the data.
> If you later use a custom Supabase domain, add it to `connect-src` in `vercel.json`.

---

## 4. Roles and workflow (enforced in the database, not just the UI)

| Role | Can do |
|---|---|
| Super Administrator | Everything, including granting Super Administrator |
| HOD / Chairperson | Review, verify, **publish**, archive, manage users (except super admins) |
| Department Administrator | Create/edit all content, review, verify, send back — **cannot publish** |
| Faculty Member | Publications, projects, IPR; edit own linked profile (unpublished) |
| Research Coordinator | Research areas, publications, projects, IPR, scholars, laboratories |
| Event Coordinator | Notices, events, gallery |
| Student Coordinator | Achievements, projects, clubs, alumni |

Workflow: **Draft → Pending review → Reviewed (verified) → Published → Archived**, with "Sent back" for corrections.

Hard rules the database enforces (tested — 46 role-based tests + 37 end-to-end browser tests passed):
- Public visitors only ever see `published` rows.
- Nothing can be published unless it is **verified** and has a **source**.
- Only HOD/Super Admin can publish or archive. Only reviewers can verify.
- A contributor's edit resets verification; contributors cannot touch published content.
- Users cannot change their own role or activation; HOD cannot create or remove super admins.
- Alumni profiles cannot be published without recorded consent. Placed ≤ eligible.
- Every insert/update/delete is written to an audit log that nobody can edit through the API.
- Uploads: PDF/JPG/PNG/WebP only, max 10 MB, staff only. **The bucket is public — never upload confidential files.**

**Known limitation (deliberate for Release 1):** faculty cannot edit their own profile once it is published; the Department Administrator makes the change. Proper revision copies ("edit a published page without unpublishing it") is a Phase 3 feature.

---

## 5. Content you MUST collect before removing the prototype banner

The site deliberately shows "To verify" / "Pending departmental approval" instead of invented data. Seeded rows are marked **verification pending**; editing a seeded published row forces you to verify it first.

Must be reconfirmed with the department: Chairperson (Dr. S. A. Angadi), establishment year (2002–2003), department email, the 6 programmes and their ownership (B.Tech CSE and B.Tech AI & DS are intentionally **excluded** until ownership is confirmed), intake, eligibility, research areas.

Still to be collected (nothing invented): official vision & mission, PEOs/POs/PSOs, chairperson's message & photo, full faculty list with CVs and photos (e.g. the Vivekanandreddy profile referenced in the research — designation not yet verified), staff, laboratories, syllabus PDFs, academic calendar, 3 years of **department-specific** placement data, publications, projects, IPR with valid numbers, student achievements with evidence, event reports, alumni with consent, approved VTU logo and brand colour, office phone number.

Use **Admin → Verification register** (CSV export) as the tracking sheet.

Then set `PROTOTYPE_MODE: false`, `LOGO_URL`, `HERO_IMAGE_URL` and the `--accent` colour in `styles.css`.

---

## 6. Requirement traceability (from the planning document)

| Requirement | Status |
|---|---|
| FR-001–FR-014 (navigation, search, faculty directory, programmes, downloads, notice board, events, research repository, achievements, placement dashboard, gallery, contact, responsive, accessibility) | Done |
| ADM-001–ADM-012 (login, dashboard, notice/event/faculty/academic/research/document/gallery management, users, approval workflow, audit) | Done |
| 7 roles, access-control rules | Done (database-enforced) |
| Content verification register (9.2) | Done (with CSV export) |
| NFR security: RLS, protected admin, input validation, upload restrictions, audit, secure password reset, CSP/HSTS headers | Done |
| NFR accessibility (WCAG 2.2 AA target) | Semantic landmarks, skip link, labels, keyboard focus, contrast, reduced motion. **Run a formal audit before launch.** |
| Rate limiting on login | Supabase Auth built-in limits + client lockout after 5 failures |
| Backups (NFR-007, QA-014) | **Not automatic on the free plan.** Use Supabase Pro (daily backups) or schedule `pg_dump`, and test a restore before launch. |
| sitemap.xml | Not included — create it once the final domain is known (a sitemap with a wrong domain is worse than none). |
| Rejected for Release 1 | AI chatbot, LMS, exam system, social network, custom placement portal, 3D homepage — as recommended. |

---

## 7. Pre-launch checklist
- [ ] Department confirms it wants the site and who owns it (written)
- [ ] University approves hosting on Supabase/Vercel (data-handling)
- [ ] Official logo/brand approval obtained
- [ ] All seeded rows verified in the Verification register
- [ ] At least **two** active administrators (HOD + Dept Admin)
- [ ] Sign-up disabled, redirect URL set, password reset tested
- [ ] Backup + restore tested
- [ ] Prototype banner switched off only after sign-off (QA-015)
