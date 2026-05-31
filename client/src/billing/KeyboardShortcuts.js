import { useEffect } from 'react';

export default function useKeyboardShortcuts(storeHook, handlers = {}) {
  useEffect(() => {
    const listener = (e) => {
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Enter => Save bill
      if (ctrl && key === 'Enter') {
        e.preventDefault();
        handlers.onSave?.();
      }

      // Ctrl+P => Print preview
      if (ctrl && (key === 'p' || key === 'P')) {
        e.preventDefault();
        handlers.onPrint?.();
      }

      // Ctrl+H => Hold bill
      if (ctrl && (key === 'h' || key === 'H')) {
        e.preventDefault();
        handlers.onHold?.();
      }

      // Ctrl+F => focus product code
      if (ctrl && (key === 'f' || key === 'F')) {
        e.preventDefault();
        const el = document.querySelector('[data-pos-code]');
        el?.focus();
        el?.select?.();
      }

      // ESC => clear current entry
      if (key === 'Escape') {
        const code = document.querySelector('[data-pos-code]');
        if (code) { code.value = ''; code.focus(); }
        const name = document.querySelector('[data-pos-name]');
        if (name) name.value = '';
      }

      // Delete => remove selected cart row (requires selection support)
      if (key === 'Delete') {
        const selected = document.querySelector('[data-cart-selected]');
        if (selected) {
          const id = selected.getAttribute('data-cart-id');
          if (id) storeHook.getState().removeItem(id);
        }
      }
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [storeHook, handlers]);
}
