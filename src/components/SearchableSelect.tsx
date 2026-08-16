import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

interface SearchableSelectProps {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

const normalizeSearch = (value: string): string =>
  value.trim().toLocaleLowerCase("vi-VN");

export const SearchableSelect = ({
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder = "Tìm kiếm...",
  emptyText = "Không tìm thấy kết quả",
  disabled = false,
  className = "",
  ariaLabel,
}: SearchableSelectProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return options;

    return options.filter((option) =>
      normalizeSearch(option).includes(normalizedQuery),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    window.requestAnimationFrame(() => inputRef.current?.focus());

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelect = (option: string) => {
    onChange(option);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
        }}
        className="select select-bordered flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl pr-3 text-left font-semibold focus:select-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={value ? "truncate" : "truncate text-base-content/50"}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-xl">
          <div className="border-b border-base-200 p-2">
            <label className="input input-bordered flex min-h-11 w-full items-center gap-2 rounded-lg focus-within:input-primary">
              <Search className="h-4 w-4 shrink-0 text-base-content/50" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                autoComplete="off"
                className="min-w-0 grow"
              />
            </label>
          </div>

          <div role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const selected = option === value;
                return (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleSelect(option)}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "bg-primary/10 font-bold text-primary"
                        : "hover:bg-base-200"
                    }`}
                  >
                    <span className="min-w-0 break-words">{option}</span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-5 text-center text-sm text-base-content/55">
                {emptyText}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
