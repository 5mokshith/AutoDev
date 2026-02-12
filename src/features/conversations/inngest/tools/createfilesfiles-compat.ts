import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

export const createCreatefilesFilesCompatTool = () => {
  return createTool({
    name: "CreatefilesFiles",
    description:
      "Compatibility shim: this is not a real tool. Use createFiles instead with { parentId, files: [{ name, content }] }.",
    parameters: z.object({}).passthrough(),
    handler: async (params) => {
      const example = {
        parentId: "",
        files: [
          {
            name: "example.txt",
            content: "Hello world",
          },
        ],
      };

      const received = (() => {
        try {
          return JSON.stringify(params);
        } catch {
          return String(params);
        }
      })();

      return (
        "Error: 'CreatefilesFiles' is not a callable tool. " +
        "Call createFiles with a JSON object like: " +
        JSON.stringify(example) +
        ". Received args: " +
        received
      );
    },
  });
};
