import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DashboardApp } from "../../src/apps/dashboard/DashboardApp";
import "../../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DashboardApp />
  </StrictMode>,
);
