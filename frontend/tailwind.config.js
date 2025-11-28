// tailwind.config.js
module.exports = {
  content: [
    // Tells Tailwind to scan all JS/JSX files in the src directory
    "./src/**/*.{js,jsx,ts,tsx}", 
    "./public/index.html"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}