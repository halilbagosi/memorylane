import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MediaCollectionDto } from './create-upload-intent.dto';

export class UpdateMediaMetadataDto {
  @IsOptional()
  @IsEnum(MediaCollectionDto)
  collection?: MediaCollectionDto;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  relationshipType?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  decoyNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  eventYear?: number;

  @IsOptional()
  isApproximateYear?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  memoryCategory?: string;
}
