import assert from 'assert';
import _ from 'lodash';

export type TokenPosition = {
  amount: number;
  price: number;
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
  price_token_a_usdc: number;
  price_token_b_usdc: number;
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

  public load(swap: DbSwap, token: string) {
    const thisToken = swap.token_a === token ? 'a' : 'b';
    if (swap[`amount_${thisToken}`] > 0) {
      this.entry(swap[`amount_${thisToken}`], swap[`token_${thisToken}_usdc_price`]);
    } else {
      this.exit(Math.abs(swap[`amount_${thisToken}`]), swap[`token_${thisToken}_usdc_price`]);
    }
    return this;
  }

  public entry(amount: number, price: number) {
    assert(
      amount >= 0 || this.closeTo(amount, 0),
      `entry amount must be non-negative, but it is ${amount}`,
    );
    if (this.closeTo(amount, 0) || this.closeTo(price, 0)) {
      // Ignore if amount or price == 0
      return;
    }
    this.positions.push({ amount, price, realizedPnL: 0 });
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

  public exit(amount: number, price: number): ExitSummary {
    assert(
      amount >= 0 || this.closeTo(0, amount),
      `exit amount must be non-negative, but it is ${amount}`,
    );
    if (this.closeTo(amount, 0) || this.closeTo(price, 0)) {
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
      const entryCost = realizedAmount * position.price;
      const realizedPnL = realizedAmount * price - entryCost;
      position.realizedPnL += realizedPnL;
      totalProfitUsdc += realizedPnL;
      totalEntryCostUsdc += entryCost;
      totalRealizedAmount += realizedAmount;
      position.amount -= realizedAmount;
      if (this.closeTo(position.amount, 0)) {
        if (position.realizedPnL > 0) {
          this._wins += 1;
        } else {
          this._loses += 1;
        }
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
