// Browser-only helpers: toast messages, a confirm dialog and file downloads.

/** Shows a short message at the bottom of the screen, optionally with an action such as "Undo". */
export function showToast(message, { actionLabel, onAction, duration = 6000 } = {}) {
  const region = document.getElementById('toasts');
  const toast = document.createElement('div');
  toast.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);

  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 180);
  };

  if (actionLabel) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = actionLabel;
    button.addEventListener('click', () => {
      dismiss();
      onAction?.();
    });
    toast.append(button);
  }

  region.append(toast);
  while (region.children.length > 3) region.firstElementChild.remove();
  timer = setTimeout(dismiss, duration);
  return dismiss;
}

/** Asks a yes/no question in a dialog. Resolves to true when the user confirms. */
export function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  const dialog = document.getElementById('confirm-dialog');
  dialog.querySelector('[data-slot="title"]').textContent = title;
  dialog.querySelector('[data-slot="message"]').textContent = message;
  const confirmButton = dialog.querySelector('[data-slot="confirm"]');
  confirmButton.textContent = confirmLabel;
  confirmButton.className = `button ${danger ? 'button-danger' : 'button-primary'}`;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}

export function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
