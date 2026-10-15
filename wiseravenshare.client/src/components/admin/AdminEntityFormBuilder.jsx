import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  compactEntityDraft,
  createEntityDraft,
  getDefaultEntityFieldValue,
  getEditableEntityFields,
} from "@/lib/wiseravenshareEntities";

function looksLongText(fieldName) {
  return /description|content|notes|script|changelog|message|bio|reason|verdict|summary|assessment/i.test(
    fieldName || ""
  );
}

function formatJsonValue(value) {
  if (value === "" || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export default function AdminEntityFormBuilder({ entity }) {
  const editableFields = useMemo(
    () => getEditableEntityFields(entity),
    [entity]
  );
  const [draft, setDraft] = useState(() => createEntityDraft(entity));
  const [jsonInputs, setJsonInputs] = useState({});
  const [jsonErrors, setJsonErrors] = useState({});

  useEffect(() => {
    const nextDraft = createEntityDraft(entity);
    setDraft(nextDraft);
    setJsonInputs(
      editableFields.reduce((accumulator, field) => {
        if (field.valueType === "json") {
          accumulator[field.name] = formatJsonValue(nextDraft[field.name]);
        }
        return accumulator;
      }, {})
    );
    setJsonErrors({});
  }, [editableFields, entity]);

  const payloadPreview = useMemo(
    () => compactEntityDraft(entity, draft),
    [draft, entity]
  );

  const updateField = (fieldName, nextValue) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [fieldName]: nextValue,
    }));
  };

  const updateJsonField = (fieldName, rawValue) => {
    setJsonInputs((current) => ({
      ...current,
      [fieldName]: rawValue,
    }));

    if (!rawValue.trim()) {
      setJsonErrors((current) => {
        const next = { ...current };
        delete next[fieldName];
        return next;
      });
      const field = editableFields.find((candidate) => candidate.name === fieldName);
      updateField(fieldName, getDefaultEntityFieldValue(field));
      return;
    }

    try {
      const parsed = JSON.parse(rawValue);
      updateField(fieldName, parsed);
      setJsonErrors((current) => {
        const next = { ...current };
        delete next[fieldName];
        return next;
      });
    } catch {
      setJsonErrors((current) => ({
        ...current,
        [fieldName]: "Invalid JSON",
      }));
    }
  };

  const resetToDefaults = () => {
    const nextDraft = createEntityDraft(entity);
    setDraft(nextDraft);
    setJsonInputs(
      editableFields.reduce((accumulator, field) => {
        if (field.valueType === "json") {
          accumulator[field.name] = formatJsonValue(nextDraft[field.name]);
        }
        return accumulator;
      }, {})
    );
    setJsonErrors({});
  };

  if (!entity) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Generated create/update form
          </p>
          <p className="text-xs text-muted-foreground">
            This form is generated directly from the entity metadata and can be
            used as the base for CRUD tooling.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetToDefaults}>
          Reset defaults
        </Button>
      </div>

      <div className="space-y-3">
        {editableFields.map((field) => {
          const value = draft[field.name];
          const hasError = Boolean(jsonErrors[field.name]);

          return (
            <div
              key={field.name}
              className="rounded-xl border border-border bg-background/40 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">
                  {field.name}
                  {field.required && (
                    <span className="text-primary"> *</span>
                  )}
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {field.valueType}
                </span>
              </div>

              {field.valueType === "boolean" ? (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="text-sm text-muted-foreground">
                    Toggle {field.description.toLowerCase()}
                  </span>
                  <Switch
                    checked={Boolean(value)}
                    onCheckedChange={(checked) => updateField(field.name, checked)}
                  />
                </div>
              ) : field.options?.length ? (
                <select
                  value={value === "" ? field.defaultValue || "" : value}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                >
                  {!field.required && <option value="">Select an option</option>}
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.valueType === "number" ? (
                <Input
                  type="number"
                  value={value}
                  onChange={(event) =>
                    updateField(
                      field.name,
                      event.target.value === "" ? "" : Number(event.target.value)
                    )
                  }
                  placeholder={field.defaultValue !== undefined ? String(field.defaultValue) : "0"}
                />
              ) : field.valueType === "date" ? (
                <Input
                  type="date"
                  value={value}
                  onChange={(event) => updateField(field.name, event.target.value)}
                />
              ) : field.valueType === "datetime" ? (
                <Input
                  type="datetime-local"
                  value={value}
                  onChange={(event) => updateField(field.name, event.target.value)}
                />
              ) : field.valueType === "json" ? (
                <>
                  <Textarea
                    value={jsonInputs[field.name] || ""}
                    onChange={(event) =>
                      updateJsonField(field.name, event.target.value)
                    }
                    placeholder='[] or { "key": "value" }'
                    className="min-h-[120px] font-mono text-xs"
                  />
                  {hasError && (
                    <p className="text-xs text-destructive">
                      {jsonErrors[field.name]}
                    </p>
                  )}
                </>
              ) : looksLongText(field.name) ? (
                <Textarea
                  value={value}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.description}
                  className="min-h-[110px]"
                />
              ) : (
                <Input
                  value={value}
                  onChange={(event) => updateField(field.name, event.target.value)}
                  placeholder={field.description}
                />
              )}

              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-1">
                  storage: {field.storageType}
                </span>
                {field.defaultValue !== undefined && (
                  <span className="rounded-full border border-border px-2 py-1">
                    default: {String(field.defaultValue)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Generated payload preview
        </p>
        <Textarea
          readOnly
          value={JSON.stringify(payloadPreview, null, 2)}
          className="min-h-[220px] font-mono text-xs"
        />
      </div>
    </div>
  );
}
