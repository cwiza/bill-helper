"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

interface BillAnalysisResponse {
  summary: string;
  potentialIssues: string[];
  vendorName: string | null;
  statementDate: string | null;
  dueDate: string | null;
  totalAmount: string | null;
  minimumDue: string | null;
  billingPeriod: string | null;
  error?: string;
}

type NextSteps = {
  call: boolean;
  payOnline: boolean;
  askDoctor: boolean;
  askFamily: boolean;
};

type HistoryStatus = "paid" | "waiting" | "need-to-call";

interface BillHistoryItem {
  id: string;
  createdAt: string;
  vendorName: string | null;
  totalAmount: string | null;
  dueDate: string | null;
  summary: string;
  status: HistoryStatus;
}

const HISTORY_STORAGE_KEY = "bill-helper-history";
const HISTORY_ENABLED_KEY = "bill-helper-history-enabled";

export default function Home() {
  const [billText, setBillText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<BillAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [contactScript, setContactScript] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const [isGeneratingDoctorQs, setIsGeneratingDoctorQs] = useState(false);
  const [doctorQuestions, setDoctorQuestions] = useState<string | null>(null);
  const [doctorError, setDoctorError] = useState<string | null>(null);

  const [isCheckingScam, setIsCheckingScam] = useState(false);
  const [scamAssessment, setScamAssessment] = useState<string | null>(null);
  const [scamError, setScamError] = useState<string | null>(null);

  const [callNotes, setCallNotes] = useState("");

  const [showPaperHelp, setShowPaperHelp] = useState(false);

  const [preferredInput, setPreferredInput] = useState<
    "text" | "photo" | null
  >(null);

  const [dictationSupported, setDictationSupported] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);

  const recognitionRef = useRef<any | null>(null);
  const dictationActiveRef = useRef(false);
  const lastResultTimeRef = useRef<number | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [nextSteps, setNextSteps] = useState<NextSteps>({
    call: false,
    payOnline: false,
    askDoctor: false,
    askFamily: false,
  });

  const [history, setHistory] = useState<BillHistoryItem[]>([]);
  const [rememberHistory, setRememberHistory] = useState(false);

  useEffect(() => {
    if (!isAnalyzing) {
      setElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(seconds);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAnalyzing]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const anyWindow = window as any;
    const SpeechRecognition =
      anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition;

    setDictationSupported(!!SpeechRecognition);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const enabled = window.localStorage.getItem(HISTORY_ENABLED_KEY);
      if (enabled === "true") {
        setRememberHistory(true);
        const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as BillHistoryItem[];
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch {
      // ignore bad history data
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        HISTORY_ENABLED_KEY,
        rememberHistory ? "true" : "false",
      );

      if (!rememberHistory) {
        window.localStorage.removeItem(HISTORY_STORAGE_KEY);
        setHistory([]);
      }
    } catch {
      // ignore storage errors
    }
  }, [rememberHistory]);

  useEffect(() => {
    if (typeof window === "undefined" || !rememberHistory) return;

    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore storage errors
    }
  }, [history, rememberHistory]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      dictationActiveRef.current = false;
    };
  }, []);

  function resetNextSteps() {
    setNextSteps({
      call: false,
      payOnline: false,
      askDoctor: false,
      askFamily: false,
    });
  }

  function addHistoryEntry(analysis: BillAnalysisResponse) {
    if (!rememberHistory) return;

    const now = new Date();
    const item: BillHistoryItem = {
      id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now.toISOString(),
      vendorName: analysis.vendorName,
      totalAmount: analysis.totalAmount,
      dueDate: analysis.dueDate,
      summary: analysis.summary,
      status: "waiting",
    };

    setHistory((previous) => [item, ...previous].slice(0, 50));
  }

  function updateHistoryStatus(id: string, status: HistoryStatus) {
    setHistory((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              status,
            }
          : item,
      ),
    );
  }

  function toggleNextStep(step: keyof NextSteps) {
    setNextSteps((previous) => ({
      ...previous,
      [step]: !previous[step],
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setContactScript(null);
    setScriptError(null);
    setDoctorQuestions(null);
    setDoctorError(null);
    setScamAssessment(null);
    setScamError(null);

    try {
      const response = await fetch("/api/analyze-bill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: billText }),
      });

      const data = (await response.json()) as BillAnalysisResponse;

      if (!response.ok) {
        setError(data.error || "Bill analysis failed.");
        return;
      }

      setResult(data);
      resetNextSteps();
      addHistoryEntry(data);
    } catch (err) {
      console.error(err);
      setError("Network error while analyzing bill.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function onPhotoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (typeof window === "undefined") return;

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("photo") as
      | HTMLInputElement
      | null;
    const file = fileInput?.files?.[0] ?? null;

    if (!file) {
      setError("Please choose a photo first.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setContactScript(null);
    setScriptError(null);
    setDoctorQuestions(null);
    setDoctorError(null);
    setScamAssessment(null);
    setScamError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/analyze-bill-image", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as BillAnalysisResponse & {
        error?: string;
      };

      if (!response.ok) {
        setError(
          data.error ||
            "Photo analysis failed. Please try a clearer picture or use the text option.",
        );
        return;
      }

      setResult(data);
      resetNextSteps();
      addHistoryEntry(data);
    } catch (err) {
      console.error(err);
      setError("Network error while analyzing photo.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function onGenerateScript() {
    if (!billText.trim() || !result) return;

    setIsGeneratingScript(true);
    setScriptError(null);
    setContactScript(null);

    try {
      const response = await fetch("/api/contact-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: billText, analysis: result }),
      });

      const data = (await response.json()) as {
        script?: string;
        error?: string;
      };

      if (!response.ok || !data.script) {
        setScriptError(
          data.error || "Could not create a contact script.",
        );
        return;
      }

      setContactScript(data.script);
    } catch (err) {
      console.error(err);
      setScriptError("Network error while creating contact script.");
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function onGenerateDoctorQuestions() {
    if (!billText.trim() || !result) return;

    setIsGeneratingDoctorQs(true);
    setDoctorError(null);
    setDoctorQuestions(null);

    try {
      const response = await fetch("/api/doctor-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: billText, analysis: result }),
      });

      const data = (await response.json()) as {
        questions?: string;
        error?: string;
      };

      if (!response.ok || !data.questions) {
        setDoctorError(
          data.error || "Could not create doctor questions.",
        );
        return;
      }

      setDoctorQuestions(data.questions);
    } catch (err) {
      console.error(err);
      setDoctorError("Network error while creating doctor questions.");
    } finally {
      setIsGeneratingDoctorQs(false);
    }
  }

  async function onCheckScam() {
    if (!billText.trim() || !result) return;

    setIsCheckingScam(true);
    setScamError(null);
    setScamAssessment(null);

    try {
      const response = await fetch("/api/scam-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: billText, analysis: result }),
      });

      const data = (await response.json()) as {
        assessment?: string;
        error?: string;
      };

      if (!response.ok || !data.assessment) {
        setScamError(
          data.error || "Could not check this bill for possible scams.",
        );
        return;
      }

      setScamAssessment(data.assessment);
    } catch (err) {
      console.error(err);
      setScamError("Network error while checking for scams.");
    } finally {
      setIsCheckingScam(false);
    }
  }

  function onPrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  function onStartDictation() {
    if (!dictationSupported || typeof window === "undefined" || isDictating) {
      return;
    }

    const anyWindow = window as any;
    const SpeechRecognition =
      anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    setDictationError(null);

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    // Only use final results to avoid repeating partial phrases
    recognition.interimResults = false;
    recognition.continuous = true;

    recognitionRef.current = recognition;
    dictationActiveRef.current = true;
    lastResultTimeRef.current = Date.now();

    recognition.onstart = () => {
      setIsDictating(true);
    };

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        transcript += result[0].transcript;
      }

      const cleaned = transcript.trim();
      if (!cleaned) return;

      lastResultTimeRef.current = Date.now();

      setCallNotes((prev) => {
        if (!prev) return cleaned;
        return prev.endsWith(" ") ? prev + cleaned : prev + " " + cleaned;
      });
    };

    recognition.onerror = () => {
      setDictationError(
        "There was a problem listening. Please check your microphone permissions and try again.",
      );
      setIsDictating(false);
      dictationActiveRef.current = false;
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      const stillActive = dictationActiveRef.current;

      if (!stillActive) {
        setIsDictating(false);
        recognitionRef.current = null;
        return;
      }

      const now = Date.now();
      const last = lastResultTimeRef.current ?? now;

      // If there was recent speech (within 30 seconds), try to continue
      if (now - last < 30000 && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          return;
        } catch {
          // fall through to stopping
        }
      }

      dictationActiveRef.current = false;
      setIsDictating(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setDictationError(
        "Voice notes could not start. Please check your browser settings.",
      );
      setIsDictating(false);
      recognitionRef.current = null;
    }
  }

  function onStopDictation() {
    if (!recognitionRef.current) {
      setIsDictating(false);
      return;
    }

    dictationActiveRef.current = false;

    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }

    recognitionRef.current = null;
    setIsDictating(false);
  }

  function onExportSession() {
    if (typeof window === "undefined") return;

    const parts: string[] = [];
    const now = new Date();

    parts.push("Bill Helper session", now.toLocaleString(), "");

    if (billText.trim()) {
      parts.push("Bill text:", billText.trim(), "");
    }

    if (result) {
      parts.push("Summary:", result.summary, "");
      parts.push("Main details:");
      parts.push(`  Company: ${result.vendorName ?? "Not clearly found"}`);
      parts.push(`  Total amount: ${result.totalAmount ?? "Not clearly found"}`);
      parts.push(
        `  Amount due now: ${
          result.minimumDue ?? result.totalAmount ?? "Not clearly found"
        }`,
      );
      parts.push(`  Due date: ${result.dueDate ?? "Not clearly found"}`);
      parts.push("");

      if (result.potentialIssues.length > 0) {
        parts.push("Things to double-check:");
        for (const issue of result.potentialIssues) {
          parts.push(`  - ${issue}`);
        }
        parts.push("");
      }
    }

    if (contactScript) {
      parts.push("Contact script:", contactScript, "");
    }

    if (doctorQuestions) {
      parts.push("Questions for doctor:", doctorQuestions, "");
    }

    if (callNotes.trim()) {
      parts.push("What was said (your notes):", callNotes.trim(), "");
    }

    if (parts.length === 0) {
      return;
    }

    const blob = new Blob([parts.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `bill-helper-session-${now.toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#B3E5FC] via-[#03A9F4] to-[#26C6DA] font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col gap-10 py-12 px-4 sm:px-10 bg-white dark:bg-zinc-950">
        <header className="space-y-4">
          <div className="flex items-start gap-4">
            <img
              src="/icon1.png"
              alt="Bill Helper icon"
              className="h-20 w-auto object-contain"
            />
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Bill Helper
              </h1>
              <p className="max-w-2xl text-base text-zinc-800 dark:text-zinc-200">
                Paste the text from your bill below. I will show the most important
                numbers in large text and point out anything that may need a closer
                look. Language is kept simple on purpose.
              </p>
            </div>
          </div>

          <section className="mt-4 space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              How would you like to share your bill?
            </h2>
            <p className="text-sm text-zinc-800 dark:text-zinc-200">
              The most reliable way is to type or paste the text. You can also
              use a clear photo if that is easier.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setPreferredInput("text");
                }}
                aria-pressed={preferredInput === "text"}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${preferredInput === "text" ? "border-zinc-900 bg-white dark:border-zinc-100 dark:bg-zinc-950" : "border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"}`}
              >
                <span className="block text-sm text-zinc-900 dark:text-zinc-50">
                  Type or paste the text
                </span>
                <span className="mt-1 block text-xs font-normal text-zinc-700 dark:text-zinc-300">
                  Best for clear results if you can get the text from your bill.
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreferredInput("photo");
                }}
                aria-pressed={preferredInput === "photo"}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-200 ${preferredInput === "photo" ? "border-zinc-900 bg-white dark:border-zinc-100 dark:bg-zinc-950" : "border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"}`}
              >
                <span className="block text-sm text-zinc-900 dark:text-zinc-50">
                  Use a photo of my bill
                </span>
                <span className="mt-1 block text-xs font-normal text-zinc-700 dark:text-zinc-300">
                  Helpful if typing is hard. Clear, straight-on photos work best.
                </span>
              </button>
            </div>
          </section>
        </header>

        {preferredInput !== null && (
          <>
            {preferredInput === "text" && (
              <>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowPaperHelp((prev) => !prev)}
                    className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {showPaperHelp
                      ? "Hide help for paper bills"
                      : "Help: My bill is on paper"}
                  </button>
                </div>
                {showPaperHelp && (
                  <section className="mt-3 max-w-2xl space-y-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                    <h2 className="text-base font-semibold">If your bill is on paper</h2>
                    <p>
                      You can use your iPhone to turn the paper bill into text:
                    </p>
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>
                        Open the <span className="font-semibold">Notes</span> app.
                      </li>
                      <li>Start a new note and tap inside the note.</li>
                      <li>
                        Choose <span className="font-semibold">Scan Text</span> (or the
                        camera icon → Scan).
                      </li>
                      <li>Point the camera at your bill and insert the text.</li>
                      <li>
                        Press and hold on the text to
                        <span className="font-semibold"> Copy</span>, then paste it above.
                      </li>
                    </ol>
                  </section>
                )}

                <form onSubmit={onSubmit} className="space-y-4">
                  <textarea
                    className="h-56 w-full rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-base text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-transparent focus:ring-4 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:ring-zinc-200"
                    placeholder="Paste your bill text here..."
                    value={billText}
                    onChange={(event) => setBillText(event.target.value)}
                  />
                  <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                    <button
                      type="submit"
                      disabled={isAnalyzing || !billText.trim()}
                      className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-base font-semibold text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {isAnalyzing ? "Analyzing..." : "Analyze bill"}
                    </button>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      No account details are stored by this page; it only uses the
                      text you paste for the current check.
                    </p>
                  </div>
                  {isAnalyzing && (
                    <p className="text-sm text-zinc-700 dark:text-zinc-200">
                      Analyzing bill 
                      {elapsedSeconds} second
                      {elapsedSeconds === 1 ? "" : "s"} so far...
                    </p>
                  )}
                </form>
              </>
            )}

            {preferredInput === "photo" && (
              <section className="space-y-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                <h2 className="text-base font-semibold">Use a photo of your bill</h2>
                <p className="text-xs text-zinc-700 dark:text-zinc-300">
                  Take a clear photo of your bill on a flat surface in good light.
                  This page will try to read the text for you.
                </p>
                <form onSubmit={onPhotoSubmit} className="space-y-3">
                  <input
                    type="file"
                    name="photo"
                    accept="image/*"
                    className="block w-full text-xs text-zinc-700 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-50 hover:file:bg-zinc-800 dark:text-zinc-200 dark:file:bg-zinc-50 dark:file:text-zinc-900 dark:hover:file:bg-zinc-200"
                  />
                  <button
                    type="submit"
                    disabled={isAnalyzing}
                    className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2 text-xs font-semibold text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {isAnalyzing ? "Analyzing photo..." : "Analyze selected photo"}
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {result && !error && (
          <section className="space-y-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Bill summary
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onPrint}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Print this page
                </button>
                <button
                  type="button"
                  onClick={onExportSession}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  Export session
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Main details
                </h2>
                <div className="space-y-2 text-base">
                  <p>
                    <span className="font-semibold">Company:</span>{" "}
                    {result.vendorName ?? "Not clearly found"}
                  </p>
                  <p>
                    <span className="font-semibold">Total amount:</span>{" "}
                    {result.totalAmount ?? "Not clearly found"}
                  </p>
                  <p>
                    <span className="font-semibold">Amount due now:</span>{" "}
                    {result.minimumDue ?? result.totalAmount ?? "Not clearly found"}
                  </p>
                  <p>
                    <span className="font-semibold">Due date:</span>{" "}
                    {result.dueDate ?? "Not clearly found"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  Dates and period
                </h2>
                <div className="space-y-2 text-base">
                  <p>
                    <span className="font-semibold">Statement date:</span>{" "}
                    {result.statementDate ?? "Not clearly found"}
                  </p>
                  <p>
                    <span className="font-semibold">Billing period:</span>{" "}
                    {result.billingPeriod ?? "Not clearly found"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                In simple words
              </h2>
              <p className="text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
                {result.summary}
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Things to double-check
              </h2>
              {result.potentialIssues.length === 0 ? (
                <p className="text-base text-zinc-800 dark:text-zinc-200">
                  No clear problems were found. Still, it is a good idea to
                  read your bill slowly and ask a trusted person if something
                  feels wrong.
                </p>
              ) : (
                <ul className="mt-1 list-disc space-y-2 pl-6 text-base text-zinc-800 dark:text-zinc-200">
                  {result.potentialIssues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Next steps for this bill
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                You can use this simple checklist to keep track of what you
                have already done.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-400 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-500 dark:text-zinc-50 dark:focus:ring-zinc-200"
                    checked={nextSteps.call}
                    onChange={() => toggleNextStep("call")}
                  />
                  <span>Call the company or insurance</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-400 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-500 dark:text-zinc-50 dark:focus:ring-zinc-200"
                    checked={nextSteps.payOnline}
                    onChange={() => toggleNextStep("payOnline")}
                  />
                  <span>Pay online or by mail</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-400 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-500 dark:text-zinc-50 dark:focus:ring-zinc-200"
                    checked={nextSteps.askDoctor}
                    onChange={() => toggleNextStep("askDoctor")}
                  />
                  <span>Ask your doctor or clinic</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-400 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-500 dark:text-zinc-50 dark:focus:ring-zinc-200"
                    checked={nextSteps.askFamily}
                    onChange={() => toggleNextStep("askFamily")}
                  />
                  <span>Ask family or a trusted friend</span>
                </label>
              </div>
            </div>

            <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Next step: simple contact script
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                If you want to call, email, or write to your insurance or the
                company about this bill, this will prepare simple words you can
                use.
              </p>
              <button
                type="button"
                onClick={onGenerateScript}
                disabled={
                  isAnalyzing ||
                  isGeneratingScript ||
                  !billText.trim() ||
                  !result
                }
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isGeneratingScript ? "Preparing script..." : "Make a phone/email script"}
              </button>
              {scriptError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {scriptError}
                </div>
              )}
              {contactScript && (
                <div className="rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-zinc-900 shadow-sm whitespace-pre-wrap dark:bg-zinc-950/60 dark:text-zinc-50">
                  {contactScript}
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Is this likely a scam?
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                This tool cannot say for sure if something is a scam, but it
                can point out common warning signs and gentle next steps.
              </p>
              <button
                type="button"
                onClick={onCheckScam}
                disabled={
                  isAnalyzing ||
                  isCheckingScam ||
                  !billText.trim() ||
                  !result
                }
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isCheckingScam
                  ? "Checking for warning signs..."
                  : "Check for scam warning signs"}
              </button>
              {scamError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {scamError}
                </div>
              )}
              {scamAssessment && (
                <div className="rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-zinc-900 shadow-sm whitespace-pre-wrap dark:bg-zinc-950/60 dark:text-zinc-50">
                  {scamAssessment}
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Questions for your doctor
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                This can prepare a short list of questions you can bring to an
                appointment or read over the phone.
              </p>
              <button
                type="button"
                onClick={onGenerateDoctorQuestions}
                disabled={
                  isAnalyzing ||
                  isGeneratingDoctorQs ||
                  !billText.trim() ||
                  !result
                }
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isGeneratingDoctorQs
                  ? "Preparing questions..."
                  : "Make questions for my doctor"}
              </button>
              {doctorError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {doctorError}
                </div>
              )}
              {doctorQuestions && (
                <div className="rounded-xl bg-white/70 p-4 text-sm leading-relaxed text-zinc-900 shadow-sm whitespace-pre-wrap dark:bg-zinc-950/60 dark:text-zinc-50">
                  {doctorQuestions}
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                What was said (your notes)
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                After you call, email, or visit, you can jot down what was
                said here. This stays on this device only. If your browser
                allows it, you can also speak and let this page turn your
                words into text.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onStartDictation}
                  disabled={!dictationSupported || isDictating}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-xs font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  {dictationSupported
                    ? "Start voice notes"
                    : "Voice notes not available in this browser"}
                </button>
                {isDictating && (
                  <>
                    <button
                      type="button"
                      onClick={onStopDictation}
                      className="inline-flex items-center justify-center rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 shadow-sm transition hover:bg-red-100 dark:border-red-700 dark:bg-red-950 dark:text-red-100 dark:hover:bg-red-900"
                    >
                      Stop listening
                    </button>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      Listening. Please speak slowly and clearly.
                    </span>
                  </>
                )}
              </div>
              {!dictationSupported && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Voice notes usually work best in Google Chrome on a
                  computer. Some browsers do not support this feature.
                </p>
              )}
              {dictationError && (
                <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                  {dictationError}
                </p>
              )}
              <textarea
                className="h-32 w-full rounded-xl border border-zinc-300 bg-white/80 p-3 text-sm text-zinc-900 shadow-sm outline-none ring-0 transition focus:border-transparent focus:ring-4 focus:ring-zinc-800 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-50 dark:focus:ring-zinc-200"
                placeholder="For example: On [date] I spoke with [name]. They said..."
                value={callNotes}
                onChange={(event) => setCallNotes(event.target.value)}
              />
            </div>
          </section>
        )}

        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Saved bills on this device (optional)
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                When this is on, short summaries of your bills are kept only in
                this browser on this device. They are not sent anywhere else.
              </p>
            </div>
            <label className="mt-1 inline-flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-100">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-400 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-500 dark:text-zinc-50 dark:focus:ring-zinc-200"
                checked={rememberHistory}
                onChange={(event) => setRememberHistory(event.target.checked)}
              />
              <span>Remember bills on this device</span>
            </label>
          </div>

          {rememberHistory && history.length === 0 && (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              No saved bills yet. After you analyze a bill, it will appear
              here with a simple status label.
            </p>
          )}

          {rememberHistory && history.length > 0 && (
            <ul className="space-y-3 text-sm">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white/70 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-950/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {item.vendorName ?? "Bill"}
                      {item.totalAmount ? ` • ${item.totalAmount}` : ""}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Saved {new Date(item.createdAt).toLocaleDateString()}
                      {item.dueDate ? ` • Due: ${item.dueDate}` : ""}
                    </p>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">
                      {item.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateHistoryStatus(item.id, "waiting")}
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                        item.status === "waiting"
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                          : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      }`}
                    >
                      Waiting
                    </button>
                    <button
                      type="button"
                      onClick={() => updateHistoryStatus(item.id, "need-to-call")}
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                        item.status === "need-to-call"
                          ? "bg-amber-500 text-zinc-900 dark:bg-amber-400"
                          : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      }`}
                    >
                      Need to call
                    </button>
                    <button
                      type="button"
                      onClick={() => updateHistoryStatus(item.id, "paid")}
                      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition ${
                        item.status === "paid"
                          ? "bg-emerald-600 text-zinc-50 dark:bg-emerald-500"
                          : "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                      }`}
                    >
                      Paid
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

