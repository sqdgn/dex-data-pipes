import _ from 'lodash';

export type TokenPosition = {
  amount: number;
  priceUsdc: number;
  realizedPnL: number;
};

export type ExitSummary = {
  realizedAmount: number;
  entryCostUsdc: number;
  profitUsdc: number;
};

export type DbSwap = {
  account: string;
  token_a: string;
  token_b: string;
  amount_a: number;
  amount_b: number;
  token_a_usdc_price: number;
  token_b_usdc_price: number;
};

export class TokenPositions {
  // Since we're using floating point numbers for calculations here
  // we need to define some acceptable margin of error
  private epsilon = 1e-10;
  private positions: TokenPosition[] = [];
  // Wins and loses count for this user-token pair
  private _wins = 0;
  private _loses = 0;

  constructor() {}

  private closeTo(x: number, y: number) {
    return Math.abs(x - y) < this.epsilon;
  }

  public async load(swap: DbSwap, token: string) {
    const thisToken = swap.token_a === token ? 'a' : 'b';
    if (swap[`amount_${thisToken}`] > 0) {
      this.entry(swap[`amount_${thisToken}`], swap[`token_${thisToken}_usdc_price`]);
    } else {
      this.exit(Math.abs(swap[`amount_${thisToken}`]), swap[`token_${thisToken}_usdc_price`]);
    }
    return this;
  }

  public entry(amount: number, priceUsdc: number) {
    if (amount === 0 || priceUsdc === 0) {
      // Ignore if amount or price == 0
      return;
    }
    this.positions.push({ amount, priceUsdc, realizedPnL: 0 });
  }

  public get totalBalance() {
    return _.sumBy(this.positions, (p) => p.amount);
  }

  public get wins() {
    return this._wins;
  }

  public get loses() {
    return this._loses;
  }

  public exit(amount: number, priceUsdc: number): ExitSummary {
    if (amount === 0 || priceUsdc === 0) {
      // Ignore if amount or price == 0
      return {
        entryCostUsdc: 0,
        profitUsdc: 0,
        realizedAmount: 0,
      };
    }
    let totalRealizedAmount = 0;
    let totalEntryCostUsdc = 0;
    let totalProfitUsdc = 0;
    while (!this.closeTo(totalRealizedAmount, amount) && this.positions.length) {
      const position = this.positions[0];
      const realizedAmount = Math.min(amount - totalRealizedAmount, position.amount);
      const entryCostUsdc = realizedAmount * position.priceUsdc;
      const realizedPnLUsdc = realizedAmount * priceUsdc - entryCostUsdc;
      position.realizedPnL += realizedPnLUsdc;
      totalProfitUsdc += realizedPnLUsdc;
      totalEntryCostUsdc += entryCostUsdc;
      totalRealizedAmount += realizedAmount;
      position.amount -= realizedAmount;
      if (this.closeTo(position.amount, 0)) {
        if (position.realizedPnL > 0) {
          this._wins += 1;
        } else {
          this._loses += 1;
        }
        // TODO: Optimize
        this.positions.shift();
      }
    }

    return {
      realizedAmount: totalRealizedAmount,
      entryCostUsdc: totalEntryCostUsdc,
      profitUsdc: totalProfitUsdc,
    };
  }
}
