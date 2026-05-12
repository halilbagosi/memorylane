import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as brain from 'brain.js';

// The default Node bundle imports gpu.js, which tries to load native headless-gl.
// The browser bundle still provides the CPU NeuralNetwork and avoids that crash.

export type QuizDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface DifficultyInputs {
  accuracy: number;
  responseTimeNormalized: number;
  timeOfDay: number;
  currentDifficulty: number;
}

export interface DifficultyPrediction {
  difficulty: QuizDifficulty;
  targetComplexity: number;
  source: 'AI' | 'RULE_BASED';
}

const TRAINING_SET = [
  { input: { accuracy: 0.96, responseTimeNormalized: 0.35, timeOfDay: 0.2, currentDifficulty: 0.5 }, output: { targetComplexity: 0.9 } },
  { input: { accuracy: 0.94, responseTimeNormalized: 0.55, timeOfDay: 0.5, currentDifficulty: 0.5 }, output: { targetComplexity: 0.82 } },
  { input: { accuracy: 0.82, responseTimeNormalized: 0.8, timeOfDay: 0.4, currentDifficulty: 0.5 }, output: { targetComplexity: 0.55 } },
  { input: { accuracy: 0.72, responseTimeNormalized: 1.0, timeOfDay: 0.5, currentDifficulty: 0.85 }, output: { targetComplexity: 0.48 } },
  { input: { accuracy: 0.68, responseTimeNormalized: 0.85, timeOfDay: 0.3, currentDifficulty: 0.5 }, output: { targetComplexity: 0.24 } },
  { input: { accuracy: 0.55, responseTimeNormalized: 1.15, timeOfDay: 0.5, currentDifficulty: 0.5 }, output: { targetComplexity: 0.16 } },
  { input: { accuracy: 0.92, responseTimeNormalized: 1.55, timeOfDay: 0.85, currentDifficulty: 0.85 }, output: { targetComplexity: 0.35 } },
  { input: { accuracy: 0.88, responseTimeNormalized: 1.65, timeOfDay: 0.9, currentDifficulty: 0.5 }, output: { targetComplexity: 0.28 } },
];

@Injectable()
export class AiDifficultyService implements OnModuleInit {
  private warmedNetwork: any | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reloadTrainingMemory();
  }

  async reloadTrainingMemory(): Promise<void> {
    const samples = await this.prisma.aiTrainingSample.findMany({
      orderBy: { createdAt: 'asc' },
      take: 5000,
      select: {
        accuracy: true,
        responseTimeNormalized: true,
        timeOfDay: true,
        currentDifficulty: true,
        targetComplexity: true,
      },
    });
    this.warmedNetwork = this.createNetworkFromSamples(samples);
  }

  async saveTrainingSample(patientId: string, inputs: DifficultyInputs, firstTapCorrect: boolean): Promise<number> {
    const targetComplexity = this.targetFromOutcome(inputs, firstTapCorrect);
    await this.prisma.aiTrainingSample.create({
      data: {
        patientId,
        accuracy: this.clamp(inputs.accuracy),
        responseTimeNormalized: this.clamp(inputs.responseTimeNormalized, 0, 2),
        timeOfDay: this.clamp(inputs.timeOfDay),
        currentDifficulty: this.clamp(inputs.currentDifficulty),
        targetComplexity,
        firstTapCorrect,
      },
    });
    this.warmedNetwork = this.createNetworkFromSamples([
      ...(await this.prisma.aiTrainingSample.findMany({
        orderBy: { createdAt: 'asc' },
        take: 5000,
        select: {
          accuracy: true,
          responseTimeNormalized: true,
          timeOfDay: true,
          currentDifficulty: true,
          targetComplexity: true,
        },
      })),
    ]);
    return targetComplexity;
  }

  predict(inputs: DifficultyInputs, storedModel?: unknown): DifficultyPrediction {
    const fallback = this.ruleBased(inputs);
    try {
      const net = this.createNetwork(storedModel);
      const output = net.run(this.normalizeInputs(inputs) as any) as { targetComplexity?: number };
      const targetComplexity = this.clamp(output?.targetComplexity ?? fallback.targetComplexity);
      return {
        difficulty: this.mapComplexityToDifficulty(targetComplexity),
        targetComplexity,
        source: 'AI',
      };
    } catch {
      return fallback;
    }
  }

  trainWithResult(storedModel: unknown, inputs: DifficultyInputs, firstTapCorrect: boolean): unknown {
    const net = this.createNetwork(storedModel);
    const targetComplexity = this.targetFromOutcome(inputs, firstTapCorrect);
    net.train(
      [
        ...this.baseTrainingSet(),
        {
          input: this.normalizeInputs(inputs),
          output: { targetComplexity },
        },
      ] as any,
      {
        iterations: 80,
        errorThresh: 0.01,
        log: false,
      },
    );
    return net.toJSON();
  }

  ruleBased(inputs: DifficultyInputs): DifficultyPrediction {
    let targetComplexity = 0.5;
    if (inputs.accuracy > 0.9) targetComplexity = 0.82;
    else if (inputs.accuracy >= 0.7) targetComplexity = 0.5;
    else targetComplexity = 0.18;

    if (inputs.responseTimeNormalized > 1.35) targetComplexity -= 0.22;
    if (inputs.responseTimeNormalized < 0.65 && inputs.accuracy >= 0.7) targetComplexity += 0.12;
    if (inputs.timeOfDay > 0.75 && inputs.responseTimeNormalized > 1.1) targetComplexity -= 0.12;

    targetComplexity = this.clamp(targetComplexity);
    return {
      difficulty: this.mapComplexityToDifficulty(targetComplexity),
      targetComplexity,
      source: 'RULE_BASED',
    };
  }

  difficultyToComplexity(difficulty?: string | null): number {
    if (difficulty === 'HARD') return 0.85;
    if (difficulty === 'EASY') return 0.18;
    return 0.5;
  }

  mapComplexityToDifficulty(value: number): QuizDifficulty {
    if (value < 0.3) return 'EASY';
    if (value < 0.7) return 'MEDIUM';
    return 'HARD';
  }

  normalizeResponseTime(milliseconds: number | null | undefined, averageMilliseconds = 8000): number {
    const safeMs = Math.max(500, milliseconds ?? averageMilliseconds);
    const safeAverage = Math.max(1000, averageMilliseconds);
    return this.clamp(safeMs / safeAverage, 0, 2);
  }

  timeOfDayScore(date = new Date()): number {
    return this.clamp(date.getHours() / 23);
  }

  private createNetwork(storedModel?: unknown) {
    const net = new brain.NeuralNetwork({ hiddenLayers: [6, 4] });
    if (storedModel) {
      try {
        net.fromJSON(storedModel as any);
        return net;
      } catch {
        // Fall through to base training.
      }
    }
    if (this.warmedNetwork) {
      try {
        net.fromJSON(this.warmedNetwork.toJSON());
        return net;
      } catch {
        // Fall through to base training.
      }
    }
    net.train(this.baseTrainingSet() as any, { iterations: 160, errorThresh: 0.01, learningRate: 0.3, log: false });
    return net;
  }

  private createNetworkFromSamples(samples: Array<DifficultyInputs & { targetComplexity: number }>) {
    const net = new brain.NeuralNetwork({ hiddenLayers: [6, 4] });
    const savedTraining = samples.map((sample) => ({
      input: this.normalizeInputs({
        accuracy: sample.accuracy,
        responseTimeNormalized: sample.responseTimeNormalized,
        timeOfDay: sample.timeOfDay,
        currentDifficulty: sample.currentDifficulty,
      }),
      output: { targetComplexity: this.clamp(sample.targetComplexity) },
    }));
    net.train([...this.baseTrainingSet(), ...savedTraining] as any, {
      iterations: samples.length > 0 ? 220 : 160,
      errorThresh: 0.01,
      learningRate: 0.3,
      log: false,
    });
    return net;
  }

  private baseTrainingSet() {
    return TRAINING_SET.map((sample) => ({
      input: this.normalizeInputs(sample.input),
      output: sample.output,
    }));
  }

  private normalizeInputs(inputs: DifficultyInputs): DifficultyInputs {
    return {
      accuracy: this.clamp(inputs.accuracy),
      responseTimeNormalized: this.clamp(inputs.responseTimeNormalized, 0, 2) / 2,
      timeOfDay: this.clamp(inputs.timeOfDay),
      currentDifficulty: this.clamp(inputs.currentDifficulty),
    };
  }

  private targetFromOutcome(inputs: DifficultyInputs, firstTapCorrect: boolean): number {
    let target = inputs.currentDifficulty;
    if (firstTapCorrect && inputs.responseTimeNormalized <= 1.05) target += 0.16;
    if (firstTapCorrect && inputs.responseTimeNormalized > 1.25) target -= 0.18;
    if (!firstTapCorrect) target -= 0.24;
    if (inputs.timeOfDay > 0.75 && inputs.responseTimeNormalized > 1.1) target -= 0.1;
    return this.clamp(target);
  }

  private clamp(value: number, min = 0, max = 1): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
  }
}
