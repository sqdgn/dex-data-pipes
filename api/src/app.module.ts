import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { ClickhouseService } from './clickhouse.service';
import { PriceService } from './price.service';
import { SwapsController } from './swaps.controller';
import { TokenMetadataService } from './token-metadata.service';

@Module({
  providers: [PriceService, ClickhouseService, TokenMetadataService],
  controllers: [AccountsController, SwapsController],
})
export class AppModule {
}
