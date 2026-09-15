declare module "react-masonry-css" {
  import type { ComponentType, ReactNode } from "react";

  type BreakpointCols = number | { default: number; [width: number]: number };

  type MasonryProps = {
    breakpointCols?: BreakpointCols;
    className?: string;
    columnClassName?: string;
    children?: ReactNode;
  };

  const Masonry: ComponentType<MasonryProps>;
  export default Masonry;
}
