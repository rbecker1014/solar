const listeners = new Set();
let deferredPrompt = null;

function isStandaloneDisplay(){
  if (typeof window === 'undefined') return false;
  const standaloneMatchMedia = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
  const navigatorStandalone = typeof window.navigator !== 'undefined' && 'standalone' in window.navigator
    ? window.navigator.standalone
    : false;
  return Boolean((standaloneMatchMedia && standaloneMatchMedia.matches) || navigatorStandalone);
}

export function getPwaInstallState(){
  return {
    canInstall: Boolean(deferredPrompt),
    isStandalone: isStandaloneDisplay(),
  };
}

function notify(){
  const snapshot = getPwaInstallState();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (err) {
      console.error('PWA install listener error:', err);
    }
  });
}

export function onPwaInstallChange(listener){
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(getPwaInstallState());
  return () => {
    listeners.delete(listener);
  };
}

export async function triggerPwaInstall(){
  if (!deferredPrompt){
    throw new Error('Installation is not available yet.');
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome;
}

if (typeof window !== 'undefined'){
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  if (window.matchMedia){
    const media = window.matchMedia('(display-mode: standalone)');
    if (media && typeof media.addEventListener === 'function'){
      media.addEventListener('change', notify);
    } else if (media && typeof media.addListener === 'function'){
      media.addListener(notify);
    }
  }
}
