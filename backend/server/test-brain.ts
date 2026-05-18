import { PrismaClient } from '@prisma/client';
import { AiDifficultyService } from './src/patient/ai-difficulty.service';

const prisma = new PrismaClient();
const ai = new AiDifficultyService(prisma as any);

async function run() {
  await ai.onModuleInit();
  console.log("Initialized.");
  const res = await ai.saveTrainingSample('test-patient-id', {
    accuracy: 0.8,
    responseTimeNormalized: 1.0,
    timeOfDay: 0.5,
    currentDifficulty: 0.5
  }, true);
  console.log("Saved targetComplexity:", res);
  process.exit(0);
}
run().catch(console.error);
