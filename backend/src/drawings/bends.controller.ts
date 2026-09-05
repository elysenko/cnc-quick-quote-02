import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DrawingsService } from './drawings.service';
import { BendCreateDto, BendPatchDto } from './bends.dto';

/**
 * Bend lines are stored as their own rows against a drawing. The uploaded DXF object
 * in MinIO is NEVER rewritten — the customer's original file stays byte-identical,
 * and bends are an overlay the shop applies after cutting.
 */
@ApiTags('bends')
@Controller('api/drawings/:drawingId/bends')
@UseGuards(JwtAuthGuard)
export class BendsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drawings: DrawingsService,
  ) {}

  @Get()
  async list(@Param('drawingId') drawingId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.drawings.findOwned(user.id, drawingId);
    return this.prisma.bendLine.findMany({ where: { drawingId }, orderBy: { createdAt: 'asc' } });
  }

  @Post()
  async create(
    @Param('drawingId') drawingId: string,
    @Body() dto: BendCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.drawings.findOwned(user.id, drawingId);
    return this.prisma.bendLine.create({ data: { ...dto, drawingId } });
  }

  @Patch(':id')
  async update(
    @Param('drawingId') drawingId: string,
    @Param('id') id: string,
    @Body() dto: BendPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.drawings.findOwned(user.id, drawingId);
    const existing = await this.prisma.bendLine.findFirst({ where: { id, drawingId } });
    if (!existing) throw new NotFoundException('That bend line no longer exists.');
    return this.prisma.bendLine.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  async remove(
    @Param('drawingId') drawingId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.drawings.findOwned(user.id, drawingId);
    const deleted = await this.prisma.bendLine.deleteMany({ where: { id, drawingId } });
    if (deleted.count === 0) throw new NotFoundException('That bend line no longer exists.');
    return { id };
  }
}
