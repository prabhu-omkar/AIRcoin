import { useEffect, useState } from "react";
import { Box, Landmark, Leaf, LogOut, Store, LayoutGrid } from "lucide-react";
import { currentAccount, signOut, type Account } from "./auth";
import { Login } from "./components/Login";
import { Overview } from "./components/Overview";
import { Market, type MarketTab } from "./components/Market";
import { RegulatorView } from "./components/Regulator";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { onAccountChange } from "./services/metamask";
import { initials, twinUrl } from "./ui";

type Page = "overview" | "market" | "regulator";

function Shell({ account, onSignOut }: { account: Account; onSignOut: () => void }) {
  const { toast, isChainOnline, blockHeight } = useWallet();
  const isRegulator = account.wallet.role === "admin";
  const [page, setPage] = useState<Page>(isRegulator ? "regulator" : "overview");
  const [marketTab, setMarketTab] = useState<MarketTab>("buy");

  // If the user switches account in MetaMask, sign out rather than act for the wrong wallet.
  useEffect(() => {
    if (account.wallet.source !== "metamask") return;
    return onAccountChange((addr) => {
      if (addr !== account.wallet.address.toLowerCase()) onSignOut();
    });
  }, [account, onSignOut]);

  const go = (p: Page, tab?: MarketTab) => {
    if (tab) setMarketTab(tab);
    setPage(p);
    window.scrollTo(0, 0);
  };

  const subtitle =
    account.wallet.source === "metamask"
      ? `MetaMask · ${account.wallet.role === "admin" ? "regulator" : account.wallet.role}`
      : account.wallet.role === "admin"
        ? "Regulator"
        : account.wallet.role === "company"
          ? "Company"
          : account.wallet.minerId
            ? `Owner of ${account.wallet.minerId}`
            : "Citizen";

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">
            <Leaf size={16} />
          </span>
          AIRcoin
        </div>
        <nav className="nav">
          <button className={page === "overview" ? "active" : ""} onClick={() => go("overview")}>
            <LayoutGrid size={17} /> Overview
          </button>
          <button className={page === "market" ? "active" : ""} onClick={() => go("market")}>
            <Store size={17} /> Market
          </button>
          {isRegulator && (
            <button className={page === "regulator" ? "active" : ""} onClick={() => go("regulator")}>
              <Landmark size={17} /> Regulator
            </button>
          )}
          <div className="nav-sep" />
          <button onClick={() => window.open(twinUrl(account.wallet.minerId), "_blank", "noopener")}>
            <Box size={17} /> Digital twin
          </button>
        </nav>
        <div className="rail-foot">
          <div className="chain-pill" title="The node this app reads from">
            <span className={`dot ${isChainOnline ? "live" : "down"}`} />
            {isChainOnline ? `Block ${blockHeight.toLocaleString("en-IN")}` : "Chain unreachable"}
          </div>
          <div className="me">
            <span className="avatar">{initials(account.name)}</span>
            <span className="me-text">
              <b>{account.name}</b>
              <small>{subtitle}</small>
            </span>
            <button className="btn ghost sm" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="page">
          {page === "overview" && <Overview onMarket={(tab) => go("market", tab)} />}
          {page === "market" && <Market tab={marketTab} onTab={setMarketTab} />}
          {page === "regulator" && isRegulator && <RegulatorView />}
        </div>
      </main>

      {toast && (
        <div className={`toast ${toast.type === "error" ? "error" : ""}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [account, setAccount] = useState<Account | null>(currentAccount());
  if (!account) return <Login onSignedIn={setAccount} />;
  return (
    <WalletProvider key={account.email} initial={account.wallet}>
      <Shell
        account={account}
        onSignOut={() => {
          signOut();
          setAccount(null);
        }}
      />
    </WalletProvider>
  );
}
