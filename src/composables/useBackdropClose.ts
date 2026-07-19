export function useBackdropClose(onClose: () => void) {
  let pointerStartedOnBackdrop = false
  let pointerEndedOnBackdrop = false

  function onBackdropPointerDown(event: PointerEvent) {
    pointerStartedOnBackdrop = event.target === event.currentTarget
    pointerEndedOnBackdrop = false
  }

  function onBackdropPointerUp(event: PointerEvent) {
    pointerEndedOnBackdrop = event.target === event.currentTarget
  }

  function onBackdropPointerCancel() {
    pointerStartedOnBackdrop = false
    pointerEndedOnBackdrop = false
  }

  function onBackdropClick(event: MouseEvent) {
    const clickedBackdrop =
      pointerStartedOnBackdrop &&
      pointerEndedOnBackdrop &&
      event.target === event.currentTarget

    onBackdropPointerCancel()
    if (clickedBackdrop) onClose()
  }

  return {
    onBackdropPointerDown,
    onBackdropPointerUp,
    onBackdropPointerCancel,
    onBackdropClick,
  }
}
