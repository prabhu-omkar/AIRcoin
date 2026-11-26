// Regulator page and the citizen's "request a miner" form. Everything here reads from and writes
// to the AIRcoin chain; approvals are transactions signed by the regulator's key.
import React, { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { KeyRound } from "lucide-react";
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
import { Button, Empty, Facts, Field, Section, ago, fmtAir, short, units, when } from "../ui";

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

const allRejections = () => fetchRejections();

/* ------------------------------------------------------------------ regulator */

export const RegulatorView: React.FC = () => {
  const { currentWallet, showToast } = useWallet();
  const [totals] = usePoll<Totals | null>(fetchTotals, null);
  const [apps, reloadApps] = usePoll<Application[]>(fetchApplications, []);
  const [miners, reloadMiners] = usePoll<MinerRow[]>(fetchMinerList, []);
  const [rejections] = usePoll<RejectionRecord[]>(allRejections, []);
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
    const res = await approveMiner(currentWallet, {
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
      showToast(`Approved. ${a.name} now owns ${minerId}.`, "success");
    } else showToast(`Couldn't approve: ${res.error}`, "error");
    reloadApps();
    reloadMiners();
  };

  const reject = async (a: Application) => {
    setBusy(`a${a.id}`);
    const res = await rejectApplication(currentWallet, a.id, "The site or plan doesn't meet programme criteria");
    setBusy(null);
    showToast(res.success ? `Request from ${a.name} declined` : `Couldn't decline: ${res.error}`, res.success ? "info" : "error");
    reloadApps();
  };

  const toggle = async (m: MinerRow) => {
    setBusy(m.miner_id);
    const next = m.status === "active" ? "suspended" : "active";
    const res = await setMinerStatus(currentWallet, m.miner_id, next);
    setBusy(null);
    showToast(
      res.success ? `${m.miner_id} ${next === "active" ? "reactivated" : "suspended"}` : `Couldn't change status: ${res.error}`,
      res.success ? "success" : "error",
    );
    reloadMiners();
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Regulator</h1>
          <p>Approve new miners, watch the fleet, and check that companies retire what they owe.</p>
        </div>
      </header>

      <Facts
        items={[
          ["AIR minted", totals ? fmtAir(units(totals.minted)) : "—", "all time"],
          ["AIR retired", totals ? fmtAir(units(totals.burned)) : "—"],
          ["Active miners", totals ? `${totals.active_miners} of ${totals.miners}` : "—"],
          ["Waiting for you", String(pending.length), pending.length === 1 ? "request" : "requests"],
        ]}
      />

      {issued && (
        <div className="notice" style={{ marginTop: 24 }}>
          <KeyRound size={18} style={{ flex: "none", marginTop: 2 }} />
          <div>
            <b>{issued.minerId} is registered.</b> Put this device key on the miner before shipping it. It is shown only once.
            <br />
            <code>MINER_ID={issued.minerId} MINER_PRIVATE_KEY={issued.privateKey}</code>
          </div>
        </div>
      )}

      <Section title="Miner requests" sub="Approving registers the miner on the chain with its own device key and 20 stickers.">
        <div className="panel table-wrap">
          {!pending.length ? (
            <Empty title="No requests waiting" />
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Site</th>
                  <th>Plants</th>
                  <th>Sent</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.name.startsWith("0x") ? <span className="mono">{short(a.applicant)}</span> : a.name}
                      {!a.name.startsWith("0x") && <small className="mono">{short(a.applicant)}</small>}
                    </td>
                    <td>
                      {a.location.label || "Unnamed site"}
                      <small className="mono">
                        {a.location.lat.toFixed(4)}, {a.location.lon.toFixed(4)}
                      </small>
                    </td>
                    <td className="num">{a.plants_planned}</td>
                    <td>{ago(a.submitted_at)}</td>
                    <td className="r" style={{ whiteSpace: "nowrap" }}>
                      <Button size="sm" variant="primary" disabled={busy === `a${a.id}`} onClick={() => approve(a)}>
                        Approve
                      </Button>{" "}
                      <Button size="sm" disabled={busy === `a${a.id}`} onClick={() => reject(a)}>
                        Decline
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      <Section title="Fleet" sub="Every registered miner. A suspended miner can't mint and loses its vote in block production.">
        <div className="panel table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Miner</th>
                <th>Owner</th>
                <th className="r">Minted</th>
                <th className="r">Verified / rejected</th>
                <th className="r">Blocks made</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {miners.map((m) => (
                <tr key={m.miner_id}>
                  <td>
                    <span className="mono">{m.miner_id}</span>
                    <small>{(m.location as any).label ?? m.location.geohash}</small>
                  </td>
                  <td className="mono">{short(m.owner_wallet)}</td>
                  <td className="r num">{fmtAir(units(m.totals.minted))} AIR</td>
                  <td className="r num">
                    {m.totals.epochs_minted} /{" "}
                    <span className={m.totals.epochs_rejected ? "bad" : ""}>{m.totals.epochs_rejected}</span>
                  </td>
                  <td className="r num">
                    {m.node.power ? m.node.blocks_proposed.toLocaleString("en-IN") : <span className="faint">not a node</span>}
                  </td>
                  <td>{m.status === "active" ? <span className="tag ok">Active</span> : <span className="tag bad">Suspended</span>}</td>
                  <td className="r">
                    <Button size="sm" disabled={busy === m.miner_id} onClick={() => toggle(m)}>
                      {m.status === "active" ? "Suspend" : "Reactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid-2">
        <Section title="Rejected proofs" sub="Signed claims every node refused, kept on the chain.">
          <div className="panel table-wrap">
            {!rejections.length ? (
              <Empty title="Nothing rejected" />
            ) : (
              <table className="t">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Miner</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rejections.slice(0, 12).map((r) => (
                    <tr key={r.tx_hash}>
                      <td>{when(r.ts)}</td>
                      <td className="mono">{r.miner_id}</td>
                      <td title={r.reason}>
                        <span className="tag bad">{r.reason_code.replace(/_/g, " ")}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>

        <Section title="Obligations" sub="AIR each company must retire this period.">
          <div className="panel table-wrap">
            {!obligations.length ? (
              <Empty title="No obligations set" />
            ) : (
              <table className="t">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="r">Retired</th>
                    <th style={{ width: "34%" }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => {
                    const pct = Math.min(100, (units(o.burned) / Math.max(units(o.amount), 1e-18)) * 100);
                    return (
                      <tr key={o.company + o.period}>
                        <td>
                          {o.company_name}
                          <small>{o.period}</small>
                        </td>
                        <td className="r num">
                          {fmtAir(units(o.burned))} / {fmtAir(units(o.amount))}
                        </td>
                        <td>
                          <div className="progress">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Section>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ citizen request */

export const MinerRequest: React.FC = () => {
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
    const res = await applyForMiner(currentWallet, {
      name: currentWallet.name,
      label: form.label,
      lat: Number(form.lat),
      lon: Number(form.lon),
      plants: Number(form.plants),
    });
    setBusy(false);
    showToast(res.success ? "Request sent to the regulator" : `Couldn't send the request: ${res.error}`, res.success ? "success" : "error");
    reload();
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Section title="Get a miner" sub="Grow 20 tagged plants under a camera miner and earn AIR for the pollution they remove.">
      {latest && latest.status !== "rejected" ? (
        <div className="panel pad">
          {latest.status === "approved" ? (
            <>
              <span className="tag ok">Approved</span> Your request for {latest.location.label} was approved as{" "}
              <b>{latest.miner_id}</b>. Its earnings will show here once it's installed and online.
            </>
          ) : (
            <>
              <span className="tag warn">Waiting for the regulator</span> You asked for a miner at {latest.location.label},{" "}
              {ago(latest.submitted_at)}.
            </>
          )}
        </div>
      ) : (
        <form className="panel pad form" onSubmit={submit}>
          {latest?.status === "rejected" && (
            <p className="bad" style={{ margin: 0 }}>
              Your last request was declined: {latest.reason}. You can send a new one.
            </p>
          )}
          <div className="form-row">
            <Field label="Where will it go?">
              <input className="input" value={form.label} onChange={set("label")} />
            </Field>
            <Field label="Plants you'll grow">
              <input className="input" inputMode="numeric" value={form.plants} onChange={set("plants")} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Latitude">
              <input className="input" inputMode="decimal" value={form.lat} onChange={set("lat")} />
            </Field>
            <Field label="Longitude">
              <input className="input" inputMode="decimal" value={form.lon} onChange={set("lon")} />
            </Field>
          </div>
          <div>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Sending…" : "Request a miner"}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
};
