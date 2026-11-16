import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#12191a",
        panel: "#1b2426",
        panel2: "#202b2d",
        ink: "#f3efe6",
        inkdim: "#9caaa7",
        inkfaint: "#6d7d79",
        emerald: "#3d8a73",
        emeralddeep: "#2a5c4b",
        gold: "#c9a227",
        lava: "#c1440e",
        line: "rgba(243,239,230,0.12)",
        linestrong: "rgba(243,239,230,0.22)",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
