import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { ExchangeRate } from './entities/exchange-rate.entity';

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepository: Repository<ExchangeRate>,
  ) {}

  async convert(
    amount: string,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<string> {
    if (fromCurrency === toCurrency) return amount;

    const rate = await this.getRate(fromCurrency, toCurrency);
    return new Decimal(amount).times(rate).toFixed(2);
  }

  async getRate(fromCurrency: string, toCurrency: string): Promise<string> {
    if (fromCurrency === toCurrency) return '1';

    const direct = await this.exchangeRateRepository.findOne({
      where: { fromCurrency, toCurrency },
    });
    if (direct) return direct.rate;

    const reverse = await this.exchangeRateRepository.findOne({
      where: { fromCurrency: toCurrency, toCurrency: fromCurrency },
    });
    if (reverse) return new Decimal(1).dividedBy(reverse.rate).toFixed(6);

    throw new NotFoundException(
      `Exchange rate not found: ${fromCurrency} -> ${toCurrency}`,
    );
  }

  async seedDefaultRates(): Promise<void> {
    const rates = [
      { fromCurrency: 'USD', toCurrency: 'EUR', rate: '0.92' },
      { fromCurrency: 'USD', toCurrency: 'GBP', rate: '0.79' },
      { fromCurrency: 'USD', toCurrency: 'UAH', rate: '41.50' },
      { fromCurrency: 'EUR', toCurrency: 'GBP', rate: '0.86' },
      { fromCurrency: 'EUR', toCurrency: 'UAH', rate: '45.10' },
    ];

    for (const rate of rates) {
      const exists = await this.exchangeRateRepository.findOne({
        where: { fromCurrency: rate.fromCurrency, toCurrency: rate.toCurrency },
      });
      if (!exists) await this.exchangeRateRepository.save(rate);
    }
  }
}
