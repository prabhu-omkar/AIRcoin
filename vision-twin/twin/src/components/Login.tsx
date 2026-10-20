import { useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { DEMO_PASSWORD, OWNERS, signIn, type Owner } from "../auth";
import { ndviColor } from "../ui";
import { Mark } from "./Mark";

// A fixed 4 x 5 "camera frame" for the sign-in page: mostly vigorous plants, one missing, one plastic.
const FRAME = [0.92, 0.84, 0.95, 0.71, 0.88, 0.9, 0.62, 0.97, -1, 0.86, 0.79, 0.93, 0.08, 0.9, 0.83, 0.94, 0.88, 0.76, 0.91, 0.85];

export function Login({ onSignedIn }: { onSignedIn: (o: Owner) => void }) {
  const [email, setEmail] = useState(OWNERS[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const owner = signIn(email, password);
    if (owner) onSignedIn(owner);
    else setError("That email and password don't match a miner account. Pick a demo profile below to fill them in.");
  };
  const choose = (owner: Owner) => {
    setEmail(owner.email);
    setPassword(DEMO_PASSWORD);
    setError("");
  };
  return (
    <div className="login">
      <section className="login-visual" aria-hidden>
        <div className="login-brand"><Mark size={32} /><b>AIRcoin</b></div>
        <div className="login-frame">
          {FRAME.map((v, i) => (
            <i key={i} className={v < 0 ? "gone" : v < 0.3 ? "fake" : ""} style={v >= 0 ? { background: ndviColor(v) } : undefined} />
          ))}
        </div>
        <div className="login-copy">
          <h1>Twenty plants, one camera, a proof every minute.</h1>
          <p>Your miner checks every pot for living leaves, estimates the pollution they pulled from the air, and signs it. Sign in to see the work and what it earned.</p>
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit} className="login-card">
          <h2>Sign in to your miner</h2>
          <p className="sub">Owner console for camera, plants, air and earnings.</p>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} />
          <label htmlFor="password">Password</label>
          <div className="password-field">
            <input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
            <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="btn ink block">Open console <ArrowRight size={16} /></button>
          <div className="profiles">
            <span>Demo profiles</span>
            {OWNERS.map((owner) => (
              <button type="button" key={owner.email} className={email === owner.email ? "selected" : ""} onClick={() => choose(owner)}>
                <span className="avatar">{owner.name.split(" ").map((x) => x[0]).join("")}</span>
                <span><b>{owner.name}</b><small>{owner.minerId ?? "No miner yet"}</small></span>
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}
