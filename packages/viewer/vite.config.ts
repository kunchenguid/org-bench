import preact from "@preact/preset-vite";

export default {
  base: "./",
  plugins: [preact()],
  build: {
    outDir: "../../docs",
    emptyOutDir: false,
  },
};
