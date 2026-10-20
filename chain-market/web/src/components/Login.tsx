import { useState } from "react";
import { ArrowRight, Building2, Eye, EyeOff, Sprout } from "lucide-react";
import { ACCOUNTS, DEMO_PASSWORD, signIn, type Account } from "../auth";
import { Mark } from "./Mark";

const roleOf = (a: Account) => (a.wallet.minerId ? `Owns ${a.wallet.minerId}` : a.wallet.role === "company" ? "Compliance buyer" : "Citizen, no miner yet");

export function Login({ onSignedIn }: { onSignedIn: (a: Account) => void }) {
  const [email, setEmail] = useState(ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const account = signIn(email, password);
    if (account) onSignedIn(account);
    else setError("That email and password don't match a demo account. Pick a profile below to fill them in.");
  };
  const choose = (account: Account) => {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError("");
  };
  return (
    <div className="auth">
      <section className="auth-story">
        <div className="auth-brand"><Mark size={32} /><b>AIRcoin</b></div>
        <div className="auth-flow" aria-hidden>
          <div className="flow-step"><Sprout size={18} /><b>Plants clean the air</b><span>A miner's camera verifies 20 living plants</span></div>
          <div className="flow-step"><Mark size={18} /><b>AIR is minted</b><span>1 AIR per mg of PM2.5-equivalent removed</span></div>
          <div className="flow-step"><Building2 size={18} /><b>Polluters retire it</b><span>Burned for good against a regulator's obligation</span></div>
        </div>
        <div className="auth-copy">
          <h1>A market for air that was actually cleaned.</h1>
          <p>Citizens earn AIR when their plants remove pollution. Companies buy it to meet the obligations set by the regulator.</p>
        </div>
      </section>
      <section className="auth-panel">
        <form onSubmit={submit} className="auth-card">
          <h2>Sign in</h2>
          <p className="sub">Use a demo profile; each one has a funded testnet wallet.</p>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
            <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn ink block">Sign in <ArrowRight size={16} /></button>
          <div className="profiles">
            <span>Demo profiles</span>
            {ACCOUNTS.map((account) => (
              <button type="button" key={account.email} onClick={() => choose(account)} className={email === account.email ? "selected" : ""}>
                <span className="avatar">{account.wallet.role === "company" ? <Building2 size={15} /> : account.name.split(" ").map((x) => x[0]).join("")}</span>
                <span><b>{account.name}</b><small>{roleOf(account)}</small></span>
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
