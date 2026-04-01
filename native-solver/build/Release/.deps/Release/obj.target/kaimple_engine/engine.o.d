cmd_Release/obj.target/kaimple_engine/engine.o := c++ -o Release/obj.target/kaimple_engine/engine.o ../engine.cpp '-DNODE_GYP_MODULE_NAME=kaimple_engine' '-DUSING_UV_SHARED=1' '-DUSING_V8_SHARED=1' '-DV8_DEPRECATION_WARNINGS=1' '-D_GLIBCXX_USE_CXX11_ABI=1' '-D_FILE_OFFSET_BITS=64' '-D_DARWIN_USE_64_BIT_INODE=1' '-D_LARGEFILE_SOURCE' '-DNAPI_VERSION=8' '-DNAPI_DISABLE_CPP_EXCEPTIONS' '-DBUILDING_NODE_EXTENSION' -I/Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node -I/Users/moltoshi/Library/Caches/node-gyp/25.5.0/src -I/Users/moltoshi/Library/Caches/node-gyp/25.5.0/deps/openssl/config -I/Users/moltoshi/Library/Caches/node-gyp/25.5.0/deps/openssl/openssl/include -I/Users/moltoshi/Library/Caches/node-gyp/25.5.0/deps/uv/include -I/Users/moltoshi/Library/Caches/node-gyp/25.5.0/deps/zlib -I/Users/moltoshi/Library/Caches/node-gyp/25.5.0/deps/v8/include -I/Users/moltoshi/Desktop/plekaim-desktop/native-solver/node_modules/node-addon-api -I../deps/eigen  -O3 -gdwarf-2 -fno-strict-aliasing -mmacosx-version-min=13.5 -arch arm64 -Wall -Wendif-labels -W -Wno-unused-parameter -std=c++17 -stdlib=libc++ -fno-rtti -O3 -DNDEBUG -MMD -MF ./Release/.deps/Release/obj.target/kaimple_engine/engine.o.d.raw   -c
Release/obj.target/kaimple_engine/engine.o: ../engine.cpp \
  /Users/moltoshi/Desktop/plekaim-desktop/native-solver/node_modules/node-addon-api/napi.h \
  /Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/node_api.h \
  /Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/js_native_api.h \
  /Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/js_native_api_types.h \
  /Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/node_api_types.h \
  /Users/moltoshi/Desktop/plekaim-desktop/native-solver/node_modules/node-addon-api/napi-inl.h \
  /Users/moltoshi/Desktop/plekaim-desktop/native-solver/node_modules/node-addon-api/napi-inl.deprecated.h \
  ../deps/eigen/Eigen/Sparse ../deps/eigen/Eigen/SparseCore \
  ../deps/eigen/Eigen/Core \
  ../deps/eigen/Eigen/src/Core/util/DisableStupidWarnings.h \
  ../deps/eigen/Eigen/src/Core/util/Macros.h \
  ../deps/eigen/Eigen/src/Core/util/ConfigureVectorization.h \
  ../deps/eigen/Eigen/src/Core/util/MKL_support.h \
  ../deps/eigen/Eigen/src/Core/util/Constants.h \
  ../deps/eigen/Eigen/src/Core/util/Meta.h \
  ../deps/eigen/Eigen/src/Core/util/ForwardDeclarations.h \
  ../deps/eigen/Eigen/src/Core/util/StaticAssert.h \
  ../deps/eigen/Eigen/src/Core/util/XprHelper.h \
  ../deps/eigen/Eigen/src/Core/util/Memory.h \
  ../deps/eigen/Eigen/src/Core/util/IntegralConstant.h \
  ../deps/eigen/Eigen/src/Core/util/SymbolicIndex.h \
  ../deps/eigen/Eigen/src/Core/NumTraits.h \
  ../deps/eigen/Eigen/src/Core/MathFunctions.h \
  ../deps/eigen/Eigen/src/Core/GenericPacketMath.h \
  ../deps/eigen/Eigen/src/Core/MathFunctionsImpl.h \
  ../deps/eigen/Eigen/src/Core/arch/Default/ConjHelper.h \
  ../deps/eigen/Eigen/src/Core/arch/Default/Half.h \
  ../deps/eigen/Eigen/src/Core/arch/Default/BFloat16.h \
  ../deps/eigen/Eigen/src/Core/arch/Default/TypeCasting.h \
  ../deps/eigen/Eigen/src/Core/arch/Default/GenericPacketMathFunctionsFwd.h \
  ../deps/eigen/Eigen/src/Core/arch/NEON/PacketMath.h \
  ../deps/eigen/Eigen/src/Core/arch/NEON/TypeCasting.h \
  ../deps/eigen/Eigen/src/Core/arch/NEON/MathFunctions.h \
  ../deps/eigen/Eigen/src/Core/arch/NEON/Complex.h \
  ../deps/eigen/Eigen/src/Core/arch/Default/Settings.h \
  ../deps/eigen/Eigen/src/Core/arch/Default/GenericPacketMathFunctions.h \
  ../deps/eigen/Eigen/src/Core/functors/TernaryFunctors.h \
  ../deps/eigen/Eigen/src/Core/functors/BinaryFunctors.h \
  ../deps/eigen/Eigen/src/Core/functors/UnaryFunctors.h \
  ../deps/eigen/Eigen/src/Core/functors/NullaryFunctors.h \
  ../deps/eigen/Eigen/src/Core/functors/StlFunctors.h \
  ../deps/eigen/Eigen/src/Core/functors/AssignmentFunctors.h \
  ../deps/eigen/Eigen/src/Core/util/IndexedViewHelper.h \
  ../deps/eigen/Eigen/src/Core/util/ReshapedHelper.h \
  ../deps/eigen/Eigen/src/Core/ArithmeticSequence.h \
  ../deps/eigen/Eigen/src/Core/IO.h \
  ../deps/eigen/Eigen/src/Core/DenseCoeffsBase.h \
  ../deps/eigen/Eigen/src/Core/DenseBase.h \
  ../deps/eigen/Eigen/src/Core/../plugins/CommonCwiseUnaryOps.h \
  ../deps/eigen/Eigen/src/Core/../plugins/BlockMethods.h \
  ../deps/eigen/Eigen/src/Core/../plugins/IndexedViewMethods.h \
  ../deps/eigen/Eigen/src/Core/../plugins/ReshapedMethods.h \
  ../deps/eigen/Eigen/src/Core/MatrixBase.h \
  ../deps/eigen/Eigen/src/Core/../plugins/CommonCwiseBinaryOps.h \
  ../deps/eigen/Eigen/src/Core/../plugins/MatrixCwiseUnaryOps.h \
  ../deps/eigen/Eigen/src/Core/../plugins/MatrixCwiseBinaryOps.h \
  ../deps/eigen/Eigen/src/Core/EigenBase.h \
  ../deps/eigen/Eigen/src/Core/Product.h \
  ../deps/eigen/Eigen/src/Core/CoreEvaluators.h \
  ../deps/eigen/Eigen/src/Core/AssignEvaluator.h \
  ../deps/eigen/Eigen/src/Core/Assign.h \
  ../deps/eigen/Eigen/src/Core/ArrayBase.h \
  ../deps/eigen/Eigen/src/Core/../plugins/ArrayCwiseUnaryOps.h \
  ../deps/eigen/Eigen/src/Core/../plugins/ArrayCwiseBinaryOps.h \
  ../deps/eigen/Eigen/src/Core/util/BlasUtil.h \
  ../deps/eigen/Eigen/src/Core/DenseStorage.h \
  ../deps/eigen/Eigen/src/Core/NestByValue.h \
  ../deps/eigen/Eigen/src/Core/ReturnByValue.h \
  ../deps/eigen/Eigen/src/Core/NoAlias.h \
  ../deps/eigen/Eigen/src/Core/PlainObjectBase.h \
  ../deps/eigen/Eigen/src/Core/Matrix.h \
  ../deps/eigen/Eigen/src/Core/Array.h \
  ../deps/eigen/Eigen/src/Core/CwiseTernaryOp.h \
  ../deps/eigen/Eigen/src/Core/CwiseBinaryOp.h \
  ../deps/eigen/Eigen/src/Core/CwiseUnaryOp.h \
  ../deps/eigen/Eigen/src/Core/CwiseNullaryOp.h \
  ../deps/eigen/Eigen/src/Core/CwiseUnaryView.h \
  ../deps/eigen/Eigen/src/Core/SelfCwiseBinaryOp.h \
  ../deps/eigen/Eigen/src/Core/Dot.h \
  ../deps/eigen/Eigen/src/Core/StableNorm.h \
  ../deps/eigen/Eigen/src/Core/Stride.h \
  ../deps/eigen/Eigen/src/Core/MapBase.h \
  ../deps/eigen/Eigen/src/Core/Map.h ../deps/eigen/Eigen/src/Core/Ref.h \
  ../deps/eigen/Eigen/src/Core/Block.h \
  ../deps/eigen/Eigen/src/Core/VectorBlock.h \
  ../deps/eigen/Eigen/src/Core/IndexedView.h \
  ../deps/eigen/Eigen/src/Core/Reshaped.h \
  ../deps/eigen/Eigen/src/Core/Transpose.h \
  ../deps/eigen/Eigen/src/Core/DiagonalMatrix.h \
  ../deps/eigen/Eigen/src/Core/Diagonal.h \
  ../deps/eigen/Eigen/src/Core/DiagonalProduct.h \
  ../deps/eigen/Eigen/src/Core/Redux.h \
  ../deps/eigen/Eigen/src/Core/Visitor.h \
  ../deps/eigen/Eigen/src/Core/Fuzzy.h \
  ../deps/eigen/Eigen/src/Core/Swap.h \
  ../deps/eigen/Eigen/src/Core/CommaInitializer.h \
  ../deps/eigen/Eigen/src/Core/GeneralProduct.h \
  ../deps/eigen/Eigen/src/Core/Solve.h \
  ../deps/eigen/Eigen/src/Core/Inverse.h \
  ../deps/eigen/Eigen/src/Core/SolverBase.h \
  ../deps/eigen/Eigen/src/Core/PermutationMatrix.h \
  ../deps/eigen/Eigen/src/Core/Transpositions.h \
  ../deps/eigen/Eigen/src/Core/TriangularMatrix.h \
  ../deps/eigen/Eigen/src/Core/SelfAdjointView.h \
  ../deps/eigen/Eigen/src/Core/products/GeneralBlockPanelKernel.h \
  ../deps/eigen/Eigen/src/Core/products/Parallelizer.h \
  ../deps/eigen/Eigen/src/Core/ProductEvaluators.h \
  ../deps/eigen/Eigen/src/Core/products/GeneralMatrixVector.h \
  ../deps/eigen/Eigen/src/Core/products/GeneralMatrixMatrix.h \
  ../deps/eigen/Eigen/src/Core/SolveTriangular.h \
  ../deps/eigen/Eigen/src/Core/products/GeneralMatrixMatrixTriangular.h \
  ../deps/eigen/Eigen/src/Core/products/SelfadjointMatrixVector.h \
  ../deps/eigen/Eigen/src/Core/products/SelfadjointMatrixMatrix.h \
  ../deps/eigen/Eigen/src/Core/products/SelfadjointProduct.h \
  ../deps/eigen/Eigen/src/Core/products/SelfadjointRank2Update.h \
  ../deps/eigen/Eigen/src/Core/products/TriangularMatrixVector.h \
  ../deps/eigen/Eigen/src/Core/products/TriangularMatrixMatrix.h \
  ../deps/eigen/Eigen/src/Core/products/TriangularSolverMatrix.h \
  ../deps/eigen/Eigen/src/Core/products/TriangularSolverVector.h \
  ../deps/eigen/Eigen/src/Core/BandMatrix.h \
  ../deps/eigen/Eigen/src/Core/CoreIterators.h \
  ../deps/eigen/Eigen/src/Core/ConditionEstimator.h \
  ../deps/eigen/Eigen/src/Core/arch/NEON/GeneralBlockPanelKernel.h \
  ../deps/eigen/Eigen/src/Core/BooleanRedux.h \
  ../deps/eigen/Eigen/src/Core/Select.h \
  ../deps/eigen/Eigen/src/Core/VectorwiseOp.h \
  ../deps/eigen/Eigen/src/Core/PartialReduxEvaluator.h \
  ../deps/eigen/Eigen/src/Core/Random.h \
  ../deps/eigen/Eigen/src/Core/Replicate.h \
  ../deps/eigen/Eigen/src/Core/Reverse.h \
  ../deps/eigen/Eigen/src/Core/ArrayWrapper.h \
  ../deps/eigen/Eigen/src/Core/StlIterators.h \
  ../deps/eigen/Eigen/src/Core/GlobalFunctions.h \
  ../deps/eigen/Eigen/src/Core/util/ReenableStupidWarnings.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseUtil.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseMatrixBase.h \
  ../deps/eigen/Eigen/src/SparseCore/../plugins/CommonCwiseUnaryOps.h \
  ../deps/eigen/Eigen/src/SparseCore/../plugins/CommonCwiseBinaryOps.h \
  ../deps/eigen/Eigen/src/SparseCore/../plugins/MatrixCwiseUnaryOps.h \
  ../deps/eigen/Eigen/src/SparseCore/../plugins/MatrixCwiseBinaryOps.h \
  ../deps/eigen/Eigen/src/SparseCore/../plugins/BlockMethods.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseAssign.h \
  ../deps/eigen/Eigen/src/SparseCore/CompressedStorage.h \
  ../deps/eigen/Eigen/src/SparseCore/AmbiVector.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseCompressedBase.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseMatrix.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseMap.h \
  ../deps/eigen/Eigen/src/SparseCore/MappedSparseMatrix.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseVector.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseRef.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseCwiseUnaryOp.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseCwiseBinaryOp.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseTranspose.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseBlock.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseDot.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseRedux.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseView.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseDiagonalProduct.h \
  ../deps/eigen/Eigen/src/SparseCore/ConservativeSparseSparseProduct.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseSparseProductWithPruning.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseProduct.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseDenseProduct.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseSelfAdjointView.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseTriangularView.h \
  ../deps/eigen/Eigen/src/SparseCore/TriangularSolver.h \
  ../deps/eigen/Eigen/src/SparseCore/SparsePermutation.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseFuzzy.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseSolverBase.h \
  ../deps/eigen/Eigen/OrderingMethods \
  ../deps/eigen/Eigen/src/OrderingMethods/Amd.h \
  ../deps/eigen/Eigen/src/OrderingMethods/Ordering.h \
  ../deps/eigen/Eigen/src/OrderingMethods/Eigen_Colamd.h \
  ../deps/eigen/Eigen/SparseCholesky \
  ../deps/eigen/Eigen/src/SparseCholesky/SimplicialCholesky.h \
  ../deps/eigen/Eigen/src/SparseCholesky/SimplicialCholesky_impl.h \
  ../deps/eigen/Eigen/SparseLU \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_gemm_kernel.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_Structs.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_SupernodalMatrix.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLUImpl.h \
  ../deps/eigen/Eigen/src/SparseCore/SparseColEtree.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_Memory.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_heap_relax_snode.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_relax_snode.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_pivotL.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_panel_dfs.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_kernel_bmod.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_panel_bmod.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_column_dfs.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_column_bmod.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_copy_to_ucol.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_pruneL.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU_Utils.h \
  ../deps/eigen/Eigen/src/SparseLU/SparseLU.h \
  ../deps/eigen/Eigen/SparseQR \
  ../deps/eigen/Eigen/src/SparseQR/SparseQR.h \
  ../deps/eigen/Eigen/IterativeLinearSolvers \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/SolveWithGuess.h \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/IterativeSolverBase.h \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/BasicPreconditioners.h \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/ConjugateGradient.h \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/LeastSquareConjugateGradient.h \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/BiCGSTAB.h \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/IncompleteLUT.h \
  ../deps/eigen/Eigen/src/IterativeLinearSolvers/IncompleteCholesky.h
../engine.cpp:
/Users/moltoshi/Desktop/plekaim-desktop/native-solver/node_modules/node-addon-api/napi.h:
/Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/node_api.h:
/Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/js_native_api.h:
/Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/js_native_api_types.h:
/Users/moltoshi/Library/Caches/node-gyp/25.5.0/include/node/node_api_types.h:
/Users/moltoshi/Desktop/plekaim-desktop/native-solver/node_modules/node-addon-api/napi-inl.h:
/Users/moltoshi/Desktop/plekaim-desktop/native-solver/node_modules/node-addon-api/napi-inl.deprecated.h:
../deps/eigen/Eigen/Sparse:
../deps/eigen/Eigen/SparseCore:
../deps/eigen/Eigen/Core:
../deps/eigen/Eigen/src/Core/util/DisableStupidWarnings.h:
../deps/eigen/Eigen/src/Core/util/Macros.h:
../deps/eigen/Eigen/src/Core/util/ConfigureVectorization.h:
../deps/eigen/Eigen/src/Core/util/MKL_support.h:
../deps/eigen/Eigen/src/Core/util/Constants.h:
../deps/eigen/Eigen/src/Core/util/Meta.h:
../deps/eigen/Eigen/src/Core/util/ForwardDeclarations.h:
../deps/eigen/Eigen/src/Core/util/StaticAssert.h:
../deps/eigen/Eigen/src/Core/util/XprHelper.h:
../deps/eigen/Eigen/src/Core/util/Memory.h:
../deps/eigen/Eigen/src/Core/util/IntegralConstant.h:
../deps/eigen/Eigen/src/Core/util/SymbolicIndex.h:
../deps/eigen/Eigen/src/Core/NumTraits.h:
../deps/eigen/Eigen/src/Core/MathFunctions.h:
../deps/eigen/Eigen/src/Core/GenericPacketMath.h:
../deps/eigen/Eigen/src/Core/MathFunctionsImpl.h:
../deps/eigen/Eigen/src/Core/arch/Default/ConjHelper.h:
../deps/eigen/Eigen/src/Core/arch/Default/Half.h:
../deps/eigen/Eigen/src/Core/arch/Default/BFloat16.h:
../deps/eigen/Eigen/src/Core/arch/Default/TypeCasting.h:
../deps/eigen/Eigen/src/Core/arch/Default/GenericPacketMathFunctionsFwd.h:
../deps/eigen/Eigen/src/Core/arch/NEON/PacketMath.h:
../deps/eigen/Eigen/src/Core/arch/NEON/TypeCasting.h:
../deps/eigen/Eigen/src/Core/arch/NEON/MathFunctions.h:
../deps/eigen/Eigen/src/Core/arch/NEON/Complex.h:
../deps/eigen/Eigen/src/Core/arch/Default/Settings.h:
../deps/eigen/Eigen/src/Core/arch/Default/GenericPacketMathFunctions.h:
../deps/eigen/Eigen/src/Core/functors/TernaryFunctors.h:
../deps/eigen/Eigen/src/Core/functors/BinaryFunctors.h:
../deps/eigen/Eigen/src/Core/functors/UnaryFunctors.h:
../deps/eigen/Eigen/src/Core/functors/NullaryFunctors.h:
../deps/eigen/Eigen/src/Core/functors/StlFunctors.h:
../deps/eigen/Eigen/src/Core/functors/AssignmentFunctors.h:
../deps/eigen/Eigen/src/Core/util/IndexedViewHelper.h:
../deps/eigen/Eigen/src/Core/util/ReshapedHelper.h:
../deps/eigen/Eigen/src/Core/ArithmeticSequence.h:
../deps/eigen/Eigen/src/Core/IO.h:
../deps/eigen/Eigen/src/Core/DenseCoeffsBase.h:
../deps/eigen/Eigen/src/Core/DenseBase.h:
../deps/eigen/Eigen/src/Core/../plugins/CommonCwiseUnaryOps.h:
../deps/eigen/Eigen/src/Core/../plugins/BlockMethods.h:
../deps/eigen/Eigen/src/Core/../plugins/IndexedViewMethods.h:
../deps/eigen/Eigen/src/Core/../plugins/ReshapedMethods.h:
../deps/eigen/Eigen/src/Core/MatrixBase.h:
../deps/eigen/Eigen/src/Core/../plugins/CommonCwiseBinaryOps.h:
../deps/eigen/Eigen/src/Core/../plugins/MatrixCwiseUnaryOps.h:
../deps/eigen/Eigen/src/Core/../plugins/MatrixCwiseBinaryOps.h:
../deps/eigen/Eigen/src/Core/EigenBase.h:
../deps/eigen/Eigen/src/Core/Product.h:
../deps/eigen/Eigen/src/Core/CoreEvaluators.h:
../deps/eigen/Eigen/src/Core/AssignEvaluator.h:
../deps/eigen/Eigen/src/Core/Assign.h:
../deps/eigen/Eigen/src/Core/ArrayBase.h:
../deps/eigen/Eigen/src/Core/../plugins/ArrayCwiseUnaryOps.h:
../deps/eigen/Eigen/src/Core/../plugins/ArrayCwiseBinaryOps.h:
../deps/eigen/Eigen/src/Core/util/BlasUtil.h:
../deps/eigen/Eigen/src/Core/DenseStorage.h:
../deps/eigen/Eigen/src/Core/NestByValue.h:
../deps/eigen/Eigen/src/Core/ReturnByValue.h:
../deps/eigen/Eigen/src/Core/NoAlias.h:
../deps/eigen/Eigen/src/Core/PlainObjectBase.h:
../deps/eigen/Eigen/src/Core/Matrix.h:
../deps/eigen/Eigen/src/Core/Array.h:
../deps/eigen/Eigen/src/Core/CwiseTernaryOp.h:
../deps/eigen/Eigen/src/Core/CwiseBinaryOp.h:
../deps/eigen/Eigen/src/Core/CwiseUnaryOp.h:
../deps/eigen/Eigen/src/Core/CwiseNullaryOp.h:
../deps/eigen/Eigen/src/Core/CwiseUnaryView.h:
../deps/eigen/Eigen/src/Core/SelfCwiseBinaryOp.h:
../deps/eigen/Eigen/src/Core/Dot.h:
../deps/eigen/Eigen/src/Core/StableNorm.h:
../deps/eigen/Eigen/src/Core/Stride.h:
../deps/eigen/Eigen/src/Core/MapBase.h:
../deps/eigen/Eigen/src/Core/Map.h:
../deps/eigen/Eigen/src/Core/Ref.h:
../deps/eigen/Eigen/src/Core/Block.h:
../deps/eigen/Eigen/src/Core/VectorBlock.h:
../deps/eigen/Eigen/src/Core/IndexedView.h:
../deps/eigen/Eigen/src/Core/Reshaped.h:
../deps/eigen/Eigen/src/Core/Transpose.h:
../deps/eigen/Eigen/src/Core/DiagonalMatrix.h:
../deps/eigen/Eigen/src/Core/Diagonal.h:
../deps/eigen/Eigen/src/Core/DiagonalProduct.h:
../deps/eigen/Eigen/src/Core/Redux.h:
../deps/eigen/Eigen/src/Core/Visitor.h:
../deps/eigen/Eigen/src/Core/Fuzzy.h:
../deps/eigen/Eigen/src/Core/Swap.h:
../deps/eigen/Eigen/src/Core/CommaInitializer.h:
../deps/eigen/Eigen/src/Core/GeneralProduct.h:
../deps/eigen/Eigen/src/Core/Solve.h:
../deps/eigen/Eigen/src/Core/Inverse.h:
../deps/eigen/Eigen/src/Core/SolverBase.h:
../deps/eigen/Eigen/src/Core/PermutationMatrix.h:
../deps/eigen/Eigen/src/Core/Transpositions.h:
../deps/eigen/Eigen/src/Core/TriangularMatrix.h:
../deps/eigen/Eigen/src/Core/SelfAdjointView.h:
../deps/eigen/Eigen/src/Core/products/GeneralBlockPanelKernel.h:
../deps/eigen/Eigen/src/Core/products/Parallelizer.h:
../deps/eigen/Eigen/src/Core/ProductEvaluators.h:
../deps/eigen/Eigen/src/Core/products/GeneralMatrixVector.h:
../deps/eigen/Eigen/src/Core/products/GeneralMatrixMatrix.h:
../deps/eigen/Eigen/src/Core/SolveTriangular.h:
../deps/eigen/Eigen/src/Core/products/GeneralMatrixMatrixTriangular.h:
../deps/eigen/Eigen/src/Core/products/SelfadjointMatrixVector.h:
../deps/eigen/Eigen/src/Core/products/SelfadjointMatrixMatrix.h:
../deps/eigen/Eigen/src/Core/products/SelfadjointProduct.h:
../deps/eigen/Eigen/src/Core/products/SelfadjointRank2Update.h:
../deps/eigen/Eigen/src/Core/products/TriangularMatrixVector.h:
../deps/eigen/Eigen/src/Core/products/TriangularMatrixMatrix.h:
../deps/eigen/Eigen/src/Core/products/TriangularSolverMatrix.h:
../deps/eigen/Eigen/src/Core/products/TriangularSolverVector.h:
../deps/eigen/Eigen/src/Core/BandMatrix.h:
../deps/eigen/Eigen/src/Core/CoreIterators.h:
../deps/eigen/Eigen/src/Core/ConditionEstimator.h:
../deps/eigen/Eigen/src/Core/arch/NEON/GeneralBlockPanelKernel.h:
../deps/eigen/Eigen/src/Core/BooleanRedux.h:
../deps/eigen/Eigen/src/Core/Select.h:
../deps/eigen/Eigen/src/Core/VectorwiseOp.h:
../deps/eigen/Eigen/src/Core/PartialReduxEvaluator.h:
../deps/eigen/Eigen/src/Core/Random.h:
../deps/eigen/Eigen/src/Core/Replicate.h:
../deps/eigen/Eigen/src/Core/Reverse.h:
../deps/eigen/Eigen/src/Core/ArrayWrapper.h:
../deps/eigen/Eigen/src/Core/StlIterators.h:
../deps/eigen/Eigen/src/Core/GlobalFunctions.h:
../deps/eigen/Eigen/src/Core/util/ReenableStupidWarnings.h:
../deps/eigen/Eigen/src/SparseCore/SparseUtil.h:
../deps/eigen/Eigen/src/SparseCore/SparseMatrixBase.h:
../deps/eigen/Eigen/src/SparseCore/../plugins/CommonCwiseUnaryOps.h:
../deps/eigen/Eigen/src/SparseCore/../plugins/CommonCwiseBinaryOps.h:
../deps/eigen/Eigen/src/SparseCore/../plugins/MatrixCwiseUnaryOps.h:
../deps/eigen/Eigen/src/SparseCore/../plugins/MatrixCwiseBinaryOps.h:
../deps/eigen/Eigen/src/SparseCore/../plugins/BlockMethods.h:
../deps/eigen/Eigen/src/SparseCore/SparseAssign.h:
../deps/eigen/Eigen/src/SparseCore/CompressedStorage.h:
../deps/eigen/Eigen/src/SparseCore/AmbiVector.h:
../deps/eigen/Eigen/src/SparseCore/SparseCompressedBase.h:
../deps/eigen/Eigen/src/SparseCore/SparseMatrix.h:
../deps/eigen/Eigen/src/SparseCore/SparseMap.h:
../deps/eigen/Eigen/src/SparseCore/MappedSparseMatrix.h:
../deps/eigen/Eigen/src/SparseCore/SparseVector.h:
../deps/eigen/Eigen/src/SparseCore/SparseRef.h:
../deps/eigen/Eigen/src/SparseCore/SparseCwiseUnaryOp.h:
../deps/eigen/Eigen/src/SparseCore/SparseCwiseBinaryOp.h:
../deps/eigen/Eigen/src/SparseCore/SparseTranspose.h:
../deps/eigen/Eigen/src/SparseCore/SparseBlock.h:
../deps/eigen/Eigen/src/SparseCore/SparseDot.h:
../deps/eigen/Eigen/src/SparseCore/SparseRedux.h:
../deps/eigen/Eigen/src/SparseCore/SparseView.h:
../deps/eigen/Eigen/src/SparseCore/SparseDiagonalProduct.h:
../deps/eigen/Eigen/src/SparseCore/ConservativeSparseSparseProduct.h:
../deps/eigen/Eigen/src/SparseCore/SparseSparseProductWithPruning.h:
../deps/eigen/Eigen/src/SparseCore/SparseProduct.h:
../deps/eigen/Eigen/src/SparseCore/SparseDenseProduct.h:
../deps/eigen/Eigen/src/SparseCore/SparseSelfAdjointView.h:
../deps/eigen/Eigen/src/SparseCore/SparseTriangularView.h:
../deps/eigen/Eigen/src/SparseCore/TriangularSolver.h:
../deps/eigen/Eigen/src/SparseCore/SparsePermutation.h:
../deps/eigen/Eigen/src/SparseCore/SparseFuzzy.h:
../deps/eigen/Eigen/src/SparseCore/SparseSolverBase.h:
../deps/eigen/Eigen/OrderingMethods:
../deps/eigen/Eigen/src/OrderingMethods/Amd.h:
../deps/eigen/Eigen/src/OrderingMethods/Ordering.h:
../deps/eigen/Eigen/src/OrderingMethods/Eigen_Colamd.h:
../deps/eigen/Eigen/SparseCholesky:
../deps/eigen/Eigen/src/SparseCholesky/SimplicialCholesky.h:
../deps/eigen/Eigen/src/SparseCholesky/SimplicialCholesky_impl.h:
../deps/eigen/Eigen/SparseLU:
../deps/eigen/Eigen/src/SparseLU/SparseLU_gemm_kernel.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_Structs.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_SupernodalMatrix.h:
../deps/eigen/Eigen/src/SparseLU/SparseLUImpl.h:
../deps/eigen/Eigen/src/SparseCore/SparseColEtree.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_Memory.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_heap_relax_snode.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_relax_snode.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_pivotL.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_panel_dfs.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_kernel_bmod.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_panel_bmod.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_column_dfs.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_column_bmod.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_copy_to_ucol.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_pruneL.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU_Utils.h:
../deps/eigen/Eigen/src/SparseLU/SparseLU.h:
../deps/eigen/Eigen/SparseQR:
../deps/eigen/Eigen/src/SparseQR/SparseQR.h:
../deps/eigen/Eigen/IterativeLinearSolvers:
../deps/eigen/Eigen/src/IterativeLinearSolvers/SolveWithGuess.h:
../deps/eigen/Eigen/src/IterativeLinearSolvers/IterativeSolverBase.h:
../deps/eigen/Eigen/src/IterativeLinearSolvers/BasicPreconditioners.h:
../deps/eigen/Eigen/src/IterativeLinearSolvers/ConjugateGradient.h:
../deps/eigen/Eigen/src/IterativeLinearSolvers/LeastSquareConjugateGradient.h:
../deps/eigen/Eigen/src/IterativeLinearSolvers/BiCGSTAB.h:
../deps/eigen/Eigen/src/IterativeLinearSolvers/IncompleteLUT.h:
../deps/eigen/Eigen/src/IterativeLinearSolvers/IncompleteCholesky.h:
