import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "night-950": "#050816",
        "night-900": "#0b1026",
        "night-800": "#111736",
        "night-700": "#19224a",
        "emerald-glow": "#14f195",
        "rose-glow": "#f15b82",
      },
      boxShadow: {
        panel: "0 20px 45px -24px rgba(20, 241, 149, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
