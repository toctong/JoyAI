import type { DataSource } from "typeorm";

/**
 * MySQL reuses a composite index's leftmost column for FKs when no dedicated
 * index exists. TypeORM synchronize then fails dropping that composite
 * (`needed in a foreign key constraint`) when datetime precision changes.
 * Ensure a plain column index exists first so composites can be replaced.
 */
const FK_COVERING_INDEXES: Array<{
  table: string;
  name: string;
  column: string;
}> = [
  { table: "job", name: "IDX_job_userId", column: "userId" },
  { table: "asset", name: "IDX_asset_userId", column: "userId" },
  { table: "asset", name: "IDX_asset_jobId", column: "jobId" },
  {
    table: "canvas_project",
    name: "IDX_canvas_project_userId",
    column: "userId",
  },
  {
    table: "canvas_project",
    name: "IDX_canvas_project_folderId",
    column: "folderId",
  },
  {
    table: "canvas_folder",
    name: "IDX_canvas_folder_userId",
    column: "userId",
  },
  {
    table: "canvas_folder",
    name: "IDX_canvas_folder_parentId",
    column: "parentId",
  },
  {
    table: "manju_project",
    name: "IDX_manju_project_userId",
    column: "userId",
  },
  {
    table: "manju_project",
    name: "IDX_manju_project_folderId",
    column: "folderId",
  },
  {
    table: "manju_folder",
    name: "IDX_manju_folder_parentId",
    column: "parentId",
  },
];

export async function ensureMysqlFkCoveringIndexes(dataSource: DataSource) {
  if (
    dataSource.options.type !== "mysql" &&
    dataSource.options.type !== "mariadb"
  ) {
    return;
  }

  for (const spec of FK_COVERING_INDEXES) {
    const tableRows: Array<{ TABLE_NAME: string }> = await dataSource.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
      [spec.table],
    );
    if (!tableRows.length) continue;

    const indexRows: Array<{ INDEX_NAME: string }> = await dataSource.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND INDEX_NAME = ?
       LIMIT 1`,
      [spec.table, spec.name],
    );
    if (indexRows.length) continue;

    await dataSource.query(
      `CREATE INDEX \`${spec.name}\` ON \`${spec.table}\` (\`${spec.column}\`)`,
    );
  }
}
