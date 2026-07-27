import type { User } from "@supabase/supabase-js";

type NameParts = { firstName: string; lastName: string };

function splitDisplayName(displayName: string): NameParts {
  const trimmed = displayName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function getUserNameParts(user: User | null): NameParts {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;

  const directFirst = String(metadata.first_name ?? "").trim();
  const directLast = String(metadata.last_name ?? "").trim();
  if (directFirst || directLast) {
    return { firstName: directFirst, lastName: directLast };
  }

  const givenName = String(metadata.given_name ?? "").trim();
  const familyName = String(metadata.family_name ?? "").trim();
  if (givenName || familyName) {
    return { firstName: givenName, lastName: familyName };
  }

  const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();
  if (fullName) {
    return splitDisplayName(fullName);
  }

  const emailPrefix = String(user?.email ?? "")
    .split("@")[0]
    ?.trim()
    .replace(/[._-]+/g, " ");
  if (emailPrefix) {
    return splitDisplayName(emailPrefix);
  }

  return { firstName: "", lastName: "" };
}

export function getUserDisplayFirstName(user: User | null): string {
  const { firstName } = getUserNameParts(user);
  return firstName || "there";
}

export function getUserInitials(user: User | null): string {
  const { firstName, lastName } = getUserNameParts(user);
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}
