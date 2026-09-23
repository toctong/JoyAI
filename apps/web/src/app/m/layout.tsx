import { MobileShell } from "@/features/mobile";
import { joyMobileDisplay, joyMobileKicker } from "@/features/mobile/mobile-fonts";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${joyMobileDisplay.variable} ${joyMobileKicker.variable}`}
    >
      <MobileShell>{children}</MobileShell>
    </div>
  );
}
