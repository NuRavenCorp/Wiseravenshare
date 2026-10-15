import React, { useState } from "react";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { POST_TEMPLATES, POST_TEMPLATE_CATEGORIES } from "./postTemplates";

export default function PostTemplatePicker({ onApply }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("general");

  const apply = (tpl) => {
    onApply(tpl);
    setOpen(false);
  };

  const filtered = POST_TEMPLATES.filter((t) => t.category === category);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
      >
        <LayoutGrid className="w-3.5 h-3.5" /> Templates
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-2 w-full max-w-md rounded-lg border border-border bg-popover shadow-xl">
            <p className="text-xs text-muted-foreground px-3 py-2 border-b border-border">Pick a template to get started fast</p>
            <div className="flex gap-1 px-2 pt-2 flex-wrap">
              {POST_TEMPLATE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    category === cat.id
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground border border-transparent"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-2 max-h-64 overflow-y-auto">
              {filtered.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => apply(tpl)}
                    className="flex items-start gap-2 p-2.5 rounded-md border border-border hover:border-primary/40 hover:bg-primary/5 text-left transition-colors"
                  >
                    <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}