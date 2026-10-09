import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // Three.js objects (camera, renderer, controls) are mutable by design; R3F's
    // idiom is to mutate them imperatively from effects and frame callbacks.
    files: ["src/components/scene/**/*.tsx"],
    rules: { "react-hooks/immutability": "off" },
  },
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
];

export default config;
