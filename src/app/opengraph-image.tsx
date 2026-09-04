import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const alt = "Makalipie — Where every bite tastes like home";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const pie = await readFile(
    join(process.cwd(), "public/brand/menu-preview.jpg")
  );
  const pieSrc = `data:image/jpeg;base64,${pie.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#2C2A28",
          color: "#FFF8F0",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pieSrc}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(44,42,40,0.92) 0%, rgba(44,42,40,0.72) 46%, rgba(44,42,40,0.28) 100%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "72px 80px",
            width: "58%",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#F4C430",
              marginBottom: 20,
            }}
          >
            Makalipie
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1.5,
            }}
          >
            Where every bite tastes like home
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 26,
              color: "rgba(255,248,240,0.82)",
            }}
          >
            Proudly Cebuana-made tarts & pies · Streetscape, Banilad
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
