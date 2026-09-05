import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRouter } from './users.router';

@Module({
  providers: [UsersService, UsersRouter],
  exports: [UsersService, UsersRouter],
})
export class UsersModule {}
