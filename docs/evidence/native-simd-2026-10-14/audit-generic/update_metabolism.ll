define { ptr, i64 } @_ZN10riose_core17update_metabolism17h1e3ffff75ae06a40E(ptr noalias noundef nonnull readonly align 8 captures(none) %input.0, i64 noundef range(i64 0, 1152921504606846976) %input.1, ptr noalias noundef nonnull writeonly align 8 captures(none) %output.0, i64 noundef range(i64 0, 1152921504606846976) %output.1) unnamed_addr #1 personality ptr @rust_eh_personality {
start:
  %_3 = and i64 %input.1, 3
  %0 = icmp eq i64 %_3, 0
  br i1 %0, label %bb2, label %bb23

bb2:                                              ; preds = %start
  %_6 = icmp samesign ugt i64 %input.1, 400000
  br i1 %_6, label %bb23, label %bb4

bb4:                                              ; preds = %bb2
  %count6 = lshr exact i64 %input.1, 1
  %_7.not = icmp eq i64 %output.1, %count6
  br i1 %_7.not, label %bb8.preheader, label %bb23

bb8.preheader:                                    ; preds = %bb4
  %_6.not.i.i15 = icmp samesign ult i64 %input.1, 4
  br i1 %_6.not.i.i15, label %bb23, label %bb16.preheader

bb16.preheader:                                   ; preds = %bb8.preheader
  %1 = add nuw nsw i64 %output.1, 1
  %2 = lshr i64 %1, 1
  %3 = lshr i64 %output.1, 1
  %4 = add nsw i64 %input.1, -4
  %5 = lshr exact i64 %4, 2
  %umin = tail call i64 @llvm.umin.i64(i64 %3, i64 %5)
  %umin30 = tail call i64 @llvm.umin.i64(i64 %umin, i64 %2)
  %min.iters.check = icmp samesign ult i64 %umin30, 2
  br i1 %min.iters.check, label %bb16.preheader33, label %vector.ph

bb16.preheader33:                                 ; preds = %vector.body, %bb16.preheader
  %iter.sroa.12.018.ph = phi i64 [ 0, %bb16.preheader ], [ %n.vec, %vector.body ]
  %iter.sroa.0.016.ph = phi ptr [ %input.0, %bb16.preheader ], [ %7, %vector.body ]
  br label %bb16

vector.ph:                                        ; preds = %bb16.preheader
  %n.vec = and i64 %umin30, 576460752303423486
  %6 = shl nuw i64 %n.vec, 5
  %7 = getelementptr i8, ptr %input.0, i64 %6
  br label %vector.body

vector.body:                                      ; preds = %vector.body, %vector.ph
  %index = phi i64 [ 0, %vector.ph ], [ %index.next, %vector.body ]
  %offset.idx = shl i64 %index, 5
  %next.gep = getelementptr i8, ptr %input.0, i64 %offset.idx
  %8 = getelementptr i8, ptr %input.0, i64 %offset.idx
  %next.gep31 = getelementptr i8, ptr %8, i64 32
  %9 = getelementptr inbounds nuw i8, ptr %next.gep, i64 16
  %10 = getelementptr i8, ptr %8, i64 48
  %11 = load double, ptr %9, align 8, !noundef !3
  %12 = load double, ptr %10, align 8, !noundef !3
  %13 = insertelement <2 x double> poison, double %11, i64 0
  %14 = insertelement <2 x double> %13, double %12, i64 1
  %15 = getelementptr inbounds nuw i8, ptr %next.gep, i64 8
  %16 = getelementptr i8, ptr %8, i64 40
  %17 = load double, ptr %15, align 8, !noundef !3
  %18 = load double, ptr %16, align 8, !noundef !3
  %19 = insertelement <2 x double> poison, double %17, i64 0
  %20 = insertelement <2 x double> %19, double %18, i64 1
  %21 = load double, ptr %next.gep, align 8, !noundef !3
  %22 = load double, ptr %next.gep31, align 8, !noundef !3
  %23 = insertelement <2 x double> poison, double %21, i64 0
  %24 = insertelement <2 x double> %23, double %22, i64 1
  %25 = fdiv <2 x double> %24, splat (double 3.600000e+02)
  %26 = fmul <2 x double> %25, splat (double 5.300000e+00)
  %27 = fdiv <2 x double> %26, splat (double 2.400000e+01)
  %28 = fsub <2 x double> %14, %27
  %29 = fmul <2 x double> %28, splat (double 2.200000e-01)
  %30 = fadd <2 x double> %24, %29
  %31 = tail call <2 x double> @llvm.maxnum.v2f64(<2 x double> %30, <2 x double> splat (double 2.000000e+02))
  %32 = getelementptr inbounds nuw i8, ptr %next.gep, i64 24
  %33 = getelementptr i8, ptr %8, i64 56
  %34 = load double, ptr %32, align 8, !noundef !3
  %35 = load double, ptr %33, align 8, !noundef !3
  %36 = insertelement <2 x double> poison, double %34, i64 0
  %37 = insertelement <2 x double> %36, double %35, i64 1
  %.idx = shl nuw i64 %index, 4
  %38 = getelementptr inbounds nuw i8, ptr %output.0, i64 %.idx
  %39 = fcmp une <2 x double> %37, zeroinitializer
  %40 = fmul <2 x double> %14, splat (double 4.000000e+00)
  %41 = fadd <2 x double> %40, splat (double -1.500000e+00)
  %42 = select <2 x i1> %39, <2 x double> splat (double 5.000000e+00), <2 x double> %41
  %43 = fadd <2 x double> %20, %42
  %44 = fcmp olt <2 x double> %43, zeroinitializer
  %45 = select <2 x i1> %44, <2 x double> zeroinitializer, <2 x double> %43
  %46 = fcmp ogt <2 x double> %45, splat (double 1.000000e+02)
  %47 = select <2 x i1> %46, <2 x double> splat (double 1.000000e+02), <2 x double> %45
  %interleaved.vec = shufflevector <2 x double> %31, <2 x double> %47, <4 x i32> <i32 0, i32 2, i32 1, i32 3>
  store <4 x double> %interleaved.vec, ptr %38, align 8
  %index.next = add nuw i64 %index, 2
  %48 = icmp eq i64 %index.next, %n.vec
  br i1 %48, label %bb16.preheader33, label %vector.body, !llvm.loop !448

bb23:                                             ; preds = %bb22, %bb8.preheader, %bb4, %bb2, %start
  %_0.sroa.5.0 = phi i64 [ 38, %start ], [ 26, %bb2 ], [ 44, %bb4 ], [ undef, %bb8.preheader ], [ undef, %bb22 ]
  %_0.sroa.0.0 = phi ptr [ @alloc_45596df20f4a6b150e3adaf8fdd7dc60, %start ], [ @alloc_467caf284e2d9ea37f2126987ba793e2, %bb2 ], [ @alloc_6686e3821ce232194a7e7638b4720fbb, %bb4 ], [ null, %bb8.preheader ], [ null, %bb22 ]
  %49 = insertvalue { ptr, i64 } poison, ptr %_0.sroa.0.0, 0
  %50 = insertvalue { ptr, i64 } %49, i64 %_0.sroa.5.0, 1
  ret { ptr, i64 } %50

bb16:                                             ; preds = %bb16.preheader33, %bb22
  %iter.sroa.12.018 = phi i64 [ %_9.0.i, %bb22 ], [ %iter.sroa.12.018.ph, %bb16.preheader33 ]
  %iter.sroa.0.016 = phi ptr [ %data.i.i.i, %bb22 ], [ %iter.sroa.0.016.ph, %bb16.preheader33 ]
  %data.i.i.i = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 32
  %_9.0.i = add nuw nsw i64 %iter.sroa.12.018, 1
  %_35 = shl nuw i64 %iter.sroa.12.018, 1
  %exitcond.not = icmp eq i64 %iter.sroa.12.018, %2
  br i1 %exitcond.not, label %panic4, label %bb17

bb17:                                             ; preds = %bb16
  %51 = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 16
  %intake = load double, ptr %51, align 8, !noundef !3
  %52 = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 8
  %energy = load double, ptr %52, align 8, !noundef !3
  %weight = load double, ptr %iter.sroa.0.016, align 8, !noundef !3
  %_32 = fdiv double %weight, 3.600000e+02
  %_31 = fmul double %_32, 5.300000e+00
  %_30 = fdiv double %_31, 2.400000e+01
  %_29 = fsub double %intake, %_30
  %gain = fmul double %_29, 2.200000e-01
  %_34 = fadd double %weight, %gain
  %53 = tail call double @llvm.maxnum.f64(double %_34, double 2.000000e+02)
  %54 = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 24
  %_26 = load double, ptr %54, align 8, !noundef !3
  %55 = getelementptr inbounds nuw double, ptr %output.0, i64 %_35
  store double %53, ptr %55, align 8
  %_41 = or disjoint i64 %_35, 1
  %exitcond22.not = icmp eq i64 %iter.sroa.12.018, %3
  br i1 %exitcond22.not, label %panic5, label %bb22

panic4:                                           ; preds = %bb16
; call core::panicking::panic_bounds_check
  tail call void @_RNvNtCsgEmfK2I1SDS_4core9panicking18panic_bounds_check(i64 noundef %_35, i64 noundef %output.1, ptr noalias noundef readonly align 8 captures(address, read_provenance) dereferenceable(24) @alloc_b45a9e6be76edb0a2d5a9d62e32dee8a) #31
  unreachable

bb22:                                             ; preds = %bb17
  %resting = fcmp une double %_26, 0.000000e+00
  %_40 = fmul double %intake, 4.000000e+00
  %56 = fadd double %_40, -1.500000e+00
  %_39.sroa.0.0 = select i1 %resting, double 5.000000e+00, double %56
  %_38 = fadd double %energy, %_39.sroa.0.0
  %_7.i = fcmp olt double %_38, 0.000000e+00
  %self.sroa.0.0.i = select i1 %_7.i, double 0.000000e+00, double %_38
  %_9.i = fcmp ogt double %self.sroa.0.0.i, 1.000000e+02
  %self.sroa.0.1.i = select i1 %_9.i, double 1.000000e+02, double %self.sroa.0.0.i
  %57 = getelementptr inbounds nuw double, ptr %output.0, i64 %_41
  store double %self.sroa.0.1.i, ptr %57, align 8
  %exitcond23 = icmp eq i64 %iter.sroa.12.018, %5
  br i1 %exitcond23, label %bb23, label %bb16, !llvm.loop !449

panic5:                                           ; preds = %bb17
; call core::panicking::panic_bounds_check
  tail call void @_RNvNtCsgEmfK2I1SDS_4core9panicking18panic_bounds_check(i64 noundef %_41, i64 noundef %output.1, ptr noalias noundef readonly align 8 captures(address, read_provenance) dereferenceable(24) @alloc_f31d41677229ab6e5197fb99101cfd78) #31
  unreachable
}
