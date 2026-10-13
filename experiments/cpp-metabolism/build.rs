use std::{env, path::PathBuf, process::Command};

fn main() {
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let object = out.join("metabolism_cpp.o");
    let archive = out.join("libmetabolism_cpp.a");
    let status = Command::new("c++")
        .args(["-std=c++20", "-O3", "-fno-fast-math", "-ffp-contract=off", "-c"])
        .arg("metabolism.cpp")
        .arg("-o")
        .arg(&object)
        .status()
        .expect("c++ is required for the isolated C++ prototype");
    assert!(status.success(), "C++ benchmark kernel compilation failed");
    let status = Command::new("ar")
        .arg("crus")
        .arg(&archive)
        .arg(&object)
        .status()
        .expect("ar is required for the isolated C++ prototype");
    assert!(status.success(), "C++ benchmark archive creation failed");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=metabolism_cpp");
    println!("cargo:rustc-link-lib=dylib=stdc++");
    println!("cargo:rerun-if-changed=metabolism.cpp");
}
