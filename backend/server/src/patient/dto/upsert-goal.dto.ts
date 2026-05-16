import { IsNumber, Min, Max } from 'class-validator';

export class UpsertGoalDto {
  @IsNumber()
  @Min(1)
  @Max(100)
  targetAccuracy: number;
}
