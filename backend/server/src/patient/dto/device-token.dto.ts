import { IsOptional, IsString, MinLength } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
