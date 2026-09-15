import { cn } from "@/shared/lib/utils";
import "./skeleton.css";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("joy-skeleton", className)}
      {...props}
    />
  );
}

export { Skeleton };
