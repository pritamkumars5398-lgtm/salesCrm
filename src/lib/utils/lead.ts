export function getFullName(lead: { fullName?: string; firstName?: string; lastName?: string }): string {
  if (lead.fullName) return lead.fullName;
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
}
