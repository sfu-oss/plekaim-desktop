module.exports = [
"[project]/renderer/node_modules/xlsx/xlsx.mjs [app-ssr] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.resolve().then(() => {
        return parentImport("[project]/renderer/node_modules/xlsx/xlsx.mjs [app-ssr] (ecmascript)");
    });
});
}),
"[project]/renderer/node_modules/jspdf/dist/jspdf.node.min.js [app-ssr] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/ssr/ccefd_html2canvas_dist_html2canvas_esm_4b750adb.js",
  "server/chunks/ssr/ccefd_core-js_237e6791._.js",
  "server/chunks/ssr/ccefd_canvg_lib_index_cjs_12d0e47f._.js",
  "server/chunks/ssr/ccefd_pako_dist_pako_esm_mjs_0085f8ec._.js",
  "server/chunks/ssr/ccefd_jspdf_dist_jspdf_node_min_2249e3ee.js",
  "server/chunks/ssr/ccefd_51e1e1b4._.js",
  "server/chunks/ssr/[externals]__8f2e6ae9._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/renderer/node_modules/jspdf/dist/jspdf.node.min.js [app-ssr] (ecmascript)");
    });
});
}),
"[project]/renderer/lib/ple-fem.ts [app-ssr] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "server/chunks/ssr/renderer_lib_ple-fem_ts_a0fc361b._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[project]/renderer/lib/ple-fem.ts [app-ssr] (ecmascript)");
    });
});
}),
];