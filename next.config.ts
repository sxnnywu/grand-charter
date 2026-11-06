import type { NextConfig } from "next";

const config: NextConfig = {
  // Keep the repository's existing AGENTS.md under its own control.
  agentRules: false,
};

export default config;
