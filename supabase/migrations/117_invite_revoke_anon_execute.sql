-- 招待RPCから anon の実行権を確実に剥奪する（防御の多層化）。
--
-- 初版は `REVOKE ... FROM anon` のみだったが、リモートでは関数ACLがデフォルト
-- 状態（= PUBLIC に EXECUTE）になっており、anon への直接付与が存在しないため
-- 何も剥がれず、anon が関数本体まで到達できたままだった（auth.uid() が NULL の
-- ため 'login required' で止まるが、意図した権限面とはズレている）。
-- PUBLIC ごと剥奪した上で、必要なロールにだけ明示的に再付与する。
-- REVOKE / GRANT は冪等なので再適用しても安全。
--
-- check_invite_code は未ログインの招待リンク検証（/auth のプリフィル）で
-- anon から呼ぶ正当な経路があるため対象外。

REVOKE ALL ON FUNCTION public.create_invite(integer, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_invite(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_invite(integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_invite(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated, service_role;
