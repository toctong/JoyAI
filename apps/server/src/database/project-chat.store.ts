import { In, Repository } from "typeorm";
import { ProjectChat } from "./entities/project-chat.entity";

export const PROJECT_CHAT_SCOPE = {
  canvasAgent: "canvas-agent",
  manjuScript: "manju-script",
  manjuAgent: "manju-agent",
} as const;

export async function readProjectChat(
  repo: Repository<ProjectChat>,
  userId: string,
  scope: string,
  projectId: string,
) {
  return repo.findOne({ where: { userId, scope, projectId } });
}

export async function writeProjectChat(
  repo: Repository<ProjectChat>,
  userId: string,
  scope: string,
  projectId: string,
  payload: Record<string, unknown>,
) {
  const existing = await repo.findOne({ where: { scope, projectId } });
  if (existing) {
    existing.userId = userId;
    existing.payload = payload;
    return repo.save(existing);
  }
  return repo.save(
    repo.create({
      userId,
      scope,
      projectId,
      payload,
    }),
  );
}

export async function deleteProjectChats(
  repo: Repository<ProjectChat>,
  scope: string,
  projectIds: string[],
) {
  if (!projectIds.length) return;
  await repo.delete({ scope, projectId: In(projectIds) });
}
