import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard, JwtAuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialCreateDto, MaterialPatchDto } from './materials.dto';

@ApiTags('materials')
@Controller('api/materials')
export class MaterialsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Customer-facing catalogue: active materials only, so a retired stock item
   * can never be selected for a new quote. */
  @Get()
  @UseGuards(JwtAuthGuard)
  list() {
    return this.prisma.material.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }
}

@ApiTags('admin')
@Controller('api/admin/materials')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminMaterialsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin catalogue includes inactive rows — that is the whole point of the screen. */
  @Get()
  list() {
    return this.prisma.material.findMany({ orderBy: { name: 'asc' } });
  }

  @Post()
  async create(@Body() dto: MaterialCreateDto) {
    await this.assertNameFree(dto.name, null);
    return this.prisma.material.create({ data: { ...dto, name: dto.name.trim() } });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: MaterialPatchDto) {
    const existing = await this.prisma.material.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That material no longer exists.');
    if (dto.name) await this.assertNameFree(dto.name, id);
    return this.prisma.material.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) },
    });
  }

  /**
   * Deactivates instead of deleting when the material is referenced by a quote:
   * an issued quote must keep resolving its material name forever.
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const quotes = await this.prisma.quote.count({ where: { materialId: id } });
    if (quotes > 0) {
      return this.prisma.material.update({ where: { id }, data: { isActive: false } });
    }
    return this.prisma.material.delete({ where: { id } });
  }

  private async assertNameFree(name: string, exceptId: string | null): Promise<void> {
    const clash = await this.prisma.material.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
    });
    if (clash) throw new ConflictException(`A material named "${name.trim()}" already exists.`);
  }
}
