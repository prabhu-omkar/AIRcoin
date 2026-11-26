// Small shared building blocks and formatters for the marketplace.
import React from "react";
import { ethers } from "ethers";

export const COMPLIANCE_PERIOD = "2026";

/** Base-unit string (18 decimals) → number of AIR / tINR. */
export const units = (v?: string | number | null) => Number(ethers.formatEther(String(v ?? "0")));
export const fmtAir = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: n && n < 1 ? 4 : 2, maximumFractionDigits: n < 1 ? 4 : 2 });
export const fmtInr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return when(ms);
};
export const initials = (name: string) =>
  name.startsWith("0x") ? name.slice(2, 4).toUpperCase() : name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export const twinUrl = (minerId?: string) => {
  const base = import.meta.env.VITE_TWIN_URL || "http://localhost:5174/";
  return minerId ? `${base}${base.includes("?") ? "&" : "?"}miner=${minerId}` : base;
};

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "default";
  size?: "sm" | "lg";
  block?: boolean;
};
export const Button: React.FC<BtnProps> = ({ variant = "default", size, block, className = "", ...rest }) => (
  <button
    className={["btn", variant !== "default" && variant, size, block && "block", className].filter(Boolean).join(" ")}
    {...rest}
  />
);

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="field">
    {label}
    {children}
  </label>
);

export const AmountInput: React.FC<{ value: string; onChange: (v: string) => void; unit: string; placeholder?: string }> = ({
  value,
  onChange,
  unit,
  placeholder,
}) => (
  <div className="input-wrap">
    <input className="input" inputMode="decimal" value={value} placeholder={placeholder ?? "0.00"} onChange={(e) => onChange(e.target.value)} />
    <span className="unit">{unit}</span>
  </div>
);

export const Section: React.FC<{ title: string; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  sub,
  action,
  children,
}) => (
  <section className="section">
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const Empty: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
  <div className="empty">
    <b>{title}</b>
    {children}
  </div>
);

export const Facts: React.FC<{ items: [React.ReactNode, React.ReactNode, React.ReactNode?][] }> = ({ items }) => (
  <dl className="facts panel">
    {items.map(([label, value, unit], i) => (
      <div className="fact" key={i}>
        <dt>{label}</dt>
        <dd>
          {value}
          {unit && <small>{unit}</small>}
        </dd>
      </div>
    ))}
  </dl>
);

/**
 * One bar per epoch over the last `count` epochs, height = AIR minted in it. Rejected epochs show
 * in red, empty ones as a stub, so the rhythm of proof of useful work is visible at a glance.
 */
export const EpochStrip: React.FC<{
  mints: { epoch: number; amount: string }[];
  rejected?: number[];
  count?: number;
  nowEpoch?: number;
  label?: React.ReactNode;
}> = ({ mints, rejected = [], count = 30, nowEpoch, label }) => {
  const latest = nowEpoch ?? Math.floor(Date.now() / 60000) - 1;
  const byEpoch = new Map(mints.map((m) => [m.epoch, units(m.amount)]));
  const bad = new Set(rejected);
  const epochs = Array.from({ length: count }, (_, i) => latest - count + 1 + i);
  const max = Math.max(...epochs.map((e) => byEpoch.get(e) ?? 0), 1e-9);
  return (
    <div className="strip" aria-label="AIR minted per epoch">
      <div className="strip-bars">
        {epochs.map((e) => {
          const v = byEpoch.get(e);
          if (bad.has(e)) return <i key={e} className="rej" style={{ height: "30%" }} title={`Epoch ${e}: rejected`} />;
          if (!v) return <i key={e} className="gap" title={`Epoch ${e}: no proof`} />;
          return <i key={e} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} title={`Epoch ${e}: ${fmtAir(v)} AIR`} />;
        })}
      </div>
      <div className="strip-meta">
        <span>{count} min ago</span>
        {label}
        <span>now</span>
      </div>
    </div>
  );
};

export const MetaMaskIcon: React.FC = () => (
  <svg className="fox" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#E2761B" d="M21.3 2.5 13.2 8.5l1.5-3.5z" />
    <path fill="#E4761B" d="m2.7 2.5 8 6.1-1.4-3.6zM18.4 16.6l-2.2 3.3 4.6 1.3 1.3-4.5zM1.9 16.7l1.3 4.5 4.6-1.3-2.1-3.3z" />
    <path fill="#E4761B" d="m7.5 10.9-1.3 1.9 4.6.2-.2-4.9zM16.5 10.9l-3.2-2.9-.1 5 4.6-.2zM7.8 19.9l2.7-1.3-2.4-1.9zM13.5 18.6l2.8 1.3-.4-3.2z" />
    <path fill="#F6851B" d="m10.8 13-3.2-1 2.3-1zm2.4 0 .9-2 2.3 1z" />
    <path fill="#C0AD9E" d="m16.3 19.9-2.8-1.3.2 1.8v.8zm-8.5 0 2.6 1.3v-.8l.2-1.8z" />
    <path fill="#763D16" d="m21.3 2.5-8.1 6 .9 2.4 1.9-.5 3.1-2.2zM2.7 2.5l8.1 6-.9 2.4-1.9-.5-3.1-2.2z" />
  </svg>
);
