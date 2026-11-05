// The theme is data-theme="light" | "dark" on <html>. The choice is kept in
// localStorage under THEME_KEY: "light", "dark", or nothing for "System"
// (follow the phone). ThemePicker in Settings changes it.

export const THEME_KEY = "theme";

/**
 * Runs in <head> before anything paints, so a dark page never flashes white.
 * It also follows the phone switching between light and dark while open, and
 * leaves window.__applyTheme for the picker to call after a change.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var t;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}if(t!=="light"&&t!=="dark")t=m.matches?"dark":"light";d.setAttribute("data-theme",t)}a();m.addEventListener?m.addEventListener("change",a):m.addListener(a);window.__applyTheme=a})()`;
