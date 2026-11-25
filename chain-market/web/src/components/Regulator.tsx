// Regulator console and the citizen's "request a miner" card. Everything here reads from
// and writes to the AIRcoin chain; approvals are on-chain transactions signed by the
// regulator's key.
import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { CheckCircle2, Cpu, Flame, KeyRound, ShieldAlert, ShieldCheck, Sprout, XCircle } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import {
  fetchApplications,
  fetchMinerList,
  fetchObligations,
  fetchRejections,
  fetchTotals,
  type Application,
  type MinerRow,
  type Obligation,
  type Totals,
} from "../services/api";
import { applyForMiner, approveMiner, rejectApplication, setMinerStatus } from "../services/chain";
import type { RejectionRecord } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const airOf = (v: string) => Number(ethers.formatEther(v || "0"));
const fmt = (n: number, d = 4) => n.toLocaleString("en-IN", { maximumFractionDigits: d });
const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const when = (ms: number) => new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function usePoll<T>(load: () => Promise<T>, initial: T, ms = 5000): [T, () => void] {
  const [v, setV] = useState<T>(initial);
  const reload = useCallback(() => {
    load().then(setV);
  }, [load]);
  useEffect(() => {
    reload();
    const t = setInterval(reload, ms);
    return () => clearInterval(t);
  }, [reload, ms]);
  return [v, reload];
}

const Panel: React.FC<{ icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode }> = ({
  icon,
  title,
  sub,
  children,
}) => (
  <section className="pro-panel">
    <div className="panel-header">
      <div className="panel-header-left">
        <div className="panel-badge-icon">{icon}</div>
        <div>
          <h3>{title}</h3>
          {sub && <p className="panel-subtitle">{sub}</p>}
        </div>
      </div>
    </div>
    <div className="ledger-table-wrap">{children}</div>
  </section>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="empty-state-card">
    <p className="font-medium text-foreground/90">{text}</p>
  </div>
);

/* ------------------------------------------------------------------ regulator */

export const RegulatorView: React.FC = () => {
  const { currentWallet, showToast } = useWallet();
  const key = currentWallet.privateKey!;
  const [totals] = usePoll<Totals | null>(fetchTotals, null);
  const [apps, reloadApps] = usePoll<Application[]>(fetchApplications, []);
  const [miners, reloadMiners] = usePoll<MinerRow[]>(fetchMinerList, []);
  const [rejections] = usePoll<RejectionRecord[]>(() => fetchRejections(), []);
  const [obligations] = usePoll<Obligation[]>(fetchObligations, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ minerId: string; address: string; privateKey: string } | null>(null);

  const pending = apps.filter((a) => a.status === "pending");

  const approve = async (a: Application) => {
    setBusy(`a${a.id}`);
    // The regulator provisions the device: a fresh key and the next 20 sticker ids.
    const device = ethers.Wallet.createRandom();
    const used = miners.flatMap((m) => m.sticker_ids);
    const first = used.length ? Math.max(...used) + 1 : 0;
    const nums = miners.map((m) => Number(m.miner_id.replace(/\D/g, "")) || 0);
    const minerId = `miner-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
    const res = await approveMiner(key, {
      application_id: a.id,
      miner_id: minerId,
      label: a.location.label || a.name,
      device_address: device.address.toLowerCase(),
      owner_wallet: a.applicant,
      sticker_ids: Array.from({ length: 20 }, (_, i) => first + i),
      location: { ...a.location, geofence_m: a.location.geofence_m || 50 },
    });
    setBusy(null);
    if (res.success) {
      setIssued({ minerId, address: device.address, privateKey: device.privateKey });
      showToast(`${minerId} approved for ${a.name}`, "success");
    } else showToast(`Approval failed: ${res.error}`, "error");
    reloadApps();
    reloadMiners();
  };

  const reject = async (a: Application) => {
    setBusy(`a${a.id}`);
    const res = await rejectApplication(key, a.id, "Location or plan does not meet programme criteria");
    setBusy(null);
    showToast(res.success ? `Application #${a.id} rejected` : `Failed: ${res.error}`, res.success ? "info" : "error");
    reloadApps();
  };

  const toggle = async (m: MinerRow) => {
    setBusy(m.miner_id);
    const next = m.status === "active" ? "suspended" : "active";
    const res = await setMinerStatus(key, m.miner_id, next);
    setBusy(null);
    showToast(res.success ? `${m.miner_id} is now ${next}` : `Failed: ${res.error}`, res.success ? "success" : "error");
    reloadMiners();
  };

  return (
    <div className="unified-dashboard-grid">
      <section className="metrics-row">
        {[
          ["AIR minted", totals ? fmt(airOf(totals.minted)) : "—", "verified plant work, all time"],
          ["AIR burned", totals ? fmt(airOf(totals.burned)) : "—", "retired against obligations"],
          ["Miners", totals ? `${totals.active_miners} / ${totals.miners}` : "—", "active / registered"],
          ["Pending requests", String(pending.length), `chain block ${totals?.block_number ?? "—"}`],
        ].map(([label, value, sub]) => (
          <div className="pro-metric-card" key={label}>
            <div className="metric-body">
              <span className="metric-label">{label}</span>
              <div className="metric-value-wrap">
                <span className="metric-value font-mono">{value}</span>
              </div>
              <p className="metric-subtext">{sub}</p>
            </div>
          </div>
        ))}
      </section>

      {issued && (
        <div className="info-banner">
          <KeyRound size={18} className="text-emerald-700 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed text-foreground/80">
            <b>{issued.minerId} provisioned.</b> Load this device key onto the miner's Pi (shown once):{" "}
            <code className="font-mono break-all">MINER_ID={issued.minerId} MINER_PRIVATE_KEY={issued.privateKey}</code>
            <br />
            Device address {issued.address}. To make the Pi a block-producing node, run <code>aircoind init</code> on it and
            send <code>set_validator</code> with its key.
          </div>
        </div>
      )}

      <Panel icon={<Sprout size={16} />} title="Miner requests" sub="Citizens applying for a miner. Approval registers it on-chain.">
        {!pending.length ? (
          <Empty text="No pending requests" />
        ) : (
          <table className="pro-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Applicant</th>
                <th>Site</th>
                <th>Plants</th>
                <th>Submitted</th>
                <th className="text-right">Decision</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono">{a.id}</td>
                  <td>
                    {a.name}
                    <span className="block text-xs text-muted-foreground font-mono">{short(a.applicant)}</span>
                  </td>
                  <td>
                    {a.location.label || "—"}
                    <span className="block text-xs text-muted-foreground font-mono">
                      {a.location.lat.toFixed(4)}, {a.location.lon.toFixed(4)}
                    </span>
                  </td>
                  <td className="font-mono">{a.plants_planned}</td>
                  <td>{when(a.submitted_at)}</td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" disabled={busy === `a${a.id}`} onClick={() => approve(a)}>
                        <CheckCircle2 size={14} /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy === `a${a.id}`} onClick={() => reject(a)}>
                        <XCircle size={14} /> Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel icon={<Cpu size={16} />} title="Miner fleet" sub="Every registered miner, its node and its record.">
        <table className="pro-table">
          <thead>
            <tr>
              <th>Miner</th>
              <th>Owner</th>
              <th>Minted</th>
              <th>Epochs ok / rejected</th>
              <th>Node power · blocks</th>
              <th className="text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {miners.map((m) => (
              <tr key={m.miner_id}>
                <td>
                  <span className="font-mono font-semibold">{m.miner_id}</span>
                  <span className="block text-xs text-muted-foreground">{(m.location as any).label ?? m.location.geohash}</span>
                </td>
                <td className="font-mono">{short(m.owner_wallet)}</td>
                <td className="font-mono">{fmt(airOf(m.totals.minted))} AIR</td>
                <td className="font-mono">
                  {m.totals.epochs_minted} / {m.totals.epochs_rejected}
                </td>
                <td className="font-mono">{m.node.power ? `${m.node.power} · ${m.node.blocks_proposed}` : "not a validator"}</td>
                <td className="text-right">
                  <Button size="sm" variant="outline" disabled={busy === m.miner_id} onClick={() => toggle(m)}>
                    {m.status === "active" ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                    {m.status === "active" ? "Active · suspend" : "Suspended · reactivate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel icon={<ShieldAlert size={16} />} title="Anti-cheat log" sub="Signed proofs every node refused, recorded on-chain.">
        {!rejections.length ? (
          <Empty text="No rejected proofs" />
        ) : (
          <table className="pro-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Miner</th>
                <th>Epoch</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rejections.slice(0, 25).map((r) => (
                <tr key={r.tx_hash}>
                  <td>{when(r.ts)}</td>
                  <td className="font-mono">{r.miner_id}</td>
                  <td className="font-mono">{r.epoch}</td>
                  <td>
                    <span className="proof-tag">{r.reason_code}</span>{" "}
                    <span className="text-xs text-muted-foreground">{r.reason}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel icon={<Flame size={16} />} title="Compliance obligations" sub="AIR each company must burn per period.">
        {!obligations.length ? (
          <Empty text="No obligations set" />
        ) : (
          <table className="pro-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Period</th>
                <th>Burned / required</th>
                <th className="text-right">Progress</th>
              </tr>
            </thead>
            <tbody>
              {obligations.map((o) => {
                const pct = Math.min(100, (airOf(o.burned) / Math.max(airOf(o.amount), 1e-18)) * 100);
                return (
                  <tr key={o.company + o.period}>
                    <td>
                      {o.company_name}
                      <span className="block text-xs text-muted-foreground font-mono">{short(o.company)}</span>
                    </td>
                    <td className="font-mono">{o.period}</td>
                    <td className="font-mono">
                      {fmt(airOf(o.burned))} / {fmt(airOf(o.amount))} AIR
                    </td>
                    <td className="text-right font-mono">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
};

/* ------------------------------------------------------------------ citizen request */

export const MinerRequestCard: React.FC = () => {
  const { currentWallet, showToast } = useWallet();
  const mine = useCallback(
    async () => (await fetchApplications()).filter((a) => a.applicant === currentWallet.address.toLowerCase()),
    [currentWallet.address],
  );
  const [apps, reload] = usePoll<Application[]>(mine, []);
  const [form, setForm] = useState({ label: "Home terrace", lat: "12.9716", lon: "77.5946", plants: "20" });
  const [busy, setBusy] = useState(false);
  const latest = apps[apps.length - 1];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await applyForMiner(currentWallet.privateKey!, {
      name: currentWallet.name,
      label: form.label,
      lat: Number(form.lat),
      lon: Number(form.lon),
      plants: Number(form.plants),
    });
    setBusy(false);
    showToast(res.success ? "Request sent to the regulator" : `Request failed: ${res.error}`, res.success ? "success" : "error");
    reload();
  };

  return (
    <Panel icon={<Sprout size={16} />} title="Request a miner" sub="Grow 20 plants, earn AIR for the pollution they remove.">
      <div className="p-6">
        {latest && (
          <p className="text-sm mb-4">
            Request #{latest.id} ({latest.location.label}):{" "}
            <b>
              {latest.status === "approved"
                ? `approved as ${latest.miner_id}. Your miner kit is on its way.`
                : latest.status === "rejected"
                ? `not approved (${latest.reason})`
                : "waiting for the regulator"}
            </b>
          </p>
        )}
        {(!latest || latest.status === "rejected") && (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-5 items-end">
            {(
              [
                ["label", "Site name"],
                ["lat", "Latitude"],
                ["lon", "Longitude"],
                ["plants", "Plants"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="text-xs font-medium grid gap-1">
                {label}
                <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </Button>
          </form>
        )}
      </div>
    </Panel>
  );
};
