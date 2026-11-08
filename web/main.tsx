/// <reference types="vite/client" />
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./web.css";

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("mock")) (await import("./dev-mock")).installMock();
  createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
}
void boot();
