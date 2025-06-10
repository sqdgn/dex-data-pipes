import { Controller, Get, Param } from '@nestjs/common';
import { ClickhouseService } from './clickhouse.service';
import { PriceService } from './price.service';
import { TokenMetadataService } from './token-metadata.service';

@Controller()
export class AccountsController {
  constructor(
    private clickhouseService: ClickhouseService,
    private tokenMetadataService: TokenMetadataService,
    private priceService: PriceService,
  ) {
  }

  @Get('/accounts/:account')
  async account(@Param('account') account: string) {
    const tokens = await this.clickhouseService.getAllAccountTokens(account);
    const meta = await this.tokenMetadataService.fetchTokensMetadata(tokens.map((t) => t.token));
    const snapshot = await this.priceService.getPriceSnapshot(Date.now() - 30_000);

    return {
      account,
      tokens: tokens.map((t) => {
        return {
          token: this.tokenMetadataService.enrichTokenData(t.token, meta),
          amount: t.amount,
            amount_usd: this.priceService.getUsdPrice(snapshot, t.token, t.amount),
        };
      }),
    };
  }
}
