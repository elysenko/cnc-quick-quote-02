import { Global, Module } from '@nestjs/common';
import { ConfigResolverService } from './config.service';
import { CryptoService } from './crypto.service';

@Global()
@Module({
  providers: [ConfigResolverService, CryptoService],
  exports: [ConfigResolverService, CryptoService],
})
export class CommonModule {}
