import { useEffect, useState } from "react";
import { Building2, Landmark, Leaf, Sprout } from "lucide-react";
import { ACCOUNTS, DEMO_PASSWORD, signIn, signInWithWallet, type Account } from "../auth";
import { fetchStatus } from "../services/api";
import { connectMetaMask, hasMetaMask } from "../services/metamask";
import { Button, EpochStrip, Field, MetaMaskIcon, initials } from "../ui";

const roleLine = (a: Account) =>
  a.wallet.role === "admin"
    ? "Regulator: approves miners, sets obligations"
    : a.wallet.role === "company"
      ? "Company: buys and retires AIR"
      : a.wallet.minerId
        ? `Citizen with ${a.wallet.minerId}`
        : "Citizen, no miner yet";

const RoleIcon = ({ a }: { a: Account }) =>
  a.wallet.role === "admin" ? <Landmark size={15} /> : a.wallet.role === "company" ? <Building2 size={15} /> : <Sprout size={15} />;

// A decorative strip for the story panel: a calm, plausible rhythm of epochs.
const DEMO_STRIP = Array.from({ length: 40 }, (_, i) => ({
  epoch: Math.floor(Date.now() / 60000) - 40 + i,
  amount: String(BigInt(Math.round((0.025 + 0.012 * Math.sin(i / 3) + 0.006 * Math.cos(i * 1.7)) * 1e6)) * 10n ** 12n),
}));

export function Login({ onSignedIn }: { onSignedIn: (a: Account) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    fetchStatus().then((s) => setHeight(s?.height ?? null));
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const account = signIn(email, password);
    if (account) onSignedIn(account);
    else setError("That email and password don't match a demo account. Pick one below to fill them in.");
  };

  const metamask = async () => {
    setError("");
    setConnecting(true);
    try {
      onSignedIn(signInWithWallet(await connectMetaMask()));
    } catch (err: any) {
      setError(err?.code === 4001 ? "MetaMask connection was declined." : err?.message ?? String(err));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={16} />
          </span>
          AIRcoin
        </div>
        <div>
          <h1>Plants clean the air. Prove it, earn for it.</h1>
          <p>
            Every minute, a camera miner checks its 20 plants and signs what they removed. Miners across the
            network verify it before a single AIR is minted.
          </p>
          <EpochStrip
            mints={DEMO_STRIP}
            count={40}
            label={<span>{height ? `Chain at block ${height.toLocaleString("en-IN")}` : "AIR minted per minute"}</span>}
          />
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <h2>Sign in</h2>
          <p>Use your wallet, or a demo profile.</p>

          <Button variant="primary" size="lg" block onClick={metamask} disabled={connecting}>
            <MetaMaskIcon /> {connecting ? "Waiting for MetaMask…" : hasMetaMask() ? "Connect MetaMask" : "Connect MetaMask (not installed)"}
          </Button>
          {!hasMetaMask() && (
            <p className="faint" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
              Install the MetaMask extension to use your own wallet. No network or gas needed: it only signs.
            </p>
          )}

          <div className="or">or use a demo account</div>

          <form onSubmit={submit} className="form">
            <Field label="Email">
              <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
            </Field>
            <Field label="Password">
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
            </Field>
            <Button type="submit" block>
              Sign in
            </Button>
          </form>
          {error && <p className="auth-error">{error}</p>}

          <div className="profiles" style={{ marginTop: 18 }}>
            {ACCOUNTS.map((a) => (
              <button
                type="button"
                key={a.email}
                className="profile"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  setError("");
                }}
              >
                <span className="avatar" aria-hidden>
                  {a.wallet.role === "citizen" ? initials(a.name) : <RoleIcon a={a} />}
                </span>
                <span>
                  <b>{a.name}</b>
                  <small>{roleLine(a)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
