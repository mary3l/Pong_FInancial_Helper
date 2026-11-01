import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pong Money",
    short_name: "Pong Money",
    description: "Track spending, bills and paydays with Pong, your money buddy.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4FAF6",
    theme_color: "#13795A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
