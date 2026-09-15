import { ImageResponse } from "next/og";

import { logoColors, pieCrustPath } from "@/components/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  const outer = pieCrustPath(100, 100, 84, 18, 11);
  const inner = pieCrustPath(100, 100, 78, 18, 10);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: logoColors.cream,
        }}
      >
        <svg width="180" height="180" viewBox="0 0 200 200">
          <path d={outer} fill={logoColors.gold} />
          <path d={inner} fill={logoColors.charcoal} />
          <circle cx="88" cy="90" r="5.5" fill={logoColors.gold} />
          <circle cx="112" cy="90" r="5.5" fill={logoColors.gold} />
          <path
            d="M 82 108 Q 100 124 118 108"
            fill="none"
            stroke={logoColors.gold}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
