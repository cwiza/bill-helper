import Anthropic from "@anthropic-ai/sdk";

export type AIProvider = "github" | "anthropic";

export interface BillAnalysis {
  summary: string;
  potentialIssues: string[];
  vendorName: string | null;
  statementDate: string | null;
  dueDate: string | null;
  totalAmount: string | null;
  minimumDue: string | null;
  billingPeriod: string | null;
}

const BILL_ANALYSIS_SYSTEM_PROMPT =
  "You are an assistant that analyzes consumer bills (utilities, subscriptions, medical, etc.). " +
  "Your audience is older adults with limited technical background. Use clear, simple language. " +
  "Given the raw text of a bill, identify key details and any items they may want to double-check. " +
  "Respond STRICTLY as compact JSON with this exact shape and field names (no markdown, no extra text): " +
  "{\"summary\": string, \"potentialIssues\": string[], \"vendorName\": string | null, " +
  "\"statementDate\": string | null, \"dueDate\": string | null, \"totalAmount\": string | null, " +
  "\"minimumDue\": string | null, \"billingPeriod\": string | null}. " +
  "If a field is not clearly present, set it to null rather than guessing. " +
  "In potentialIssues, list short, plain-language bullets about charges or patterns worth a closer look.";

const CONTACT_SCRIPT_SYSTEM_PROMPT =
  "You help older adults figure out what to say when they call, email, or write about a confusing bill. " +
  "Use very simple, kind language and avoid legal terms when possible. " +
  "You will receive the full bill text and, when available, a structured analysis of the bill. " +
  "Using that information, create a clear script they can follow. " +
  "Output plain text only (no JSON, no markdown). Use this structure: " +
  "1) A short overview paragraph of what they might ask about. " +
  "2) A section called 'Phone script' with words they can say on the phone, using placeholders like [Your full name], [Account number], [Date on the bill]. " +
  "3) A section called 'Email script' with a simple subject line and body they can copy. " +
  "4) A section called 'Letter script' they could print and mail. " +
  "5) A short list called 'Where to send this' with example destinations using mock descriptions only, such as 'Insurance customer service (phone number on the back of your card)' or 'Billing office address printed near the top of the bill'. " +
  "Do NOT invent real phone numbers or mailing addresses. Keep everything generic and clearly marked as examples.";

const DOCTOR_QUESTIONS_SYSTEM_PROMPT =
  "You help older adults prepare simple questions to ask their doctor or clinic about a medical bill. " +
  "Use very simple, kind language and avoid medical jargon when possible. " +
  "You will receive the full bill text and, when available, a structured analysis of the bill. " +
  "Using that information, create a short list of clear questions they can bring to an appointment or phone call. " +
  "Output plain text only (no JSON, no markdown). Use this structure: " +
  "1) A one-sentence overview of why they might want to talk with the doctor. " +
  "2) A section called 'Questions about this bill' with 3-8 short questions in simple language. " +
  "3) A section called 'Medical questions to ask' with 2-5 short questions that focus on treatment, tests, or follow-up care. " +
  "Make it clear they can show or read this list to their doctor. Do NOT invent real phone numbers or addresses.";

const SCAM_CHECK_SYSTEM_PROMPT =
  "You help older adults notice common red flags in bills that might be scams or mistakes. " +
  "Use very simple, calm language and do NOT scare them. " +
  "You will receive the full bill text and, when available, a structured analysis of the bill. " +
  "Look for things like: demands to pay immediately in unusual ways, threats, unclear company identity, or charges that do not match normal bills. " +
  "You are NOT a lawyer and cannot say for sure that something is a scam. You only point out possible warning signs. " +
  "Output plain text only (no JSON, no markdown). Use this structure: " +
  "1) A short line called 'Overall' that gently says if the bill looks mostly ordinary or if there are some warning signs. " +
  "2) A section called 'Possible warning signs' with 3-8 short bullet-style lines in simple language. " +
  "3) A section called 'What you can do next' with a few simple, safe steps (like calling a trusted number on the back of a real card, asking family, or logging in to a known website). " +
  "Do NOT invent real phone numbers, email addresses, or web links. Keep everything generic and clearly marked as examples.";

export async function analyzeBillWithConfiguredProvider(
  billText: string,
): Promise<BillAnalysis> {
  const provider = (process.env.AI_PROVIDER as AIProvider | undefined) ?? "github";

  if (provider === "anthropic") {
    return analyzeWithAnthropic(billText);
  }

  // Default to GitHub Models / MSFT family
  return analyzeWithGithubModels(billText);
}

export async function generateContactScriptWithConfiguredProvider(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const provider = (process.env.AI_PROVIDER as AIProvider | undefined) ?? "github";

  if (provider === "anthropic") {
    return generateContactScriptWithAnthropic(billText, analysis);
  }

  return generateContactScriptWithGithubModels(billText, analysis);
}

export async function generateDoctorQuestionsWithConfiguredProvider(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const provider = (process.env.AI_PROVIDER as AIProvider | undefined) ?? "github";

  if (provider === "anthropic") {
    return generateDoctorQuestionsWithAnthropic(billText, analysis);
  }

  return generateDoctorQuestionsWithGithubModels(billText, analysis);
}

export async function checkScamWithConfiguredProvider(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const provider = (process.env.AI_PROVIDER as AIProvider | undefined) ?? "github";

  if (provider === "anthropic") {
    return checkScamWithAnthropic(billText, analysis);
  }

  return checkScamWithGithubModels(billText, analysis);
}

async function analyzeWithGithubModels(billText: string): Promise<BillAnalysis> {
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  const modelId =
    process.env.GITHUB_MODELS_MODEL_ID ?? "gpt-4o-mini";

  if (!apiKey) {
    throw new Error(
      "GITHUB_MODELS_API_KEY is not set. Add it to your environment to enable bill analysis.",
    );
  }

  const endpoint =
    process.env.GITHUB_MODELS_ENDPOINT ??
    "https://models.inference.ai.azure.com/chat/completions";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: BILL_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: billText },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Models request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };
  const rawContent: string | undefined =
    data.choices?.[0]?.message?.content ?? undefined;

  if (!rawContent || typeof rawContent !== "string") {
    return {
      summary: "Bill analysis is unavailable. The model did not return text.",
      potentialIssues: [],
      vendorName: null,
      statementDate: null,
      dueDate: null,
      totalAmount: null,
      minimumDue: null,
      billingPeriod: null,
    };
  }

  try {
    const parsed = JSON.parse(rawContent) as Partial<BillAnalysis>;
    if (
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.potentialIssues)
    ) {
      return {
        summary: parsed.summary,
        potentialIssues: parsed.potentialIssues.map(String),
        vendorName: parsed.vendorName ?? null,
        statementDate: parsed.statementDate ?? null,
        dueDate: parsed.dueDate ?? null,
        totalAmount: parsed.totalAmount ?? null,
        minimumDue: parsed.minimumDue ?? null,
        billingPeriod: parsed.billingPeriod ?? null,
      };
    }
  } catch {
    // fall through to fallback
  }

  return {
    summary: rawContent,
    potentialIssues: [],
    vendorName: null,
    statementDate: null,
    dueDate: null,
    totalAmount: null,
    minimumDue: null,
    billingPeriod: null,
  };
}

async function generateContactScriptWithGithubModels(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  const modelId =
    process.env.GITHUB_MODELS_MODEL_ID ?? "gpt-4o-mini";

  if (!apiKey) {
    throw new Error(
      "GITHUB_MODELS_API_KEY is not set. Add it to your environment to enable bill analysis.",
    );
  }

  const endpoint =
    process.env.GITHUB_MODELS_ENDPOINT ??
    "https://models.inference.ai.azure.com/chat/completions";

  const parts: string[] = [
    "Here is the full text of the bill:",
    billText,
  ];

  if (analysis) {
    parts.push(
      "",
      "Here is a structured analysis of the bill in JSON format:",
      JSON.stringify(analysis, null, 2),
    );
  }

  const combined = parts.join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: CONTACT_SCRIPT_SYSTEM_PROMPT },
        { role: "user", content: combined },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Models request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };
  const rawContent: string | undefined =
    data.choices?.[0]?.message?.content ?? undefined;

  if (!rawContent || typeof rawContent !== "string") {
    return "Sorry, I could not prepare a contact script based on this bill.";
  }

  return rawContent.trim();
}

async function generateDoctorQuestionsWithGithubModels(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  const modelId =
    process.env.GITHUB_MODELS_MODEL_ID ?? "gpt-4o-mini";

  if (!apiKey) {
    throw new Error(
      "GITHUB_MODELS_API_KEY is not set. Add it to your environment to enable bill analysis.",
    );
  }

  const endpoint =
    process.env.GITHUB_MODELS_ENDPOINT ??
    "https://models.inference.ai.azure.com/chat/completions";

  const parts: string[] = [
    "Here is the full text of the bill:",
    billText,
  ];

  if (analysis) {
    parts.push(
      "",
      "Here is a structured analysis of the bill in JSON format:",
      JSON.stringify(analysis, null, 2),
    );
  }

  const combined = parts.join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: DOCTOR_QUESTIONS_SYSTEM_PROMPT },
        { role: "user", content: combined },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Models request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };
  const rawContent: string | undefined =
    data.choices?.[0]?.message?.content ?? undefined;

  if (!rawContent || typeof rawContent !== "string") {
    return "Sorry, I could not prepare doctor questions based on this bill.";
  }

  return rawContent.trim();
}

async function checkScamWithGithubModels(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  const modelId =
    process.env.GITHUB_MODELS_MODEL_ID ?? "gpt-4o-mini";

  if (!apiKey) {
    throw new Error(
      "GITHUB_MODELS_API_KEY is not set. Add it to your environment to enable bill analysis.",
    );
  }

  const endpoint =
    process.env.GITHUB_MODELS_ENDPOINT ??
    "https://models.inference.ai.azure.com/chat/completions";

  const parts: string[] = [
    "Here is the full text of the bill:",
    billText,
  ];

  if (analysis) {
    parts.push(
      "",
      "Here is a structured analysis of the bill in JSON format:",
      JSON.stringify(analysis, null, 2),
    );
  }

  const combined = parts.join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: SCAM_CHECK_SYSTEM_PROMPT },
        { role: "user", content: combined },
      ],
      max_tokens: 768,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub Models request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };
  const rawContent: string | undefined =
    data.choices?.[0]?.message?.content ?? undefined;

  if (!rawContent || typeof rawContent !== "string") {
    return "Sorry, I could not check this bill for scam warning signs.";
  }

  return rawContent.trim();
}

async function analyzeWithAnthropic(billText: string): Promise<BillAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to enable Claude-based analysis.",
    );
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0.2,
    system: BILL_ANALYSIS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: billText,
      },
    ],
  });

  const rawContent = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  if (!rawContent) {
    return {
      summary: "Bill analysis is unavailable. Claude did not return text.",
      potentialIssues: [],
      vendorName: null,
      statementDate: null,
      dueDate: null,
      totalAmount: null,
      minimumDue: null,
      billingPeriod: null,
    };
  }

  try {
    const parsed = JSON.parse(rawContent) as Partial<BillAnalysis>;
    if (
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.potentialIssues)
    ) {
      return {
        summary: parsed.summary,
        potentialIssues: parsed.potentialIssues.map(String),
        vendorName: parsed.vendorName ?? null,
        statementDate: parsed.statementDate ?? null,
        dueDate: parsed.dueDate ?? null,
        totalAmount: parsed.totalAmount ?? null,
        minimumDue: parsed.minimumDue ?? null,
        billingPeriod: parsed.billingPeriod ?? null,
      };
    }
  } catch {
    // fall through to fallback
  }

  return {
    summary: rawContent,
    potentialIssues: [],
    vendorName: null,
    statementDate: null,
    dueDate: null,
    totalAmount: null,
    minimumDue: null,
    billingPeriod: null,
  };
}

async function generateContactScriptWithAnthropic(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to enable Claude-based analysis.",
    );
  }

  const client = new Anthropic({ apiKey });

  const parts: string[] = [
    "Here is the full text of the bill:",
    billText,
  ];

  if (analysis) {
    parts.push(
      "",
      "Here is a structured analysis of the bill in JSON format:",
      JSON.stringify(analysis, null, 2),
    );
  }

  const combined = parts.join("\n\n");

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0.2,
    system: CONTACT_SCRIPT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: combined,
      },
    ],
  });

  const rawContent = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  if (!rawContent) {
    return "Sorry, I could not prepare a contact script based on this bill.";
  }

  return rawContent;
}

async function generateDoctorQuestionsWithAnthropic(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to enable Claude-based analysis.",
    );
  }

  const client = new Anthropic({ apiKey });

  const parts: string[] = [
    "Here is the full text of the bill:",
    billText,
  ];

  if (analysis) {
    parts.push(
      "",
      "Here is a structured analysis of the bill in JSON format:",
      JSON.stringify(analysis, null, 2),
    );
  }

  const combined = parts.join("\n\n");

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0.2,
    system: DOCTOR_QUESTIONS_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: combined,
      },
    ],
  });

  const rawContent = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  if (!rawContent) {
    return "Sorry, I could not prepare doctor questions based on this bill.";
  }

  return rawContent;
}

async function checkScamWithAnthropic(
  billText: string,
  analysis: BillAnalysis | null,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to enable Claude-based analysis.",
    );
  }

  const client = new Anthropic({ apiKey });

  const parts: string[] = [
    "Here is the full text of the bill:",
    billText,
  ];

  if (analysis) {
    parts.push(
      "",
      "Here is a structured analysis of the bill in JSON format:",
      JSON.stringify(analysis, null, 2),
    );
  }

  const combined = parts.join("\n\n");

  const message = await client.messages.create({
    model,
    max_tokens: 768,
    temperature: 0.2,
    system: SCAM_CHECK_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: combined,
      },
    ],
  });

  const rawContent = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  if (!rawContent) {
    return "Sorry, I could not check this bill for scam warning signs.";
  }

  return rawContent;
}
