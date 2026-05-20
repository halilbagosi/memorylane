import {
  buildAdaptiveQuizSet,
  buildAdaptiveQuizSetFromIds,
  buildQuizPool,
  shouldMixQuestionTypes,
} from '../../../../frontend/src/services/quiz';
import type { CareLevel, QuizDifficulty, QuizMediaItem, QuizMode } from '../../../../frontend/src/services/media';

const makeMedia = (index: number, relationshipType: string): QuizMediaItem => ({
  publicId: `person-${index}`,
  firstName: `Person${index}`,
  lastName: `Example${index}`,
  relationshipType,
  birthYear: 1950 + index,
  eventYear: 2020,
  hint: null,
  nickname: null,
  downloadUrl: `https://example.test/person-${index}.jpg`,
  downloadExpiresAt: new Date('2030-01-01T00:00:00.000Z').toISOString(),
});

const media = [
  makeMedia(1, 'Mother'),
  makeMedia(2, 'Father'),
  makeMedia(3, 'Sister'),
  makeMedia(4, 'Friend'),
  makeMedia(5, 'Neighbor'),
];

const modes: QuizMode[] = ['NAME', 'AGE', 'RELATIONSHIP'];

function modeSetFor(
  difficulty: QuizDifficulty,
  careLevel: CareLevel,
  aiAdaptiveEnabled: boolean,
) {
  const questions = buildAdaptiveQuizSet(
    buildQuizPool(media),
    modes,
    careLevel,
    difficulty,
    aiAdaptiveEnabled,
  );
  return new Set(questions.map((question) => question.mode));
}

describe('adaptive quiz generation', () => {
  it('mixes question types when AI adaptive difficulty predicts HARD', () => {
    expect(shouldMixQuestionTypes('DEMENTIA', 'HARD', true)).toBe(true);

    const seenModes = modeSetFor('HARD', 'DEMENTIA', true);

    expect(seenModes).toEqual(new Set<QuizMode>(['NAME', 'AGE', 'RELATIONSHIP']));
  });

  it.each<QuizDifficulty>(['EASY', 'MEDIUM'])(
    'keeps AI adaptive %s sessions to one question type',
    (difficulty) => {
      expect(shouldMixQuestionTypes('DEMENTIA', difficulty, true)).toBe(false);

      const seenModes = modeSetFor(difficulty, 'DEMENTIA', true);

      expect(seenModes).toEqual(new Set<QuizMode>(['NAME']));
    },
  );

  it('keeps non-AI dementia sessions separate even when difficulty is HARD', () => {
    expect(shouldMixQuestionTypes('DEMENTIA', 'HARD', false)).toBe(false);

    const seenModes = modeSetFor('HARD', 'DEMENTIA', false);

    expect(seenModes).toEqual(new Set<QuizMode>(['NAME']));
  });

  it('still mixes preventative sessions without AI adaptive difficulty', () => {
    expect(shouldMixQuestionTypes('PREVENTATIVE', 'MEDIUM', false)).toBe(true);

    const seenModes = modeSetFor('MEDIUM', 'PREVENTATIVE', false);

    expect(seenModes).toEqual(new Set<QuizMode>(['NAME', 'AGE', 'RELATIONSHIP']));
  });

  it('restores mixed AI-hard sessions by rotating modes across repeated saved IDs', () => {
    const pool = buildQuizPool(media);
    const savedIds = media.flatMap((item) => [item.publicId, item.publicId, item.publicId]);

    const restored = buildAdaptiveQuizSetFromIds(
      pool,
      modes,
      'DEMENTIA',
      savedIds,
      'HARD',
      true,
    );

    expect(new Set(restored.map((question) => question.mode))).toEqual(
      new Set<QuizMode>(['NAME', 'AGE', 'RELATIONSHIP']),
    );
  });

  it('uses difficulty to control choice count', () => {
    const pool = buildQuizPool(media);

    expect(buildAdaptiveQuizSet(pool, modes, 'DEMENTIA', 'EASY', true)[0].choices).toHaveLength(3);
    expect(buildAdaptiveQuizSet(pool, modes, 'DEMENTIA', 'MEDIUM', true)[0].choices).toHaveLength(4);
    for (const question of buildAdaptiveQuizSet(pool, modes, 'DEMENTIA', 'HARD', true)) {
      expect(question.choices).toHaveLength(5);
    }
  });
});
