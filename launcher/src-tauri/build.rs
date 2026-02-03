fn main() {
  // Tauri Standard
  tauri_build::build();

  println!("cargo:rustc-check-cfg=cfg(mobile)");
}
