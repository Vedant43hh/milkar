// Runs in <head> before first paint: applies the saved theme (or the system setting) so there is
// no flash of the wrong theme, and follows system changes while the choice is "system".
export const THEME_SCRIPT = `(function(){try{var k='milkar-theme',m=window.matchMedia('(prefers-color-scheme: dark)');function a(){var s=localStorage.getItem(k);var d=s==='dark'||((s!=='light')&&m.matches);document.documentElement.classList.toggle('dark',d);}a();m.addEventListener('change',a);}catch(e){}})();`;

// Also in <head>, before the app's own scripts: a page transition that the next navigation (or a
// reload) cuts short rejects with an AbortError "Transition was skipped". That is expected, not a
// failure, so it is kept out of the console and error reporting. Every other rejection passes.
export const VIEW_TRANSITION_SCRIPT = `addEventListener('unhandledrejection',function(e){var r=e.reason;if(r&&r.name==='AbortError'&&/Transition was skipped/.test(String(r.message))){e.preventDefault();e.stopImmediatePropagation();}});`;
