import { lazy, Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Header, type View } from "./components/Header";
import { startSource } from "./sources";

const TwinApp = lazy(() => import("./apps/twin/TwinApp"));
const Dashboard = lazy(() => import("./apps/dashboard/DashboardApp"));

const VIEWS: View[] = ["twin", "overview", "plants", "earnings"];

function initialView(): View {
  const fromUrl = new URLSearchParams(window.location.search).get("view") ?? window.location.hash.slice(1);
  if (fromUrl === "dashboard") return "overview";
  return (VIEWS as string[]).includes(fromUrl) ? (fromUrl as View) : "twin";
}

export default function App() {
  const [view, setView] = useState<View>(initialView);
  useEffect(() => startSource(), []);

  const go = (v: View) => {
    setView(v);
    window.history.replaceState(null, "", `${window.location.search}#${v}`);
  };

  return (
    <div className="app">
      <Header view={view} onView={go} />
      <Suspense
        fallback={
          <div className="loading">
            <Loader2 size={18} className="spin" /> Loading…
          </div>
        }
      >
        {view === "twin" ? <TwinApp /> : <Dashboard view={view} />}
      </Suspense>
    </div>
  );
}
