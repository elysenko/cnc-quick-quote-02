import { Injectable, NotFoundException, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { Drawing } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../integrations/storage.service';
import { parseDxf, FlatPath } from '../domain/dxf-parser';

export interface DrawingView {
  id: string;
  filename: string;
  sizeBytes: number;
  bboxWMm: number;
  bboxHMm: number;
  cutLengthMm: number;
  entityCount: number;
  createdAt: string;
  paths: FlatPath[];
}

@Injectable()
export class DrawingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  /** Shapes a row for the UI: geometry is unwrapped from JSON into `paths`. */
  toView(drawing: Drawing): DrawingView {
    const geometry = drawing.geometryJson as { paths?: FlatPath[] } | null;
    return {
      id: drawing.id,
      filename: drawing.filename,
      sizeBytes: drawing.sizeBytes,
      bboxWMm: drawing.bboxWMm,
      bboxHMm: drawing.bboxHMm,
      cutLengthMm: drawing.cutLengthMm,
      entityCount: drawing.entityCount,
      createdAt: drawing.createdAt.toISOString(),
      paths: geometry?.paths ?? [],
    };
  }

  /**
   * Validates, parses, stores and records an uploaded drawing.
   *
   * Order is deliberate: extension and size are checked against MachineSettings
   * BEFORE any storage call, so a rejected upload never leaves an orphaned object in
   * the bucket. The DXF is then parsed before the object is written, so an
   * unparseable file costs nothing either.
   */
  async upload(userId: string, file: { originalname: string; size: number; buffer: Buffer }): Promise<DrawingView> {
    const machine = await this.settings.machine();

    const name = file.originalname ?? 'drawing.dxf';
    const dot = name.lastIndexOf('.');
    const extension = dot >= 0 ? name.slice(dot).toLowerCase() : '';
    if (!machine.allowedExtensions.includes(extension)) {
      throw new UnprocessableEntityException(
        `${extension || 'That file'} is not an accepted drawing format. Upload a ${machine.allowedExtensions.join(', ')} file.`,
      );
    }
    if (file.size > machine.maxUploadBytes) {
      const limitMb = (machine.maxUploadBytes / 1048576).toFixed(0);
      throw new PayloadTooLargeException(
        `That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${limitMb} MB.`,
      );
    }

    // Throws DxfParseError (422) with the parser's own message on bad geometry.
    const geometry = parseDxf(file.buffer);

    const objectKey = `drawings/${userId}/${randomUUID()}${extension}`;
    await this.storage.putObject(objectKey, file.buffer, 'application/dxf');

    const drawing = await this.prisma.drawing.create({
      data: {
        userId,
        filename: name,
        objectKey,
        sizeBytes: file.size,
        geometryJson: { paths: geometry.paths },
        bboxWMm: geometry.bboxWMm,
        bboxHMm: geometry.bboxHMm,
        cutLengthMm: geometry.cutLengthMm,
        entityCount: geometry.entityCount,
      },
    });
    return this.toView(drawing);
  }

  async list(userId: string): Promise<DrawingView[]> {
    const rows = await this.prisma.drawing.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => this.toView(row));
  }

  /** Owner-scoped: another user's id is indistinguishable from a missing one. */
  async findOwned(userId: string, id: string): Promise<Drawing> {
    const drawing = await this.prisma.drawing.findFirst({ where: { id, userId } });
    if (!drawing) throw new NotFoundException('That drawing could not be found.');
    return drawing;
  }

  async get(userId: string, id: string): Promise<DrawingView> {
    return this.toView(await this.findOwned(userId, id));
  }

  async downloadUrl(userId: string, id: string): Promise<string> {
    const drawing = await this.findOwned(userId, id);
    return this.storage.presignedGet(drawing.objectKey);
  }
}
