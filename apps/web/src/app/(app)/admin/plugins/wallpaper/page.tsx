import { redirect } from "next/navigation";

/** Wallpaper / inspire theme plugin retired — inspire matches other app pages. */
export default function WallpaperPluginRedirectPage() {
  redirect("/admin/plugins");
}
