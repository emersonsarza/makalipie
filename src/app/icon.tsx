import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 18,
          fontWeight: 800,
          borderRadius: 999,
        }}
      >
        M
      </div>
    ),
    { ...size }
  );
}
