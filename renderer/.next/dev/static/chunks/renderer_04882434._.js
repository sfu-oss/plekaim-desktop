(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/renderer/node_modules/xlsx/xlsx.mjs [app-client] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.resolve().then(() => {
        return parentImport("[project]/renderer/node_modules/xlsx/xlsx.mjs [app-client] (ecmascript)");
    });
});
}),
"[project]/renderer/node_modules/jspdf/dist/jspdf.es.min.js [app-client] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "static/chunks/ccefd_9b5f7567._.js",
  "static/chunks/ccefd_a340dab5._.js",
  "static/chunks/ccefd_jspdf_dist_jspdf_es_min_fcd8506a.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/renderer/node_modules/jspdf/dist/jspdf.es.min.js [app-client] (ecmascript)");
    });
});
}),
"[project]/renderer/lib/ple-fem.ts [app-client] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "static/chunks/renderer_lib_ple-fem_ts_5c01dbd2._.js",
  "static/chunks/renderer_lib_ple-fem_ts_fcd8506a._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/renderer/lib/ple-fem.ts [app-client] (ecmascript)");
    });
});
}),
]);