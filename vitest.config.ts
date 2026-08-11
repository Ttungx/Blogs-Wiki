import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";

const migrations = await readD1Migrations(path.resolve("worker/migrations"));

export default {
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ["worker/__tests__/d1/**/*.test.ts"],
  },
};
