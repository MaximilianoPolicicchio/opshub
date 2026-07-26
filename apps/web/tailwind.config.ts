import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0b0d10",
        surface: {
          DEFAULT: "#111418",
          raised: "#161a1f",
          hover: "#1b2027",
        },
        border: {
          DEFAULT: "#242a31",
          subtle: "#1a1f25",
        },
        ink: {
          DEFAULT: "#e6e9ed",
          muted: "#9aa4b1",
          faint: "#68727f",
        },
        accent: {
          DEFAULT: "#5b8def",
          hover: "#4a7ce0",
        },
        health: {
          healthy: "#3fb950",
          attention: "#d29922",
          blocked: "#f85149",
        },
        priority: {
          critical: "#f85149",
          high: "#d29922",
          medium: "#5b8def",
          low: "#68727f",
        },
      },
      fontSize: {
        xxs: ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        md: "8px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
