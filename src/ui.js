// Hjelpere for nettleseren: korte meldinger nederst (toasts), en bekreftelsesdialog og nedlasting av filer.

/** Viser en kort melding nederst på skjermen, eventuelt med en knapp som "Angre". */
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

/** Stiller et ja/nei-spørsmål i en dialog. Gir true når brukeren bekrefter. */
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
