"use client";

import { useCallback, useRef, useState } from "react";

export function isJoyPhotoOpen() {
  return document.documentElement.hasAttribute("data-joy-photo-open");
}

/**
 * Keep a parent Dialog open while nested JoyPhotoProvider lightbox is active.
 *
 * Parent Dialogs that nest PhotoView should use `modal={false}` (stable — do
 * not toggle) so the body-portaled lightbox is not aria-hidden/inert. Keep the
 * Dialog overlay receiving pointer events so clicks never fall through to the
 * page (which re-opened a second identical dialog). While the lightbox is open,
 * set content `pointer-events-none` and block outside dismiss via the guard /
 * onPointerDownOutside.
 */
export function useDialogPhotoGuard() {
  const [photoOpen, setPhotoOpen] = useState(false);
  const photoOpenRef = useRef(false);
  const suppressCloseRef = useRef(false);

  const onPhotoVisibleChange = useCallback((visible: boolean) => {
    photoOpenRef.current = visible;
    setPhotoOpen(visible);
    if (visible) {
      document.documentElement.setAttribute("data-joy-photo-open", "1");
      return;
    }
    document.documentElement.removeAttribute("data-joy-photo-open");
    // Same ESC tick can close lightbox then bubble to Dialog — ignore once.
    suppressCloseRef.current = true;
    window.setTimeout(() => {
      suppressCloseRef.current = false;
    }, 50);
  }, []);

  const guardOpenChange = useCallback(
    (next: boolean, onOpenChange: (open: boolean) => void) => {
      if (
        !next &&
        (photoOpenRef.current || suppressCloseRef.current || isJoyPhotoOpen())
      ) {
        return;
      }
      onOpenChange(next);
    },
    [],
  );

  const contentProps = {
    onEscapeKeyDown: (event: Event) => {
      if (photoOpenRef.current || isJoyPhotoOpen()) {
        event.preventDefault();
      }
    },
  };

  return { photoOpen, onPhotoVisibleChange, guardOpenChange, contentProps };
}
