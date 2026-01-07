import { NextRequest, NextResponse } from "next/server";
import { analyzeBillWithConfiguredProvider } from "@/lib/ai";

interface AnalyzeBillRequestBody {
  text?: unknown;
}

export async function POST(request: NextRequest) {
  let body: AnalyzeBillRequestBody;

  try {
    body = (await request.json()) as AnalyzeBillRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text : undefined;

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "Field 'text' is required and must be a non-empty string." },
      { status: 400 },
    );
  }

  try {
    const analysis = await analyzeBillWithConfiguredProvider(text);
    return NextResponse.json(analysis, { status: 200 });
  } catch (error) {
    console.error("Bill analysis failed", error);

    const isDev = process.env.NODE_ENV !== "production";
    const messageBase =
      "Bill analysis failed. Check server logs and environment configuration.";

    if (isDev && error instanceof Error) {
      return NextResponse.json(
        { error: `${messageBase} Details: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: messageBase },
      { status: 500 },
    );
  }
}
