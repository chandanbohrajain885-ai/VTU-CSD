set client_min_messages = warning;

-- =====================================================================
-- VTU CSE Department Website — Supabase database schema
-- Run the WHOLE file in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run (idempotent). Re-running never deletes your content.
--
-- What this creates
--   * 19 content tables with a common workflow/verification block
--   * profiles + roles (7 staff roles), role_permissions
--   * Row Level Security on every table (public sees PUBLISHED rows only)
--   * Workflow trigger: draft -> pending_review -> reviewed -> published
--       - only HOD / Super Administrator can publish or archive
--       - only Dept Admin / HOD / Super Admin can review, verify or send back
--       - published content must be VERIFIED and have a SOURCE
--       - contributor edits reset verification; published rows are locked for contributors
--   * Audit log of every insert / update / delete (who, what, when)
--   * Public storage bucket with file-type and size limits
--   * Baseline seed content taken from public VTU pages (verification: pending)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Profiles and roles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        text not null default 'faculty',
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in
    ('super_admin','hod','dept_admin','faculty','research_coordinator','event_coordinator','student_coordinator'));
exception when duplicate_object then null; end $$;

create table if not exists public.role_permissions (
  role   text not null,
  entity text not null,
  primary key (role, entity)
);

-- Contributor roles and the content they may create. dept_admin, hod and
-- super_admin can manage ALL content (see is_reviewer()).
insert into public.role_permissions (role, entity) values
  ('faculty','publications'), ('faculty','research_projects'), ('faculty','ipr'),
  ('research_coordinator','research_areas'), ('research_coordinator','publications'),
  ('research_coordinator','research_projects'), ('research_coordinator','ipr'),
  ('research_coordinator','research_scholars'), ('research_coordinator','laboratories'),
  ('event_coordinator','events'), ('event_coordinator','notices'), ('event_coordinator','gallery'),
  ('student_coordinator','student_achievements'), ('student_coordinator','student_projects'),
  ('student_coordinator','student_clubs'), ('student_coordinator','alumni')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Role helper functions (SECURITY DEFINER, fixed search_path)
-- ---------------------------------------------------------------------
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.app_role() is not null
$$;

create or replace function public.is_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('super_admin','hod','dept_admin'), false)
$$;

create or replace function public.is_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('super_admin','hod'), false)
$$;

create or replace function public.can_write(p_entity text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_reviewer()
      or exists (select 1 from public.role_permissions rp
                 where rp.role = public.app_role() and rp.entity = p_entity)
$$;

revoke all on function public.app_role() from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_reviewer() from public;
revoke all on function public.is_approver() from public;
revoke all on function public.can_write(text) from public;
grant execute on function public.app_role(), public.is_staff(), public.is_reviewer(), public.is_approver(), public.can_write(text) to anon, authenticated, service_role;

-- New auth users get an INACTIVE profile. A Super Administrator or HOD must activate it.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this script ran.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

-- Guard: no self-escalation, only super_admin manages super_admins.
create or replace function public.guard_profiles() returns trigger
language plpgsql set search_path = public as $$
declare v_role text := public.app_role();
begin
  new.updated_at := now();
  if current_user not in ('anon', 'authenticated') then
    return new;  -- SQL editor / service role
  end if;
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;
  if coalesce(v_role, '') not in ('super_admin', 'hod') then
    if old.id <> auth.uid() then
      raise exception 'Not allowed to edit other users' using errcode = '42501';
    end if;
    new.role := old.role;
    new.is_active := old.is_active;
    return new;
  end if;
  if old.id = auth.uid() and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'You cannot change your own role or activation status' using errcode = '42501';
  end if;
  if v_role <> 'super_admin' and (old.role = 'super_admin' or new.role = 'super_admin')
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'Only a Super Administrator can grant, remove or deactivate the Super Administrator role' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_profiles on public.profiles;
create trigger guard_profiles before update on public.profiles
  for each row execute function public.guard_profiles();

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.app_role() in ('super_admin', 'hod'))
  with check (id = auth.uid() or public.app_role() in ('super_admin', 'hod'));

alter table public.role_permissions enable row level security;
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 3. Content tables (type-specific columns; common columns added in step 4)
-- ---------------------------------------------------------------------
create table if not exists public.dept_content (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('about','history','vision','mission','objectives','peo','po','pso','org_structure','chair_message')),
  title text not null,
  body text
);

create table if not exists public.programmes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  level text not null check (level in ('UG','PG','Research')),
  degree text, duration text, eligibility text, intake text,
  description text, syllabus_url text,
  sort_order int not null default 100
);

create table if not exists public.faculty (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  designation text, qualification text, specialisation text, experience text,
  email text, photo_url text, research_interests text, profile_url text,
  memberships text, responsibilities text,
  is_leadership boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  sort_order int not null default 100
);

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, designation text, email text, photo_url text,
  sort_order int not null default 100
);

create table if not exists public.research_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text,
  sort_order int not null default 100
);

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  title text not null, authors text, venue text,
  pub_type text check (pub_type in ('Journal','Conference','Book','Book chapter','Other')),
  pub_year int check (pub_year between 1950 and 2100),
  url text, research_area text,
  faculty_id uuid references public.faculty(id) on delete set null
);

create table if not exists public.research_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text check (category in ('Funded research','Consultancy','Collaboration','Internal')),
  investigator text, partner_or_funder text, amount text,
  start_year int check (start_year between 1950 and 2100),
  end_year int check (end_year between 1950 and 2100),
  project_status text check (project_status in ('Ongoing','Completed')),
  description text,
  faculty_id uuid references public.faculty(id) on delete set null
);

create table if not exists public.ipr (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  ipr_type text check (ipr_type in ('Patent','Copyright','Design','Trademark')),
  reference_number text, inventors text,
  ipr_status text check (ipr_status in ('Filed','Published','Granted','Registered')),
  filed_on date,
  faculty_id uuid references public.faculty(id) on delete set null
);

create table if not exists public.research_scholars (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, guide text, research_area text,
  programme text check (programme in ('Ph.D.','M.Sc. (Engg) by Research')),
  scholar_status text check (scholar_status in ('Ongoing','Awarded')),
  year_joined int check (year_joined between 1950 and 2100)
);

create table if not exists public.laboratories (
  id uuid primary key default gen_random_uuid(),
  name text not null, purpose text, description text, equipment text, software text,
  workstations int check (workstations >= 0),
  in_charge text, photo_url text, guidelines text,
  sort_order int not null default 100
);

create table if not exists public.student_achievements (
  id uuid primary key default gen_random_uuid(),
  title text not null, category text, students text, event_name text,
  achievement_date date, description text, evidence_url text, photo_url text
);

create table if not exists public.student_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null, team text, guide text,
  project_year int check (project_year between 1950 and 2100),
  description text, link_url text
);

create table if not exists public.student_clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  club_type text check (club_type in ('Technical club','Student chapter')),
  coordinator text, description text, link_url text
);

create table if not exists public.placement_records (
  id uuid primary key default gen_random_uuid(),
  eligible int check (eligible >= 0),
  placed int check (placed >= 0),
  higher_studies int check (higher_studies >= 0),
  entrepreneurs int check (entrepreneurs >= 0),
  notes text, source_doc_url text,
  constraint placed_le_eligible check (placed is null or eligible is null or placed <= eligible)
);

create table if not exists public.alumni (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  graduation_year int check (graduation_year between 1950 and 2100),
  programme text, designation text, organisation text, industry text,
  achievements text, testimonial text, photo_url text,
  consent boolean not null default false
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null, category text, description text,
  start_date date not null, end_date date,
  venue text, organiser text, resource_person text,
  registration_url text, report_url text, cover_image_url text, attachments_url text,
  constraint event_dates check (end_date is null or end_date >= start_date)
);

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null, category text,
  notice_date date not null default current_date, expires_on date,
  body text, link_url text, attachment_url text,
  is_pinned boolean not null default false
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null, category text not null,
  programme_code text, file_url text not null, owner text
);

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  title text, image_url text not null, caption text, album text,
  event_id uuid references public.events(id) on delete set null,
  taken_on date
);

-- Audit log
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null,
  actor uuid,
  old_status text,
  new_status text,
  changed_fields text[],
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- 4. Workflow + audit functions
-- ---------------------------------------------------------------------
create or replace function public.enforce_workflow() returns trigger
language plpgsql set search_path = public as $$
declare
  v_reviewer boolean;
  v_approver boolean;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();

  -- Trusted contexts (SQL editor, service role) skip workflow rules.
  if current_user not in ('anon', 'authenticated') then
    if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
    return new;
  end if;

  v_reviewer := public.is_reviewer();
  v_approver := public.is_approver();

  if tg_op = 'UPDATE' and old.status = 'published' and not v_reviewer then
    raise exception 'Published content can only be changed by the Department Administrator, HOD or Super Administrator' using errcode = '42501';
  end if;

  if not v_reviewer then
    -- Contributors cannot verify, write review notes, or keep a "reviewed" status after editing.
    new.verification_status := 'pending';
    new.review_note := case when tg_op = 'UPDATE' then old.review_note else null end;
    if tg_op = 'UPDATE' and old.status = 'reviewed' and new.status = 'reviewed' then
      new.status := 'pending_review';
    end if;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status in ('published', 'archived') and not v_approver then
      raise exception 'Only the HOD/Chairperson or Super Administrator can publish or archive content' using errcode = '42501';
    end if;
    if new.status in ('reviewed', 'rejected') and not v_reviewer then
      raise exception 'Only a reviewer can mark content as reviewed or send it back' using errcode = '42501';
    end if;
  end if;

  -- verified_by tracks who verified
  if new.verification_status = 'verified' then
    if tg_op = 'INSERT' or old.verification_status is distinct from 'verified' then
      new.verified_by := auth.uid();
    else
      new.verified_by := old.verified_by;
    end if;
  else
    new.verified_by := null;
  end if;

  if new.status = 'published' then
    if new.verification_status <> 'verified' then
      raise exception 'Content must be marked as verified before it can be published' using errcode = '23514';
    end if;
    if coalesce(btrim(new.source), '') = '' then
      raise exception 'A source (document, person or official web page) is required before publication' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' or old.status <> 'published' then
      new.published_at := now();
      new.approved_by := auth.uid();
    else
      new.published_at := old.published_at;
      new.approved_by := old.approved_by;
    end if;
  elsif tg_op = 'UPDATE' then
    new.published_at := old.published_at;
    new.approved_by := old.approved_by;
  else
    new.published_at := null;
    new.approved_by := null;
  end if;

  return new;
end $$;

create or replace function public.audit_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_fields text[];
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_fields
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old -> n.key)
      and n.key not in ('updated_at', 'updated_by');
  end if;
  insert into public.audit_logs (table_name, record_id, action, actor, old_status, new_status, changed_fields)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id')::uuid, tg_op, auth.uid(),
          v_old ->> 'status', v_new ->> 'status', v_fields);
  return coalesce(new, old);
end $$;

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_changes();

-- ---------------------------------------------------------------------
-- 5. Common columns, constraints, triggers, RLS and grants for all content tables
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  content_tables text[] := array[
    'dept_content','programmes','faculty','staff','research_areas','publications',
    'research_projects','ipr','research_scholars','laboratories','student_achievements',
    'student_projects','student_clubs','placement_records','alumni','events','notices',
    'documents','gallery'];
begin
  foreach t in array content_tables loop
    execute format($f$
      alter table public.%1$I
        add column if not exists status text not null default 'draft',
        add column if not exists verification_status text not null default 'pending',
        add column if not exists source text,
        add column if not exists academic_year text,
        add column if not exists review_note text,
        add column if not exists created_by uuid references auth.users(id) on delete set null,
        add column if not exists updated_by uuid references auth.users(id) on delete set null,
        add column if not exists verified_by uuid references auth.users(id) on delete set null,
        add column if not exists approved_by uuid references auth.users(id) on delete set null,
        add column if not exists created_at timestamptz not null default now(),
        add column if not exists updated_at timestamptz not null default now(),
        add column if not exists published_at timestamptz
    $f$, t);

    begin
      execute format('alter table public.%1$I add constraint %2$I check (status in (''draft'',''pending_review'',''reviewed'',''rejected'',''published'',''archived''))', t, t || '_status_check');
    exception when duplicate_object then null; end;
    begin
      execute format('alter table public.%1$I add constraint %2$I check (verification_status in (''pending'',''verified''))', t, t || '_verification_check');
    exception when duplicate_object then null; end;

    execute format('create index if not exists %2$I on public.%1$I (status)', t, t || '_status_idx');

    execute format('drop trigger if exists enforce_workflow on public.%I', t);
    execute format('create trigger enforce_workflow before insert or update on public.%I for each row execute function public.enforce_workflow()', t);
    execute format('drop trigger if exists audit_changes on public.%I', t);
    execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function public.audit_changes()', t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (status = ''published'' or public.is_staff())', t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write(%L))', t || '_insert', t, t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_reviewer() or (public.can_write(%L) and created_by = auth.uid())) with check (public.is_reviewer() or (public.can_write(%L) and created_by = auth.uid()))', t || '_update', t, t, t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_reviewer() or (public.can_write(%L) and created_by = auth.uid() and status = ''draft''))', t || '_delete', t, t);

    execute format('revoke insert, update, delete, truncate on public.%I from anon', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Faculty members may edit their OWN (unpublished) linked profile.
drop policy if exists faculty_self_update on public.faculty;
create policy faculty_self_update on public.faculty for update to authenticated
  using (user_id = auth.uid() and public.app_role() = 'faculty')
  with check (user_id = auth.uid() and public.app_role() = 'faculty');

-- Alumni can never be published without consent.
do $$ begin
  alter table public.alumni add constraint alumni_consent_required check (status <> 'published' or consent = true);
exception when duplicate_object then null; end $$;

-- Audit log: readable by reviewers only, never writable through the API.
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_read on public.audit_logs;
create policy audit_logs_read on public.audit_logs for select to authenticated using (public.is_reviewer());
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

revoke insert, update, delete, truncate on public.profiles, public.role_permissions from anon;
revoke insert, delete, truncate on public.profiles from authenticated;
revoke insert, update, delete, truncate on public.role_permissions from authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.role_permissions to authenticated;

-- ---------------------------------------------------------------------
-- 6. Storage: public bucket for approved public files (PDF / images, max 10 MB)
--    WARNING: everything uploaded here is publicly downloadable.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dept-public', 'dept-public', true, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dept_public_staff_insert on storage.objects;
create policy dept_public_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dept-public' and public.is_staff());
drop policy if exists dept_public_reviewer_update on storage.objects;
create policy dept_public_reviewer_update on storage.objects for update to authenticated
  using (bucket_id = 'dept-public' and public.is_reviewer())
  with check (bucket_id = 'dept-public' and public.is_reviewer());
drop policy if exists dept_public_reviewer_delete on storage.objects;
create policy dept_public_reviewer_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dept-public' and public.is_reviewer());

-- ---------------------------------------------------------------------
-- 7. Baseline seed (from public VTU pages; verification_status = pending)
--    Inserted only if missing. Reviewers must verify before editing published rows.
-- ---------------------------------------------------------------------
insert into public.dept_content (id, slug, title, body, status, verification_status, source) values
('00000000-0000-4000-8000-000000000101', 'about', 'About the Department',
 E'The Department of Computer Science and Engineering is part of Visvesvaraya Technological University (VTU) at its Jnana Sangama campus in Belagavi, Karnataka.\n\nThe department''s work covers engineering education, research, software development, consultancy and student-centred learning. Its published research activity spans artificial intelligence and intelligent systems, cloud computing, computer networks, computer vision and image processing, the Internet of Things and knowledge-based intelligent systems.',
 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000102', 'history', 'History and Establishment',
 'The department was established in the academic year 2002–2003 at VTU''s Jnana Sangama campus, Belagavi.',
 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department')
on conflict do nothing;

insert into public.programmes (id, code, name, level, degree, duration, sort_order, status, verification_status, source) values
('00000000-0000-4000-8000-000000000201', 'CSBS', 'B.Tech in Computer Science and Business Systems', 'UG', 'B.Tech', '4 years', 10, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000202', 'MTECH-CSE', 'M.Tech in Computer Science and Engineering', 'PG', 'M.Tech', '2 years', 20, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000203', 'MTECH-CNE', 'M.Tech in Computer Network Engineering', 'PG', 'M.Tech', '2 years', 30, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000204', 'MCA', 'Master of Computer Applications', 'PG', 'MCA', '2 years', 40, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000205', 'PHD-CSE', 'Ph.D. in Computer Science and Engineering', 'Research', 'Ph.D.', null, 50, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000206', 'MSC-ENGG', 'M.Sc. (Engineering) by Research', 'Research', 'M.Sc. (Engg)', null, 60, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department')
on conflict do nothing;

insert into public.faculty (id, full_name, designation, email, responsibilities, is_leadership, sort_order, status, verification_status, source) values
('00000000-0000-4000-8000-000000000301', 'Dr. S. A. Angadi', 'Chairperson', 'chair.cse@vtu.ac.in',
 'Chairperson, Department of Computer Science and Engineering', true, 1, 'published', 'pending',
 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department')
on conflict do nothing;

insert into public.research_areas (id, name, description, sort_order, status, verification_status, source) values
('00000000-0000-4000-8000-000000000401', 'Artificial Intelligence and Intelligent Systems', 'Machine learning, reasoning and intelligent decision-making systems.', 10, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000402', 'Cloud Computing', 'Distributed infrastructure, virtualisation and cloud services.', 20, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000403', 'Computer Networks', 'Network architecture, protocols, performance and security.', 30, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000404', 'Computer Vision and Image Processing', 'Image analysis, recognition and visual understanding.', 40, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000405', 'Internet of Things (IoT)', 'Connected devices, sensing and embedded systems.', 50, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department'),
('00000000-0000-4000-8000-000000000406', 'Knowledge-Based Intelligent Systems', 'Knowledge representation and expert systems.', 60, 'published', 'pending', 'Public VTU CSE department web page (vtu.ac.in) — reconfirm with department')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 8. FIRST SUPER ADMINISTRATOR (run separately, once)
--    1) Supabase -> Authentication -> Users -> Add user (email + password)
--    2) Replace the email below and run ONLY this statement:
--
--    update public.profiles set role = 'super_admin', is_active = true, full_name = 'Your Name'
--    where email = 'you@example.com';
-- ---------------------------------------------------------------------
