import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { routeWriter } from "./vite-plugins/route-writer";

export default defineConfig({
  plugins: [
    react(),
    routeWriter(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "places.json",
        "roads.geojson",
        "routes/index.json",
        "routes/*.json",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,geojson,png,svg,ico,webmanifest}"],
        // roads.geojson is ~2.2 MB — bump cap so it precaches for offline routing.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\//.test(url.href),
            handler: "CacheFirst",
            options: {
              cacheName: "carto-voyager-tiles",
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: "Sasakay — Legazpi Jeepney Map",
        short_name: "Sasakay",
        description:
          "Free offline-first jeepney trip planner for Legazpi City, by bytebento.ph.",
        theme_color: "#059669",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
