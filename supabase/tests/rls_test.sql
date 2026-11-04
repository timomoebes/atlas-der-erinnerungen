\set ON_ERROR_STOP on
\set a '00000000-0000-0000-0000-00000000000a'
\set b '00000000-0000-0000-0000-00000000000b'
\set c '00000000-0000-0000-0000-00000000000c'
\set d '00000000-0000-0000-0000-00000000000d'

create function t_assert(c boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'ASSERT FAILED: %', msg; end if; end $$;
grant execute on function t_assert(boolean, text) to public;

insert into auth.users (id, email, raw_user_meta_data) values
  (:'a', 'a@x', '{"display_name":"Anna"}'), (:'b', 'b@x', '{"display_name":"Ben"}'),
  (:'c', 'c@x', '{"display_name":"Cora"}'), (:'d', 'd@x', '{"display_name":"Dora"}');
select t_assert((select count(*) from profiles) = 4, 'profile trigger created 4 profiles');

-- ===== A creates an atlas, moment, photo row, comment =====
set role authenticated; select set_config('app.uid', :'a', false);
select create_atlas('Unser Jahr', 'Fuer uns', 'Berlin', 52.5, 13.4, 'Paphos', 34.7, 32.4) as atlas_x \gset
select set_config('app.x', :'atlas_x', false);
select t_assert((select count(*) from atlas_members where atlas_id = :'atlas_x' and role = 'owner') = 1, 'creator is owner');
insert into moments (id, atlas_id, author_id, title, note, moment_date, position)
  values ('11111111-1111-1111-1111-111111111111', :'atlas_x', :'a', 'Ankunft', 'Meer', '2025-08-12', 1);
insert into moment_photos (id, moment_id, atlas_id, storage_path)
  values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', :'atlas_x', :'atlas_x' || '/11111111-1111-1111-1111-111111111111/p.jpg');
insert into storage.objects (bucket_id, name) values ('photos', :'atlas_x' || '/11111111-1111-1111-1111-111111111111/p.jpg');
insert into comments (moment_id, atlas_id, author_id, body) values ('11111111-1111-1111-1111-111111111111', :'atlas_x', :'a', 'Schoen');
-- author spoofing must fail
do $$ begin
  begin
    insert into moments (atlas_id, author_id, title, moment_date) values (current_setting('app.x')::uuid, '00000000-0000-0000-0000-00000000000b', 'fake', '2025-01-01');
    raise exception 'SHOULD HAVE FAILED: author spoof';
  exception when insufficient_privilege then null; end;
end $$;

-- ===== D (outsider) sees nothing and can write nothing =====
reset role; set role authenticated; select set_config('app.uid', :'d', false);
select t_assert((select count(*) from atlases) = 0, 'outsider sees no atlases');
select t_assert((select count(*) from moments) = 0, 'outsider sees no moments');
select t_assert((select count(*) from comments) = 0, 'outsider sees no comments');
select t_assert((select count(*) from moment_photos) = 0, 'outsider sees no photo rows');
select t_assert((select count(*) from storage.objects) = 0, 'outsider sees no storage objects');
with u as (update storage.objects set name = name returning 1) select t_assert((select count(*) from u) = 0, 'outsider cannot update storage objects');
select t_assert((select count(*) from profiles where id = :'a') = 0, 'outsider cannot read member profile');
select t_assert((select count(*) from profiles where id = :'d') = 1, 'outsider reads own profile');
select t_assert((select count(*) from invites) = 0, 'outsider sees no invites');
do $$ begin
  begin insert into moments (atlas_id, author_id, title, moment_date) values (current_setting('app.x')::uuid, '00000000-0000-0000-0000-00000000000d', 'x', '2025-01-01'); raise exception 'SHOULD HAVE FAILED: outsider moment';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('photos', current_setting('app.x') || '/evil.jpg'); raise exception 'SHOULD HAVE FAILED: outsider upload';
  exception when insufficient_privilege then null; end;
  begin perform redeem_invite('deadbeef'); raise exception 'SHOULD HAVE FAILED: bogus invite';
  exception when raise_exception then if sqlerrm not like 'invite invalid%' then raise; end if; end;
end $$;

-- ===== A invites B (editor) and C (viewer) =====
reset role; set role authenticated; select set_config('app.uid', :'a', false);
insert into invites (atlas_id, created_by, role) values (:'atlas_x', :'a', 'editor') returning code as code_b \gset
insert into invites (atlas_id, created_by, role) values (:'atlas_x', :'a', 'viewer') returning code as code_c \gset

reset role; set role authenticated; select set_config('app.uid', :'b', false);
select redeem_invite(:'code_b');
select t_assert((select role from atlas_members where atlas_id = :'atlas_x' and user_id = :'b') = 'editor', 'B joined as editor');
select t_assert((select count(*) from moments) = 1, 'B sees the moment');
select t_assert((select count(*) from storage.objects) = 1, 'B sees the photo object');
select t_assert((select count(*) from profiles where id = :'a') = 1, 'B reads A profile (shared atlas)');
select t_assert((select count(*) from invites) = 0, 'editor cannot read invites');
insert into moments (id, atlas_id, author_id, title, moment_date) values ('33333333-3333-3333-3333-333333333333', :'atlas_x', :'b', 'Bens Moment', '2025-08-13');
with u as (update moments set title = 'gehackt' where id = '11111111-1111-1111-1111-111111111111' returning 1) select t_assert((select count(*) from u) = 0, 'editor cannot edit others moment');
with d as (delete from moments where id = '11111111-1111-1111-1111-111111111111' returning 1) select t_assert((select count(*) from d) = 0, 'editor cannot delete others moment');
with u as (update moments set title = 'Bens Moment 2' where id = '33333333-3333-3333-3333-333333333333' returning 1) select t_assert((select count(*) from u) = 1, 'editor edits own moment');
do $$ begin
  begin insert into invites (atlas_id, created_by, role) values (current_setting('app.x')::uuid, '00000000-0000-0000-0000-00000000000b', 'editor'); raise exception 'SHOULD HAVE FAILED: editor invite';
  exception when insufficient_privilege then null; end;
  begin insert into moment_photos (moment_id, atlas_id, storage_path) values ('11111111-1111-1111-1111-111111111111', current_setting('app.x')::uuid, current_setting('app.x') || '/11111111-1111-1111-1111-111111111111/b.jpg'); raise exception 'SHOULD HAVE FAILED: photo on foreign moment';
  exception when insufficient_privilege then null; end;
end $$;
with d as (delete from atlas_members where user_id = :'a' returning 1) select t_assert((select count(*) from d) = 0, 'editor cannot remove owner');
with u as (update atlases set title = 'x' where id = :'atlas_x' returning 1) select t_assert((select count(*) from u) = 0, 'editor cannot edit atlas');
insert into storage.objects (bucket_id, name) values ('photos', :'atlas_x' || '/33333333-3333-3333-3333-333333333333/b.jpg');
with u as (update storage.objects set name = name where bucket_id = 'photos' and name like :'atlas_x' || '/%' returning 1) select t_assert((select count(*) from u) = 2, 'editor may update (upsert) objects of own atlas');

reset role; set role authenticated; select set_config('app.uid', :'c', false);
select redeem_invite(:'code_c');
select t_assert((select count(*) from moments) = 2, 'viewer reads moments');
insert into comments (moment_id, atlas_id, author_id, body) values ('11111111-1111-1111-1111-111111111111', :'atlas_x', :'c', 'Toll');
with u as (update storage.objects set name = name returning 1) select t_assert((select count(*) from u) = 0, 'viewer cannot update storage objects');
do $$ begin
  begin insert into moments (atlas_id, author_id, title, moment_date) values (current_setting('app.x')::uuid, '00000000-0000-0000-0000-00000000000c', 'x', '2025-01-01'); raise exception 'SHOULD HAVE FAILED: viewer moment';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name) values ('photos', current_setting('app.x') || '/viewer.jpg'); raise exception 'SHOULD HAVE FAILED: viewer upload';
  exception when insufficient_privilege then null; end;
end $$;
with d as (delete from comments where author_id = :'a' returning 1) select t_assert((select count(*) from d) = 0, 'viewer cannot delete others comments');

-- ===== invite limits =====
reset role; set role authenticated; select set_config('app.uid', :'d', false);
reset role; update invites set expires_at = now() - interval '1 day' where code = :'code_c';
set role authenticated; select set_config('app.uid', :'d', false);
do $$ declare c text; begin
  select code into c from invites limit 1; -- invisible to outsider (RLS) -> null
  perform t_assert(c is null, 'outsider cannot list invite codes');
  begin perform redeem_invite((select 'x')); exception when raise_exception then null; end;
end $$;

-- ===== owner leaves: ownership passes to B; last member leaving deletes atlas =====
reset role; set role authenticated; select set_config('app.uid', :'a', false);
select leave_atlas(:'atlas_x');
select t_assert((select count(*) from atlases) = 0, 'A no longer sees atlas after leaving');
reset role;
select t_assert((select role from atlas_members where atlas_id = :'atlas_x' and user_id = :'b') = 'owner', 'B promoted to owner');
select t_assert((select author_id from moments where id = '11111111-1111-1111-1111-111111111111') = :'a', 'A moment stays (author_id kept while account exists)');

-- ===== account deletion =====
set role authenticated; select set_config('app.uid', :'a', false);
select delete_my_account();
reset role;
select t_assert((select count(*) from auth.users where id = :'a') = 0, 'A account removed');
select t_assert((select author_id from moments where id = '11111111-1111-1111-1111-111111111111') is null, 'A moments anonymised (author null)');
select t_assert((select count(*) from comments where body = 'Schoen') = 1, 'A comment kept, author null');

-- B and C remain; B deletes account while C still member -> atlas survives with C promoted
set role authenticated; select set_config('app.uid', :'b', false);
select delete_my_account();
reset role;
select t_assert((select role from atlas_members where atlas_id = :'atlas_x' and user_id = :'c') = 'owner', 'C promoted after B left');
set role authenticated; select set_config('app.uid', :'c', false);
select delete_my_account();
reset role;
select t_assert((select count(*) from atlases) = 0, 'atlas deleted when last member deleted account');
select t_assert((select count(*) from moments) = 0, 'moments cascaded');

select 'ALL RLS TESTS PASSED' as result;
