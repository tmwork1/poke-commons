// Google ログイン(Supabase Auth)のセッションを全リクエストで locals.user に載せる。
// 個体管理機能(Phase C予定)専用の認証レーンであり、ダメージ計算・検索・builds等の
// 既存の匿名ルートはそもそも locals.user を参照しないため、ここで値をセットするだけでは
// 挙動に一切影響しない(強制認証・保護ロジックはあえて追加しない)。
// /mypage 自体が Astro.locals.user の有無でログインボタン/ログアウトボタンを出し分ける設計
// のため(育成データ管理計画.md §8 Phase A-3)、ミドルウェア側での強制リダイレクトも行わない。
// /api/auth/** はセッション確立前のリクエストを扱う経路であり、locals.user をセットする以外の
// 保護は元々存在しないため、この方針のもとでは自動的に対象外になる。
import { defineMiddleware } from 'astro:middleware';
import { getSessionUser } from './lib/user-session';

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = await getSessionUser(context.request, context.cookies).catch(() => null);
  return next();
});
