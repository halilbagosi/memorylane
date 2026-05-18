import { IsLatitude, IsLongitude, IsOptional, IsString } from 'class-validator';

export class UpdatePatientLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsString()
  capturedAt?: string;

  @IsString()
  locationShareToken!: string;
}
