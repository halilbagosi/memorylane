import { IsNotEmpty, IsOptional, IsString, IsDateString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePatientDto {
  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^[a-zA-ZëçËÇ\s]+$/, {
    message: 'Patient name must only contain letters and spaces',
  })
  name: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^[a-zA-ZëçËÇ\s]+$/, {
    message: 'Patient surname must only contain letters and spaces',
  })
  surname: string;

  @IsNotEmpty({ message: 'Date of birth is required' })
  @IsDateString({}, { message: 'Date of birth must be a valid ISO 8601 date string (e.g. 1950-03-15)' })
  dateOfBirth: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
