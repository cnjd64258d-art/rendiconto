import { useRegisterSW } from 'virtual:pwa-register/react';
import { Banner, showToast } from '../ui/components';
import styles from './App.module.css';

const HOUR = 60 * 60 * 1000;

/** "Nuova versione disponibile → Aggiorna" banner. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      // iOS keeps PWAs suspended for long: check when coming back and hourly.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, HOUR);
    },
    onOfflineReady() {
      showToast('Pronta anche offline');
    },
  });

  if (!needRefresh) return null;
  return (
    <div className={styles.update}>
      <Banner icon="✨" action={{ label: 'Aggiorna', onClick: () => void updateServiceWorker(true) }}>
        Nuova versione disponibile
      </Banner>
    </div>
  );
}
