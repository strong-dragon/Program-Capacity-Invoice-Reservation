import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import Decimal from 'decimal.js';

export function IsPositiveDecimal(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPositiveDecimal',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') {
            return false;
          }
          try {
            const decimal = new Decimal(value);
            return decimal.isPositive() && !decimal.isZero();
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a positive decimal number greater than zero`;
        },
      },
    });
  };
}
