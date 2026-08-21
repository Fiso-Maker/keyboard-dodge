import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const configuredPagesBaseUrl = process.env.PAGES_BASE_URL?.replace(/\/$/, "");
const pagesBaseUrl = isGitHubPages
  ? configuredPagesBaseUrl || "https://fiso-maker.github.io/keyboard-dodge"
  : "";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export" as const,
        assetPrefix: pagesBaseUrl,
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
