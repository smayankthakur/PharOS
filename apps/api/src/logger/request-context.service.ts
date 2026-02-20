import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

type RequestContextState = {
  requestId: string;
  tenantId: string | null;
};

@Injectable()
export class RequestContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<RequestContextState>();

  run(state: RequestContextState, callback: () => void): void {
    this.asyncLocalStorage.run(state, callback);
  }

  get(): RequestContextState | null {
    return this.asyncLocalStorage.getStore() ?? null;
  }

  setTenantId(tenantId: string | null): void {
    const store = this.asyncLocalStorage.getStore();
    if (!store) {
      return;
    }

    store.tenantId = tenantId;
  }
}
