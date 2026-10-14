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
  %min.iters.check = icmp samesign ult i64 %umin30, 4
  br i1 %min.iters.check, label %bb16.preheader35, label %vector.ph

bb16.preheader35:                                 ; preds = %vector.body, %bb16.preheader
  %iter.sroa.12.018.ph = phi i64 [ 0, %bb16.preheader ], [ %n.vec, %vector.body ]
  %iter.sroa.0.016.ph = phi ptr [ %input.0, %bb16.preheader ], [ %10, %vector.body ]
  br label %bb16

vector.ph:                                        ; preds = %bb16.preheader
  %6 = add nuw nsw i64 %umin30, 1
  %n.mod.vf = and i64 %6, 3
  %7 = icmp eq i64 %n.mod.vf, 0
  %8 = select i1 %7, i64 4, i64 %n.mod.vf
  %n.vec = sub nsw i64 %6, %8
  %9 = shl i64 %n.vec, 5
  %10 = getelementptr i8, ptr %input.0, i64 %9
  br label %vector.body

vector.body:                                      ; preds = %vector.body, %vector.ph
  %index = phi i64 [ 0, %vector.ph ], [ %index.next, %vector.body ]
  %offset.idx = shl i64 %index, 5
  %next.gep = getelementptr i8, ptr %input.0, i64 %offset.idx
  %wide.vec = load <16 x double>, ptr %next.gep, align 8
  %strided.vec = shufflevector <16 x double> %wide.vec, <16 x double> poison, <4 x i32> <i32 0, i32 4, i32 8, i32 12>
  %strided.vec31 = shufflevector <16 x double> %wide.vec, <16 x double> poison, <4 x i32> <i32 1, i32 5, i32 9, i32 13>
  %strided.vec32 = shufflevector <16 x double> %wide.vec, <16 x double> poison, <4 x i32> <i32 2, i32 6, i32 10, i32 14>
  %strided.vec33 = shufflevector <16 x double> %wide.vec, <16 x double> poison, <4 x i32> <i32 3, i32 7, i32 11, i32 15>
  %11 = fdiv <4 x double> %strided.vec, splat (double 3.600000e+02)
  %12 = fmul <4 x double> %11, splat (double 5.300000e+00)
  %13 = fdiv <4 x double> %12, splat (double 2.400000e+01)
  %14 = fsub <4 x double> %strided.vec32, %13
  %15 = fmul <4 x double> %14, splat (double 2.200000e-01)
  %16 = fadd <4 x double> %strided.vec, %15
  %17 = tail call <4 x double> @llvm.maxnum.v4f64(<4 x double> %16, <4 x double> splat (double 2.000000e+02))
  %.idx = shl nuw i64 %index, 4
  %18 = getelementptr inbounds nuw i8, ptr %output.0, i64 %.idx
  %19 = fcmp une <4 x double> %strided.vec33, zeroinitializer
  %20 = fmul <4 x double> %strided.vec32, splat (double 4.000000e+00)
  %21 = fadd <4 x double> %20, splat (double -1.500000e+00)
  %22 = select <4 x i1> %19, <4 x double> splat (double 5.000000e+00), <4 x double> %21
  %23 = fadd <4 x double> %strided.vec31, %22
  %24 = fcmp olt <4 x double> %23, zeroinitializer
  %25 = select <4 x i1> %24, <4 x double> zeroinitializer, <4 x double> %23
  %26 = fcmp ogt <4 x double> %25, splat (double 1.000000e+02)
  %27 = select <4 x i1> %26, <4 x double> splat (double 1.000000e+02), <4 x double> %25
  %interleaved.vec = shufflevector <4 x double> %17, <4 x double> %27, <8 x i32> <i32 0, i32 4, i32 1, i32 5, i32 2, i32 6, i32 3, i32 7>
  store <8 x double> %interleaved.vec, ptr %18, align 8
  %index.next = add nuw i64 %index, 4
  %28 = icmp eq i64 %index.next, %n.vec
  br i1 %28, label %bb16.preheader35, label %vector.body, !llvm.loop !453

bb23:                                             ; preds = %bb22, %bb8.preheader, %bb4, %bb2, %start
  %_0.sroa.5.0 = phi i64 [ 38, %start ], [ 26, %bb2 ], [ 44, %bb4 ], [ undef, %bb8.preheader ], [ undef, %bb22 ]
  %_0.sroa.0.0 = phi ptr [ @alloc_45596df20f4a6b150e3adaf8fdd7dc60, %start ], [ @alloc_467caf284e2d9ea37f2126987ba793e2, %bb2 ], [ @alloc_6686e3821ce232194a7e7638b4720fbb, %bb4 ], [ null, %bb8.preheader ], [ null, %bb22 ]
  %29 = insertvalue { ptr, i64 } poison, ptr %_0.sroa.0.0, 0
  %30 = insertvalue { ptr, i64 } %29, i64 %_0.sroa.5.0, 1
  ret { ptr, i64 } %30

bb16:                                             ; preds = %bb16.preheader35, %bb22
  %iter.sroa.12.018 = phi i64 [ %_9.0.i, %bb22 ], [ %iter.sroa.12.018.ph, %bb16.preheader35 ]
  %iter.sroa.0.016 = phi ptr [ %data.i.i.i, %bb22 ], [ %iter.sroa.0.016.ph, %bb16.preheader35 ]
  %data.i.i.i = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 32
  %_9.0.i = add nuw nsw i64 %iter.sroa.12.018, 1
  %_35 = shl nuw i64 %iter.sroa.12.018, 1
  %exitcond.not = icmp eq i64 %iter.sroa.12.018, %2
  br i1 %exitcond.not, label %panic4, label %bb17

bb17:                                             ; preds = %bb16
  %31 = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 16
  %intake = load double, ptr %31, align 8, !noundef !3
  %32 = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 8
  %energy = load double, ptr %32, align 8, !noundef !3
  %weight = load double, ptr %iter.sroa.0.016, align 8, !noundef !3
  %_32 = fdiv double %weight, 3.600000e+02
  %_31 = fmul double %_32, 5.300000e+00
  %_30 = fdiv double %_31, 2.400000e+01
  %_29 = fsub double %intake, %_30
  %gain = fmul double %_29, 2.200000e-01
  %_34 = fadd double %weight, %gain
  %33 = tail call double @llvm.maxnum.f64(double %_34, double 2.000000e+02)
  %34 = getelementptr inbounds nuw i8, ptr %iter.sroa.0.016, i64 24
  %_26 = load double, ptr %34, align 8, !noundef !3
  %35 = getelementptr inbounds nuw double, ptr %output.0, i64 %_35
  store double %33, ptr %35, align 8
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
  %36 = fadd double %_40, -1.500000e+00
  %_39.sroa.0.0 = select i1 %resting, double 5.000000e+00, double %36
  %_38 = fadd double %energy, %_39.sroa.0.0
  %_7.i = fcmp olt double %_38, 0.000000e+00
  %self.sroa.0.0.i = select i1 %_7.i, double 0.000000e+00, double %_38
  %_9.i = fcmp ogt double %self.sroa.0.0.i, 1.000000e+02
  %self.sroa.0.1.i = select i1 %_9.i, double 1.000000e+02, double %self.sroa.0.0.i
  %37 = getelementptr inbounds nuw double, ptr %output.0, i64 %_41
  store double %self.sroa.0.1.i, ptr %37, align 8
  %exitcond23 = icmp eq i64 %iter.sroa.12.018, %5
  br i1 %exitcond23, label %bb23, label %bb16, !llvm.loop !454

panic5:                                           ; preds = %bb17
; call core::panicking::panic_bounds_check
  tail call void @_RNvNtCsgEmfK2I1SDS_4core9panicking18panic_bounds_check(i64 noundef %_41, i64 noundef %output.1, ptr noalias noundef readonly align 8 captures(address, read_provenance) dereferenceable(24) @alloc_f31d41677229ab6e5197fb99101cfd78) #31
  unreachable
}
