import { IsNotEmpty, IsString, IsIn, IsOptional } from 'class-validator';

export class SocialLoginDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['google', 'apple'])
  provider: 'google' | 'apple';

  @IsNotEmpty()
  @IsString()
  idToken: string;

  @IsOptional()
  @IsString()
  deviceLabel?: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}
