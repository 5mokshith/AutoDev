import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { demoGenerate } from "./functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    demoGenerate, // <-- This is where you'll always add all your functions
  ],
});