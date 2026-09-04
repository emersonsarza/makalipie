import { ImageResponse } from "next/og";

export const alt = "Makalipie — Where every bite tastes like home";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#FFF8F0",
          color: "#2C2A28",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 36,
            borderRadius: 32,
            background: "#F5E6C8",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "80px 88px",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginBottom: 28,
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 999,
                background: "#2C2A28",
                color: "#F4C430",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
                fontWeight: 700,
              }}
            >
              :)
            </div>
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                letterSpacing: -1,
              }}
            >
              Makalipie
            </div>
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 650,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 900,
            }}
          >
            Where every bite tastes like home
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 28,
              color: "#5c5752",
            }}
          >
            Proudly Cebuana-made tarts & pies · Streetscape, Banilad
          </div>
          <div
            style={{
              marginTop: 36,
              display: "flex",
              background: "#F4C430",
              color: "#2C2A28",
              borderRadius: 999,
              padding: "12px 28px",
              fontSize: 22,
              fontWeight: 700,
              width: "auto",
            }}
          >
            EST. 2020
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
