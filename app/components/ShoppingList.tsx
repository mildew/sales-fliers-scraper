"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Plus, X, ShoppingCart, ChevronDown, Trash2 } from "lucide-react";

type Store =
  | "food-coop"
  | "albertsons"
  | "shop-n-kart"
  | "costco"
  | "market-of-choice";

const STORES: { key: Store; label: string }[] = [
  { key: "food-coop", label: "Food Coop" },
  { key: "albertsons", label: "Albertsons" },
  { key: "shop-n-kart", label: "Shop N Kart" },
  { key: "costco", label: "Costco" },
  { key: "market-of-choice", label: "Market of Choice" },
];

interface Item {
  id: string;
  text: string;
  done: boolean;
}

function getStorageKey(store: Store) {
  return `shopping-list:${store}`;
}

function loadItems(store: Store): Item[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(store));
    if (!raw) return [];
    return JSON.parse(raw) as Item[];
  } catch {
    return [];
  }
}

function saveItems(store: Store, items: Item[]) {
  try {
    localStorage.setItem(getStorageKey(store), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export default function ShoppingList() {
  const [store, setStore] = useState<Store>("food-coop");
  const [items, setItems] = useState<Item[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load items when store changes
  useEffect(() => {
    setItems(loadItems(store));
  }, [store]);

  // Persist items on change
  useEffect(() => {
    saveItems(store, items);
  }, [items, store]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const addItem = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const newItem: Item = {
      id: crypto.randomUUID(),
      text: trimmed,
      done: false,
    };
    setItems((prev) => [...prev, newItem]);
    setInputValue("");
    inputRef.current?.focus();
  };

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const saveEdit = (id: string) => {
    const trimmed = editText.trim();
    if (trimmed) {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, text: trimmed } : item)),
      );
    } else {
      removeItem(id);
    }
    setEditingId(null);
  };

  const clearDone = () => {
    setItems((prev) => prev.filter((item) => !item.done));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") addItem();
  };

  const activeStoreLabel =
    STORES.find((s) => s.key === store)?.label ?? "Food Coop";
  const doneCount = items.filter((i) => i.done).length;

  return (
    <section className="mb-8">
      <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShoppingCart className="size-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-card-foreground">
                Shopping List
              </h2>
              <p className="text-xs text-muted-foreground">
                {items.length > 0
                  ? `${items.length - doneCount} left${doneCount > 0 ? ` · ${doneCount} done` : ""}`
                  : "Add items you need to pick up"}
              </p>
            </div>
          </div>

          {/* Store Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-muted/80 transition-colors"
            >
              {activeStoreLabel}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 min-w-40 rounded-lg border border-border/60 bg-popover p-1 shadow-lg backdrop-blur-sm">
                {STORES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => {
                      setStore(s.key);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      store === s.key
                        ? "bg-primary/10 text-primary"
                        : "text-popover-foreground hover:bg-accent"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 mb-5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add an item…"
            className="flex-1 h-9 rounded-lg border border-border/60 bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring/50 transition-all"
          />
          <button
            onClick={() => setItems([])}
            disabled={items.length === 0}
            title="Delete all items"
            className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] transition-all disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100"
          >
            <Trash2 className="size-4" />
          </button>
          <button
            onClick={addItem}
            disabled={!inputValue.trim()}
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.97] transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* List */}
        {items.length > 0 ? (
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                  item.done ? "bg-muted/30" : "hover:bg-muted/40"
                }`}
              >
                <button
                  onClick={() => toggleItem(item.id)}
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                    item.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {item.done && <Check className="size-3" />}
                </button>
                {editingId === item.id ? (
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onBlur={() => saveEdit(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        saveEdit(item.id);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    autoFocus
                    className="flex-1 h-7 rounded border border-border/60 bg-muted/30 px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <span
                    onClick={() => {
                      setEditingId(item.id);
                      setEditText(item.text);
                    }}
                    title="Click to edit"
                    className={`flex-1 text-sm cursor-pointer transition-all ${
                      item.done
                        ? "text-muted-foreground line-through"
                        : "text-foreground hover:text-primary/80"
                    }`}
                  >
                    {item.text}
                  </span>
                )}
                <button
                  onClick={() => removeItem(item.id)}
                  className="flex size-6 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border/50 py-8 text-center">
            <p className="text-xs text-muted-foreground">
              Your shopping list is empty
            </p>
          </div>
        )}

        {/* Footer */}
        {items.length > 0 && doneCount > 0 && (
          <div className="mt-4 pt-3 border-t border-border/40 flex justify-end">
            <button
              onClick={clearDone}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear completed ({doneCount})
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
