/**
 * Subscription plan limits and helper functions for MemoryLane.
 *
 * Mirrors the backend subscription.constants.ts to allow UI gating
 * before making API calls.
 */

export const FREE_PLAN_LIMITS = {
  maxSecondaryCaregiversPerPatient: 1,
  maxPatientsPerCaregiver: 2,
  maxSimultaneousSessions: 2,
  allowedMediaKinds: ['PHOTO'] as readonly string[],
  aiDifficultyEnabled: false,
};

export const PREMIUM_PLAN_LIMITS = {
  maxSecondaryCaregiversPerPatient: Infinity,
  maxPatientsPerCaregiver: Infinity,
  maxSimultaneousSessions: Infinity,
  allowedMediaKinds: ['PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT'] as readonly string[],
  aiDifficultyEnabled: true,
};

export function getPlanLimits(isSubscribed: boolean) {
  return isSubscribed ? PREMIUM_PLAN_LIMITS : FREE_PLAN_LIMITS;
}

/** Returns whether the given media kind can be uploaded. */
export function canUploadMediaKind(isSubscribed: boolean, kind: string): boolean {
  const limits = getPlanLimits(isSubscribed);
  return limits.allowedMediaKinds.includes(kind);
}

/** Returns whether the user can add another patient. */
export function canAddPatient(isSubscribed: boolean, currentCount: number): boolean {
  const limits = getPlanLimits(isSubscribed);
  return currentCount < limits.maxPatientsPerCaregiver;
}

/** Returns whether another secondary caregiver can join this patient. */
export function canAddSecondaryCaregiver(isSubscribed: boolean, currentCount: number): boolean {
  const limits = getPlanLimits(isSubscribed);
  return currentCount < limits.maxSecondaryCaregiversPerPatient;
}

/** Returns a user-friendly plan name. */
export function getPlanName(isSubscribed: boolean): string {
  return isSubscribed ? 'Premium' : 'Free';
}
