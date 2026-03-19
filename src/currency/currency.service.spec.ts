import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { ExchangeRate } from './entities/exchange-rate.entity';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let exchangeRateRepository: jest.Mocked<Repository<ExchangeRate>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyService,
        {
          provide: getRepositoryToken(ExchangeRate),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
    exchangeRateRepository = module.get(getRepositoryToken(ExchangeRate));
  });

  describe('convert', () => {
    it('should return same amount for same currency', async () => {
      const result = await service.convert('100.00', 'USD', 'USD');
      expect(result).toBe('100.00');
    });

    it('should convert USD to EUR using direct rate', async () => {
      exchangeRateRepository.findOne.mockResolvedValueOnce({
        id: '1',
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: '0.92',
        updatedAt: new Date(),
      });

      const result = await service.convert('100.00', 'USD', 'EUR');
      expect(result).toBe('92.00');
    });

    it('should convert EUR to USD using reverse rate', async () => {
      exchangeRateRepository.findOne
        .mockResolvedValueOnce(null) // No direct rate
        .mockResolvedValueOnce({
          id: '1',
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          rate: '0.92',
          updatedAt: new Date(),
        });

      const result = await service.convert('92.00', 'EUR', 'USD');
      // 92 / 0.92 = 100
      expect(parseFloat(result)).toBeCloseTo(100, 1);
    });

    it('should throw NotFoundException for unknown currency pair', async () => {
      exchangeRateRepository.findOne.mockResolvedValue(null);

      await expect(service.convert('100', 'XXX', 'YYY')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getRate', () => {
    it('should return 1 for same currency', async () => {
      const result = await service.getRate('USD', 'USD');
      expect(result).toBe('1');
    });

    it('should return direct rate when available', async () => {
      exchangeRateRepository.findOne.mockResolvedValueOnce({
        id: '1',
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: '0.92',
        updatedAt: new Date(),
      });

      const result = await service.getRate('USD', 'EUR');
      expect(result).toBe('0.92');
    });

    it('should calculate inverse rate when direct rate not available', async () => {
      exchangeRateRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: '1',
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          rate: '0.92',
          updatedAt: new Date(),
        });

      const result = await service.getRate('EUR', 'USD');
      expect(parseFloat(result)).toBeCloseTo(1.087, 2);
    });
  });
});
