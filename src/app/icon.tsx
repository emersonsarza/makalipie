import { ImageResponse } from "next/og";

import { logoColors, pieCrustPath } from "@/components/logo";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
        }}
      >
        <svg width="32" height="32" viewBox="0 0 200 200">
          <path d={outer} fill={logoColors.gold} />
          <path d={inner} fill={logoColors.charcoal} />
          <circle cx="88" cy="92" r="8" fill={logoColors.gold} />
          <circle cx="112" cy="92" r="8" fill={logoColors.gold} />
          <path
            d="M 80 112 Q 100 132 120 112"
            fill="none"
            stroke={logoColors.gold}
            strokeWidth="8"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
