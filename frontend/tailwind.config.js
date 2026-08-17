/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        shift: {
          a: "#e3f2fd",
          b: "#fff3e0",
          c: "#f3e5f5",
          d: "#1a237e",
          off: "#ffcdd2",
          special: "#e1bee7",
        },
      },
    },
  },
  plugins: [],
}
