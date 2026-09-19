/* ImageResponse renders plain image elements into a PNG, not browser content. */
/* eslint-disable @next/next/no-img-element */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const variants = {
  home: {
    headline: ["A little pie.", "A lot of", "happy."],
    label: "HANDCRAFTED IN CEBU",
    detail: "Tarts, pies & little reasons to smile.",
    photo: "hero",
  },
  menu: {
    headline: ["Find your", "favourite", "little pie."],
    label: "THE MAKALIPIE MENU",
    detail: "Sweet tarts. Buko weekends. Savoury pies.",
    photo: "table",
  },
  order: {
    headline: ["A box of", "happy,", "just for you."],
    label: "PUT TOGETHER YOUR BOX",
    detail: "Choose your pies. Confirm on Instagram.",
    photo: "gift",
  },
} as const;

export async function createSocialImage(page: keyof typeof variants) {
  const content = variants[page];
  const [book, heavy, photo, seal] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/Garet-Book.ttf")),
    readFile(join(process.cwd(), "public/fonts/Garet-Heavy.ttf")),
    readFile(join(process.cwd(), `public/images/social/${content.photo}.jpg`)),
    readFile(join(process.cwd(), "public/brand/seal.png")),
  ]);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#FAF9F6",
        color: "#656466",
        fontFamily: "Garet",
      }}
    >
      <div
        style={{
          width: 630,
          height: "100%",
          padding: "44px 48px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src={`data:image/png;base64,${seal.toString("base64")}`}
            alt=""
            width={65}
            height={65}
          />
          <div style={{ fontSize: 39, fontWeight: 700, letterSpacing: -2 }}>
            makalipie
          </div>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 2.5,
            marginTop: 38,
          }}
        >
          {content.label}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 67,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: -3,
            marginTop: 19,
          }}
        >
          {content.headline.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div
          style={{
            width: 134,
            height: 9,
            background: "#EFC315",
            marginTop: 17,
          }}
        />
        <div style={{ fontSize: 17, marginTop: 24 }}>{content.detail}</div>
        <div style={{ fontSize: 13, marginTop: "auto" }}>
          CEBUANA-MADE · STREETSCAPE, BANILAD
        </div>
      </div>
      <img
        src={`data:image/jpeg;base64,${photo.toString("base64")}`}
        alt=""
        width={570}
        height={630}
        style={{ objectFit: "cover" }}
      />
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Garet", data: book, weight: 400, style: "normal" },
        { name: "Garet", data: heavy, weight: 700, style: "normal" },
      ],
    },
  );
}
