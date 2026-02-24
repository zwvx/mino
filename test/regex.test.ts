import { describe, test, expect } from "bun:test";
import { performance } from "perf_hooks";

describe("Regex Performance Benchmarks", () => {
    const iters = 1_000_000;

    const uas = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "openclaw/1.0",
        "OpenClaw-Gateway/2.0 (linux)",
        "Some other OpenClaw-Gateway/3.0 with long text following it that might cause backtracking issues if not careful"
    ];

    const titles = [
        "Normal Title without any parenthesis",
        "OpenClaw(test)",
        "OpenClaw(something else entire line) with more trailing text",
        "OpenClaw(a) (b) (c) (d)"
    ];

    test("User-Agent regex: Original vs Optimized", () => {
        const reUaOld = /openclaw|OpenClaw-Gateway\/.*/;
        const reUaNew = /openclaw|openclaw-gateway\//i;

        const startOld = performance.now();
        for (let i = 0; i < iters; i++) {
            for (const ua of uas) {
                reUaOld.test(ua);
            }
        }
        const endOld = performance.now();

        const startNew = performance.now();
        for (let i = 0; i < iters; i++) {
            for (const ua of uas) {
                reUaNew.test(ua);
            }
        }
        const endNew = performance.now();

        console.log(`User-Agent regex benchmark (${iters} iterations per UA):`);
        console.log(`Original: ${(endOld - startOld).toFixed(2)}ms`);
        console.log(`Optimized: ${(endNew - startNew).toFixed(2)}ms`);

        expect(endNew).toBeLessThanOrEqual(endOld * 1.5);
    });

    test("X-Title regex: Original vs Optimized", () => {
        const reTitleOld = /OpenClaw\(.+\)/;
        const reTitleNew = /OpenClaw\([^)]+\)/;

        const startOld = performance.now();
        for (let i = 0; i < iters; i++) {
            for (const t of titles) {
                reTitleOld.test(t);
            }
        }
        const endOld = performance.now();

        const startNew = performance.now();
        for (let i = 0; i < iters; i++) {
            for (const t of titles) {
                reTitleNew.test(t);
            }
        }
        const endNew = performance.now();

        console.log(`X-Title regex benchmark (${iters} iterations per Title):`);
        console.log(`Original: ${(endOld - startOld).toFixed(2)}ms`);
        console.log(`Optimized: ${(endNew - startNew).toFixed(2)}ms`);

        expect(reTitleOld.test("OpenClaw(test)")).toBe(true);
        expect(reTitleNew.test("OpenClaw(test)")).toBe(true);
    });
});
