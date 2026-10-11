import React, { useEffect, useState } from "react";
import { Check, AlertCircle, Info } from "lucide-react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { currentAccount, signOut, type Account } from "./auth";
import { Login } from "./components/Login";
import { BurnView, BuyView, MinerView, RequestMinerView, SellView, WalletView } from "./components/Views";
import { cn } from "./lib/utils";

type Tab = "wallet" | "buy" | "sell" | "burn" | "miner";

const Shell: React.FC<{ account: Account; onSignOut: () => void }> = ({ account, onSignOut }) => {
  const { switchWallet, toast } = useWallet();
  const [tab, setTab] = useState<Tab>("wallet");
  useEffect(() => switchWallet(account.wallet), [account]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasMiner = !!account.wallet.minerId;
  const tabs: [Tab, string][] = [["wallet", "Wallet"], ["buy", "Buy"], ["sell", "Sell"], ["burn", "Burn"]];
  if (account.wallet.role === "citizen") tabs.push(["miner", hasMiner ? "My miner" : "Request a miner"]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-8 px-6">
          <span className="text-[15px] font-semibold tracking-tight">AIRcoin</span>
          <nav className="flex h-full gap-1">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn("border-b-2 px-3 text-sm transition-colors", tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{account.name}</span>
            <button onClick={onSignOut} className="text-muted-foreground hover:text-foreground">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {tab === "wallet" && <WalletView />}
        {tab === "buy" && <BuyView />}
        {tab === "sell" && <SellView />}
        {tab === "burn" && <BurnView />}
        {tab === "miner" && (hasMiner ? <MinerView /> : <RequestMinerView />)}
      </main>
      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg">
          {toast.type === "success" ? <Check className="h-4 w-4 text-emerald-600" /> : toast.type === "error" ? <AlertCircle className="h-4 w-4 text-red-600" /> : <Info className="h-4 w-4 text-muted-foreground" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [account, setAccount] = useState<Account | null>(currentAccount());
  return (
    <WalletProvider>
      {account ? <Shell key={account.email} account={account} onSignOut={() => { signOut(); setAccount(null); }} /> : <Login onSignedIn={setAccount} />}
    </WalletProvider>
  );
}
