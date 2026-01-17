import { describe, expect, test, beforeEach } from "bun:test"
import { MinoMemory } from "../server/core/memory"

describe("identity concurrency", () => {
    let memory: MinoMemory

    beforeEach(async () => {
        memory = new MinoMemory()
    })

    test("incr should initialize to 1", () => {
        const identity = "user1"
        memory.identityConcurrency.incr(identity)
        expect(memory.identityConcurrency.get(identity)).toBe(1)
    })

    test("incr should increment existing value", () => {
        const identity = "user2"
        memory.identityConcurrency.incr(identity)
        memory.identityConcurrency.incr(identity)
        expect(memory.identityConcurrency.get(identity)).toBe(2)
    })

    test("decr should decrement existing value", () => {
        const identity = "user3"
        memory.identityConcurrency.incr(identity)
        memory.identityConcurrency.incr(identity) // 2
        memory.identityConcurrency.decr(identity)
        expect(memory.identityConcurrency.get(identity)).toBe(1)
    })

    test("decr should not go below 0", () => {
        const identity = "user4"
        memory.identityConcurrency.decr(identity)
        expect(memory.identityConcurrency.get(identity)).toBe(0)

        memory.identityConcurrency.incr(identity) // 1
        memory.identityConcurrency.decr(identity) // 0
        memory.identityConcurrency.decr(identity) // 0
        expect(memory.identityConcurrency.get(identity)).toBe(0)
    })
})
