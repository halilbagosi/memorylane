import { CareLevel, QuizDifficulty, QuizMediaItem, QuizMode } from './media';

const FALLBACK_RELATIONSHIPS = ['Friend', 'Cousin', 'Neighbor', 'Coworker', 'Teacher', 'Classmate'];

export interface QuizQuestion {
  media: QuizMediaItem;
  imageUrl: string;
  mode: QuizMode;
  correctAnswer: string;
  choices: string[];
  questionText: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  return shuffle(arr).slice(0, count);
}

function getFullName(media: QuizMediaItem): string {
  const parts = [media.firstName, media.lastName].filter(Boolean);
  return parts.join(' ') || '';
}

function getIdentityKey(media: Pick<QuizMediaItem, 'firstName' | 'lastName'>): string | null {
  const firstName = media.firstName?.trim();
  if (!firstName) return null;
  const lastName = media.lastName?.trim() ?? '';
  return `${firstName} ${lastName}`.trim().toLowerCase();
}

export function uniqueIdentityCount(
  items: Array<Pick<QuizMediaItem, 'firstName' | 'lastName'>>,
): number {
  const identities = new Set<string>();
  for (const item of items) {
    const key = getIdentityKey(item);
    if (key) identities.add(key);
  }
  return identities.size;
}

function getRawAnswer(media: QuizMediaItem, mode: QuizMode): string | null {
  switch (mode) {
    case 'NAME':
      return media.firstName ? getFullName(media) : null;
    case 'RELATIONSHIP':
      return media.relationshipType || null;
    case 'AGE': {
      if (!media.birthYear || !media.eventYear) return null;
      const age = media.eventYear - media.birthYear;
      return age > 0 ? String(age) : null;
    }
  }
}

function formatAnswer(raw: string, mode: QuizMode): string {
  if (mode === 'AGE') return `${raw} years old`;
  return raw;
}

function generateAgeDecoys(correctAge: number, decoyCount: number): string[] {
  const decoys = new Set<string>();
  for (let attempt = 0; attempt < 50 && decoys.size < decoyCount; attempt++) {
    const offset = Math.floor(Math.random() * 20) - 10;
    if (offset === 0) continue;
    const age = Math.max(1, correctAge + offset);
    if (String(age) !== String(correctAge)) decoys.add(String(age));
  }
  // Guaranteed fallbacks if random range was too narrow
  const extras = [correctAge + 13, correctAge - 13, correctAge + 7, correctAge - 7, correctAge + 4, correctAge - 4];
  for (const fa of extras) {
    if (decoys.size >= decoyCount) break;
    const a = Math.max(1, fa);
    if (String(a) !== String(correctAge) && !decoys.has(String(a))) decoys.add(String(a));
  }
  return [...decoys].slice(0, decoyCount);
}

function decoyCountForDifficulty(difficulty: QuizDifficulty): number {
  if (difficulty === 'EASY') return 2;
  if (difficulty === 'HARD') return 4;
  return 3;
}

function buildDecoys(
  media: QuizMediaItem,
  allMedia: QuizMediaItem[],
  mode: QuizMode,
  rawCorrect: string,
  decoyCount: number,
): string[] {
  const others = allMedia.filter(m => m.publicId !== media.publicId);

  if (mode === 'NAME') {
    const correctKey = getIdentityKey(media);
    const decoysByIdentity = new Map<string, string>();
    for (const other of shuffle(others)) {
      const key = getIdentityKey(other);
      const name = getFullName(other);
      if (!key || key === correctKey || !name || name === rawCorrect || decoysByIdentity.has(key)) continue;
      decoysByIdentity.set(key, name);
    }
    return pickRandom([...decoysByIdentity.values()], decoyCount);
  }

  if (mode === 'RELATIONSHIP') {
    const pool = [...new Set(
      others.map(m => m.relationshipType).filter((r): r is string => !!r && r !== rawCorrect),
    )];
    const picks = pickRandom(pool, decoyCount);
    if (picks.length < decoyCount) {
      const needed = decoyCount - picks.length;
      const fallbacks = FALLBACK_RELATIONSHIPS.filter(r => r !== rawCorrect && !picks.includes(r));
      return [...picks, ...pickRandom(fallbacks, needed)];
    }
    return picks;
  }

  // AGE
  return generateAgeDecoys(parseInt(rawCorrect, 10), decoyCount);
}

function questionText(mode: QuizMode): string {
  switch (mode) {
    case 'NAME': return 'Who is this person?';
    case 'RELATIONSHIP': return 'How do you know this person?';
    case 'AGE': return 'How old was this person\nin this memory?';
  }
}

function buildQuestion(
  media: QuizMediaItem,
  allMedia: QuizMediaItem[],
  mode: QuizMode,
  imageUrl: string,
  difficulty: QuizDifficulty,
): QuizQuestion | null {
  const rawCorrect = getRawAnswer(media, mode);
  if (!rawCorrect) return null;

  const decoyCount = decoyCountForDifficulty(difficulty);
  const rawDecoys = buildDecoys(media, allMedia, mode, rawCorrect, decoyCount);
  if (rawDecoys.length < decoyCount) return null;

  const correctAnswer = formatAnswer(rawCorrect, mode);
  const choices = shuffle([...new Set([correctAnswer, ...rawDecoys.map(d => formatAnswer(d, mode))])]);
  if (choices.length < decoyCount + 1) return null;

  return {
    media,
    imageUrl,
    mode,
    correctAnswer,
    choices,
    questionText: questionText(mode),
  };
}

export function buildQuizPool(
  items: QuizMediaItem[],
): { media: QuizMediaItem; imageUrl: string }[] {
  return items.map(m => ({ media: m, imageUrl: m.downloadUrl }));
}

export function buildQuizSet(
  pool: { media: QuizMediaItem; imageUrl: string }[],
  mode: QuizMode,
  difficulty: QuizDifficulty = 'MEDIUM',
  count?: number,
): QuizQuestion[] {
  const allMedia = pool.map(p => p.media);

  const byIdentity = new Map<string, { media: QuizMediaItem; imageUrl: string }>();
  for (const item of shuffle(pool.filter(p => getRawAnswer(p.media, mode) !== null))) {
    const key = getIdentityKey(item.media);
    if (key && !byIdentity.has(key)) byIdentity.set(key, item);
  }

  const eligible = [...byIdentity.values()];
  const selected = typeof count === 'number'
    ? pickRandom(eligible, Math.min(count, eligible.length))
    : shuffle(eligible);

  const questions: QuizQuestion[] = [];
  for (const { media, imageUrl } of selected) {
    const q = buildQuestion(media, allMedia, mode, imageUrl, difficulty);
    if (q) questions.push(q);
  }
  return questions;
}

export function buildQuizSetFromIds(
  pool: { media: QuizMediaItem; imageUrl: string }[],
  mode: QuizMode,
  publicIds: string[],
  difficulty: QuizDifficulty = 'MEDIUM',
): QuizQuestion[] {
  const allMedia = pool.map(p => p.media);
  const byPublicId = new Map(pool.map(item => [item.media.publicId, item]));

  const questions: QuizQuestion[] = [];
  const seenIdentities = new Set<string>();
  for (const publicId of publicIds) {
    const item = byPublicId.get(publicId);
    if (!item || getRawAnswer(item.media, mode) === null) continue;
    const identityKey = getIdentityKey(item.media);
    if (!identityKey || seenIdentities.has(identityKey)) continue;
    seenIdentities.add(identityKey);

    const q = buildQuestion(item.media, allMedia, mode, item.imageUrl, difficulty);
    if (q) questions.push(q);
  }
  return questions;
}

export function buildAdaptiveQuizSet(
  pool: { media: QuizMediaItem; imageUrl: string }[],
  modes: QuizMode[],
  careLevel: CareLevel,
  difficulty: QuizDifficulty = 'MEDIUM',
): QuizQuestion[] {
  if (careLevel !== 'PREVENTATIVE') {
    const preferredMode = modes.includes('NAME') ? 'NAME' : modes[0];
    return preferredMode ? buildQuizSet(pool, preferredMode, difficulty) : [];
  }

  const mixed: QuizQuestion[] = [];
  const seen = new Set<string>();
  for (const mode of shuffle(modes)) {
    for (const question of buildQuizSet(pool, mode, difficulty)) {
      const key = `${question.media.publicId}:${question.mode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mixed.push(question);
    }
  }
  return shuffle(mixed);
}

export function buildAdaptiveQuizSetFromIds(
  pool: { media: QuizMediaItem; imageUrl: string }[],
  modes: QuizMode[],
  careLevel: CareLevel,
  publicIds: string[],
  difficulty: QuizDifficulty = 'MEDIUM',
): QuizQuestion[] {
  if (careLevel !== 'PREVENTATIVE') {
    const preferredMode = modes.includes('NAME') ? 'NAME' : modes[0];
    return preferredMode ? buildQuizSetFromIds(pool, preferredMode, publicIds, difficulty) : [];
  }

  const allMedia = pool.map(p => p.media);
  const byPublicId = new Map(pool.map(item => [item.media.publicId, item]));
  const questions: QuizQuestion[] = [];
  const perMediaModeIndex = new Map<string, number>();

  for (const publicId of publicIds) {
    const item = byPublicId.get(publicId);
    if (!item) continue;
    const eligibleModes = modes.filter(mode => getRawAnswer(item.media, mode) !== null);
    if (eligibleModes.length === 0) continue;
    const index = perMediaModeIndex.get(publicId) ?? 0;
    const mode = eligibleModes[index % eligibleModes.length];
    perMediaModeIndex.set(publicId, index + 1);
    const q = buildQuestion(item.media, allMedia, mode, item.imageUrl, difficulty);
    if (q) questions.push(q);
  }
  return questions;
}
