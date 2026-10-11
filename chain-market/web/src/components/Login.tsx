import { useState } from "react";
import { ArrowRight, Building2, Eye, EyeOff, Leaf, Sprout } from "lucide-react";
import { ACCOUNTS, DEMO_PASSWORD, signIn, type Account } from "../auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Login({ onSignedIn }: { onSignedIn: (a: Account) => void }) {
  const [email, setEmail] = useState(ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const account = signIn(email, password);
    if (account) onSignedIn(account);
    else setError("Those details do not match a demo account.");
  };
  const choose = (account: Account) => {
    setEmail(account.email); setPassword(DEMO_PASSWORD); setError("");
  };
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <div className="auth-brand"><span><Leaf size={20} /></span><b>AIRcoin</b></div>
        <div className="story-copy">
          <h1>Clean air.<br /><em>Measured and rewarded.</em></h1>
        </div>
      </section>
      <section className="auth-panel">
        <form onSubmit={submit} className="auth-card">
          <div className="auth-heading">
            <h2>Welcome back</h2><p>Sign in to manage your AIR, miners, and impact.</p>
          </div>
          <div className="auth-fields">
            <label htmlFor="email">Email address</label>
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
            <div className="password-label"><label htmlFor="password">Password</label><button type="button">Forgot password?</button></div>
            <div className="password-wrap">
              <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {error && <p className="auth-error">{error}</p>}
            <Button type="submit" className="auth-submit">Enter workspace <ArrowRight size={17} /></Button>
          </div>
          <div className="demo-divider"><span>or explore with a demo profile</span></div>
          <div className="demo-profiles">
            {ACCOUNTS.map((account) => (
              <button type="button" key={account.email} onClick={() => choose(account)} className={email === account.email ? "selected" : ""}>
                <span className="profile-icon">{account.wallet.role === "company" ? <Building2 size={17} /> : <Sprout size={17} />}</span>
                <span><b>{account.name}</b><small>{account.wallet.minerId ? account.wallet.minerId + " owner" : account.wallet.role === "company" ? "Compliance buyer" : "Citizen / no miner"}</small></span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
