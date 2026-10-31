import { defineConfig } from "vitest/config";

// Same "@/..." imports as tsconfig, so tests can load route handlers
export default defineConfig({ resolve: { alias: { "@": import.meta.dirname } } });
