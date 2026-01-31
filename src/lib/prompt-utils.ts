import { createHash } from "crypto";

export const truncateText = (input: string, maxChars: number): string => {
  if (maxChars <= 0) return "";
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars);
};

export const truncateTextMiddle = (input: string, maxChars: number): string => {
  if (maxChars <= 0) return "";
  if (input.length <= maxChars) return input;
  const keep = Math.max(0, maxChars - 80);
  const head = Math.floor(keep * 0.6);
  const tail = keep - head;
  return `${input.slice(0, head)}\n\n...[truncated]...\n\n${input.slice(input.length - tail)}`;
};

export const sha256 = (value: string): string => {
  return createHash("sha256").update(value).digest("hex");
};

export const uniq = <T>(items: T[]): T[] => {
  return Array.from(new Set(items));
};
