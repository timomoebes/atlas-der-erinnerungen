-- Atlas der Erinnerungen: accounts, shared atlases, moments, photos, comments.
-- Run in the Supabase SQL editor of a NEW project (region: Frankfurt) or via `supabase db push`.

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create table public.atlases (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  dedication text not null default '' check (char_length(dedication) <= 400),
  origin_name text not null default 'Start' check (char_length(origin_name) <= 60),
  origin_lat double precision not null check (origin_lat between -90 and 90),
  origin_lon double precision not null check (origin_lon between -180 and 180),
  dest_name text not null default 'Ziel' check (char_length(dest_name) <= 60),
  dest_lat double precision not null check (dest_lat between -90 and 90),
  dest_lon double precision not null check (dest_lon between -180 and 180),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.atlas_members (
  atlas_id uuid not null references public.atlases(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (atlas_id, user_id)
);
create index on public.atlas_members (user_id);

create table public.invites (
  code text primary key default encode(gen_random_bytes(12), 'hex'),
  atlas_id uuid not null references public.atlases(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor','viewer')),
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 5 check (max_uses between 1 and 50),
  uses int not null default 0,
  created_at timestamptz not null default now()
);

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  atlas_id uuid not null references public.atlases(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  note text not null default '' check (char_length(note) <= 12000),
  moment_date date not null,
  position real not null default 0.5 check (position between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.moments (atlas_id, moment_date);

create table public.moment_photos (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  atlas_id uuid not null references public.atlases(id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (storage_path like atlas_id::text || '/%')
);
create index on public.moment_photos (moment_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  atlas_id uuid not null references public.atlases(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on public.comments (moment_id, created_at);

-- ---------- helpers (security definer: avoid recursive RLS) ----------
create function public.is_member(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from atlas_members where atlas_id = a and user_id = auth.uid());
$$;
create function public.can_edit(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from atlas_members where atlas_id = a and user_id = auth.uid() and role in ('owner','editor'));
$$;
create function public.is_owner(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from atlas_members where atlas_id = a and user_id = auth.uid() and role = 'owner');
$$;
create function public.shares_atlas_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from atlas_members a join atlas_members b on a.atlas_id = b.atlas_id
    where a.user_id = auth.uid() and b.user_id = u);
$$;

-- keep updated_at honest
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger moments_touch before update on public.moments
  for each row execute function public.touch_updated_at();

-- profile row for every new auth user
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 60));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPCs ----------
create function public.create_atlas(
  p_title text, p_dedication text,
  p_origin_name text, p_origin_lat double precision, p_origin_lon double precision,
  p_dest_name text, p_dest_lat double precision, p_dest_lon double precision
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into atlases (title, dedication, origin_name, origin_lat, origin_lon, dest_name, dest_lat, dest_lon, created_by)
  values (p_title, coalesce(p_dedication,''), p_origin_name, p_origin_lat, p_origin_lon, p_dest_name, p_dest_lat, p_dest_lon, auth.uid())
  returning id into new_id;
  insert into atlas_members (atlas_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end $$;

create function public.redeem_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from invites where code = p_code for update;
  if not found or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'invite invalid or expired';
  end if;
  insert into atlas_members (atlas_id, user_id, role) values (inv.atlas_id, auth.uid(), inv.role)
  on conflict (atlas_id, user_id) do nothing;
  update invites set uses = uses + 1 where code = p_code;
  return inv.atlas_id;
end $$;

-- Hands ownership to another member, or deletes the atlas when the caller is alone.
-- The client removes the atlas' storage files BEFORE calling this for the "alone" case.
create function public.leave_atlas(p_atlas uuid) returns void
language plpgsql security definer set search_path = public as $$
declare successor uuid; mine text;
begin
  select role into mine from atlas_members where atlas_id = p_atlas and user_id = auth.uid();
  if mine is null then return; end if;
  if (select count(*) from atlas_members where atlas_id = p_atlas) = 1 then
    delete from atlases where id = p_atlas;
    return;
  end if;
  if mine = 'owner' and (select count(*) from atlas_members where atlas_id = p_atlas and role = 'owner') = 1 then
    select user_id into successor from atlas_members
      where atlas_id = p_atlas and user_id <> auth.uid() order by (role = 'editor') desc, joined_at limit 1;
    update atlas_members set role = 'owner' where atlas_id = p_atlas and user_id = successor;
  end if;
  delete from atlas_members where atlas_id = p_atlas and user_id = auth.uid();
end $$;

-- Account deletion (App Store requirement). Client deletes files of atlases where the user is alone first.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare a record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  for a in select atlas_id from atlas_members where user_id = auth.uid() loop
    perform public.leave_atlas(a.atlas_id);
  end loop;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.create_atlas(text,text,text,double precision,double precision,text,double precision,double precision) from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
revoke all on function public.leave_atlas(uuid) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.create_atlas(text,text,text,double precision,double precision,text,double precision,double precision) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.leave_atlas(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.is_member(uuid), public.can_edit(uuid), public.is_owner(uuid), public.shares_atlas_with(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.can_edit(uuid), public.is_owner(uuid), public.shares_atlas_with(uuid) to authenticated;

-- ---------- row level security ----------
alter table public.profiles       enable row level security;
alter table public.atlases        enable row level security;
alter table public.atlas_members  enable row level security;
alter table public.invites        enable row level security;
alter table public.moments        enable row level security;
alter table public.moment_photos  enable row level security;
alter table public.comments       enable row level security;

create policy profiles_read   on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_atlas_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy atlases_read   on public.atlases for select to authenticated using (public.is_member(id));
create policy atlases_update on public.atlases for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

create policy members_read   on public.atlas_members for select to authenticated using (public.is_member(atlas_id));
create policy members_remove on public.atlas_members for delete to authenticated
  using (public.is_owner(atlas_id) and user_id <> auth.uid());

create policy invites_read   on public.invites for select to authenticated using (public.is_owner(atlas_id));
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_owner(atlas_id) and created_by = auth.uid() and uses = 0);
create policy invites_delete on public.invites for delete to authenticated using (public.is_owner(atlas_id));

create policy moments_read   on public.moments for select to authenticated using (public.is_member(atlas_id));
create policy moments_insert on public.moments for insert to authenticated
  with check (public.can_edit(atlas_id) and author_id = auth.uid());
create policy moments_update on public.moments for update to authenticated
  using (public.can_edit(atlas_id) and (author_id = auth.uid() or public.is_owner(atlas_id)))
  with check (public.can_edit(atlas_id));
create policy moments_delete on public.moments for delete to authenticated
  using (public.can_edit(atlas_id) and (author_id = auth.uid() or public.is_owner(atlas_id)));

create policy photos_read   on public.moment_photos for select to authenticated using (public.is_member(atlas_id));
create policy photos_insert on public.moment_photos for insert to authenticated
  with check (public.can_edit(atlas_id)
    and exists (select 1 from public.moments m where m.id = moment_id and m.atlas_id = moment_photos.atlas_id
                and (m.author_id = auth.uid() or public.is_owner(m.atlas_id))));
create policy photos_delete on public.moment_photos for delete to authenticated
  using (public.can_edit(atlas_id) and exists (
    select 1 from public.moments m where m.id = moment_id and (m.author_id = auth.uid() or public.is_owner(m.atlas_id))));

create policy comments_read   on public.comments for select to authenticated using (public.is_member(atlas_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (public.is_member(atlas_id) and author_id = auth.uid()
    and exists (select 1 from public.moments m where m.id = moment_id and m.atlas_id = comments.atlas_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_owner(atlas_id));

-- ---------- private photo bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- object path = {atlas_id}/{moment_id}/{file}; the first folder decides access
create policy photos_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and exists (
    select 1 from public.atlas_members m
    where m.atlas_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid()));
create policy photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and exists (
    select 1 from public.atlas_members m
    where m.atlas_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role in ('owner','editor')));
create policy photos_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and exists (
    select 1 from public.atlas_members m
    where m.atlas_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role in ('owner','editor')))
  with check (bucket_id = 'photos' and exists (
    select 1 from public.atlas_members m
    where m.atlas_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role in ('owner','editor')));
create policy photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and exists (
    select 1 from public.atlas_members m
    where m.atlas_id::text = (storage.foldername(name))[1] and m.user_id = auth.uid() and m.role in ('owner','editor')));

-- ---------- realtime (partner sees new entries live) ----------
alter publication supabase_realtime add table public.moments, public.moment_photos, public.comments;
