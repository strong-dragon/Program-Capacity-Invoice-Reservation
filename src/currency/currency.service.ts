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
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rate = await this.getRate(fromCurrency, toCurrency);
    const result = new Decimal(amount).times(rate);

    return result.toFixed(2);
  }

  async getRate(fromCurrency: string, toCurrency: string): Promise<string> {
    if (fromCurrency === toCurrency) {
      return '1';
    }

    const exchangeRate = await this.exchangeRateRepository.findOne({
      where: { fromCurrency, toCurrency },
    });

    if (exchangeRate) {
      return exchangeRate.rate;
    }

    // Try reverse rate
    const reverseRate = await this.exchangeRateRepository.findOne({
      where: { fromCurrency: toCurrency, toCurrency: fromCurrency },
    });

    if (reverseRate) {
      return new Decimal(1).dividedBy(reverseRate.rate).toFixed(6);
    }

    throw new NotFoundException(
      `Exchange rate not found for ${fromCurrency} to ${toCurrency}`,
    );
  }

  async seedDefaultRates(): Promise<void> {
    const defaultRates = [
      { fromCurrency: 'USD', toCurrency: 'EUR', rate: '0.92' },
      { fromCurrency: 'USD', toCurrency: 'GBP', rate: '0.79' },
      { fromCurrency: 'USD', toCurrency: 'UAH', rate: '41.50' },
      { fromCurrency: 'EUR', toCurrency: 'GBP', rate: '0.86' },
      { fromCurrency: 'EUR', toCurrency: 'UAH', rate: '45.10' },
    ];

    for (const rate of defaultRates) {
      const existing = await this.exchangeRateRepository.findOne({
        where: {
          fromCurrency: rate.fromCurrency,
          toCurrency: rate.toCurrency,
        },
      });

      if (!existing) {
        await this.exchangeRateRepository.save(rate);
      }
    }
  }
}
