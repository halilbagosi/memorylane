import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { MediaService } from './media.service';

interface AuthenticatedRequest extends Request {
  user: { userId: string; email: string; sessionId: string };
}

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(JwtAuthGuard)
  @Post('upload-intent')
  async createUploadIntent(
    @Body() dto: CreateUploadIntentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.mediaService.createUploadIntent(req.user.userId, dto, this.apiBaseUrl(req));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':publicId/complete')
  async complete(
    @Param('publicId') publicId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.mediaService.completeUpload(req.user.userId, publicId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('patient/:patientId')
  async listForPatient(
    @Param('patientId') patientId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.mediaService.listForPatient(req.user.userId, patientId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':publicId/access-url')
  async accessUrl(
    @Param('publicId') publicId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.mediaService.issueAccessUrl(req.user.userId, publicId, this.apiBaseUrl(req));
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':publicId')
  async deleteMedia(
    @Param('publicId') publicId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.mediaService.deleteMedia(req.user.userId, publicId);
  }

  /** Signed URL endpoint: receives the raw plaintext payload and persists
   *  it as ciphertext. Bound to a single media item via HMAC token. */
  @Put('storage/upload/:token')
  async storageUpload(@Param('token') token: string, @Req() req: Request) {
    const body = (req as Request & { body: Buffer | undefined }).body;
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException('Expected raw octet-stream body');
    }
    await this.mediaService.storeUploadedPayload(decodeURIComponent(token), body);
    return { uploaded: true };
  }

  /** Signed URL endpoint: returns the decrypted payload bytes. */
  @Get('storage/download/:token')
  async storageDownload(@Param('token') token: string, @Res() res: Response) {
    const { contentType, body } = await this.mediaService.readDecryptedPayload(
      decodeURIComponent(token),
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(body.length));
    res.status(200).end(body);
  }

  private apiBaseUrl(req: Request): string {
    const fromEnv = process.env.PUBLIC_API_BASE_URL;
    if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, '');
    const proto =
      (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol ?? 'http';
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.get('host');
    return `${proto}://${host}`;
  }
}
