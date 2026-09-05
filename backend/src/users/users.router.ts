import { Injectable } from '@nestjs/common';
import { TrpcRouter, TrpcProcedure } from 'nestjs-trpc';
import { z } from 'zod';
import { UsersService } from './users.service';
import type { User } from '@prisma/client';

@Injectable()
@TrpcRouter({ alias: 'users' })
export class UsersRouter {
  constructor(private readonly usersService: UsersService) {}

  @TrpcProcedure()
  async findAll(): Promise<User[]> {
    return this.usersService.findAll();
  }

  @TrpcProcedure({
    input: z.object({ id: z.string().uuid() }),
  })
  async findById({
    input,
  }: {
    input: { id: string };
  }): Promise<User | null> {
    return this.usersService.findById(input.id);
  }
}
