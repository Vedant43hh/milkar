// Runs in <head> before first paint: applies the saved theme (or the system setting) so there is
// no flash of the wrong theme, and follows system changes while the choice is "system".
export const THEME_SCRIPT = `(function(){try{var k='milkar-theme',m=window.matchMedia('(prefers-color-scheme: dark)');function a(){var s=localStorage.getItem(k);var d=s==='dark'||((s!=='light')&&m.matches);document.documentElement.classList.toggle('dark',d);}a();m.addEventListener('change',a);}catch(e){}})();`;
