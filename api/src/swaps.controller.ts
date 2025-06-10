import { Controller, Get } from '@nestjs/common';
import { uniq } from 'lodash';
import { ClickhouseService } from './clickhouse.service';
import { PriceService } from './price.service';
import { TokenMetadataService } from './token-metadata.service';

@Controller()
export class SwapsController {
  constructor(
    private clickhouseService: ClickhouseService,
    private priceService: PriceService,
    private tokenMetadataService: TokenMetadataService,
  ) {
  }

  @Get('/swaps')
  async swaps() {
    const swaps = await this.clickhouseService.getSwaps({limit: 100});
    const meta = await this.tokenMetadataService.fetchTokensMetadata(
      uniq(swaps.flatMap((t) => [t.token_a, t.token_b])),
    );

    const snapshot = await this.priceService.getPriceSnapshot(Date.now() - 30_000);

    return swaps.map((s) => {
      const input = s.a_to_b ? s.token_a : s.token_b;
      const output = s.a_to_b ? s.token_b : s.token_a;

      const amount_usd = this.priceService.getUsdPrice(snapshot, s.token_b, s.amount_b);

      return {
        timestamp: s.timestamp,
        dex: s.dex,
        transaction_hash: s.transaction_hash,
        input: {
          token: this.tokenMetadataService.enrichTokenData(input, meta),
          amount: s.a_to_b ? s.amount_a : s.amount_b,
        },
        output: {
          token: this.tokenMetadataService.enrichTokenData(output, meta),
          amount: s.a_to_b ? s.amount_b : s.amount_a,
        },
        amount_usd,
      };
    });
  }
}
