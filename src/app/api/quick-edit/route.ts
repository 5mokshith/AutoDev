import { z } from "zod";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { firecrawl } from "@/lib/firecrawl";
import { AsyncTtlCache } from "@/lib/ai-cache";
import {
  getLanguageModel,
  getQuickEditModelSelection,
  type AiSelection,
} from "@/lib/ai-providers";
import { sha256, truncateText, truncateTextMiddle, uniq } from "@/lib/prompt-utils";

const quickEditSchema = z.object({
  editedCode: z
    .string()
    .describe(
      "The edited version of the selected code based on the instruction"
    ),
});

const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

const quickEditCache = new AsyncTtlCache<{ editedCode: string }>();
const scrapeCache = new AsyncTtlCache<string>();

const QUICK_EDIT_MAX_URLS = Number.parseInt(
  process.env.AUTODEV_QUICK_EDIT_MAX_URLS ?? "2",
  10,
);
const QUICK_EDIT_MAX_DOC_CHARS_PER_URL = Number.parseInt(
  process.env.AUTODEV_QUICK_EDIT_MAX_DOC_CHARS_PER_URL ?? "6000",
  10,
);
const QUICK_EDIT_MAX_DOC_CHARS_TOTAL = Number.parseInt(
  process.env.AUTODEV_QUICK_EDIT_MAX_DOC_CHARS_TOTAL ?? "12000",
  10,
);
const QUICK_EDIT_MAX_SELECTED_CODE_CHARS = Number.parseInt(
  process.env.AUTODEV_QUICK_EDIT_MAX_SELECTED_CODE_CHARS ?? "12000",
  10,
);
const QUICK_EDIT_MAX_FULL_CODE_CHARS = Number.parseInt(
  process.env.AUTODEV_QUICK_EDIT_MAX_FULL_CODE_CHARS ?? "24000",
  10,
);
const QUICK_EDIT_MAX_INSTRUCTION_CHARS = Number.parseInt(
  process.env.AUTODEV_QUICK_EDIT_MAX_INSTRUCTION_CHARS ?? "2000",
  10,
);

const QUICK_EDIT_PROMPT = `You are a code editing assistant. Edit the selected code based on the user's instruction.

<context>
<selected_code>
{selectedCode}
</selected_code>
<full_code_context>
{fullCode}
</full_code_context>
</context>

{documentation}

<instruction>
{instruction}
</instruction>

<instructions>
Return a JSON object with exactly one key: "editedCode".
The value must be ONLY the edited version of the selected code.
Maintain the same indentation level as the original.
Do not include any explanations or comments unless requested.
If the instruction is unclear or cannot be applied, return the original code unchanged.
</instructions>`;

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    const { selectedCode, fullCode, instruction, ai } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 400 }
      );
    }

    if (!selectedCode) {
      return NextResponse.json(
        { error: "Selected code is required" },
        { status: 400 }
      );
    }

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruction is required" },
        { status: 400 }
      );
    }

    const sanitizedSelectedCode = truncateText(
      selectedCode,
      Number.isFinite(QUICK_EDIT_MAX_SELECTED_CODE_CHARS)
        ? QUICK_EDIT_MAX_SELECTED_CODE_CHARS
        : 12000,
    );
    const sanitizedFullCode = truncateTextMiddle(
      fullCode || "",
      Number.isFinite(QUICK_EDIT_MAX_FULL_CODE_CHARS)
        ? QUICK_EDIT_MAX_FULL_CODE_CHARS
        : 24000,
    );
    const sanitizedInstruction = truncateText(
      instruction,
      Number.isFinite(QUICK_EDIT_MAX_INSTRUCTION_CHARS)
        ? QUICK_EDIT_MAX_INSTRUCTION_CHARS
        : 2000,
    );

    const rawUrls: string[] = instruction.match(URL_REGEX) || [];
    const urls: string[] = uniq(rawUrls).slice(
      0,
      Number.isFinite(QUICK_EDIT_MAX_URLS) ? QUICK_EDIT_MAX_URLS : 2,
    );
    let documentationContext = "";

    if (urls.length > 0) {
      const maxCharsPerUrl = Number.isFinite(QUICK_EDIT_MAX_DOC_CHARS_PER_URL)
        ? QUICK_EDIT_MAX_DOC_CHARS_PER_URL
        : 6000;
      const maxCharsTotal = Number.isFinite(QUICK_EDIT_MAX_DOC_CHARS_TOTAL)
        ? QUICK_EDIT_MAX_DOC_CHARS_TOTAL
        : 12000;

      const scrapedResults = await Promise.all(
        urls.map(async (url) => {
          const cacheKey = `firecrawl:scrape:${url}`;

          return await scrapeCache.getOrSet(cacheKey, 60 * 60 * 1000, async () => {
            try {
              const result = await firecrawl.scrape(url, {
                formats: ["markdown"],
              });

              if (!result.markdown) return "";
              return truncateText(result.markdown, maxCharsPerUrl);
            } catch {
              return "";
            }
          });
        }),
      );

      const docs = scrapedResults
        .map((markdown, idx) => {
          const url = urls[idx];
          if (!markdown) return "";
          return `<doc url="${url}">\n${markdown}\n</doc>`;
        })
        .filter(Boolean);

      if (docs.length > 0) {
        documentationContext = `<documentation>\n${truncateText(
          docs.join("\n\n"),
          maxCharsTotal,
        )}\n</documentation>`;
      }
    }

    const prompt = QUICK_EDIT_PROMPT
      .replace("{selectedCode}", sanitizedSelectedCode)
      .replace("{fullCode}", sanitizedFullCode)
      .replace("{instruction}", sanitizedInstruction)
      .replace("{documentation}", documentationContext);

    const selection = getQuickEditModelSelection(ai as AiSelection | undefined);
    const model = getLanguageModel(selection);

    const cacheKey = sha256(
      JSON.stringify({ provider: selection.provider, model: selection.model, prompt }),
    );

    const { editedCode } = await quickEditCache.getOrSet(cacheKey, 30_000, async () => {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: quickEditSchema }),
        prompt,
        temperature: 0,
        maxOutputTokens: 2048,
      });

      return { editedCode: output.editedCode };
    });

    return NextResponse.json({ editedCode });
  } catch (error) {
    console.error("Edit error:", error);
    return NextResponse.json(
      { error: "Failed to generate edit" },
      { status: 500 }
    );
  }
};
