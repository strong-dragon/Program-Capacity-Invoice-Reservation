import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrencyService } from './currency.service';
import { ExchangeRate } from './entities/exchange-rate.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate])],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule implements OnModuleInit {
  constructor(private readonly currencyService: CurrencyService) {}

  async onModuleInit() {
    await this.currencyService.seedDefaultRates();
  }
}
