import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { QuizReminderScheduler } from './quiz-reminder.scheduler';

@Global()
@Module({
  providers: [PushService, QuizReminderScheduler],
  exports: [PushService],
})
export class PushModule {}
