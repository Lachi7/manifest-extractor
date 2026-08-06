"use client";

import { useEffect, useRef, useState } from "react";
import AnchorMark from "./anchor-mark";
import { scrollToEl, scrollToTop } from "./smooth-scroll";

type LandingProps = {
  busy: boolean;
  status: string;
  isError: boolean;
  onDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

const STEPS = [
  {
    n: "01",
    title: "Drop the scan",
    body: "The PDF never leaves your machine to be rasterised — pdf.js renders every page to an image right in the browser, at the DPI you choose.",
  },
  {
    n: "02",
    title: "Every page is read",
    body: "Each page is classified on its own: transfer manifest, wagon summary, single-wagon waybill, or something to skip. Sideways scans rotate first.",
  },
  {
    n: "03",
    title: "Tables come back",
    body: "Rows are extracted into a strict schema, GNG codes are joined to their wagons, station and customer names are matched to their master-data IDs, and the result downloads as CSV or JSON.",
  },
];

const CAPS = [
  { k: "Transfer manifest", v: "16 columns per wagon — numbers, stations, cargo codes, net and gross weight." },
  { k: "Wagon summary", v: "Waybill numbers, containers, ferry and bridge payers, station codes." },
  { k: "GNG / waybills", v: "СМГС and Пересылочная накладная forms read down to the wagon and GNG code." },
  { k: "Reference IDs", v: "Stations, carriers and payers matched to master-data port and customer IDs — Azerbaijani, Russian or English spelling." },
  { k: "Auto-classify", v: "No page-type picking required — or pin the type to halve the API calls." },
  { k: "Rotate & enlarge", v: "Fix sideways scans and inspect any page at full render resolution before extracting." },
  { k: "CSV / JSON export", v: "Both tables and the waybill join, header block included, one click each." },
];

export default function Landing(props: LandingProps) {
  useReveal();
  const anywhere = useDropAnywhere(props.onDrop);

  return (
    <div className="landing">
      <div className="scroll-progress" aria-hidden="true" />
      <ChainRail />

      {/* ── Hero: anchor, badge, title, subtitle, cue. No upload here — the
             only drop zone is the closing card (or drop anywhere). ─────── */}
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-inner">
          {/* climb (scroll) on the wrapper, sway (loop) on the inner element,
              so the two transforms compose instead of overwriting */}
          <div className="hero-anchor-climb">
            <span className="hero-chain" aria-hidden="true" />
            <div className="hero-anchor-wrap">
              <AnchorMark size={120} />
            </div>
          </div>

          <div className="landing-badge" data-reveal style={{ "--d": "0ms" } as React.CSSProperties}>
            RAILWAY MANIFEST · OCR
          </div>
          <h1 className="landing-title">
            {["Railway", "Manifest", "Extractor"].map((w, i) => (
              <span className="word" key={w} style={{ "--d": `${80 + i * 90}ms` } as React.CSSProperties} data-reveal>
                {w}
              </span>
            ))}
          </h1>
          <p className="landing-sub" data-reveal style={{ "--d": "380ms" } as React.CSSProperties}>
            Upload a scanned railway shipping PDF — pages are auto-classified and tables, single-wagon waybills and
            GNG codes are extracted with Gemini.
          </p>
          <button
            className="hero-cta"
            type="button"
            onClick={() => scrollToEl("#upload")}
            data-reveal
            style={{ "--d": "480ms" } as React.CSSProperties}
          >
            Upload a PDF ↓
          </button>
        </div>

        <div className="scroll-cue">
          <span>how it works</span>
          <i className="cue-chevron" aria-hidden="true" />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="section steps-section">
        <h2 className="section-title" data-reveal>
          Three moves, no typing
        </h2>
        <p className="section-lead" data-reveal style={{ "--d": "80ms" } as React.CSSProperties}>
          The whole pipeline from the notebook, running as a page.
        </p>
        <div className="steps">
          {STEPS.map((s, i) => (
            <article
              className="step-card"
              key={s.n}
              data-reveal
              style={{ "--d": `${i * 120}ms` } as React.CSSProperties}
            >
              <div className="step-n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── What it reads ────────────────────────────────────────────── */}
      <section className="section">
        <h2 className="section-title" data-reveal>
          What it pulls up
        </h2>
        <p className="section-lead" data-reveal style={{ "--d": "80ms" } as React.CSSProperties}>
          Every document type in the pipeline, and what comes back from each.
        </p>
        <div className="cap-grid">
          {CAPS.map((c, i) => (
            <article
              className="cap-card"
              key={c.k}
              data-reveal
              style={{ "--d": `${(i % 3) * 100}ms` } as React.CSSProperties}
            >
              <h3>{c.k}</h3>
              <p>{c.v}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── The one upload zone ──────────────────────────────────────── */}
      <section className="section closing" id="upload">
        <div className="closing-card" data-reveal>
          <AnchorMark size={44} tone="light" className="closing-anchor" />
          <h2>Weigh anchor</h2>
          <p>Drop a PDF here — or anywhere on the page. Nothing is stored; the file is read in your browser.</p>
          <div className="dz-reveal">
            <UploadZone {...props} />
          </div>
          <button className="link-btn" onClick={() => scrollToTop()} type="button">
            ↑ back to top
          </button>
        </div>
      </section>

      <footer className="landing-foot">
        <AnchorMark size={20} />
        <span>Railway Manifest Extractor · pages rendered locally, extraction via Gemini</span>
      </footer>

      {anywhere && (
        <div className="drop-veil">
          <div className="drop-veil-inner">
            <div className="dropzone-icon">↑</div>
            Release to load the PDF
          </div>
        </div>
      )}
      {props.isError && <div className="landing-toast">{props.status}</div>}
    </div>
  );
}

/* ── Upload zone ───────────────────────────────────────────────────────
   Pointer-magnetic: the card leans toward the cursor and settles back on
   leave, so the drop target feels physical rather than flat.              */
function UploadZone({ busy, onDrop, onFileInput }: LandingProps) {
  const ref = useRef<HTMLLabelElement>(null);
  const magnetic = useRef(true);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    magnetic.current = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || !magnetic.current || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    // −1 → 1 across the card, damped to a few px of lean.
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--mx", (dx * 14).toFixed(2));
    el.style.setProperty("--my", (dy * 10).toFixed(2));
    el.style.setProperty("--tilt", (dx * 2.2).toFixed(2));
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", "0");
    el.style.setProperty("--my", "0");
    el.style.setProperty("--tilt", "0");
  }

  return (
    <label
      ref={ref}
      className={`dropzone ${dragOver ? "dragover" : ""}`}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        reset();
        setDragOver(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        reset();
        setDragOver(false);
        onDrop(e);
      }}
    >
      <input type="file" accept="application/pdf" onChange={onFileInput} disabled={busy} hidden />
      <div className="dropzone-icon">↑</div>
      <div className="dropzone-main">{busy ? "Loading PDF…" : "Click to upload or drag & drop"}</div>
      <div className="dropzone-hint">PDF only · rendered in your browser</div>
    </label>
  );
}

/* ── Chain rail ────────────────────────────────────────────────────────
   The anchor rides the chain as the page scrolls: position from --scroll-p,
   tilt from --scroll-v, and the chain draws taut above it. All CSS — this
   component only renders the shape.                                       */
function ChainRail() {
  return (
    <div className="chain-rail" aria-hidden="true">
      <div className="chain-track">
        <div className="chain-drawn" />
      </div>
      <div className="chain-anchor">
        <AnchorMark size={28} />
      </div>
    </div>
  );
}

/* Drop a PDF anywhere on the landing — no need to scroll to the zone. */
function useDropAnywhere(onDrop: (e: React.DragEvent) => void) {
  const [over, setOver] = useState(false);
  const handler = useRef(onDrop);
  handler.current = onDrop;

  useEffect(() => {
    const carriesFile = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    // dragenter/leave fire per element, so count them to know when the
    // pointer has actually left the window.
    let depth = 0;

    const onEnter = (e: DragEvent) => {
      if (!carriesFile(e)) return;
      depth++;
      setOver(true);
    };
    const onOver = (e: DragEvent) => {
      if (carriesFile(e)) e.preventDefault(); // required, else the browser opens the file
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const onDropWin = (e: DragEvent) => {
      if (!carriesFile(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      // the handler only reads preventDefault + dataTransfer.files, both of
      // which a native DragEvent has
      handler.current(e as unknown as React.DragEvent);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDropWin);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDropWin);
    };
  }, []);

  return over;
}

/* Reveal-on-scroll: one observer for every [data-reveal] on the landing. */
function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nodes.forEach((n) => n.classList.add("is-in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target); // reveal once, then stop watching
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}
