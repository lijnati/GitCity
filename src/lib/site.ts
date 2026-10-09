export const SITE = {
  name: "GitCity",
  tagline: "Every codebase is a city.",
  description:
    "Turn any public GitHub repository into an interactive 3D world. Explore its structure, discover complexity, and see how code comes together.",
  /** Absolute base for metadata and preview-image URLs. On Vercel, falls back to the production domain. */
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000"),
  source: "https://github.com/lijnati/GitCity",
};
