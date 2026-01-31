import { generateText, Output } from "ai";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCodingModelSelection,
  getLanguageModel,
  type AiSelection,
} from "@/lib/ai-providers";
import { AsyncTtlCache } from "@/lib/ai-cache";
import { sha256, truncateText, truncateTextMiddle } from "@/lib/prompt-utils";

const suggestionSchema = z.object({
  suggestion: z
    .string()
    .describe(
      "The code to insert at cursor, or empty string if no completion needed"
    ),
});

const suggestionCache = new AsyncTtlCache<{ suggestion: string }>();

const SUGGESTION_MAX_CODE_CHARS = Number.parseInt(
  process.env.AUTODEV_SUGGESTION_MAX_CODE_CHARS ?? "18000",
  10,
);
const SUGGESTION_MAX_CONTEXT_CHARS = Number.parseInt(
  process.env.AUTODEV_SUGGESTION_MAX_CONTEXT_CHARS ?? "4000",
  10,
);

const SUGGESTION_PROMPT = `You are a code suggestion assistant.

<context>
<file_name>{fileName}</file_name>
<previous_lines>
{previousLines}
</previous_lines>
<current_line number="{lineNumber}">{currentLine}</current_line>
<before_cursor>{textBeforeCursor}</before_cursor>
<after_cursor>{textAfterCursor}</after_cursor>
<next_lines>
{nextLines}
</next_lines>
<full_code>
{code}
</full_code>
</context>

<instructions>
Follow these steps IN ORDER:

1. First, look at next_lines. If next_lines contains ANY code, check if it continues from where the cursor is. If it does, return empty string immediately - the code is already written.

2. Check if before_cursor ends with a complete statement (;, }, )). If yes, return empty string.

3. Only if steps 1 and 2 don't apply: suggest what should be typed at the cursor position, using context from full_code.

Your suggestion is inserted immediately after the cursor, so never suggest code that's already in the file.
Return a JSON object with exactly one key: "suggestion".
The value should be a string of code to insert, or an empty string.
</instructions>`;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 },
      );
    }

    const {
      fileName,
      code,
      currentLine,
      previousLines,
      textBeforeCursor,
      textAfterCursor,
      nextLines,
      lineNumber,
      ai,
    } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: "Code is required" },
        { status: 400 }
      );
    }

    const sanitizedCode = truncateTextMiddle(
      code,
      Number.isFinite(SUGGESTION_MAX_CODE_CHARS) ? SUGGESTION_MAX_CODE_CHARS : 18000,
    );
    const sanitizedPreviousLines = truncateText(
      previousLines || "",
      Number.isFinite(SUGGESTION_MAX_CONTEXT_CHARS)
        ? SUGGESTION_MAX_CONTEXT_CHARS
        : 4000,
    );
    const sanitizedNextLines = truncateText(
      nextLines || "",
      Number.isFinite(SUGGESTION_MAX_CONTEXT_CHARS)
        ? SUGGESTION_MAX_CONTEXT_CHARS
        : 4000,
    );

    const prompt = SUGGESTION_PROMPT
      .replace("{fileName}", fileName)
      .replace("{code}", sanitizedCode)
      .replace("{currentLine}", currentLine)
      .replace("{previousLines}", sanitizedPreviousLines)
      .replace("{textBeforeCursor}", textBeforeCursor)
      .replace("{textAfterCursor}", textAfterCursor)
      .replace("{nextLines}", sanitizedNextLines)
      .replace("{lineNumber}", lineNumber.toString());

    const selection = getCodingModelSelection(ai as AiSelection | undefined);
    const model = getLanguageModel(selection);

    const cacheKey = sha256(
      JSON.stringify({ provider: selection.provider, model: selection.model, prompt }),
    );

    const { suggestion } = await suggestionCache.getOrSet(cacheKey, 15_000, async () => {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: suggestionSchema }),
        prompt,
        temperature: 0.2,
        maxOutputTokens: 256,
      });

      return { suggestion: output.suggestion };
    });

    return NextResponse.json({ suggestion })
  } catch (error) {
    console.error("Suggestion error: ", error);
    return NextResponse.json(
      { error: "Failed to generate suggestion" },
      { status: 500 },
    );
  }
}
