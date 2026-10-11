import { useState } from "react";
import { DEMO_PASSWORD, OWNERS, signIn, type Owner } from "../auth";

export function Login({ onSignedIn }: { onSignedIn: (o: Owner) => void }) {
  const [email, setEmail] = useState(OWNERS[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const o = signIn(email, password);
    if (o) onSignedIn(o);
    else setError("Email or password is incorrect.");
  };
  return (
    <div className="login">
      <form onSubmit={submit} className="login-card">
        <h1>Sign in to your miner</h1>
        <p className="sub">See your plants, camera and earnings.</p>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Sign in</button>
        <p className="demo">Demo password <code>{DEMO_PASSWORD}</code>: {OWNERS.map((o) => o.email).join(", ")}</p>
      </form>
    </div>
  );
}
