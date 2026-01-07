import { NextRequest, NextResponse } from "next/server";
import {
  analyzeBillWithConfiguredProvider,
  generateContactScriptWithConfiguredProvider,
  type BillAnalysis,
} from "@/lib/ai";

interface ContactScriptRequestBody {
  text?: unknown;
  analysis?: unknown;
}

function coerceBillAnalysis(value: unknown): BillAnalysis | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybe = value as Partial<BillAnalysis>;

  if (typeof maybe.summary !== "string" || !Array.isArray(maybe.potentialIssues)) {
    return null;
  }

  return {
    summary: maybe.summary,
    potentialIssues: maybe.potentialIssues.map(String),
    vendorName: maybe.vendorName ?? null,
    statementDate: maybe.statementDate ?? null,
    dueDate: maybe.dueDate ?? null,
    totalAmount: maybe.totalAmount ?? null,
    minimumDue: maybe.minimumDue ?? null,
    billingPeriod: maybe.billingPeriod ?? null,
  };
}

export async function POST(request: NextRequest) {
  let body: ContactScriptRequestBody;

  try {
    body = (await request.json()) as ContactScriptRequestBody;
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

  let analysis: BillAnalysis | null = null;

  if (body.analysis) {
    analysis = coerceBillAnalysis(body.analysis);
  }

  try {
    const effectiveAnalysis =
      analysis ?? (await analyzeBillWithConfiguredProvider(text));

    const script = await generateContactScriptWithConfiguredProvider(
      text,
      effectiveAnalysis,
    );

    return NextResponse.json({ script }, { status: 200 });
  } catch (error) {
    console.error("Contact script generation failed", error);

    const isDev = process.env.NODE_ENV !== "production";
    const messageBase =
      "Contact script generation failed. Check server logs and environment configuration.";

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
