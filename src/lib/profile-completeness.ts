// src/lib/profile-completeness.ts
// Menghitung kelengkapan profil job seeker berdasarkan field yang diisi.
// Helper untuk users.routes.ts

export function computeProfileCompleteness(profile: {
  skills?: any;
  portfolioLink?: string | null;
  workExperience?: any;
  awards?: any;
  organizationExperience?: any;
  interests?: any;
  cvUrl?: string | null;
}): number {
  let score = 0;

  // Helper to check if field has content (string, array, or object)
  const hasContent = (val: any) => {
    if (val === null || val === undefined) return false;
    if (typeof val === "string") {
      // If it's a string, it could be a JSON string. We just check if it's not empty.
      // If it's literally "[]" or "{}", we could count it as empty, but let's just do length for now.
      const trimmed = val.trim();
      return trimmed.length > 0 && trimmed !== "[]" && trimmed !== "{}";
    }
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return Object.keys(val).length > 0;
    return false;
  };

  if (hasContent(profile.skills)) {
    score += 20;
  }
  if (hasContent(profile.interests)) {
    score += 15;
  }
  if (hasContent(profile.workExperience)) {
    score += 20;
  }
  if (hasContent(profile.organizationExperience)) {
    score += 15;
  }
  if (hasContent(profile.cvUrl)) {
    score += 15;
  }
  if (hasContent(profile.portfolioLink)) {
    score += 10;
  }
  if (hasContent(profile.awards)) {
    score += 5;
  }

  return score;
}
