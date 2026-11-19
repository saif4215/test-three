import type { NextConfig } from "next";

const config: NextConfig = {
  // Automated tests build into their own folder so they never disturb a running development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  // Native / Node-only packages must not be bundled.
  serverExternalPackages: ["pg", "sharp", "nodemailer", "@aws-sdk/client-s3"],
  experimental: {
    // Images are uploaded through a route handler; server actions only carry text.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default config;
