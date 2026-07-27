// ASCO anchor mark. `tone="light"` renders the ink parts white for the navy
// hero; default navy ink for light backgrounds. Red arms / blue crossbar kept.
export default function AnchorMark({
  size = 40,
  tone = "ink",
  className,
}: {
  size?: number;
  tone?: "ink" | "light";
  className?: string;
}) {
  const ink = tone === "light" ? "#ffffff" : "#0A2540";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="20" cy="14" r="5" fill={ink} />
      <line x1="20" y1="19" x2="20" y2="32" stroke={ink} strokeWidth="2.5" />
      <path d="M 8 26 Q 20 38 32 26" stroke="#C41E3A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <line x1="12" y1="20" x2="28" y2="20" stroke="#2A9FD6" strokeWidth="2.5" />
    </svg>
  );
}
