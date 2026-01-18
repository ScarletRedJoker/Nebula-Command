import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, size = 256, format = "png" } = body;

    if (!data) {
      return NextResponse.json({ error: "Data is required" }, { status: 400 });
    }

    const options: QRCode.QRCodeToDataURLOptions = {
      width: Math.min(Math.max(size, 64), 1024),
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    };

    let qrData: string;

    if (format === "svg") {
      qrData = await QRCode.toString(data, { 
        type: "svg",
        width: options.width,
        margin: options.margin,
        color: options.color,
      });
      return NextResponse.json({ 
        success: true, 
        format: "svg",
        data: qrData,
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(qrData).toString("base64")}`
      });
    } else {
      qrData = await QRCode.toDataURL(data, options);
      return NextResponse.json({ 
        success: true, 
        format: "png",
        dataUrl: qrData
      });
    }
  } catch (error: any) {
    console.error("[QR API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
