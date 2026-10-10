import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Home-screen icon for iOS, which ignores SVG favicons: the logo mark on the paper
 * colour. Opaque on purpose (iOS fills transparency with black) and square, since
 * iOS applies its own corner mask.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f1ec" }}>
        <svg width="108" height="108" viewBox="0 0 20 20">
          <rect x="1" y="9" width="8" height="10" fill="#151515" />
          <rect x="11" y="1" width="8" height="18" fill="#d6401f" />
          <rect x="1" y="1" width="8" height="6" fill="#151515" opacity="0.35" />
        </svg>
      </div>
    ),
    size,
  );
}
