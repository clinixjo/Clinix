import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Stray lockfiles elsewhere on the machine confuse root inference.
  turbopack: { root: process.cwd() },
};

export default withNextIntl(nextConfig);
