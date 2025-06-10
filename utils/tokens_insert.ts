import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { ethers } from 'ethers';
import path from 'path';
import dotenv from 'dotenv';
import { Network } from 'streams/evm_swaps/networks';
dotenv.config();

// ERC20 ABI with only the functions we need
const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

// RPC endpoints for different networks
const RPC_ENDPOINTS: Record<Network, string> = {
  ethereum: process.env.ETHEREUM_RPC_URL!,
  base: process.env.BASE_RPC_URL!,
};

async function main() {
  try {
    // Read and parse the CSV file
    const csvPath = path.resolve(__dirname, '../pipes/evm/swaps/tokens.csv');
    const csvContent = readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`Found ${records.length} tokens in CSV file`);

    // Create providers for each network
    const providers: Record<string, ethers.JsonRpcProvider> = {};
    for (const [network, rpcUrl] of Object.entries(RPC_ENDPOINTS)) {
      providers[network] = new ethers.JsonRpcProvider(rpcUrl);
    }

    // Process tokens
    const tokenData: {
      network: string;
      tokenAddress: string;
      decimals: number;
      symbol: string;
      name: string;
    }[] = [];

    for (const record of records) {
      const network = record.chainName;
      const tokenAddress = record.toTokenAddress;

      if (!providers[network]) {
        console.warn(`No provider configured for network: ${network}`);
        continue;
      }

      try {
        console.log(`Processing token ${tokenAddress} on ${network}`);

        const provider = providers[network];
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

        // Fetch token data in parallel
        const [decimals, symbol, name] = await Promise.all([
          tokenContract.decimals(),
          tokenContract.symbol(),
          tokenContract.name(),
        ]);

        if (decimals === 18n) {
          console.log(`Skipping ${tokenAddress} on ${network} because decimals are 18`);
          continue;
        }

        tokenData.push({
          network,
          tokenAddress: tokenAddress.toLowerCase(),
          decimals,
          symbol,
          name,
        });
      } catch (error) {
        console.error(`Error processing ${tokenAddress} on ${network}:`, error);
      }
    }

    // Generate SQL insert statements
    let sqlInserts = `-- Generated token inserts\n`;
    sqlInserts += `INSERT INTO evm_tokens (network, token_address, decimals, symbol, name) VALUES\n`;

    const valueStrings = tokenData.map(
      (token) =>
        `('${token.network}', '${token.tokenAddress}', ${token.decimals}, '${token.symbol.replace(/'/g, "''")}', '${token.name.replace(/'/g, "''")}')`,
    );

    sqlInserts += valueStrings.join(',\n');
    sqlInserts += ';\n';

    // Write SQL to file
    const sqlPath = path.resolve(__dirname, '../pipes/evm/swaps/02-token_inserts.sql');
    writeFileSync(sqlPath, sqlInserts);

    console.log(`Successfully generated SQL inserts for ${tokenData.length} tokens`);
    console.log(`SQL file written to: ${sqlPath}`);
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

// Execute the main function
main()
  .catch(console.error)
  .finally(() => process.exit(0));
