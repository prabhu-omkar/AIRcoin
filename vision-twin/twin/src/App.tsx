import { lazy, Suspense, useState } from "react";
import { Mark } from "./components/Mark";

const TwinApp = lazy(() => import("./apps/twin/TwinApp"));
const DashboardApp = lazy(() => import("./apps/dashboard/DashboardApp").then((m) => ({ default: m.DashboardApp })));

type ViewMode = "twin" | "dashboard";

function Loading({ label }: { label: string }) {
  return (
    <div className="boot" role="status">
      <Mark size={40} />
      <span>{label}</span>
    </div>
  );
}

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "twin";
    const param = new URLSearchParams(window.location.search).get("view");
    return param === "dashboard" || window.location.hash.includes("dashboard") ? "dashboard" : "twin";
  });

  const go = (mode: ViewMode) => {
    setViewMode(mode);
    window.history.replaceState(null, "", `#${mode}`);
  };

  return viewMode === "twin" ? (
    <Suspense fallback={<Loading label="Building the 3D twin" />}>
      <TwinApp onOpenDashboard={() => go("dashboard")} />
    </Suspense>
  ) : (
    <Suspense fallback={<Loading label="Opening the owner console" />}>
      <DashboardApp onOpenTwin={() => go("twin")} />
    </Suspense>
  );
}

export default App;
