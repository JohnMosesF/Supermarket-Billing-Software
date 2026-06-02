/**
 * Enhanced POS Keyboard Manager
 * Handles all keyboard shortcuts for production-ready billing
 * 
 * SHORTCUTS:
 * - F1: New Bill
 * - F2: Search Products
 * - F3: Focus Customer Name
 * - F4: Hold Bill
 * - F5: Resume Hold Bill
 * - F6: Bill History
 * - F8: Print Invoice
 * - Ctrl+P: Print Bill
 * - Ctrl+S: Save Bill
 * - Ctrl+H: Hold Bill
 * - Ctrl+F: Focus Product ID
 * - Ctrl+Delete: Remove Selected Item
 * - ESC: Clear Current Entry
 */
export default class KeyboardManager {
  constructor(actions = {}) {
    this.actions = actions;
    this._handler = this._handler.bind(this);
  }

  start() {
    window.addEventListener('keydown', this._handler);
  }

  stop() {
    window.removeEventListener('keydown', this._handler);
  }

  _handler(e) {
    // Don't trigger on input fields except for special keys
    const activeEl = document.activeElement || null;
    const tagName = activeEl?.tagName || '';
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName);
    const isEditable = activeEl?.contentEditable === 'true';

    // Function keys (F1-F8)
    if (e.key === 'F1') {
      e.preventDefault();
      this.actions.newBill?.();
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      this.actions.searchProducts?.();
      return;
    }
    if (e.key === 'F3') {
      e.preventDefault();
      this.actions.focusCustomer?.();
      return;
    }
    if (e.key === 'F4') {
      e.preventDefault();
      this.actions.holdBill?.();
      return;
    }
    if (e.key === 'F5') {
      e.preventDefault();
      this.actions.resumeHoldBill?.();
      return;
    }
    if (e.key === 'F6') {
      e.preventDefault();
      this.actions.billHistory?.();
      return;
    }
    if (e.key === 'F8') {
      e.preventDefault();
      this.actions.printInvoice?.();
      return;
    }

    // Ctrl combinations
    if (e.ctrlKey) {
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        this.actions.print?.();
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.actions.save?.();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.actions.hold?.();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.actions.focusProduct?.();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        this.actions.deleteItem?.();
        return;
      }
      // Ctrl+Enter to save quickly
      if (e.key === 'Enter') {
        e.preventDefault();
        this.actions.save?.();
        return;
      }
    }

    // Escape key - clear entry (allow from anywhere in POS)
    if (e.key === 'Escape') {
      e.preventDefault();
      this.actions.clearRow?.();
      return;
    }

    // Delete key - remove item (only outside input fields)
    if (e.key === 'Delete' && !isInput && !isEditable) {
      e.preventDefault();
      this.actions.deleteItem?.();
      return;
    }

    // Arrow navigation for POS table/selection when focus is not inside an input
    if (!isInput && !isEditable) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.actions.selectNext?.();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.actions.selectPrev?.();
        return;
      }
    }
  }
}
