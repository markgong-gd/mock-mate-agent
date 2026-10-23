/**
 * @file 【后端·中间件】公网访问口令（部署时启用）
 * 做什么：配置 ACCESS_PASSWORD + COOKIE_SECRET 后生效；校验签名 httpOnly Cookie，
 *        未通过时 API 返回 401、页面返回服务端渲染的口令页；/api/healthz 与口令接口放行。
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { AppError } from '@/shared/common/errors';
import type { AppEnv } from '../types';

export const ACCESS_COOKIE = 'mm_access';
const MAX_AGE_S = 30 * 24 * 3600;

export interface AccessGateOptions {
  password?: string;
  cookieSecret?: string;
  cookieSecure: boolean;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** 常量时间比较口令 */
export const passwordMatches = (input: string, expected: string) =>
  timingSafeEqual(sha256(input), sha256(expected));

/** 签名密钥混入口令哈希：修改口令即令旧 Cookie 全部失效 */
const signingSecret = (o: Required<Pick<AccessGateOptions, 'password' | 'cookieSecret'>>) =>
  `${o.cookieSecret}.${sha256(o.password).toString('hex').slice(0, 16)}`;

export const isGateEnabled = (
  o: AccessGateOptions,
): o is AccessGateOptions & { password: string; cookieSecret: string } =>
  Boolean(o.password && o.cookieSecret);

export async function hasAccess(c: Context, o: AccessGateOptions): Promise<boolean> {
  if (!isGateEnabled(o)) return true;
  const v = await getSignedCookie(c, signingSecret(o), ACCESS_COOKIE);
  if (!v) return false;
  const issuedAt = Number(v.split('.')[1]);
  return Number.isFinite(issuedAt) && Date.now() - issuedAt < MAX_AGE_S * 1000;
}

export async function grantAccess(c: Context, o: AccessGateOptions) {
  if (!isGateEnabled(o)) return;
  await setSignedCookie(c, ACCESS_COOKIE, `v1.${Date.now()}`, signingSecret(o), {
    httpOnly: true,
    sameSite: 'Lax',
    secure: o.cookieSecure,
    path: '/',
    maxAge: MAX_AGE_S,
  });
}

export const revokeAccess = (c: Context, o: AccessGateOptions) =>
  deleteCookie(c, ACCESS_COOKIE, { path: '/', secure: o.cookieSecure });

const ALWAYS_OPEN = new Set(['/api/healthz', '/api/access/login', '/api/access/status']);

/**
 * 部署到公网时的访问口令（02 §9.5）。未通过时：
 * - /api/healthz 与口令接口放行
 * - 其它 /api/* 返回 401
 * - 页面请求返回服务端渲染的口令页（不下发前端产物）
 */
export const accessGate = (o: AccessGateOptions) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!isGateEnabled(o) || ALWAYS_OPEN.has(c.req.path) || (await hasAccess(c, o))) return next();
    if (c.req.path.startsWith('/api/')) throw new AppError('UNAUTHORIZED');
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.html(LOGIN_HTML, 401);
    throw new AppError('UNAUTHORIZED');
  });

const LOGIN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>MockMate · 访问口令</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#f8fafc;color:#0f172a}
  form{width:min(360px,90vw);padding:28px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  h1{font-size:18px;margin:0 0 6px}p{margin:0 0 18px;color:#64748b;font-size:13px}
  input{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
  button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-size:14px;cursor:pointer}
  button:disabled{opacity:.6}.err{color:#dc2626;font-size:13px;margin-top:10px;min-height:1em}
</style>
</head>
<body>
<form id="f">
  <h1>MockMate</h1>
  <p>个人使用实例，请输入访问口令。</p>
  <input id="p" type="password" autocomplete="current-password" placeholder="访问口令" required autofocus />
  <button id="b" type="submit">进入</button>
  <div class="err" id="e"></div>
</form>
<script>
  const f=document.getElementById('f'),b=document.getElementById('b'),e=document.getElementById('e');
  f.addEventListener('submit',async(ev)=>{ev.preventDefault();b.disabled=true;e.textContent='';
    try{const r=await fetch('/api/access/login',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({password:document.getElementById('p').value})});
      if(r.ok){location.reload();return}
      const j=await r.json().catch(()=>({}));e.textContent=j.code==='RATE_LIMITED'?'尝试次数过多，请稍后再试':'口令错误';
    }catch{e.textContent='网络错误'}finally{b.disabled=false}});
</script>
</body>
</html>`;
