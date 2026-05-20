import { AiDifficultyService } from './ai-difficulty.service';

const makeService = () => new AiDifficultyService({
  aiTrainingSample: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
} as any);

describe('AiDifficultyService', () => {
  it('maps low, medium, and high complexity to quiz difficulty labels', () => {
    const service = makeService();

    expect(service.mapComplexityToDifficulty(0.1)).toBe('EASY');
    expect(service.mapComplexityToDifficulty(0.5)).toBe('MEDIUM');
    expect(service.mapComplexityToDifficulty(0.85)).toBe('HARD');
  });

  it('converts saved difficulty labels to complexity values used by the model', () => {
    const service = makeService();

    expect(service.difficultyToComplexity('EASY')).toBe(0.18);
    expect(service.difficultyToComplexity('MEDIUM')).toBe(0.5);
    expect(service.difficultyToComplexity('HARD')).toBe(0.85);
    expect(service.difficultyToComplexity(null)).toBe(0.5);
  });

  it('rule-based fallback predicts HARD after very strong performance', () => {
    const service = makeService();

    const prediction = service.ruleBased({
      accuracy: 0.96,
      responseTimeNormalized: 0.45,
      timeOfDay: 0.4,
      currentDifficulty: 0.5,
    });

    expect(prediction.difficulty).toBe('HARD');
    expect(prediction.source).toBe('RULE_BASED');
  });

  it('rule-based fallback lowers difficulty when accuracy is poor', () => {
    const service = makeService();

    const prediction = service.ruleBased({
      accuracy: 0.45,
      responseTimeNormalized: 1.4,
      timeOfDay: 0.4,
      currentDifficulty: 0.85,
    });

    expect(prediction.difficulty).toBe('EASY');
    expect(prediction.source).toBe('RULE_BASED');
  });

  it('caps AI prediction to the safer fallback when performance is poor or very slow', () => {
    const service = makeService();
    jest.spyOn(service as any, 'createNetwork').mockReturnValue({
      run: jest.fn(() => ({ targetComplexity: 0.85 })),
    });

    expect(service.predict({
      accuracy: 0.45,
      responseTimeNormalized: 1,
      timeOfDay: 0.4,
      currentDifficulty: 0.5,
    }).difficulty).toBe('EASY');

    expect(service.predict({
      accuracy: 0.85,
      responseTimeNormalized: 1.6,
      timeOfDay: 0.4,
      currentDifficulty: 0.5,
    }).difficulty).toBe('EASY');
  });

  it('lowers difficulty when the patient needs many taps before the correct answer', () => {
    const service = makeService();
    jest.spyOn(service as any, 'createNetwork').mockReturnValue({
      run: jest.fn(() => ({ targetComplexity: 0.85 })),
    });

    expect(service.normalizeAttemptLoad(1)).toBe(0);
    expect(service.normalizeAttemptLoad(5)).toBe(1);

    const prediction = service.predict({
      accuracy: 0.85,
      responseTimeNormalized: 0.9,
      timeOfDay: 0.4,
      currentDifficulty: 0.5,
      attemptLoad: service.normalizeAttemptLoad(5),
    });

    expect(prediction.difficulty).toBe('EASY');
  });
});
