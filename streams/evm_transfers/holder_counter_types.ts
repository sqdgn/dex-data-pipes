export type HolderCounterState = {
  processedTimestamp: number;
  processedTxIndex: number;
  processedLogIndex: number;
  lastCallbackTimestamp: number;
  lastCallbackTxIndex: number;
  lastCallbackLogIndex: number;
};
