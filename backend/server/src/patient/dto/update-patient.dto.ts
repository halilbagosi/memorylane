import { IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdatePatientDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^[a-zA-Z\s]+$/, { message: 'Name must only contain letters and spaces' })
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^[a-zA-Z\s]+$/, { message: 'Surname must only contain letters and spaces' })
  surname?: string;
}
