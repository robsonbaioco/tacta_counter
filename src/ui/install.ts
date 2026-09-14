// Chrome shows its own install infobar only when its engagement heuristics say so, which is rare. Instead,
// whenever the browser reports the app as installable, show our own card whose button opens the native
// install dialog. Dismissing it lasts until the next visit: nothing is written to storage.

type InstallPromptEvent = Event & { prompt(): Promise<void> };

export function setupInstallPrompt(card: HTMLElement, accept: HTMLButtonElement, dismiss: HTMLButtonElement) {
  let deferred: InstallPromptEvent | null = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // replaces Chrome's mini-infobar with our card
    deferred = e as InstallPromptEvent;
    card.hidden = false;
  });

  accept.addEventListener('click', async () => {
    card.hidden = true;
    const prompt = deferred;
    deferred = null; // an install prompt can only be shown once
    await prompt?.prompt();
  });

  dismiss.addEventListener('click', () => (card.hidden = true));

  window.addEventListener('appinstalled', () => {
    card.hidden = true;
    deferred = null;
  });
}
