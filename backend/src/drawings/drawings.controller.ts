import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Redirect,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { AuthedRequest, AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../auth/auth.guard';
import { RateLimitService } from '../integrations/ratelimit.service';
import { DrawingsService } from './drawings.service';

/** Hard ceiling for multer, above the configurable MachineSettings limit so the
 * business rule (and its friendly message) is what a user actually hits. */
const MULTER_CEILING_BYTES = 64 * 1024 * 1024;

@ApiTags('drawings')
@Controller('api/drawings')
@UseGuards(JwtAuthGuard)
export class DrawingsController {
  constructor(
    private readonly drawings: DrawingsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_CEILING_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthedRequest,
  ) {
    await this.rateLimit.enforce({ bucket: 'drawings', limit: 30, windowSeconds: 300 }, request);
    if (!file) throw new BadRequestException('No drawing file was received. Choose a file and try again.');
    return this.drawings.upload(user.id, file);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.drawings.list(user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.drawings.get(user.id, id);
  }

  /** Redirects to a short-lived presigned URL so the file streams from MinIO. */
  @Get(':id/file')
  @Redirect()
  async file(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return { url: await this.drawings.downloadUrl(user.id, id), statusCode: 302 };
  }
}
