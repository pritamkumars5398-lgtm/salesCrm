/**
 * Channels that are shown in the app but not live yet.
 * Flip SMS_COMING_SOON to false to bring SMS back everywhere.
 */
export const SMS_COMING_SOON = true;

export const COMING_SOON_LABEL = "Coming soon";
export const SMS_COMING_SOON_MESSAGE = "SMS is coming soon.";

export function isComingSoonChannel(channel: string | null | undefined): boolean {
  return SMS_COMING_SOON && channel === "sms";
}
