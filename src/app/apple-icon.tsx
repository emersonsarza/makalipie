import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F4C430",
          color: "#2C2A28",
          fontSize: 96,
          fontWeight: 800,
        }}
      >
        M
      </div>
    ),
    { ...size }
  );
}
