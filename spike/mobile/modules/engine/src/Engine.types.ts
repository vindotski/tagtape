export type EngineModuleEvents = {
  onLog: (event: { id: string; message: string }) => void;
  onProgress: (event: { id: string; done: number; total: number }) => void;
};

export type TrackKind = "site" | "direct";
