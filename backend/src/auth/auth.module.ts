import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AdminGuard, JwtAuthGuard } from './auth.guard';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      // JWT_SECRET is injected from infra-secrets; the fallback only exists so a
      // local `npm run start:dev` boots without a .env file.
      secret: process.env.JWT_SECRET ?? 'cnc-quick-quote-development-secret',
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminGuard],
  exports: [AuthService, JwtAuthGuard, AdminGuard, JwtModule],
})
export class AuthModule {}
