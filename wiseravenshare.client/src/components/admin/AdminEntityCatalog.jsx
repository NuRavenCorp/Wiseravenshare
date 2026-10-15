import React, { useMemo, useState } from "react";
import { CheckCircle2, Database, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import AdminEntityFormBuilder from "@/components/admin/AdminEntityFormBuilder";
import {
  WISERAVENSHARE_ENTITIES,
  WISERAVENSHARE_ENTITY_GROUPS,
} from "@/lib/wiseravenshareEntities";

export default function AdminEntityCatalog() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [selectedEntityName, setSelectedEntityName] = useState(
    WISERAVENSHARE_ENTITIES[0]?.name || ""
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return WISERAVENSHARE_ENTITIES.filter((entity) => {
      const matchesGroup = group === "all" || entity.group === group;
      const matchesSearch =
        !query ||
        entity.name.toLowerCase().includes(query) ||
        entity.description.toLowerCase().includes(query) ||
        entity.group.toLowerCase().includes(query);

      return matchesGroup && matchesSearch;
    });
  }, [group, search]);

  const groupCounts = useMemo(() => {
    return WISERAVENSHARE_ENTITY_GROUPS.map((entry) => ({
      ...entry,
      count:
        entry.id === "all"
          ? WISERAVENSHARE_ENTITIES.length
          : WISERAVENSHARE_ENTITIES.filter((entity) => entity.group === entry.id).length,
    }));
  }, []);

  const selectedEntity =
    filtered.find((entity) => entity.name === selectedEntityName) ||
    WISERAVENSHARE_ENTITIES.find((entity) => entity.name === selectedEntityName) ||
    filtered[0] ||
    null;

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl border border-border bg-card/50 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-medium text-foreground">
            WiseRavenShare frontend entities
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          This frontend catalog mirrors the translated WiseRavenShare entity set so admin
          and product surfaces can use a single consistent list of platform entities.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {groupCounts.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setGroup(entry.id)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                group === entry.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <p className="text-xs uppercase tracking-wide">{entry.label}</p>
              <p className="text-xl font-heading mt-1">{entry.count}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search entities by name, group, or purpose…"
          className="pl-10"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        {filtered.length} frontend entit{filtered.length === 1 ? "y" : "ies"} available.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.2fr] gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((entity) => {
            const isSelected = selectedEntity?.name === entity.name;

            return (
              <button
                key={entity.name}
                type="button"
                onClick={() => setSelectedEntityName(entity.name)}
                className={`p-5 rounded-2xl border text-left space-y-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card/50 hover:border-primary/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-medium text-foreground">{entity.name}</p>
                    <p className="text-xs uppercase tracking-wide text-primary mt-1">
                      {entity.group}
                    </p>
                  </div>
                  <Database className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{entity.description}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-1">
                    {entity.fields.length} fields
                  </span>
                  <span className="rounded-full border border-border px-2 py-1">
                    {entity.required.length} required
                  </span>
                  {entity.translatedFrom && (
                    <span className="rounded-full border border-border px-2 py-1">
                      {entity.translatedFrom}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {selectedEntity && (
          <div className="p-5 rounded-2xl border border-border bg-card/50 space-y-5 h-fit">
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-heading text-foreground">
                    {selectedEntity.name}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-primary mt-1">
                    {selectedEntity.group}
                  </p>
                </div>
                <Database className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {selectedEntity.description}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">Fields</p>
                <p className="text-xl font-heading text-foreground">
                  {selectedEntity.fields.length}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">Required fields</p>
                <p className="text-xl font-heading text-foreground">
                  {selectedEntity.required.length}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Access policy
              </p>
              <div className="space-y-2">
                {Object.entries(selectedEntity.accessPolicy || {}).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-border bg-background/40 px-3 py-2"
                  >
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {key}
                    </p>
                    <p className="text-sm text-foreground mt-1">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Field metadata
              </p>
              <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
                {selectedEntity.fields.map((field) => (
                  <div
                    key={field.name}
                    className="rounded-xl border border-border bg-background/40 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {field.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {field.description}
                        </p>
                      </div>
                      {field.required && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary">
                          <CheckCircle2 className="w-3 h-3" /> required
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full border border-border px-2 py-1">
                        value: {field.valueType}
                      </span>
                      <span className="rounded-full border border-border px-2 py-1">
                        storage: {field.storageType}
                      </span>
                      {field.defaultValue !== undefined && (
                        <span className="rounded-full border border-border px-2 py-1">
                          default: {String(field.defaultValue)}
                        </span>
                      )}
                    </div>
                    {Array.isArray(field.options) && field.options.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {field.options.map((option) => (
                          <span
                            key={option}
                            className="rounded-full bg-secondary/40 px-2 py-1 text-xs text-foreground"
                          >
                            {option}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <AdminEntityFormBuilder entity={selectedEntity} />
          </div>
        )}
      </div>
    </div>
  );
}
