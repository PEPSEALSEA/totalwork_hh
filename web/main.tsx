import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "../src/app/globals.css";
import "./web.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
