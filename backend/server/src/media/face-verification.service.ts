import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateCollectionCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
  FaceDetail,
  IndexFacesCommand,
  RekognitionClient,
  ResourceAlreadyExistsException,
  SearchFacesByImageCommand,
} from '@aws-sdk/client-rekognition';
import sharp from 'sharp';

export type QuizPhotoVerificationCode =
  | 'NO_FACE_DETECTED'
  | 'TOO_MANY_FACES'
  | 'LOW_CONFIDENCE'
  | 'LOW_CLARITY'
  | 'NOT_FRONTAL'
  | 'INVALID_IMAGE'
  | 'DUPLICATE_PHOTO'
  | 'FACE_VERIFICATION_UNAVAILABLE';

export interface QuizPhotoVerificationResult {
  accepted: boolean;
  code?: QuizPhotoVerificationCode;
  message?: string;
  confidence?: number;
  cropped?: boolean;
}

export interface ProcessedQuizPhoto {
  buffer: Buffer;
  contentType: string;
  byteSize: number;
  cropped: boolean;
}

const MIN_CONFIDENCE = Number(process.env.QUIZ_FACE_MIN_CONFIDENCE) || 85;
const MIN_SHARPNESS = Number(process.env.QUIZ_FACE_MIN_SHARPNESS) || 45;
const MIN_BRIGHTNESS = Number(process.env.QUIZ_FACE_MIN_BRIGHTNESS) || 35;
const MAX_YAW = Number(process.env.QUIZ_FACE_MAX_YAW) || 15;
const MAX_ROLL = Number(process.env.QUIZ_FACE_MAX_ROLL) || 15;
const MIN_FACE_AREA_BEFORE_CROP = Number(process.env.QUIZ_FACE_MIN_AREA_BEFORE_CROP) || 0.5;

const FRIENDLY_MESSAGES: Record<QuizPhotoVerificationCode, string> = {
  NO_FACE_DETECTED: "We couldn't find a face. Please make sure the person is looking forward.",
  TOO_MANY_FACES: 'Only one person allowed per quiz photo.',
  LOW_CONFIDENCE: 'This photo is a bit blurry. Try a clearer one to help recognition.',
  LOW_CLARITY: 'This photo is a bit hard to see. Try a brighter, clearer photo.',
  NOT_FRONTAL: 'A front-facing photo will help the patient recognize this person more easily.',
  INVALID_IMAGE: 'We could not decode this image. Please try a JPEG or PNG photo.',
  DUPLICATE_PHOTO: 'This photo has already been added.',
  FACE_VERIFICATION_UNAVAILABLE: 'Face verification is temporarily unavailable. Please try again.',
};

const FACE_MATCH_THRESHOLD = Number(process.env.QUIZ_FACE_MATCH_THRESHOLD) || 90;

@Injectable()
export class FaceVerificationService {
  private readonly logger = new Logger(FaceVerificationService.name);
  private readonly rekognition = new RekognitionClient({
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
  });

  async validateQuizPhoto(imageBuffer: Buffer): Promise<QuizPhotoVerificationResult> {
    const processed = await this.prepareForDetection(imageBuffer, false);
    const face = await this.detectSingleFace(processed);
    const failure = this.validateFaceQuality(face);
    if (failure) return failure;

    return {
      accepted: true,
      confidence: (face.Confidence ?? 0) / 100,
      cropped: this.shouldCrop(face),
    };
  }

  async validateAndProcessQuizPhoto(imageBuffer: Buffer): Promise<ProcessedQuizPhoto> {
    const processed = await this.prepareForDetection(imageBuffer, false);
    const face = await this.detectSingleFace(processed);
    const failure = this.validateFaceQuality(face);
    if (failure) throw this.toBadRequest(failure);

    if (!this.shouldCrop(face)) {
      return {
        buffer: processed,
        contentType: 'image/jpeg',
        byteSize: processed.length,
        cropped: false,
      };
    }

    const cropped = await this.cropToHeadshot(processed, face).catch(() => processed);
    return {
      buffer: cropped,
      contentType: 'image/jpeg',
      byteSize: cropped.length,
      cropped: true,
    };
  }

  toBadRequest(result: QuizPhotoVerificationResult): BadRequestException {
    return new BadRequestException({
      code: result.code ?? 'INVALID_IMAGE',
      message: result.message ?? FRIENDLY_MESSAGES.INVALID_IMAGE,
    });
  }

  private async prepareForDetection(imageBuffer: Buffer, strict: boolean): Promise<Buffer> {
    try {
      return await sharp(imageBuffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
    } catch (error) {
      if (!strict) return imageBuffer;
      throw this.toBadRequest({
        accepted: false,
        code: 'INVALID_IMAGE',
        message:
          process.env.NODE_ENV === 'production'
            ? FRIENDLY_MESSAGES.INVALID_IMAGE
            : `${FRIENDLY_MESSAGES.INVALID_IMAGE} (${error instanceof Error ? error.message : 'unknown decode error'})`,
      });
    }
  }

  private async detectSingleFace(imageBuffer: Buffer): Promise<FaceDetail> {
    let faces: FaceDetail[];
    try {
      const response = await this.rekognition.send(
        new DetectFacesCommand({
          Image: { Bytes: imageBuffer },
          Attributes: ['ALL'],
        }),
      );
      faces = response.FaceDetails ?? [];
    } catch (error) {
      console.error('[face-verification] Rekognition DetectFaces failed', {
        name: error && typeof error === 'object' && 'name' in error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      });
      if (error && typeof error === 'object' && 'name' in error && error.name === 'InvalidImageFormatException') {
        throw this.toBadRequest({
          accepted: false,
          code: 'INVALID_IMAGE',
          message: FRIENDLY_MESSAGES.INVALID_IMAGE,
        });
      }
      throw this.toUnavailable(error);
    }

    if (faces.length === 0) {
      throw this.toBadRequest({
        accepted: false,
        code: 'NO_FACE_DETECTED',
        message: FRIENDLY_MESSAGES.NO_FACE_DETECTED,
      });
    }
    if (faces.length > 1) {
      throw this.toBadRequest({
        accepted: false,
        code: 'TOO_MANY_FACES',
        message: FRIENDLY_MESSAGES.TOO_MANY_FACES,
      });
    }

    return faces[0];
  }

  private validateFaceQuality(face: FaceDetail): QuizPhotoVerificationResult | null {
    const confidence = face.Confidence ?? 0;
    if (confidence < MIN_CONFIDENCE) {
      return {
        accepted: false,
        code: 'LOW_CONFIDENCE',
        message: FRIENDLY_MESSAGES.LOW_CONFIDENCE,
        confidence: confidence / 100,
      };
    }

    const yaw = Math.abs(face.Pose?.Yaw ?? 0);
    const roll = Math.abs(face.Pose?.Roll ?? 0);
    if (yaw > MAX_YAW || roll > MAX_ROLL) {
      return {
        accepted: false,
        code: 'NOT_FRONTAL',
        message: FRIENDLY_MESSAGES.NOT_FRONTAL,
        confidence: confidence / 100,
      };
    }

    const sharpness = face.Quality?.Sharpness ?? 0;
    const brightness = face.Quality?.Brightness ?? 0;
    if (sharpness < MIN_SHARPNESS || brightness < MIN_BRIGHTNESS) {
      return {
        accepted: false,
        code: 'LOW_CLARITY',
        message: FRIENDLY_MESSAGES.LOW_CLARITY,
        confidence: confidence / 100,
      };
    }

    return null;
  }

  private shouldCrop(face: FaceDetail): boolean {
    const box = face.BoundingBox;
    if (!box?.Width || !box.Height) return false;
    return box.Width * box.Height < MIN_FACE_AREA_BEFORE_CROP;
  }

  // Face collection helpers

  private collectionId(patientId: string): string {
    return `ml-${patientId.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
  }

  private async ensureCollection(patientId: string): Promise<void> {
    try {
      await this.rekognition.send(
        new CreateCollectionCommand({ CollectionId: this.collectionId(patientId) }),
      );
    } catch (error) {
      if (error instanceof ResourceAlreadyExistsException) return;
      this.logger.error('Failed to create Rekognition collection', { patientId, error });
      throw this.toUnavailable(error);
    }
  }

  /** Returns true when a face that matches the provided image already exists
   *  in this patient's collection (similarity >= FACE_MATCH_THRESHOLD). */
  async findDuplicateFaceExternalImageIds(patientId: string, imageBuffer: Buffer): Promise<string[]> {
    try {
      await this.ensureCollection(patientId);
      const response = await this.rekognition.send(
        new SearchFacesByImageCommand({
          CollectionId: this.collectionId(patientId),
          Image: { Bytes: imageBuffer },
          MaxFaces: 10,
          FaceMatchThreshold: FACE_MATCH_THRESHOLD,
        }),
      );
      return (response.FaceMatches ?? [])
        .map((match) => match.Face?.ExternalImageId)
        .filter((id): id is string => !!id);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        (error.name === 'InvalidParameterException' ||
          error.name === 'InvalidImageFormatException')
      ) {
        return [];
      }
      this.logger.error('SearchFacesByImage failed', { patientId, error });
      throw this.toUnavailable(error);
    }
  }

  async checkForDuplicateFace(patientId: string, imageBuffer: Buffer): Promise<boolean> {
    return (await this.findDuplicateFaceExternalImageIds(patientId, imageBuffer)).length > 0;
  }

  /** Adds the face to the patient's collection. Returns the AWS face ID. */
  async indexFaceInCollection(
    patientId: string,
    externalImageId: string,
    imageBuffer: Buffer,
  ): Promise<string | undefined> {
    try {
      await this.ensureCollection(patientId);
      const response = await this.rekognition.send(
        new IndexFacesCommand({
          CollectionId: this.collectionId(patientId),
          Image: { Bytes: imageBuffer },
          ExternalImageId: externalImageId,
          MaxFaces: 1,
          DetectionAttributes: [],
        }),
      );
      return response.FaceRecords?.[0]?.Face?.FaceId;
    } catch (error) {
      this.logger.error('IndexFaces failed', { patientId, error });
      throw this.toUnavailable(error);
    }
  }

  /** Removes a previously indexed face from the patient's collection. */
  async removeFaceFromCollection(patientId: string, faceId: string): Promise<void> {
    try {
      await this.rekognition.send(
        new DeleteFacesCommand({
          CollectionId: this.collectionId(patientId),
          FaceIds: [faceId],
        }),
      );
    } catch (error) {
      this.logger.warn('DeleteFaces failed', { patientId, faceId, error });
    }
  }

  // Image processing

  private toUnavailable(error: unknown): ServiceUnavailableException {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown';
    const isProd = process.env.NODE_ENV === 'production';
    return new ServiceUnavailableException({
      code: 'FACE_VERIFICATION_UNAVAILABLE',
      message: isProd
        ? FRIENDLY_MESSAGES.FACE_VERIFICATION_UNAVAILABLE
        : `${FRIENDLY_MESSAGES.FACE_VERIFICATION_UNAVAILABLE} Check AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and Rekognition permissions. (${name})`,
    });
  }

  private async cropToHeadshot(imageBuffer: Buffer, face: FaceDetail): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width ?? 0;
    const imageHeight = metadata.height ?? 0;
    const box = face.BoundingBox;
    if (!imageWidth || !imageHeight || !box?.Width || !box.Height) {
      return sharp(imageBuffer).jpeg({ quality: 92 }).toBuffer();
    }

    const faceLeft = Math.max(0, (box.Left ?? 0) * imageWidth);
    const faceTop = Math.max(0, (box.Top ?? 0) * imageHeight);
    const faceWidth = box.Width * imageWidth;
    const faceHeight = box.Height * imageHeight;
    const centerX = faceLeft + faceWidth / 2;
    const centerY = faceTop + faceHeight / 2;
    const side = Math.min(
      Math.max(faceWidth, faceHeight) * 2.25,
      imageWidth,
      imageHeight,
    );

    const left = Math.round(Math.min(Math.max(centerX - side / 2, 0), imageWidth - side));
    const top = Math.round(Math.min(Math.max(centerY - side / 2, 0), imageHeight - side));
    const size = Math.max(1, Math.round(side));

    return sharp(imageBuffer)
      .extract({ left, top, width: size, height: size })
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
  }
}
