import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export enum MediaKindDto {
  PHOTO = 'PHOTO',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export enum MediaCollectionDto {
  MEMORY = 'MEMORY',
  QUIZ = 'QUIZ',
}

export class CreateUploadIntentDto {
  @IsUUID()
  patientId!: string;

  @IsEnum(MediaKindDto)
  kind!: MediaKindDto;

  @IsString()
  @MaxLength(127)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  byteSize!: number;

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

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentHash?: string;
}
