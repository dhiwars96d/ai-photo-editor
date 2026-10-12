if (type === "retouch") {
  if (
    window.Retouch &&
    typeof window.Retouch.open === "function"
  ) {
    window.Retouch.open();
  }

  return;
}
