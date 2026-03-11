export function calculateAttemptScore(wrongAttempts: number): number {
  return Math.max(0, 3 - wrongAttempts);
}

export function calculateTimeAttackBonus(
  timeRemainingSeconds: number,
  timeLimitSeconds: number
): number {
  if (timeRemainingSeconds <= 0 || timeLimitSeconds <= 0) {
    return 0;
  }

  const ratio = timeRemainingSeconds / timeLimitSeconds;

  if (ratio >= 0.66) {
    return 3;
  }

  if (ratio >= 0.33) {
    return 2;
  }

  return 1;
}

export function calculateStreakBonus(streak: number): number {
  if (streak <= 1) {
    return 0;
  }

  return Math.min(3, streak - 1);
}

export function formatAttempts(attempts: number): string {
  if (attempts === 0) {
    return 'פגיעה ראשונה';
  }

  return `${attempts} פספוסים לפני הפגיעה`;
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
