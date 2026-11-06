// Browser notifications for direct messages and mentions. Client only. They show while a Kora tab
// is open (there is no service worker push yet), and only when the person turned them on in their
// profile and the browser allows them.

const KEY = 'kora.notifications';

export function notificationsEnabled() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNotificationsEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // The browser permission still applies; only the opt-out is lost.
  }
}

/**
 * Shows one notification. `tag` collapses repeats, so two open tabs that both notice the same new
 * message show it once.
 */
export function showNotification({
  title,
  body,
  tag,
  onClick,
}: {
  title: string;
  body: string;
  tag: string;
  onClick: () => void;
}) {
  if (!notificationsEnabled()) return;
  try {
    const notification = new Notification(title, { body, tag, icon: '/favicon-32.png' });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}
