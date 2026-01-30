"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import {
  DEFAULT_MODEL_BY_PROVIDER,
  MODELS_BY_PROVIDER,
  type AiProvider,
} from "@/lib/ai-selection";

import { setAiSelection, useAiSelection } from "@/lib/ai-selection-store";

export const AiModelSelector = () => {
  const [open, setOpen] = useState(false);
  const { provider, model } = useAiSelection();

  const modelOptions = useMemo(() => {
    return MODELS_BY_PROVIDER[provider];
  }, [provider]);

  const label =
    provider === "google"
      ? `Gemini: ${model}`
      : provider === "groq"
        ? `Groq: ${model}`
        : `OpenAI: ${model}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Provider</div>
            <Select
              value={provider}
              onValueChange={(value) => {
                const nextProvider = value as AiProvider;
                const nextModel = MODELS_BY_PROVIDER[nextProvider].includes(model)
                  ? model
                  : DEFAULT_MODEL_BY_PROVIDER[nextProvider];

                setAiSelection({ provider: nextProvider, model: nextModel });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google (Gemini)</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Model</div>
            <Select
              value={model}
              onValueChange={(nextModel) =>
                setAiSelection({ provider, model: nextModel })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">Custom model</div>
            <Input
              value={model}
              onChange={(e) => setAiSelection({ provider, model: e.target.value })}
              placeholder="Enter model id"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
