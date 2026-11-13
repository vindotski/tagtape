import { NativeModule, requireNativeModule } from "expo";

import type { EngineModuleEvents, TrackKind } from "./Engine.types";

declare class EngineModule extends NativeModule<EngineModuleEvents> {
  versions(): Promise<Record<string, string>>;
  guardSelfTest(): Promise<string>;
  readConfig(): Promise<string>;
  defaultDestination(): Promise<string>;
  /** The track's info as JSON (title, duration, is_live, acodec, _type). */
  probe(url: string): Promise<string>;
  /** A 1000×1000 JPEG, base64. */
  cover(url: string): Promise<string>;
  convert(
    id: string,
    kind: TrackKind,
    url: string,
    copy: boolean,
    destination: string,
    folderName: string,
    fileName: string,
    tagBase64: string,
  ): Promise<{ bytes: number; location: string }>;
  cancel(id: string): Promise<void>;
  listTemp(): Promise<string[]>;
}

export default requireNativeModule<EngineModule>("Engine");
