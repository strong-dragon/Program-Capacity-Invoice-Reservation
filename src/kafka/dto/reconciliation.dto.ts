export interface ReconciliationMessage {
  programId: string;
  totalCapacity: string;
  reservations: Array<{
    invoiceId: string;
    amount: string;
    currency: string;
    status: 'active' | 'released';
  }>;
  timestamp: string;
}
