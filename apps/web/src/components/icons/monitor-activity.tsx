import { createLucideIcon } from "lucide-react";

/**
 * Monitor with activity pulse — admin「任务」tab reference style.
 * Matches Lucide stroke conventions (24×24, round caps/joins).
 */
export const MonitorActivity = createLucideIcon("MonitorActivity", [
  ["rect", { width: "20", height: "14", x: "2", y: "3", rx: "2", ry: "2", key: "screen" }],
  ["path", { d: "M8 21h8", key: "base" }],
  ["path", { d: "M12 17v4", key: "stem" }],
  [
    "path",
    {
      d: "M7 11.5h1.2l1.4-3.5 1.8 6.5 1.6-4.5 1.2 1.5H17",
      key: "pulse",
    },
  ],
]);
