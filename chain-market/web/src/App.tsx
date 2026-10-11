import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  Bell,
  Cpu,
  ExternalLink,
  Flame,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Radio,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  X,
} from "lucide-react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { currentAccount, signOut, type Account } from "./auth";
import { Login } from "./components/Login";
import { UnifiedOverviewView, UnifiedMarketView } from "./components/Views";
import { cn } from "./lib/utils";

type Tab = "overview" | "market";

const Shell = ({
  account,
  onSignOut,
}: {
  account: Account;
  onSignOut: () => void;
}) => {
  const { switchWallet, toast } = useWallet();
  const [tab, setTab] = useState<Tab>("overview");
  const [marketSubtab, setMarketSubtab] = useState<"buy" | "burn" | "sell">(
    "buy"
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    switchWallet(account.wallet);
  }, [account]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasMiner = Boolean(account.wallet.minerId);

  const navigateToMarket = (subtab: "buy" | "burn" | "sell" = "buy") => {
    setMarketSubtab(subtab);
    setTab("market");
    setMobileOpen(false);
  };

  return (
    <div className="pro-platform-shell">
      {/* SIDEBAR NAVIGATION */}
      <aside className={cn("pro-sidebar", mobileOpen && "is-open")}>
        <div className="sidebar-top-brand">
          <div className="brand-logo-gem">
            <Leaf size={18} strokeWidth={2.4} />
          </div>
          <div className="brand-copy">
            <span className="brand-title">AIRcoin</span>
            <span className="brand-network-pill">
              <span className="network-live-dot" />
              Polygon Amoy
            </span>
          </div>
          <button
            className="mobile-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Live Epoch Status Widget */}
        <div className="sidebar-epoch-widget">
          <div className="epoch-header">
            <span className="epoch-title">PoUW Consensus</span>
            <span className="epoch-live-tag">Live · 60s</span>
          </div>
          <div className="epoch-details">
            <span>
              {hasMiner
                ? `Node: ${account.wallet.minerId}`
                : "Standard Settlement Node"}
            </span>
          </div>
        </div>

        {/* Primary Navigation Items */}
        <div className="sidebar-nav-section">
          <span className="nav-group-label">Platform Workspace</span>
          <nav className="pro-nav-list" aria-label="Main Navigation">
            <button
              onClick={() => {
                setTab("overview");
                setMobileOpen(false);
              }}
              className={cn("nav-item", tab === "overview" && "active")}
            >
              <LayoutDashboard size={17} />
              <div className="nav-text">
                <span className="nav-title">Overview & Miner</span>
                <span className="nav-desc">Balances, Rig & Mints</span>
              </div>
            </button>

            <button
              onClick={() => {
                setTab("market");
                setMobileOpen(false);
              }}
              className={cn("nav-item", tab === "market" && "active")}
            >
              <Store size={17} />
              <div className="nav-text">
                <span className="nav-title">Market & Retire</span>
                <span className="nav-desc">Buy, Burn & Trade</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer User Profile */}
        <div className="sidebar-footer">
          <div className="user-profile-badge">
            <div className="user-avatar-circle">
              {account.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="user-meta">
              <span className="user-name" title={account.name}>
                {account.name}
              </span>
              <span className="user-role-label">
                {account.wallet.minerId
                  ? "Miner Operator"
                  : account.wallet.role === "company"
                  ? "Compliance Buyer"
                  : "Citizen Member"}
              </span>
            </div>
            <button
              onClick={onSignOut}
              className="sign-out-btn"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="sidebar-scrim-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* MAIN VIEWPORT */}
      <section className="pro-main-content">
        {/* Mobile App Bar */}
        <header className="mobile-header-bar">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open Navigation Menu"
          >
            <Menu size={20} />
          </button>
          <div className="mobile-brand-title">
            <Leaf size={16} className="text-emerald-600" /> AIRcoin
          </div>
          <button
            onClick={onSignOut}
            aria-label="Sign Out"
            className="text-muted-foreground"
          >
            <LogOut size={18} />
          </button>
        </header>

        {/* Top Desktop Page Title Bar */}
        <header className="pro-page-topbar">
          <div className="topbar-left">
            <div className="breadcrumb-trail">
              <span>AIRcoin Network</span>
              <span className="separator">/</span>
              <span className="current-page">
                {tab === "overview" ? "Overview & Miner" : "Market & Retire"}
              </span>
            </div>
            <h1 className="pro-page-title">
              {tab === "overview"
                ? "Overview & Hardware Miner"
                : "Marketplace & Compliance Retirement"}
            </h1>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="pro-content-area">
          {tab === "overview" && (
            <UnifiedOverviewView onNavigateMarket={navigateToMarket} />
          )}
          {tab === "market" && (
            <UnifiedMarketView initialSubtab={marketSubtab} />
          )}
        </main>
      </section>

      {/* Global Toast Alert */}
      {toast && (
        <div
          role="status"
          className={cn(
            "pro-floating-toast",
            toast.type === "success" && "toast-success",
            toast.type === "error" && "toast-error"
          )}
        >
          <div className="toast-icon-gem">
            {toast.type === "success" ? (
              <ShieldCheck size={16} />
            ) : toast.type === "error" ? (
              <X size={16} />
            ) : (
              <Sparkles size={16} />
            )}
          </div>
          <div className="toast-text-copy">
            <span className="toast-headline">
              {toast.type === "success"
                ? "Transaction Confirmed"
                : toast.type === "error"
                ? "Action Failed"
                : "Network Notification"}
            </span>
            <span className="toast-subtext">{toast.message}</span>
          </div>
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
