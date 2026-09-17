// Redrawing without losing the reader's place.
//
// The app draws each page as a string and replaces the old markup. Done
// naively, that throws away the focused field and the caret with it: typing a
// second letter in the search box landed before the first. renderInto puts
// focus and selection back on the equivalent element of the new markup.

function focusKey(element) {
  if (!element || element === document.body) return null;
  if (element.id) return `#${CSS.escape(element.id)}`;
  if (element.dataset?.focusKey) return `[data-focus-key="${CSS.escape(element.dataset.focusKey)}"]`;
  return null;
}

export function renderInto(root, html) {
  const active = document.activeElement;
  const selector = root.contains(active) ? focusKey(active) : null;
  let selection = null;
  try {
    if (selector && typeof active.selectionStart === 'number') selection = [active.selectionStart, active.selectionEnd];
  } catch { /* elementos sem seleção */ }

  root.innerHTML = html;

  if (!selector) return;
  const again = root.querySelector(selector);
  if (!again) return;
  again.focus({ preventScroll: true });
  if (selection) {
    try { again.setSelectionRange(...selection); } catch { /* elementos sem seleção */ }
  }
}

// A polite status line for screen readers, outside the part that is redrawn.
// Announcing the whole page on every redraw — what aria-live on the app root
// did — made the app unusable with one.
function announcer() {
  let element = document.querySelector('#announcer');
  if (!element) {
    element = document.createElement('div');
    element.id = 'announcer';
    element.className = 'sr-only';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    document.body.append(element);
  }
  return element;
}

export function announce(message) {
  const element = announcer();
  element.textContent = '';
  // A change the next frame is what makes screen readers repeat a message.
  requestAnimationFrame(() => { element.textContent = message; });
}

export function toast(message, { actionLabel = '', onAction = null, duration = 3800 } = {}) {
  document.querySelectorAll('.toast').forEach((existing) => existing.remove());
  const element = document.createElement('div');
  element.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  element.append(text);
  if (actionLabel && onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = actionLabel;
    button.addEventListener('click', () => { element.remove(); onAction(); });
    element.append(button);
  }
  document.body.append(element);
  announce(message);
  if (duration) setTimeout(() => element.remove(), duration);
}

export function debounce(fn, wait = 160) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand?.('copy');
    area.remove();
    return Boolean(copied);
  }
}
