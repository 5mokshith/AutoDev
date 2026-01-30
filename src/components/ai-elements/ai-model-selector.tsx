"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CheckIcon } from "lucide-react";

import {
  DEFAULT_MODEL_BY_PROVIDER,
  MODELS_BY_PROVIDER,
  type AiProvider,
} from "@/lib/ai-selection";

import { setAiSelection, useAiSelection } from "@/lib/ai-selection-store";

export const AiModelSelector = () => {
  const [open, setOpen] = useState(false);
  const { provider, model } = useAiSelection();

  const options = useMemo(() => {
    return (Object.keys(MODELS_BY_PROVIDER) as AiProvider[]).flatMap((p) =>
      MODELS_BY_PROVIDER[p].map((m) => ({ provider: p, model: m }))
    );
  }, []);

  const providerLabel =
    provider === "google" ? "Gemini" : provider === "groq" ? "Groq" : "OpenAI";

  const label =
    provider === "google"
      ? `Gemini: ${model}`
      : provider === "groq"
        ? `Groq: ${model}`
        : `OpenAI: ${model}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded-full px-3 text-xs bg-background/20 border-border/60 hover:bg-background/30"
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 p-0 overflow-hidden border-border/60 bg-popover/80 backdrop-blur"
      >
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup heading="Current">
              <CommandItem
                value={`${provider}:${model}`}
                onSelect={() => {
                  setOpen(false);
                }}
                className="justify-between"
              >
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{providerLabel}</div>
                  <div className="truncate font-medium">{model}</div>
                </div>
                <CheckIcon className="size-4 text-muted-foreground" />
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="All models">
              {options.map((opt) => {
                const optProviderLabel =
                  opt.provider === "google"
                    ? "Gemini"
                    : opt.provider === "groq"
                      ? "Groq"
                      : "OpenAI";

                const selected = opt.provider === provider && opt.model === model;

                return (
                  <CommandItem
                    key={`${opt.provider}:${opt.model}`}
                    value={`${optProviderLabel} ${opt.model}`}
                    onSelect={() => {
                      const nextProvider = opt.provider;
                      const nextModel = opt.model;

                      const normalizedModel = MODELS_BY_PROVIDER[nextProvider].includes(
                        nextModel
                      )
                        ? nextModel
                        : DEFAULT_MODEL_BY_PROVIDER[nextProvider];

                      setAiSelection({
                        provider: nextProvider,
                        model: normalizedModel,
                      });
                      setOpen(false);
                    }}
                    className="justify-between"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {optProviderLabel}
                      </div>
                      <div className="truncate font-medium">{opt.model}</div>
                    </div>
                    {selected ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <span className="size-4" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
