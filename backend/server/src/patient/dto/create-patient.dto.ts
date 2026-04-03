import { IsNotEmpty, IsString, IsInt, Min, Max, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePatientDto {
  @IsNotEmpty()
  @IsString()
  //cut out extra spaces
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  // only letters allowed
  @Matches(/^[a-zA-Z\s]+$/, {
    message: 'Patient name must only contain letters and spaces',
  })
  name: string;

  @IsNotEmpty()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^[a-zA-Z\s]+$/, {
    message: 'Patient surname must only contain letters and spaces',
  })
  surname: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(120)
  age: number;
}