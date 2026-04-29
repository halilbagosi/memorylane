import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
