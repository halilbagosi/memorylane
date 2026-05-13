/**
 * Subscription plan limits for MemoryLane.
 *
 * Free users have restricted access to encourage premium upgrades.
 * Premium users have full, unlimited access to all features.
 */

export const FREE_PLAN_LIMITS = {
  /** Maximum number of secondary caregivers per patient */
  maxSecondaryCaregiversPerPatient: 2,
  /** Maximum number of patients a caregiver can manage */
  maxPatientsPerCaregiver: 2,
  /** Maximum number of concurrent login sessions */
  maxSimultaneousSessions: 2,
  /** Media kinds allowed for upload */
  allowedMediaKinds: ['PHOTO'] as readonly string[],
  /** Whether AI-powered quiz difficulty is enabled */
  aiDifficultyEnabled: false,
};

export const PREMIUM_PLAN_LIMITS = {
  maxSecondaryCaregiversPerPatient: Infinity,
  maxPatientsPerCaregiver: Infinity,
  maxSimultaneousSessions: Infinity,
  allowedMediaKinds: ['PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT'] as readonly string[],
  aiDifficultyEnabled: true,
};

/** Returns the plan limits based on subscription status. */
export function getPlanLimits(isSubscribed: boolean) {
  return isSubscribed ? PREMIUM_PLAN_LIMITS : FREE_PLAN_LIMITS;
}
