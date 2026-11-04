-- Findings from the Supabase security advisor after 0001:
-- 1. handle_new_user() is a trigger function; nobody should be able to call it through /rest/v1/rpc.
-- 2. touch_updated_at() needs a fixed search_path.
-- The remaining advisor notes (is_member, can_edit, is_owner, shares_atlas_with, create_atlas, redeem_invite,
-- leave_atlas, delete_my_account callable by signed-in users) are intentional: RLS policies call the helpers as the
-- signed-in user, and the four RPCs are the app's API. All of them check auth.uid() themselves.
revoke all on function public.handle_new_user() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = '';
