import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "buffer";
import Tesseract from "tesseract.js";
import { analyzeBillWithConfiguredProvider } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OCR_TIMEOUT_MS = 60_000; // 60 seconds
const ANALYSIS_TIMEOUT_MS = 60_000; // 60 seconds

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function POST(request: NextRequest) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { error: "An image file is required." },
      { status: 400 },
    );
  }

  try {
    const arrayBuffer = await fileEntry.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await withTimeout(
      Tesseract.recognize(buffer, "eng"),
      OCR_TIMEOUT_MS,
      "Reading text from the photo took too long. Please try a clearer, smaller picture or use the text option instead.",
    );
    const text = result.data.text?.trim();

    if (!text) {
      return NextResponse.json(
        {
          error:
            "I could not read any text from that photo. Please try a clearer picture taken straight-on in good light.",
        },
        { status: 400 },
      );
    }

    const analysis = await withTimeout(
      analyzeBillWithConfiguredProvider(text),
      ANALYSIS_TIMEOUT_MS,
      "Analyzing the bill took too long. Please try again in a moment or use the text option instead.",
    );

    return NextResponse.json(analysis, { status: 200 });
  } catch (error) {
    console.error("Image bill analysis failed", error);

    if (error instanceof Error && error.message.includes("took too long")) {
      return NextResponse.json(
        { error: error.message },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        error:
          "Photo analysis failed. Please try again with a clearer picture or use the text option instead.",
      },
      { status: 500 },
    );
  }
}
