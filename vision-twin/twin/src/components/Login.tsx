import { useState } from "react";
import { ArrowRight, Camera, Check, Eye, EyeOff, Leaf, LockKeyhole, ScanLine, ShieldCheck, Sprout } from "lucide-react";
import { DEMO_PASSWORD, OWNERS, signIn, type Owner } from "../auth";

export function Login({ onSignedIn }: { onSignedIn: (o: Owner) => void }) {
  const [email, setEmail] = useState(OWNERS[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const owner = signIn(email, password);
    if (owner) onSignedIn(owner); else setError("Those details do not match a miner account.");
  };
  const choose = (owner: Owner) => { setEmail(owner.email); setPassword(DEMO_PASSWORD); setError(""); };
  return (
    <div className="login">
      <section className="login-visual">
        <div className="login-brand"><span><Leaf size={20} /></span><b>AIRcoin</b><small>Miner OS</small></div>
        <div className="vision-graphic">
          <div className="vision-corners"><i /><i /><i /><i /></div>
          <span className="vision-leaf"><Leaf size={82} strokeWidth={1} /></span>
          <span className="scan-line" />
          <div className="vision-tag"><ScanLine size={13} /><span>PLANT 07</span><b>98.4% VERIFIED</b></div>
        </div>
        <div className="visual-copy">
          <span><i /> Live verification network</span>
          <h1>Your plants are doing valuable work.</h1>
          <p>See every leaf, sensor, proof, and earning from one calm control room.</p>
        </div>
        <div className="visual-stats"><span><Camera size={15} /> Computer vision</span><span><ShieldCheck size={15} /> Signed proofs</span><span><Check size={15} /> Live earnings</span></div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit} className="login-card">
          <span className="secure-label"><LockKeyhole size={13} /> Owner access</span>
          <h2>Welcome to your miner</h2>
          <p className="sub">Sign in to monitor plants, air quality, and earnings.</p>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
          <div className="password-label"><label htmlFor="password">Password</label><button type="button">Forgot password?</button></div>
          <div className="password-field"><input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} /><button type="button" onClick={() => setShow((v) => !v)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary login-submit">Open dashboard <ArrowRight size={16} /></button>
          <div className="owner-divider"><span>Demo profiles</span></div>
          <div className="owner-list">{OWNERS.map((owner) => <button type="button" key={owner.email} className={email === owner.email ? "selected" : ""} onClick={() => choose(owner)}><span><Sprout size={16} /></span><span><b>{owner.name}</b><small>{owner.minerId ?? "No miner assigned"}</small></span><ArrowRight size={14} /></button>)}</div>
          <p className="demo">Choose a profile to fill the demo password.</p>
        </form>
      </section>
    </div>
  );
}
