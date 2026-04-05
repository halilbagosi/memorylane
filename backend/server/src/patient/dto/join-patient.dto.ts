import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class JoinPatientDto {
  @IsNotEmpty({ message: 'Join code is required' })
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @Length(6, 6, { message: 'Join code must be exactly 6 characters' })
  @Matches(/^[A-F0-9]+$/, {
    message: 'Join code must be a valid hexadecimal code (letters A-F and digits 0-9)',
  })
  joinCode: string;
}
