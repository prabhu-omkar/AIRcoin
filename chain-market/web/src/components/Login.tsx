import React, { useState } from "react";
import { ACCOUNTS, DEMO_PASSWORD, signIn, type Account } from "../auth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export const Login: React.FC<{ onSignedIn: (a: Account) => void }> = ({ onSignedIn }) => {
  const [email, setEmail] = useState(ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const acc = signIn(email, password);
    if (acc) onSignedIn(acc);
    else setError("Email or password is incorrect.");
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to AIRcoin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Trade, sell and retire AIR credits.</p>
        <div className="mt-6 grid gap-2">
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 text-sm" />
        </div>
        <div className="mt-4 grid gap-2">
          <label htmlFor="password" className="text-sm font-medium">Password</label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 text-sm" />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <Button type="submit" className="mt-6 h-10 w-full text-sm">Sign in</Button>
        <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          <p>Demo accounts, password <span className="font-mono text-foreground">{DEMO_PASSWORD}</span>:</p>
          <ul className="mt-2 grid gap-1">
            {ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button type="button" onClick={() => setEmail(a.email)} className="text-left hover:text-foreground">
                  {a.email} <span className="text-muted-foreground/70">({a.wallet.minerId ? `owns ${a.wallet.minerId}` : a.wallet.role === "company" ? "company" : "no miner"})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </form>
    </div>
  );
};
