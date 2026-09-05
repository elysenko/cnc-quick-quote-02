import { Module } from '@nestjs/common';
import { TrpcModule } from 'nestjs-trpc';
import { UsersModule } from '../users/users.module';
import { UsersRouter } from '../users/users.router';

@Module({
  imports: [
    TrpcModule.forRoot({
      autoSchemaFile: true,
    }),
    UsersModule,
  ],
  providers: [UsersRouter],
  exports: [TrpcModule],
})
export class TrpcAppModule {}
