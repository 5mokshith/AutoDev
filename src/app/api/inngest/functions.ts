import { inngest } from "@/inngest/client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

export const demoGenerate = inngest.createFunction(
  { id: "demo-generate" },
  { event: "test/demo.generate" },
  async ({ event, step }) => {
    await step.run("generate-text", async () => {
       return await generateText({
        model: google("gemini-2.5-flash"),
        prompt: "Write a vegetarian lasagna recipe for 4 people",
    });
    })
    await step.sleep("wait-a-moment", "1s");
    return { message: `Hello ${event.data.email}!` };
  },
);