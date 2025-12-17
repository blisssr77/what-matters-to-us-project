# WhatMatters

A lightweight, privacy‑first workspace for **notes, docs, tasks, and calendars** — wrapped in a clean React UI with Supabase Auth and encrypted “Vault Codes” for sensitive content.

> _Focus your notes, docs, and tasks—securely._

<p align="left">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-React-646CFF?logo=vite&logoColor=white" />
  <img alt="Tailwind" src="https://img.shields.io/badge/Styled%20with-Tailwind-38B2AC?logo=tailwindcss&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Backend-Supabase-3ECF8E?logo=supabase&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-000?logo=opensourceinitiative&logoColor=white" />
</p>

---

## 🔗 Live

- Production: https://what-matters-to-us-project-ov13.vercel.app

---

## ✨ Highlights

- **Modern React (Vite) + Tailwind UI** with a friendly, minimal look and feel.
- **Supabase Auth**
  - Email/password **and** Google OAuth.
  - Email verification flow with redirect.
  - Robust signup/signin UX (avoids “stuck on Loading” races).
- **Account Management**
  - “Set password” path for Google‑only accounts via `/auth/recover`.
  - “Change password” form for email/password users, with live rule checks.
- **AI Assistant**
  - Smart summarization for long notes and documents.
  - Helps users quickly digest complex content without leaving the workspace.
- **Real-time Messenger**
  - **Schema:** Relational design with `conversations`, `participants` (for unread counts), and `messages`.
  - **Security:** Advanced RLS using `!inner` joins and `SECURITY DEFINER` helper functions to prevent infinite recursion loops.
  - **Performance:** Zustand store managing global state with **optimistic UI updates** for instant message sending and live unread badges.
- **Profile management** with `profiles` table (username, names, email, verified flag, timestamps), safe **upsert** helpers, and RLS‑safe reads/writes.
- **Vault Codes** (Workspace & Private): user‑level encryption codes, rotation flows, and RPC helpers:
  - `set_user_vault_code`, `verify_user_vault_code`
  - `set_user_private_code`, `verify_user_private_code`
  - Rotation utilities to re‑encrypt content when codes change.
- **Calendar integration flags** (`user_settings.calendar_connected`, workspace/private calendar toggles).
- **Production‑ready deploy** on Netlify (or Vercel), SPA routing, and auth redirects.

---

## 🧱 Tech Stack

- **Frontend:** React + Vite, Tailwind CSS
- **Auth & DB:** Supabase (Auth, Postgres, RLS, RPC)
- **AI:** OpenAI API (Assistant for note summarization)
- **State & Routing:** React Router, lightweight component state
- **Nice touches:** BroadcastChannel for cross‑tab email verification, debounced field validators, non‑persist Supabase client for “probe” logins

---

## 🗂️ Key App Flows

### 1) Authentication

- **Email/Password:** standard signup → verification email → login.  
- **Google OAuth:** instant login; password is **not** set (user can add one later).  
- **Google‑only → set password:** send a password‑setup link  
  ```js
  await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/auth/recover`
  });
  ```
  The `/auth/recover` route:
  - Ingests the Supabase recovery hash
  - Lets the user set a new password
  - (Optional) “probes” a non‑persist login so the **email** provider appears immediately in `user.identities`
  - Sets a one‑shot UI hint (e.g., `wm_has_email_pw`) so Manage Account flips to **Change password** instantly

### 2) Profile creation / update

- **ensureProfileExists / ensureProfile(user)** helpers:
  - RLS‑safe `.select(...).maybeSingle()` (ignore `406`)
  - **Insert without `.select()`** to avoid 406 under strict RLS
  - Upsert/update: sets `updated_at`, syncs `email` and `email_verified` from Auth when available

- **Username handling:**
  - **slugifyUsername** and **findAvailableUsername** with incremental suffixes (`user`, `user-1`, …)
  - Unique index on `lower(username)` + client debounce check

### 3) Vault Codes

Two independent “vaults”: **Workspace** and **Private**.

- **Create:** save a new code hash via RPC  
- **Change:** verify current → rotate encrypted content → write new hash  
- **UI:** rule checkers, confirmation fields, debounced verification RPC

---

## 🗃️ Database Notes

### `public.profiles` (excerpt)

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  first_name text null,
  last_name text null,
  avatar_url text null,
  updated_at timestamptz default current_timestamp,
  email text null,
  created_at timestamptz null,
  seed_phrase text null,
  vault_code_set boolean null,
  ws_vault_code_set boolean null,
  pv_vault_code_set boolean null,
  email_verified boolean not null default false,
  constraint profiles_username_key unique (username),
  constraint chk_username_format check (username ~ '^[A-Za-z0-9._-]{3,32}$')
);

create unique index if not exists profiles_username_idx
on public.profiles using btree (lower(username));
```

- **Triggers**: `touch_updated_at()`, `ensure_username_default()` (as in your schema).  
- **RLS**: queries use **minimal selects** and avoid `insert ... select` patterns; client inserts without `select()` on strict RLS.

**Other tables** (referenced in UI):
- `vault_codes` (workspace/private hashes)
- `workspace_members`, `workspace_vault_items`
- `private_spaces`, `private_vault_items`
- `user_settings` (`calendar_connected`)
- `workspace_calendar_items_secure`, `private_calendar_items_secure`

**RPCs**:
- `set_user_vault_code(code)` / `verify_user_vault_code(code)`
- `set_user_private_code(code)` / `verify_user_private_code(code)`

---

## ⚙️ Environment

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

> Keep the `VITE_` prefix for Vite. Don’t commit secrets.

---

## ▶️ Local Development

```bash
npm i
npm run dev
```

Ensure your Supabase **Site URL** points to your local dev origin during testing for email links (or use a tunnel).

---

## 🧪 Troubleshooting

- **Stuck on “Loading…” after signup**  
  - Always **sign out** before `signUp` if a stale session exists.  
  - Gate the Auth screen on a `booted` flag after `getSession()`.  
  - Don’t mix `.insert().select()` under strict RLS; avoid `.select()` on insert.

- **Duplicate email on signup**  
  - Surface `already registered` errors from `auth.signUp` and flip UI to **Log in**.  
  - Don’t show “Verification email sent” banner on those errors.

- **Google‑only user doesn’t see “Change password”**  
  - They have no `email` provider yet.  
  - Use **“Set password”** via `/auth/recover` (resetPasswordForEmail).  
  - After the flow, **probe** a non‑persist sign‑in to attach the identity immediately; optionally drop a UI hint (`wm_has_email_pw`) until provider metadata refreshes.

- **Hook order crashes**  
  - Don’t conditionally create/destroy hooks; gate the whole form with a top‑level `booted`/`authBooted` boolean.

---

## 🏷️ Branding Snippet

![WhatMatters](docs/banner.png)

---

## 📄 License

MIT © WhatMatters
