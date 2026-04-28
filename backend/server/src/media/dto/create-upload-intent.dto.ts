import { IsEnum, IsInt, IsString, IsUUID, Max, Min, MaxLength } from 'class-validator';

export enum MediaKindDto {
  PHOTO = 'PHOTO',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
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
}
