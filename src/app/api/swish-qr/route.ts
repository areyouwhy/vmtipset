import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { buildSwishPayload } from "@/lib/swish";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const msg = searchParams.get("msg") ?? "";
  if (!msg) {
    return NextResponse.json({ error: "msg required" }, { status: 400 });
  }

  const payload = buildSwishPayload(msg);
  const png = await QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 400,
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
