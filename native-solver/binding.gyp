{
  "targets": [
    {
      "target_name": "kaimple_engine",
      "sources": ["engine.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "deps/eigen"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "cflags_cc": ["-std=c++17", "-O3", "-DNDEBUG"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "CLANG_CXX_LIBRARY": "libc++",
        "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
        "OTHER_CPLUSPLUSFLAGS": ["-O3", "-DNDEBUG"]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c++17", "/O2"],
          "ExceptionHandling": 1
        }
      }
    }
  ]
}
