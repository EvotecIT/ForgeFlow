export interface FilterStoreBinding {
  getFilter(): string;
  setFilter(next: string): Promise<void> | void;
}

export interface StoredFilterController {
  getFilter(): string;
  setFilter(value: string): void;
  syncFilterFromStore(): void;
}

export function updateStoredFilter(
  value: string,
  assign: (next: string) => void,
  persist: (next: string) => Promise<void> | void,
  refresh: () => void
): void {
  assign(value);
  void persist(value);
  refresh();
}

export function syncStoredFilter(
  current: string,
  readStored: () => string,
  assign: (next: string) => void,
  refresh: () => void
): void {
  const next = readStored();
  if (next === current) {
    return;
  }
  assign(next);
  refresh();
}

export function createStoredFilterController(
  store: FilterStoreBinding,
  refresh: () => void
): StoredFilterController {
  let filterText = store.getFilter();
  return {
    getFilter: () => filterText,
    setFilter: (value: string) => {
      updateStoredFilter(
        value,
        (next) => {
          filterText = next;
        },
        (next) => store.setFilter(next),
        refresh
      );
    },
    syncFilterFromStore: () => {
      syncStoredFilter(
        filterText,
        () => store.getFilter(),
        (next) => {
          filterText = next;
        },
        refresh
      );
    }
  };
}
