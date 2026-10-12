import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ root: "web", base: "/totalwork_hh/", plugins: [react()], build: { outDir: "../site-dist", emptyOutDir: true } });
