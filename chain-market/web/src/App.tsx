import { useEffect, useState } from "react";
import { ArrowUpRight, Check, LayoutDashboard, LogOut, Menu, Store, X } from "lucide-react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { currentAccount, signOut, type Account } from "./auth";
import { Login } from "./components/Login";
import { Mark } from "./components/Mark";
import { UnifiedOverviewView, UnifiedMarketView } from "./components/Views";

type Tab = "overview" | "market";

const twinUrl = (): string => {
  if (import.meta.env.VITE_TWIN_URL) return import.meta.env.VITE_TWIN_URL;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" ? "https://aircoin-twin.vercel.app/" : "http://localhost:5174/";
};

const ROLE_LABEL = { citizen: "Miner owner", company: "Compliance buyer", admin: "Regulator" } as const;

const Shell = ({ account, onSignOut }: { account: Account; onSignOut: () => void }) => {
  const { switchWallet, toast, isRpcOnline } = useWallet();
  const [tab, setTab] = useState<Tab>("overview");
  const [marketSubtab, setMarketSubtab] = useState<"buy" | "burn" | "sell">("buy");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    switchWallet(account.wallet);
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = account.wallet.minerId ? "Miner owner" : account.wallet.role === "company" ? ROLE_LABEL.company : "Citizen";
  const go = (t: Tab) => {
    setTab(t);
    setMobileOpen(false);
  };
  const toMarket = (sub: "buy" | "burn" | "sell" = "buy") => {
    setMarketSubtab(sub);
    go("market");
  };
  const initials = account.name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <div className="shell">
      <aside className={`rail ${mobileOpen ? "open" : ""}`}>
        <div className="rail-brand">
          <Mark size={30} />
          <div>
            <b>AIRcoin</b>
            <span>Clean-air credit exchange</span>
          </div>
          <button className="icon-btn rail-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>

        <nav className="rail-nav" aria-label="Main">
          <button className={tab === "overview" ? "active" : ""} aria-current={tab === "overview" ? "page" : undefined} onClick={() => go("overview")}>
            <LayoutDashboard size={17} />
            <span>Overview</span>
          </button>
          <button className={tab === "market" ? "active" : ""} aria-current={tab === "market" ? "page" : undefined} onClick={() => go("market")}>
            <Store size={17} />
            <span>Market</span>
          </button>
        </nav>

        <div className="rail-links">
          <a href={twinUrl()} target="_blank" rel="noreferrer">
            <ArrowUpRight size={16} />
            <span>Miner twin</span>
          </a>
        </div>

        <div className="rail-network">
          <span className={`net-dot ${isRpcOnline ? "on" : ""}`} />
          <div>
            <b>Polygon Amoy</b>
            <span>{isRpcOnline ? "Connected to testnet" : "Testnet unreachable, using local records"}</span>
          </div>
        </div>

        <div className="rail-account">
          <span className="avatar">{initials}</span>
          <div>
            <b>{account.name}</b>
            <span>{role}</span>
          </div>
          <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
        </div>
      </aside>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}

      <section className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div>
            <h1>{tab === "overview" ? (account.wallet.role === "company" ? account.name : `Hello, ${account.name.split(" ")[0]}`) : "Market"}</h1>
            <p>
              {tab === "overview"
                ? account.wallet.role === "company"
                  ? "Buy verified AIR from citizen miners and retire it against your obligation."
                  : "Your verified clean-air credits and what your miner has minted."
                : "Buy AIR minted by plant miners, sell your own, or retire it for good."}
            </p>
          </div>
        </header>
        <main className="content">
          {tab === "overview" ? <UnifiedOverviewView onNavigateMarket={toMarket} /> : <UnifiedMarketView initialSubtab={marketSubtab} />}
        </main>
      </section>

      {toast && (
        <div role="status" className={`toast ${toast.type}`}>
          <span className="toast-icon">{toast.type === "error" ? <X size={15} /> : <Check size={15} />}</span>
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
      {account ? (
        <Shell
          key={account.email}
          account={account}
          onSignOut={() => {
            signOut();
            setAccount(null);
          }}
        />
      ) : (
        <Login onSignedIn={setAccount} />
      )}
    </WalletProvider>
  );
}
