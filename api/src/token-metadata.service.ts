import { Metaplex, PublicKey } from '@metaplex-foundation/js';
import { Injectable } from '@nestjs/common';
import { Connection } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com');

const metaplex = Metaplex.make(connection);

type Metadata = Record<
  string,
  {
    name: string;
    symbol: string;
  }
>;

@Injectable()
export class TokenMetadataService {
  async fetchTokensMetadata(tokens: string[]): Promise<Metadata> {
    const res = await metaplex
      .nfts()
      .findAllByMintList({mints: tokens.map((t) => new PublicKey(t))});

    return res.reduce((acc, nft: any) => {
      if (!nft || !nft.mintAddress) return acc;

      acc[nft.mintAddress.toString()] = {
        name: nft.name,
        symbol: nft.symbol,
      };

      return acc;
    }, {});
  }

  enrichTokenData(token: string, md: Metadata) {
    if (!md[token]) return {mintAddress: token};

    return {
      mint_address: token,
      name: md[token].name,
      symbol: md[token].symbol,
    };
  }
}
