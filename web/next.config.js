const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    outputFileTracingRoot: path.join(__dirname),
    serverComponentsExternalPackages: ["@react-pdf/renderer", "@libsql/client"],
  },
};

module.exports = nextConfig;
