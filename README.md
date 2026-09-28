# Aviation Word Hunt ✈

A word search game for an event booth: shown on a TV over HDMI, played with a mouse or touchscreen.
Each visitor gets **one target word**. Once they find it, the screen shows "Tahniah!" and staff stamp their passport.

**Stack:** Vite + React + TypeScript · Supabase (Postgres + Auth) · Cloudflare Pages

| Route | Purpose |
|---|---|
| `/#/` | Game screen (open this on the TV) |
| `/#/admin` | Admin: add/remove words, set grid size, difficulty, title |

## 1. Run locally

```bash
npm install
npm run dev
```

Without `.env.local`, the app runs in **demo mode**: the default word list is used and admin changes are saved only in that browser.

## 2. Set up Supabase

1. Create a new project at supabase.com
2. **SQL Editor** → paste `supabase/schema.sql` → Run (creates the tables, RLS and 32 aviation words)
3. **Authentication → Users → Add user**: create an admin account for kakak (email + password).
   Turn off public signup under *Authentication → Providers → Email → Allow new users to sign up* (so only the admin can log in).
4. **Project Settings → API**: copy the `Project URL` and `anon public key` into `.env.local` (see `.env.example`)

RLS: anyone can **read** (the game screen), and only logged-in users can **change** anything.

## 3. Deploy to Cloudflare Pages

Workers & Pages → Create → Pages → connect the GitHub repo:

- Framework preset: **Vite** (or None)
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Or without GitHub: `npm run build && npx wrangler pages deploy dist`

## 4. On event day

- Open the URL on the laptop connected to the TV → press **F** (fullscreen)
- Open the page once while there is internet. The config is cached in the browser, so the game **keeps running if the wifi drops**.
  (It's a React app, so the page must already be open. Don't refresh while offline.)
- Staff shortcuts (keyboard) or the ⚙ button at the bottom right of the screen:

| Key | Action |
|---|---|
| `Space` / `Enter` | Next player (after a success) |
| `N` | Skip, new word |
| `H` | Show hint (the first letter blinks) |
| `F` | Fullscreen |
| `Esc` | Cancel selection |

## How to play

- **Click/tap** the first letter, then **click/tap** the last letter, **or**
- **Drag/swipe** from the first letter to the last

Automatic behaviour: a 💡 Hint button appears after 40 seconds, the board resets if left untouched for 90 seconds,
and a new round starts N seconds after a success (N is set in admin).

## Limits

| Item | Limit |
|---|---|
| Grid size | 8×8 – 15×15 (recommended 10–12 for a booth) |
| Words in the grid | 5 – 15 |
| Word list | max 100 |
| Word length | 3 letters – grid size; A–Z only (spaces/hyphens are stripped) |
