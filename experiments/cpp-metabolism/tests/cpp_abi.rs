unsafe extern "C" {
    fn riose_cpp_update_metabolism(count: usize, input: *const f64, output: *mut f64) -> i32;
    fn riose_cpp_allocate(count: usize, input: *mut *mut f64, output: *mut *mut f64) -> i32;
    fn riose_cpp_free(input: *mut f64, output: *mut f64);
}

#[test]
fn cpp_abi_validates_null_and_oversized_batches() {
    assert_eq!(unsafe { riose_cpp_update_metabolism(1, std::ptr::null(), std::ptr::null_mut()) }, -2);
    assert_eq!(unsafe { riose_cpp_update_metabolism(100_001, std::ptr::null(), std::ptr::null_mut()) }, -1);
    let (mut input, mut output) = (std::ptr::null_mut(), std::ptr::null_mut());
    assert_eq!(unsafe { riose_cpp_allocate(100_001, &mut input, &mut output) }, -1);
}

#[test]
fn cpp_abi_accepts_empty_batch_and_allocates_matching_owned_buffers() {
    assert_eq!(unsafe { riose_cpp_update_metabolism(0, std::ptr::null(), std::ptr::null_mut()) }, 0);
    let (mut input, mut output) = (std::ptr::null_mut(), std::ptr::null_mut());
    assert_eq!(unsafe { riose_cpp_allocate(2, &mut input, &mut output) }, 0);
    assert!(!input.is_null() && !output.is_null());
    unsafe { riose_cpp_free(input, output) };
}
