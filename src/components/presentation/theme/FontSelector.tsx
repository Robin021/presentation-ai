"use client";

import { FontPicker } from "@/components/ui/font-picker";
import { Label } from "@/components/ui/label";
import type { Font } from "@/components/ui/font-picker/types";

// Porsche Next TT local font configuration
const localFonts: Font[] = [
  {
    category: "sans-serif",
    name: "Porsche Next TT",
    sane: "porsche_next_tt",
    cased: "porsche next tt",
    variants: ["0,400", "0,700"],
    isLocal: true,
  },
];

interface FontSelectorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function FontSelector({ value, onChange, label }: FontSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <FontPicker
        value={onChange}
        defaultValue={value}
        autoLoad={true}
        mode="combo"
        localFonts={localFonts}
      />
    </div>
  );
}
