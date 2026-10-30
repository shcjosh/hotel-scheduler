/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 品牌色（沿用既有 indigo，集中由 token 管理）
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        // 狀態色（StatusPill / Badge / Toast 共用）
        status: {
          success: "#059669",
          "success-soft": "#ecfdf5",
          warning: "#d97706",
          "warning-soft": "#fffbeb",
          danger: "#dc2626",
          "danger-soft": "#fef2f2",
          info: "#2563eb",
          "info-soft": "#eff6ff",
        },
        shift: {
          a: "#e3f2fd",
          b: "#fff3e0",
          c: "#f3e5f5",
          d: "#1a237e",
          off: "#ffcdd2",
          special: "#e1bee7",
        },
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.08)",
        popover: "0 8px 24px -8px rgb(15 23 42 / 0.25)",
        drawer: "-8px 0 24px -8px rgb(15 23 42 / 0.2)",
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        lg: ["16px", { lineHeight: "22px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
      },
    },
  },
  plugins: [],
}
