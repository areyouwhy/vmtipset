import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "LA COPA DEL MUNDO 2026";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Branded link-preview card: the Bielsa photo full-bleed, darkened, with the
// Text-TV title overlaid. Generated at build/request time via Satori.
export default async function OpengraphImage() {
  const bielsa = await readFile(join(process.cwd(), "src/app/vibes/bielsa.jpg"));
  const src = `data:image/jpeg;base64,${bielsa.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundColor: "#000",
        }}
      >
        {/* Bielsa, full-bleed cover */}
        <img
          src={src}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 30%",
          }}
        />
        {/* darkening gradient for legibility */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.92) 100%)",
          }}
        />
        {/* yellow frame */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            border: "4px solid #ffff00",
            display: "flex",
          }}
        />
        {/* title block */}
        <div
          style={{
            position: "absolute",
            left: 64,
            bottom: 64,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 28,
              letterSpacing: 10,
              color: "#00ffff",
              fontWeight: 700,
            }}
          >
            ● COPA · SOMMAREN 2026
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 800,
              color: "#ffff00",
              letterSpacing: 2,
              lineHeight: 1.02,
              marginTop: 8,
            }}
          >
            LA COPA DEL MUNDO
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              letterSpacing: 8,
              color: "#ffffff",
              fontWeight: 700,
              marginTop: 12,
            }}
          >
            FANTASY VM 2026 · COPA.RUY.SE
          </div>
        </div>
      </div>
    ),
    size,
  );
}
