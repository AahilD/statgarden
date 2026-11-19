import type { NextConfig } from "next";

// The browser talks to /api/*; Next forwards it to FastAPI, so there are no
// cross-origin requests and the API address lives in one place.
const API_URL = process.env.STATGARDEN_API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // the builder used to live at /build, then /explore; old shared links keep working (query string is kept)
    return [
      { source: "/build", destination: "/lab", permanent: true },
      { source: "/explore", destination: "/lab", permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
