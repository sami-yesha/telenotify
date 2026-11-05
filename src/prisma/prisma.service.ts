import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { encryptExistingRows } from './encrypt-existing';
import { FieldCipher, fieldEncryption } from './field-encryption';

// The extended client encrypts customers' personal data at rest (see
// field-encryption.ts); everything else uses it like a plain PrismaClient.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly base: PrismaClient;

  constructor() {
    super();
    this.base = this;
    // Returning from a constructor replaces the instance; this class's methods still work.
    return this.$extends(fieldEncryption(process.env.ENCRYPTION_KEY ?? '')) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
    // Before taking traffic: rows from before encryption must be encrypted to be found.
    await encryptExistingRows(this.base, new FieldCipher(process.env.ENCRYPTION_KEY ?? ''));
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
