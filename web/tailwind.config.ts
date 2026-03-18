import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1565C0",
        repair: "#1976D2",
        claim: "#E65100",
        reclaim: "#B71C1C",
        success: "#2E7D32",
        warning: "#F57F17",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
