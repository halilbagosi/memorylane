import { IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[a-zA-ZëçËÇ\s]+$/, { message: 'Name must only contain letters and spaces' })
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[a-zA-ZëçËÇ\s]+$/, { message: 'Surname must only contain letters and spaces' })
  surname?: string;

  // base64 data URL or null to remove the avatar
  @IsOptional()
  @IsString()
  avatarUrl?: string | null;
}
