import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

export const alt = "Makalipie gyud ni!";
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
          background: "#F4C430",
          color: "#2C2A28",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pieSrc}
          alt=""
          width={520}
          height={630}
          style={{
            width: 520,
            height: 630,
            objectFit: "cover",
            objectPosition: "center 70%",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px 56px",
            width: 680,
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            Makalipie · Cebu
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 0.95,
              marginTop: 18,
            }}
          >
            Makalipie gyud ni!
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 26,
            }}
          >
            Tarts & pies · Streetscape, Banilad
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
