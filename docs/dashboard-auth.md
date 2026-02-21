# Dashboard Password Authentication (Bun + Elysia)

Simple cookie-based password gate for an Elysia dashboard. Single shared password, in-memory sessions.

## Environment Variable

```env
DASHBOARD_PASSWORD=your-secret-here
```

If unset or empty, all routes are open with no login required.

## Config

```ts
// src/utils/config.ts
export default {
  dashboardPassword: Bun.env.DASHBOARD_PASSWORD ?? '',
  port: parseInt(Bun.env.PORT ?? '3000', 10),
  // ...
} as const;
```

## Server Setup

```ts
import { Elysia } from 'elysia';
import config from '@/utils/config';

const SESSION_COOKIE = 'bot_session';
const sessions = new Set<string>();

const generateToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const parseCookies = (header: string | null): Record<string, string> => {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [key, ...rest] = c.trim().split('=');
      return [key, rest.join('=')];
    }),
  );
};

const isAuthenticated = (request: Request): boolean => {
  if (!config.dashboardPassword) return true;
  const cookies = parseCookies(request.headers.get('cookie'));
  return sessions.has(cookies[SESSION_COOKIE] ?? '');
};

const app = new Elysia()
  // Login page
  .get('/login', () => Bun.file('public/login.html'))

  // Login endpoint
  .post('/auth/login', ({ body, set }) => {
    const { password } = body as { password: string };
    if (!config.dashboardPassword || password === config.dashboardPassword) {
      const token = generateToken();
      sessions.add(token);
      set.headers['set-cookie'] =
        `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`;
      return { ok: true };
    }
    set.status = 401;
    return { ok: false };
  })

  // Logout endpoint
  .post('/auth/logout', ({ set }) => {
    set.headers['set-cookie'] = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
    return { ok: true };
  })

  // Auth guard — runs before every route
  .onBeforeHandle(({ request, set, path }) => {
    if (path === '/login' || path.startsWith('/auth/')) return;
    if (!isAuthenticated(request)) {
      set.status = 302;
      set.headers['location'] = '/login';
      return 'Redirecting to login';
    }
  })

  // Protected routes go below
  .get('/', () => Bun.file('public/index.html'))
  .listen(config.port);
```

## Login Page

Create `public/login.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login</title>
    <style>
      body {
        font-family: system-ui;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #111;
        color: #eee;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 280px;
      }
      input {
        padding: 0.6rem;
        border: 1px solid #333;
        border-radius: 4px;
        background: #222;
        color: #eee;
        font-size: 1rem;
      }
      button {
        padding: 0.6rem;
        border: none;
        border-radius: 4px;
        background: #2563eb;
        color: #fff;
        font-size: 1rem;
        cursor: pointer;
      }
      button:hover {
        background: #1d4ed8;
      }
      .error {
        color: #f87171;
        font-size: 0.875rem;
        display: none;
      }
    </style>
  </head>
  <body>
    <form id="login-form">
      <h2>Login</h2>
      <input type="password" name="password" placeholder="Password" required autofocus />
      <p class="error" id="error-msg">Invalid password</p>
      <button type="submit">Sign in</button>
    </form>
    <script>
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = e.target.password.value;
        const res = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          window.location.href = '/';
        } else {
          document.getElementById('error-msg').style.display = 'block';
        }
      });
    </script>
  </body>
</html>
```

## How It Works

1. **No password set** — auth is disabled, everything is open
2. **Password set** — unauthenticated requests redirect to `/login`
3. **Login** — `POST /auth/login` with `{ "password": "..." }`. On match, sets an `HttpOnly` cookie with a random 32-byte token (7-day expiry)
4. **Subsequent requests** — cookie is checked against an in-memory `Set` of valid tokens
5. **Logout** — `POST /auth/logout` clears the cookie

## Notes

- Sessions are **in-memory only** — server restart logs everyone out
- Single shared password, not per-user accounts
- `HttpOnly` + `SameSite=Strict` cookies protect against XSS and CSRF
- No rate limiting on login — add if exposed to the internet
