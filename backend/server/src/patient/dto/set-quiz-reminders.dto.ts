import { ArrayMaxSize, IsArray, IsString, Matches } from 'class-validator';

export class SetQuizRemindersDto {
  @IsArray()
  @ArrayMaxSize(6, { message: 'You can set up to 6 reminder times.' })
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    each: true,
    message: 'Reminder times must be in 24-hour HH:MM format.',
  })
  times!: string[];
}
