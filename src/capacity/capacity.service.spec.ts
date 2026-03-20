import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CapacityService } from './capacity.service';
import { Program } from '../programs/entities/program.entity';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/entities/reservation.entity';
import { CurrencyService } from '../currency/currency.service';
import { InsufficientCapacityException } from '../common/exceptions/insufficient-capacity.exception';
import { ProgramNotFoundException } from '../common/exceptions/program-not-found.exception';

/**
 * Type-safe mock for EntityManager used in transactions
 */
interface MockEntityManager {
  getRepository: jest.Mock;
}

/**
 * Creates a type-safe mock for DataSource.transaction
 * that properly handles the callback signature
 */
function createTransactionMock(mockManager: MockEntityManager): jest.Mock {
  return jest
    .fn()
    .mockImplementation(
      <T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> => {
        return callback(mockManager as unknown as EntityManager);
      },
    );
}

describe('CapacityService', () => {
  let service: CapacityService;
  let programRepository: jest.Mocked<Repository<Program>>;
  let reservationRepository: jest.Mocked<Repository<Reservation>>;
  let currencyService: jest.Mocked<CurrencyService>;
  let dataSource: { transaction: jest.Mock };

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

  const createMockQueryBuilder = (total = '0') => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setLock: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getRawOne: jest.fn().mockResolvedValue({ total }),
  });

  beforeEach(async () => {
    const mockQueryBuilder = createMockQueryBuilder();

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
      const mockQueryBuilder = createMockQueryBuilder('250000.00');
      reservationRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<
          Repository<Reservation>['createQueryBuilder']
        >,
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

      const mockManager: MockEntityManager = {
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
            createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
          };
        }),
      };

      dataSource.transaction = createTransactionMock(mockManager);
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
      const mockManager: MockEntityManager = {
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
            createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
          };
        }),
      };

      dataSource.transaction = createTransactionMock(mockManager);
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

      const mockQueryBuilderWithExisting = {
        ...createMockQueryBuilder(),
        getOne: jest.fn().mockResolvedValue(existingReservation),
      };

      const mockManager: MockEntityManager = {
        getRepository: jest.fn((entity) => {
          if (entity === Program) {
            return {
              findOne: jest.fn().mockResolvedValue(mockProgram),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(mockProgram),
            createQueryBuilder: jest.fn(() => mockQueryBuilderWithExisting),
          };
        }),
      };

      dataSource.transaction = createTransactionMock(mockManager);

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

      const mockManager: MockEntityManager = {
        getRepository: jest.fn((entity) => {
          if (entity === Program) {
            return {
              findOne: jest.fn().mockResolvedValue(mockProgram),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(mockReservation),
            save: jest.fn().mockResolvedValue({
              ...mockReservation,
              status: ReservationStatus.RELEASED,
            }),
            createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
          };
        }),
      };

      dataSource.transaction = createTransactionMock(mockManager);

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

      const mockManager: MockEntityManager = {
        getRepository: jest.fn((entity) => {
          if (entity === Program) {
            return {
              findOne: jest.fn().mockResolvedValue(mockProgram),
            };
          }
          return {
            findOne: jest.fn().mockResolvedValue(releasedReservation),
            createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
          };
        }),
      };

      dataSource.transaction = createTransactionMock(mockManager);

      const result = await service.release('res-1');

      expect(result).toBeDefined();
    });
  });
});
