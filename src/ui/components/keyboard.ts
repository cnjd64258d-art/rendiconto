/**
 * iOS only opens the keyboard when focus() runs inside a user gesture.
 * A sheet's input mounts one frame later, so we focus a hidden decimal input
 * synchronously in the tap handler; the real input then takes over focus and
 * the keyboard stays open.
 */
let proxy: HTMLInputElement | null = null;

export function primeKeyboard(inputMode: 'decimal' | 'text' = 'decimal'): void {
  if (!proxy) {
    proxy = document.createElement('input');
    proxy.setAttribute('aria-hidden', 'true');
    proxy.tabIndex = -1;
    Object.assign(proxy.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      fontSize: '16px',
      pointerEvents: 'none',
    });
    document.body.appendChild(proxy);
  }
  proxy.inputMode = inputMode;
  proxy.focus({ preventScroll: true });
}
