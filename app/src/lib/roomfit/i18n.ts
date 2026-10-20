import { derived, writable } from "svelte/store";
import { locale as editorLocale } from "$lib/i18n";
import { en } from "./messages.en";
export type Language = "zh" | "en";
const preference = writable<Language>("zh");
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const phrases = Object.fromEntries(
  Object.entries(en).map(([k, v]) => [normalize(k), v]),
);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(en)
  .filter(([k]) => /\{\d+\}/.test(k))
  .map(([key, value]) => ({
    pattern: new RegExp(
      "^" +
        key
          .split(/\{\d+\}/)
          .map(escape)
          .join("([\\s\\S]*?)") +
        "$",
    ),
    value,
  }));
export function translate(language: Language, value: unknown): string {
  let s = String(value ?? "");
  const state: Record<string, string> = {
    idle: "待机",
    running: "渲染中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };
  s = state[s] ?? s;
  if (language === "zh") return s;
  if (phrases[normalize(s)]) return phrases[normalize(s)];
  for (const { pattern, value } of patterns) {
    const match = s.match(pattern);
    if (match)
      return value.replace(
        /\{(\d+)\}/g,
        (_, i) =>
          phrases[normalize(match[Number(i) + 1])] ?? match[Number(i) + 1],
      );
  }
  // Localize known message prefixes without changing user paths or names.
  for (const [key, value] of Object.entries(en))
    if (key.endsWith("：") && s.startsWith(key))
      return value + s.slice(key.length);
  if (s.startsWith("Error: "))
    return "Error: " + translate(language, s.slice(7));
  return s;
}
export const tr = derived(
  preference,
  (language) => (value: unknown) => translate(language, value),
);
export const language = {
  subscribe: preference.subscribe,
  set(value: Language) {
    if (value !== "zh" && value !== "en") return;
    preference.set(value);
    editorLocale.set(value);
    if (typeof document !== "undefined")
      document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
    try {
      localStorage.setItem("roomfit-language", value);
    } catch {}
    const bridge =
      typeof window !== "undefined" ? (window as any).roomfit : null;
    void bridge?.preferences?.({ language: value }).catch(() => {});
  },
};
export async function initializeLanguage() {
  let saved: unknown;
  try {
    saved = localStorage.getItem("roomfit-language");
  } catch {}
  try {
    const native = await (window as any).roomfit?.preferences?.();
    if (native?.language) saved = native.language;
  } catch {}
  language.set(saved === "en" ? "en" : "zh");
}
