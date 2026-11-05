import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.output<T> {
    return this.schema.parse(value);
  }
}
