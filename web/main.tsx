/// <reference types="vite/client" />
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./web.css";

// Light by default; dark only when the user chose it from the account menu.
document.documentElement.dataset.theme = localStorage.getItem("hh_theme") === "dark" ? "dark" : "light";

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) (await import("./dev-mock")).installMock();
  createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
}
void boot();
