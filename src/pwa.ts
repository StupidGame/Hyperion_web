const SERVICE_WORKER_URL = '/sw.js';
const STANDALONE_DISPLAY_QUERY = '(display-mode: standalone)';
const MOBILE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'portrait-primary') => Promise<void>;
};

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error: unknown) => {
      console.warn('Service worker registration failed.', error);
    });
  });
}

export function lockMobilePwaOrientation() {
  const tryLock = () => {
    const isStandalone =
      window.matchMedia(STANDALONE_DISPLAY_QUERY).matches || (navigator as NavigatorWithStandalone).standalone === true;
    const isTouchMobile = window.matchMedia(MOBILE_POINTER_QUERY).matches;
    const orientation = screen.orientation as LockableScreenOrientation | undefined;

    if (!isStandalone || !isTouchMobile || typeof orientation?.lock !== 'function') {
      return;
    }

    void orientation.lock('portrait-primary').catch(() => undefined);
  };

  tryLock();
  window.addEventListener('load', tryLock, { once: true });
  window.addEventListener('resize', tryLock);
  window.addEventListener('orientationchange', tryLock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tryLock();
    }
  });
  document.addEventListener('pointerdown', tryLock, { passive: true });
}
