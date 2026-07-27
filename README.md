# Railway Manifest Extractor - Web

A web version of the `GEMINI_API_VL_3` notebook. Upload a scanned railway
shipping PDF and it extracts structured data with Gemini:

- **Page auto-classification** — `transfer_manifest_table`, `wagon_summary_table`, `single_wagon_waybill`, `other`
- **Table extraction** — the two manifest table types (same schemas + prompts as the notebook)
- **GNG / wagon extraction** from single-wagon waybills (СМГС / Пересылочная накладная), **merged into the summary table** by wagon number
- **Per-page rotation** for sideways scans, preview, CSV download (Excel-friendly, UTF-8 BOM)

The landing page runs on [Lenis](https://github.com/darkroomengineering/lenis) smooth
scroll (`app/smooth-scroll.tsx`). It publishes the scroll state as CSS custom
properties on `<html>` — `--scroll-y`, `--scroll-p` (0→1 progress) and
`--scroll-v` (velocity) — and every scroll-linked effect (the small anchor
riding the left chain rail, the big hero anchor being hauled up, the hero
parallax, the progress hairline) is plain CSS reading those, so one rAF loop
drives the whole page. Two rules worth knowing before editing it:

- **Don't `transition` a scroll-linked property.** The target moves every frame,
  so the transition never lands (it reads as lag or as a stuck value).
- **One transform per element.** The hero anchor's scroll-driven climb lives on
  `.hero-anchor-climb` and its 7s sway on the child `.hero-anchor-wrap`, so the
  two compose instead of overwriting each other. Same reason reveals sit on a
  wrapper around the drop zone rather than on the drop zone itself.
Under `prefers-reduced-motion` Lenis never mounts, the variables stay `0`, and
the decorative motion is switched off in CSS.

## How it works (why it runs free on Vercel/Render)

The notebook used `pdf2image` + `poppler` (a system binary) and Gradio — neither
runs on serverless hosts. Here:

- The **browser** renders PDF pages to images with `pdf.js` (no poppler needed; rotation is native).
- Small **serverless API routes** (`/api/classify`, `/api/extract`, `/api/gng`) each make **one** Gemini call, so no function exceeds the free-tier time limit.
- Pages are rendered as **PNG at 500 DPI** — byte-for-byte the same as the notebook's `convert_from_path(dpi=500)` + `image.save(buf, "PNG")`.

> **Vercel body-size caveat:** Vercel serverless functions cap the request body at **4.5 MB**. A 500-DPI PNG of a dense page can exceed that. If you deploy to Vercel and hit `413`/body-too-large, lower the **Render DPI** control to 300, or deploy to **Render** (no such limit). Locally there is no limit.

## Run locally (Ubuntu Linux)

### Prerequisites

- **Node.js 18+** (20 or 22 recommended) and npm. No Python, poppler, or other
  system packages are needed — the browser renders PDFs with `pdf.js`.

Check what you have:

```bash
node -v   # should print v18 or higher
npm -v
```

If Node is missing or too old, install a current version (NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Steps

```bash
# 1. Enter the web app folder
cd web

# 2. Install dependencies (creates node_modules/)
npm install

# 3. Create your local env file and add your Gemini API key
cp .env.example .env.local
nano .env.local                   # paste your key, save (Ctrl+O, Enter, Ctrl+X)

# 4. Start the dev server
npm run dev
```

Then open **http://localhost:3000** in your browser, upload a PDF, and it extracts the manifest data.

Set in `.env.local`:

```
GEMINI_API_KEY=your_key_here
# optional:
GEMINI_MODEL=gemini-3.5-flash
```

Get a key at https://aistudio.google.com/apikey

> The API key stays in server-side env vars and is never sent to the browser.

### Port already in use?

Run on a different port:

```bash
npm run dev -- -p 3001
```

### Production-style run (optional)

To serve an optimized build instead of the dev server:

```bash
npm run build
npm start                         # http://localhost:3000
```

## Deploy to Vercel

1. Push the `web/` folder to a GitHub repo (or run `vercel` from inside `web/`).
2. In the Vercel project: **Settings → Environment Variables**, add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`).
3. Deploy. Framework preset is auto-detected as **Next.js**.

> If you import the whole repo (not just `web/`), set the Vercel **Root Directory** to `web`.

## Deploy to Render (free plan)

Render needs a Git repo to pull from — there is no way to upload a folder. Push
this `web/` directory as its own repo first:

```bash
cd web
git init -b main
git add -A
git commit -m "Railway manifest extractor web app"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.gitignore` already keeps `node_modules/`, `.next/` and `.env.local` out, so
your API key is never pushed.

Then at https://dashboard.render.com/web/new:

1. **Source** — the first screen only asks *where the code lives*. Pick
   **Git Provider** and authorise GitHub, or paste the URL under **Public Git
   Repository** if the repo is public. There is no "Environment" dropdown on
   this screen; it comes next.
2. **Configure** — after the repo is selected, the settings page appears. The
   field the old instructions called *Environment* is now called **Language**:
   set it to **Node** (it is usually auto-detected from `package.json`).

   | Field | Value |
   |---|---|
   | Language | `Node` |
   | Branch | `main` |
   | Root Directory | *leave blank* (blank if the repo root **is** `web/`; set to `web` only if you pushed the whole parent folder) |
   | Build Command | `npm install && npm run build` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

3. **Environment Variables** — add `GEMINI_API_KEY` (and optionally
   `GEMINI_MODEL`). Do **not** set `PORT`; Render injects it and `next start`
   reads it automatically.
4. **Deploy Web Service**. The first build takes a few minutes.

### Free-plan caveats

- **Cold starts.** A free service sleeps after ~15 minutes with no traffic, and
  the next request takes ~50 seconds to wake it. Nothing is lost — the first
  upload after an idle period is just slow.
- **512 MB build memory.** `next build` occasionally runs out of memory on the
  free instance. If a deploy fails with a `JavaScript heap out of memory` or
  exit code 137, add an env var `NODE_OPTIONS` = `--max-old-space-size=460` and
  redeploy.
- **No 4.5 MB body limit** here (unlike Vercel), so 500-DPI pages upload fine.

## Notes

- The model defaults to `gemini-3.5-flash` (as in the notebook). Override with `GEMINI_MODEL`.
- Everything happens per page: render → classify → extract/gng. Rate-limit (429) backoff is built in.
- The API key lives only in server env vars; it is never sent to the browser.
