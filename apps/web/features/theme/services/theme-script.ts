import { DEFAULT_THEME, THEME_COLORS, THEME_STORAGE_KEY } from "./theme";

/**
 * Runs in <head> while the HTML is parsed, before anything is painted, so a learner who chose
 * light never sees a flash of dark (docs/theming.md). Mirrors `applyTheme` without depending on
 * any bundle; anything unexpected leaves the server's default (dark) in place.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark")t=${JSON.stringify(DEFAULT_THEME)};var c=${JSON.stringify(THEME_COLORS)};d.dataset.theme=t;d.style.colorScheme=t;var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].content=c[t];var s=document.querySelectorAll('meta[name="color-scheme"]');for(var j=0;j<s.length;j++)s[j].content=t;}catch(e){}})();`;
