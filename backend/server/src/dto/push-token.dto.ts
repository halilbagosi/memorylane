import { IsString, MinLength } from 'class-validator';

export class PushTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
