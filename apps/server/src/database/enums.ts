export enum UserRole {
  admin = "admin",
  creator = "creator",
}

export enum JobKind {
  image = "image",
  video = "video",
  llm = "llm",
}

export enum JobStatus {
  queued = "queued",
  running = "running",
  polling = "polling",
  succeeded = "succeeded",
  failed = "failed",
  cancelled = "cancelled",
}
