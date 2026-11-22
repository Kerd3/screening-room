import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
    // Headroom for slow shared CI runners (a pure test once hit the 5s default there).
    testTimeout: 15_000,
  },
});
