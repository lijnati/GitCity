export const THEME_STORAGE_KEY = "gitcity-theme";

/**
 * Runs before first paint (inlined in <head>): applies the stored choice, or the
 * system preference, as `data-theme` on <html>, and follows system changes while
 * no explicit choice is stored. Kept tiny and dependency-free.
 */
export const THEME_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}",d=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");function a(){var s=null;try{s=localStorage.getItem(k)}catch(e){}d.dataset.theme=s==="light"||s==="dark"?s:m.matches?"dark":"light"}a();m.addEventListener("change",a)}catch(e){}})();`;
