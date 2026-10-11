import { DEFAULT_THEME, THEME_COLORS, THEME_STORAGE_KEY } from "./theme";

const INLINE_SCRIPT_UNSAFE_CHAR_MAP: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "/": "\\u002F",
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const INLINE_SCRIPT_UNSAFE_CHAR_PATTERN = /[<>\/\\\b\f\n\r\t\0\u2028\u2029]/g;

function escapeUnsafeInlineScriptChars(value: string): string {
  return value.replace(
    INLINE_SCRIPT_UNSAFE_CHAR_PATTERN,
    (char) => INLINE_SCRIPT_UNSAFE_CHAR_MAP[char] ?? char,
  );
}

function safeJsonForInlineScript(value: unknown): string {
  return escapeUnsafeInlineScriptChars(JSON.stringify(value));
}

/**
 * Runs in <head> while the HTML is parsed, before anything is painted, so a learner who chose
 * light never sees a flash of dark (docs/theming.md). Mirrors `applyTheme` without depending on
 * any bundle; anything unexpected leaves the server's default (dark) in place.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem(${safeJsonForInlineScript(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark")t=${safeJsonForInlineScript(DEFAULT_THEME)};var c=${safeJsonForInlineScript(THEME_COLORS)};d.dataset.theme=t;d.style.colorScheme=t;var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].content=c[t];var s=document.querySelectorAll('meta[name="color-scheme"]');for(var j=0;j<s.length;j++)s[j].content=t;}catch(e){}})();`;
