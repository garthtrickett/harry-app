import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command, mode }) => ({
  base: "/",
  plugins: [
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      injectManifest: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // High threshold to support pre-cached audio assets
      },
      filename: "sw.ts",
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
        type: "module",
      },
      manifest: {
        name: "Cal Wizard",
        short_name: "Cal Wizard",
        description: "Master Training",
        start_url: "/",
        display: "standalone",
        background_color: "#09090b",
        theme_color: "#09090b",
        orientation: "portrait-primary",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ],
        screenshots: [
          {
            src: "/screenshot-mobile.png",
            sizes: "512x512",
            type: "image/png",
            label: "Review Interface"
          },
          {
            src: "/screenshot-desktop.png",
            sizes: "512x512",
            type: "image/png",
            form_factor: "wide",
            label: "Curator Dashboard"
          }
        ]
      }
    })
  ],
    
  server: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT) : 3100,
    allowedHosts: true,
    hmr: {
      clientPort: process.env.VITE_HMR_SECURE === "true" ? 443 : undefined,
    },
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.BACKEND_PORT || "42169"}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://127.0.0.1:${process.env.BACKEND_PORT || "42169"}`,
        ws: true,
        changeOrigin: true,
      }
    }
  }
}));
