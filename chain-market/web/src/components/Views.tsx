import React, { useCallback, useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { fetchListings, fetchMiner, fetchMinerMints } from "../services/api";
import { burnAir, burnForCompliance, buyListing, listAirOnMarket, readObligation } from "../services/chain";
import type { C4MinerData, MarketplaceListing } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const wei = (v: string) => Number(v) / 1e18;
const air = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const COMPLIANCE_PERIOD = "2026";

export const Section: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
  <section className="rounded-xl border border-border bg-card">
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div className="grid gap-2">
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

function useListings() {
  const [items, setItems] = useState<MarketplaceListing[] | null>(null);
  const load = useCallback(async () => setItems((await fetchListings()).filter((l) => l.status === "active")), []);
  useEffect(() => {
    load();
  }, [load]);
  return { items, reload: load };
}

export const WalletView: React.FC = () => {
  const { airBalance, tinrBalance, claimFreeFaucet } = useWallet();
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">AIR balance</p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">{airBalance}</p>
        <p className="mt-1 text-xs text-muted-foreground">1 AIR = 1 mg of PM2.5-equivalent removed</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Rupee balance (test tINR)</p>
        <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">₹{tinrBalance}</p>
        <Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={async () => { setBusy(true); await claimFreeFaucet(); setBusy(false); }}>
          {busy ? "Adding…" : "Add ₹10,000 test funds"}
        </Button>
      </div>
    </div>
  );
};

export const BuyView: React.FC = () => {
  const { currentWallet, refreshBalances, showToast } = useWallet();
  const { items, reload } = useListings();
  const [buying, setBuying] = useState<number | null>(null);
  const offers = items?.filter((l) => l.seller.toLowerCase() !== currentWallet.address.toLowerCase());
  const buy = async (l: MarketplaceListing) => {
    setBuying(l.id);
    const res = await buyListing(currentWallet.privateKey!, l.id, String(wei(l.price_tinr)));
    setBuying(null);
    showToast(res.success ? `Bought ${air(wei(l.amount_air))} AIR` : `Purchase failed: ${res.error}`, res.success ? "success" : "error");
    if (res.success) {
      reload();
      refreshBalances();
    }
  };
  return (
    <Section title="AIR for sale">
      {!offers ? <Empty>Loading offers…</Empty> : !offers.length ? <Empty>No offers right now. Check back after the next mint.</Empty> : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="pb-3 font-medium">Amount</th><th className="pb-3 font-medium">Price</th><th className="pb-3 font-medium">Per AIR</th><th className="pb-3 font-medium">Seller</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {offers.map((l) => (
              <tr key={l.id}>
                <td className="py-3 font-mono">{air(wei(l.amount_air))} AIR</td>
                <td className="py-3 font-mono">{inr(wei(l.price_tinr))}</td>
                <td className="py-3 font-mono text-muted-foreground">{inr(wei(l.price_tinr) / wei(l.amount_air))}</td>
                <td className="py-3 font-mono text-muted-foreground">{short(l.seller)}</td>
                <td className="py-3 text-right"><Button size="sm" disabled={buying !== null} onClick={() => buy(l)}>{buying === l.id ? "Buying…" : "Buy"}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
};

export const SellView: React.FC = () => {
  const { currentWallet, airBalance, refreshBalances, showToast } = useWallet();
  const { items, reload } = useListings();
  const [amount, setAmount] = useState("0.01");
  const [price, setPrice] = useState("10");
  const [busy, setBusy] = useState(false);
  const mine = items?.filter((l) => l.seller.toLowerCase() === currentWallet.address.toLowerCase());
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await listAirOnMarket(currentWallet.privateKey!, amount, price);
    setBusy(false);
    showToast(res.success ? `Listed ${amount} AIR for ₹${price}` : `Listing failed: ${res.error}`, res.success ? "success" : "error");
    if (res.success) {
      reload();
      refreshBalances();
    }
  };
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
      <Section title="Sell AIR">
        <form onSubmit={submit} className="grid gap-4">
          <Field id="sell-amount" label="Amount (AIR)" hint={`You have ${airBalance} AIR`}>
            <Input id="sell-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-sm" />
          </Field>
          <Field id="sell-price" label="Total price (₹)">
            <Input id="sell-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="h-10 text-sm" />
          </Field>
          <Button type="submit" disabled={busy} className="h-10">{busy ? "Listing…" : "List for sale"}</Button>
        </form>
      </Section>
      <Section title="Your listings">
        {!mine ? <Empty>Loading…</Empty> : !mine.length ? <Empty>You have nothing listed.</Empty> : (
          <ul className="divide-y divide-border text-sm">
            {mine.map((l) => (
              <li key={l.id} className="flex justify-between py-3 font-mono">
                <span>{air(wei(l.amount_air))} AIR</span>
                <span className="text-muted-foreground">{inr(wei(l.price_tinr))}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};

export const BurnView: React.FC = () => {
  const { currentWallet, airBalance, refreshBalances, showToast } = useWallet();
  const [obligation, setObligation] = useState<{ amount: number; burned: number } | null>(null);
  const [amount, setAmount] = useState("0.01");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => readObligation(currentWallet.address, COMPLIANCE_PERIOD).then(setObligation), [currentWallet.address]);
  useEffect(() => {
    load();
  }, [load]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = obligation ? await burnForCompliance(currentWallet.privateKey!, COMPLIANCE_PERIOD, amount) : await burnAir(currentWallet.privateKey!, amount);
    setBusy(false);
    showToast(res.success ? `Retired ${amount} AIR` : `Burn failed: ${res.error}`, res.success ? "success" : "error");
    if (res.success) {
      load();
      refreshBalances();
    }
  };
  const pct = obligation ? Math.min(100, (obligation.burned / obligation.amount) * 100) : 0;
  return (
    <Section title={obligation ? `Compliance burn, ${COMPLIANCE_PERIOD}` : "Retire AIR"}>
      <div className="grid max-w-md gap-5">
        {obligation ? (
          <div>
            <div className="flex justify-between text-sm"><span>{air(obligation.burned)} of {air(obligation.amount)} AIR retired</span><span className="text-muted-foreground">{pct.toFixed(0)}%</span></div>
            <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Burning removes AIR from circulation for good, so the pollution it represents can't be claimed again.</p>
        )}
        <form onSubmit={submit} className="grid gap-4">
          <Field id="burn-amount" label="Amount (AIR)" hint={`You have ${airBalance} AIR`}>
            <Input id="burn-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-sm" />
          </Field>
          <Button type="submit" variant="destructive" disabled={busy} className="h-10">{busy ? "Burning…" : "Burn AIR"}</Button>
        </form>
      </div>
    </Section>
  );
};

export const MinerView: React.FC = () => {
  const { currentWallet } = useWallet();
  const [miner, setMiner] = useState<C4MinerData | null>(null);
  const [mints, setMints] = useState<{ amount: string; ts: number; tx_hash: string }[]>([]);
  const id = currentWallet.minerId!;
  useEffect(() => {
    fetchMiner(id).then(setMiner);
    fetchMinerMints(id, 8).then((r) => setMints(r.items ?? []));
  }, [id]);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
      <Section title={id}>
        <dl className="grid gap-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Status</dt><dd className="capitalize">{miner?.status ?? "…"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Plants registered</dt><dd>{miner ? miner.sticker_ids.length || 20 : "…"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Total earned</dt><dd className="font-mono">{miner ? `${air(wei(miner.totals.minted))} AIR` : "…"}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">Location</dt><dd className="font-mono">{miner ? `${miner.location.lat.toFixed(4)}, ${miner.location.lon.toFixed(4)}` : "…"}</dd></div>
        </dl>
        <a href="http://localhost:5174/" className="mt-5 inline-block text-sm font-medium text-primary hover:underline">Open miner dashboard</a>
      </Section>
      <Section title="Recent earnings">
        {!mints.length ? <Empty>No earnings yet.</Empty> : (
          <ul className="divide-y divide-border text-sm">
            {mints.map((m) => (
              <li key={m.tx_hash} className="flex justify-between py-2.5">
                <span className="text-muted-foreground">{new Date(m.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="font-mono">+{air(wei(m.amount))} AIR</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};

export const RequestMinerView: React.FC = () => {
  const { currentWallet, showToast } = useWallet();
  const key = `aircoin.minerRequest.${currentWallet.address}`;
  const [request, setRequest] = useState<{ address: string; at: number } | null>(() => JSON.parse(localStorage.getItem(key) ?? "null"));
  const [address, setAddress] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = { address, at: Date.now() };
    localStorage.setItem(key, JSON.stringify(r));
    setRequest(r);
    showToast("Miner request sent to the regulator", "success");
  };
  return (
    <Section title="Request a miner">
      {request ? (
        <div className="text-sm">
          <p className="font-medium">Request received</p>
          <p className="mt-1 text-muted-foreground">Sent {new Date(request.at).toLocaleDateString("en-IN", { dateStyle: "medium" })} for {request.address}. The regulator reviews it and ships a camera rig with 20 tagged plant stickers. Your earnings appear here once it is installed.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid max-w-md gap-4">
          <p className="text-sm text-muted-foreground">A miner is a camera that watches up to 20 tagged plants and pays you AIR for the pollution they remove.</p>
          <Field id="req-address" label="Installation address">
            <Input id="req-address" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Flat, street, city" className="h-10 text-sm" />
          </Field>
          <Button type="submit" className="h-10">Send request</Button>
        </form>
      )}
    </Section>
  );
};
