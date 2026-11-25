// Production only: registers the service worker (public/sw.js) after the page has loaded, so an
// installed Milkar shows a friendly offline page instead of the browser's error.
export const SERVICE_WORKER_SCRIPT = `if('serviceWorker' in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});`;
