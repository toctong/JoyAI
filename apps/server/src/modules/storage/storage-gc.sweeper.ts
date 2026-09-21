import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StorageService, type StorageObjectSummary } from "./storage.service";
import { AssetsService } from "../assets/assets.service";

export type StorageGcCandidate = StorageObjectSummary & {
  reason: "unreferenced";
};

export type StorageGcReport = {
  scanned: number;
  candidates: StorageGcCandidate[];
  referencedKeys: number;
  dryRun: boolean;
  deleted?: string[];
  failed?: string[];
  bytesCandidate: number;
};

function envMs(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(config: ConfigService, key: string, fallback = false): boolean {
  const raw = config.get<string>(key);
  if (raw == null || raw === "") return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/**
 * Periodic scan of uploads/by-hash/* vs Asset references.
 * Default is dry-run (log only). Set STORAGE_GC_DELETE=true to purge.
 */
@Injectable()
export class StorageGcSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageGcSweeper.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly minAgeMs: number;
  private readonly autoDelete: boolean;
  private readonly enabled: boolean;
  private running = false;

  constructor(
    private readonly storage: StorageService,
    @Inject(forwardRef(() => AssetsService))
    private readonly assets: AssetsService,
    config: ConfigService,
  ) {
    this.enabled = envBool(config, "STORAGE_GC_ENABLED", true);
    this.autoDelete = envBool(config, "STORAGE_GC_DELETE", false);
    this.intervalMs = envMs(config, "STORAGE_GC_SWEEP_MS", 6 * 60 * 60_000);
    this.minAgeMs = envMs(config, "STORAGE_GC_MIN_AGE_MS", 7 * 24 * 60 * 60_000);
  }

  onModuleInit() {
    if (!this.enabled || !this.storage.isConfigured()) return;
    this.timer = setInterval(() => {
      void this.sweep().catch((e) =>
        this.logger.warn(
          `Storage GC sweep failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }, this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(opts?: { dryRun?: boolean; delete?: boolean }): Promise<StorageGcReport> {
    let shouldDelete = false;
    if (opts?.delete === true) shouldDelete = true;
    else if (opts?.dryRun === true) shouldDelete = false;
    else shouldDelete = this.autoDelete;
    const dryRun = !shouldDelete;

    if (this.running) {
      return {
        scanned: 0,
        candidates: [],
        referencedKeys: 0,
        dryRun: true,
        bytesCandidate: 0,
      };
    }
    this.running = true;
    try {
      if (!this.storage.isConfigured()) {
        return {
          scanned: 0,
          candidates: [],
          referencedKeys: 0,
          dryRun: true,
          bytesCandidate: 0,
        };
      }

      const objects = await this.storage.listByHashObjects();
      const { keys, md5s } = await this.assets.collectStorageReferences();
      const now = Date.now();
      const candidates: StorageGcCandidate[] = [];

      for (const obj of objects) {
        if (keys.has(obj.key)) continue;
        const md5 = obj.key.match(/^uploads\/by-hash\/([a-f0-9]{32})\./i)?.[1];
        if (md5 && md5s.has(md5.toLowerCase())) continue;
        if (obj.lastModified) {
          const age = now - Date.parse(obj.lastModified);
          if (Number.isFinite(age) && age < this.minAgeMs) continue;
        }
        candidates.push({ ...obj, reason: "unreferenced" });
      }

      const bytesCandidate = candidates.reduce((sum, c) => sum + (c.size || 0), 0);
      const report: StorageGcReport = {
        scanned: objects.length,
        candidates,
        referencedKeys: keys.size,
        dryRun: !shouldDelete,
        bytesCandidate,
      };

      if (!shouldDelete) {
        if (candidates.length) {
          this.logger.log(
            `Storage GC dry-run: ${candidates.length}/${objects.length} unreferenced (~${Math.round(bytesCandidate / 1024)} KiB)`,
          );
        }
        return report;
      }

      const { deleted, failed } = await this.storage.deleteObjects(
        candidates.map((c) => c.key),
      );
      report.deleted = deleted;
      report.failed = failed;
      this.logger.warn(
        `Storage GC deleted ${deleted.length} objects (${failed.length} failed)`,
      );
      return report;
    } finally {
      this.running = false;
    }
  }
}
