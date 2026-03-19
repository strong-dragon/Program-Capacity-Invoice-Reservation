/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CapacityService } from './capacity.service';
import { Program } from '../programs/entities/program.entity';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/entities/reservation.entity';
import { CurrencyService } from '../currency/currency.service';
import { InsufficientCapacityException } from '../common/exceptions/insufficient-capacity.exception';
import { ProgramNotFoundException } from '../common/exceptions/program-not-found.exception';

describe('CapacityService', () => {
  let service: CapacityService;
  let programRepository: jest.Mocked<Repository<Program>>;
  let reservationRepository: jest.Mocked<Repository<Reservation>>;
  let currencyService: jest.Mocked<CurrencyService>;
  let dataSource: jest.Mocked<DataSource>;

  const mockProgram: Program = {
    id: 'program-1',
    name: 'Test Program',
    currency: 'USD',
    totalCapacity: '1000000.00',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    reservations: [],
  };

  beforeEach(async () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapacityService,
        {
          provide: getRepositoryToken(Program),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Reservation),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
            delete: jest.fn(),
          },
        },
        {
          provide: CurrencyService,
          useValue: {
            convert: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CapacityService>(CapacityService);
    programRepository = module.get(getRepositoryToken(Program));
    reservationRepository = module.get(getRepositoryToken(Reservation));
    currencyService = module.get(CurrencyService);
    dataSource = module.get(DataSource);
  });

  describe('getAvailability', () => {
    it('should return correct availability when no reservations', async () => {
      programRepository.findOne.mockResolvedValue(mockProgram);

      const result = await service.getAvailability('program-1');

      expect(result).toEqual({
        programId: 'program-1',
        currency: 'USD',
        totalCapacity: '1000000.00',
        reservedAmount: '0.00',
        availableAmount: '1000000.00',
      });
    });

    it('should return correct availability with reservations', async () => {
      programRepository.findOne.mockResolvedValue(mockProgram);
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '250000.00' }),
      };
      reservationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.getAvailability('program-1');

      expect(result).toEqual({
        programId: 'program-1',
        currency: 'USD',
        totalCapacity: '1000000.00',
        reservedAmount: '250000.00',
        availableAmount: '750000.00',
      });
    });

    it('should throw ProgramNotFoundException for unknown program', async () => {
      programRepository.findOne.mockResolvedValue(null);

      await expect(service.getAvailability('unknown')).rejects.toThrow(
        ProgramNotFoundException,
      );
    });
  });

  describe('reserve', () => {
    it('should create reservation and reduce available capacity', async () => {
      const mockReservation: Reservation = {
        id: 'res-1',
        invoiceId: 'INV-001',
        amount: '50000.00',
        currency: 'USD',
        amountInProgramCurrency: '50000.00',
        status: ReservationStatus.ACTIVE,
        programId: 'program-1',
        program: mockProgram,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockManager = {
        getRepository: jest.fn((entity) => {
          if (entity === Program) {
            return {
              findOne: jest.fn().mockResolvedValue(mockProgram),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockReturnValue(mockReservation),
            save: jest.fn().mockResolvedValue(mockReservation),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
            })),
          };
        }),
      };

      dataSource.transaction.mockImplementation(
        async <T>(
          cb: (manager: typeof mockManager) => Promise<T>,
        ): Promise<T> => {
          return cb(mockManager);
        },
      );

      currencyService.convert.mockResolvedValue('50000.00');

      const result = await service.reserve(
        'program-1',
        'INV-001',
        '50000.00',
        'USD',
      );

      expect(result.reservation).toBeDefined();
      expect(result.availability.availableAmount).toBe('950000.00');
    });

    it('should throw InsufficientCapacityException when capacity exceeded', async () => {
      const mockManager = {
        getRepository: jest.fn((entity) => {
          if (entity === Program) {
            return {
              findOne: jest.fn().mockResolvedValue({
                ...mockProgram,
                totalCapacity: '100.00',
              }),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(null),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
            })),
          };
        }),
      };

      dataSource.transaction.mockImplementation(
        async <T>(
          cb: (manager: typeof mockManager) => Promise<T>,
        ): Promise<T> => {
          return cb(mockManager);
        },
      );

      currencyService.convert.mockResolvedValue('200.00');

      await expect(
        service.reserve('program-1', 'INV-001', '200.00', 'USD'),
      ).rejects.toThrow(InsufficientCapacityException);
    });

    it('should return existing reservation for duplicate invoiceId (idempotency)', async () => {
      const existingReservation: Reservation = {
        id: 'res-existing',
        invoiceId: 'INV-001',
        amount: '50000.00',
        currency: 'USD',
        amountInProgramCurrency: '50000.00',
        status: ReservationStatus.ACTIVE,
        programId: 'program-1',
        program: mockProgram,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      programRepository.findOne.mockResolvedValue(mockProgram);

      const mockManager = {
        getRepository: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue(existingReservation),
        })),
      };

      dataSource.transaction.mockImplementation(
        async <T>(
          cb: (manager: typeof mockManager) => Promise<T>,
        ): Promise<T> => {
          return cb(mockManager);
        },
      );

      const result = await service.reserve(
        'program-1',
        'INV-001',
        '50000.00',
        'USD',
      );

      expect(result.reservation.id).toBe('res-existing');
    });
  });

  describe('release', () => {
    it('should release reservation and restore capacity', async () => {
      const mockReservation: Reservation = {
        id: 'res-1',
        invoiceId: 'INV-001',
        amount: '50000.00',
        currency: 'USD',
        amountInProgramCurrency: '50000.00',
        status: ReservationStatus.ACTIVE,
        programId: 'program-1',
        program: mockProgram,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      programRepository.findOne.mockResolvedValue(mockProgram);

      const mockManager = {
        getRepository: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue(mockReservation),
          save: jest.fn().mockResolvedValue({
            ...mockReservation,
            status: ReservationStatus.RELEASED,
          }),
        })),
      };

      dataSource.transaction.mockImplementation(
        async <T>(
          cb: (manager: typeof mockManager) => Promise<T>,
        ): Promise<T> => {
          return cb(mockManager);
        },
      );

      const result = await service.release('res-1');

      expect(result).toBeDefined();
      expect(result.programId).toBe('program-1');
    });

    it('should be idempotent for already released reservations', async () => {
      const releasedReservation: Reservation = {
        id: 'res-1',
        invoiceId: 'INV-001',
        amount: '50000.00',
        currency: 'USD',
        amountInProgramCurrency: '50000.00',
        status: ReservationStatus.RELEASED,
        programId: 'program-1',
        program: mockProgram,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      programRepository.findOne.mockResolvedValue(mockProgram);

      const mockManager = {
        getRepository: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue(releasedReservation),
        })),
      };

      dataSource.transaction.mockImplementation(
        async <T>(
          cb: (manager: typeof mockManager) => Promise<T>,
        ): Promise<T> => {
          return cb(mockManager);
        },
      );

      const result = await service.release('res-1');

      expect(result).toBeDefined();
    });
  });
});
