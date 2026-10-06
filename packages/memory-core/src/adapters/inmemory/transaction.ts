import type { TransactionPort } from '../../ports/repositories.js';

export class InMemoryTransaction implements TransactionPort {
  private inTransaction = false;
  private rolledBack = false;

  begin(): void {
    if (this.inTransaction) {
      throw new Error('Transaction already open');
    }
    this.inTransaction = true;
    this.rolledBack = false;
  }

  commit(): void {
    if (!this.inTransaction) {
      throw new Error('No open transaction');
    }
    this.inTransaction = false;
  }

  rollback(): void {
    if (!this.inTransaction) {
      throw new Error('No open transaction');
    }
    this.inTransaction = false;
    this.rolledBack = true;
  }

  get wasRolledBack(): boolean {
    return this.rolledBack;
  }
}
