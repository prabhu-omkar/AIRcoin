/** AIRcoin mark: a coin whose face is a single leaf, the vein drawn as a rising airflow line. Same as the twin's. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--ink)" />
      <path d="M9.5 21.5c0-7 5-11.5 13-12-0.4 7.6-5 12.4-12 12.6" fill="var(--moss-bright)" />
      <path d="M10.2 21.8c2.6-3.4 5.4-6 9.2-8.6" fill="none" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
