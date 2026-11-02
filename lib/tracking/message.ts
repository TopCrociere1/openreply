export interface MessageTrackedLink {
  slug: string;
  destinationUrl: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/i;

function trimTrailingPunctuation(url: string) {
  return url.replace(/[.,!?;:]+$/, "");
}

/** Clean the gap a missing name leaves ("Ciao !" -> "Ciao!"). */
function tidy(text: string) {
  return text.replace(/[ \t]+([,!?.])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}

export function extractFirstUrl(message: string): string | null {
  const match = message.match(URL_PATTERN);
  if (!match) return null;

  try {
    const url = trimTrailingPunctuation(match[0]);
    return new URL(url).toString();
  } catch {
    return null;
  }
}

export function replaceUrlWithTrackedPlaceholder(
  message: string,
  destinationUrl: string | null | undefined
) {
  if (!destinationUrl) return message;
  if (message.includes(destinationUrl)) {
    return message.replace(destinationUrl, "{link}");
  }

  const withoutTrailingSlash = destinationUrl.replace(/\/$/, "");
  return message.replace(withoutTrailingSlash, "{link}");
}

/**
 * Personalize {username} and strip the {link} token — used when the link is
 * delivered as a separate button rather than inline in the message text.
 */
export function renderMessageWithoutLink({
  message,
  commenterName,
}: {
  message: string;
  commenterName?: string | null;
}) {
  return tidy(
    message
      .replace(/\{username\}/gi, commenterName ?? "")
      .replace(/\s*\{link\}\s*/gi, " ")
  );
}

/** Instagram handles are letters, digits, dot and underscore, max 30. */
export function sanitizeUsername(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 30);
  return cleaned || null;
}

/** Pass the handle on only when the destination actually uses {username}. */
export function usernameForDestination(
  destination: string,
  username: string | null | undefined
) {
  return /\{username\}|%7Busername%7D/i.test(destination) ? username ?? null : null;
}

/** Fill {username} in a destination URL, raw or percent-encoded. */
export function fillDestinationUsername(destination: string, username: string | null) {
  const value = username ? `@${username}` : "";
  return destination
    .replace(/\{username\}/gi, encodeURIComponent(value))
    .replace(/%7Busername%7D/gi, encodeURIComponent(value));
}

export function buildTrackedUrl(
  slug: string,
  baseUrl?: string,
  recipientToken?: string,
  username?: string | null
) {
  const resolvedBaseUrl =
    baseUrl ??
    (typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXTAUTH_URL ?? "http://localhost:3000");

  const url = new URL(`${resolvedBaseUrl.replace(/\/$/, "")}/r/${slug}`);
  if (recipientToken) url.searchParams.set("r", recipientToken);
  // Top Crociere: carry the Instagram handle so the redirect can fill
  // {username} inside the destination (e.g. a wa.me prefilled text).
  const handle = sanitizeUsername(username);
  if (handle) url.searchParams.set("u", handle);
  return url.toString();
}

export function renderMessageWithTracking({
  message,
  commenterName,
  trackedLinks,
  baseUrl,
  recipientToken,
}: {
  message: string;
  commenterName?: string | null;
  trackedLinks?: MessageTrackedLink[];
  baseUrl?: string;
  recipientToken?: string;
}) {
  let rendered = tidy(message.replace(/\{username\}/gi, commenterName ?? ""));
  const primaryLink = trackedLinks?.[0];

  if (!primaryLink) return rendered;

  const trackedUrl = buildTrackedUrl(
    primaryLink.slug,
    baseUrl,
    recipientToken,
    usernameForDestination(primaryLink.destinationUrl, commenterName)
  );

  if (/\{link\}/i.test(rendered)) {
    return rendered.replace(/\{link\}/gi, trackedUrl);
  }

  if (rendered.includes(primaryLink.destinationUrl)) {
    rendered = rendered.replaceAll(primaryLink.destinationUrl, trackedUrl);
  } else {
    const withoutTrailingSlash = primaryLink.destinationUrl.replace(/\/$/, "");
    rendered = rendered.replaceAll(withoutTrailingSlash, trackedUrl);
  }

  return rendered;
}
