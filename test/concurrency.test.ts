import { describe, expect, test, beforeEach } from "bun:test"
import { MinoMemory } from "../server/core/memory"

describe("identity session", () => {
    let memory: MinoMemory

    beforeEach(async () => {
        memory = new MinoMemory()
    })

    test("incrActiveRequests should initialize to 1", () => {
        const identity = "user1"
        memory.incrActiveRequests(identity)
        expect(memory.getActiveRequests(identity)).toBe(1)
    })

    test("incrActiveRequests should increment existing value", () => {
        const identity = "user2"
        memory.incrActiveRequests(identity)
        memory.incrActiveRequests(identity)
        expect(memory.getActiveRequests(identity)).toBe(2)
    })

    test("decrActiveRequests should decrement existing value", () => {
        const identity = "user3"
        memory.incrActiveRequests(identity)
        memory.incrActiveRequests(identity)
        memory.decrActiveRequests(identity)
        expect(memory.getActiveRequests(identity)).toBe(1)
    })

    test("decrActiveRequests should not go below 0", () => {
        const identity = "user4"
        memory.decrActiveRequests(identity)
        expect(memory.getActiveRequests(identity)).toBe(0)

        memory.incrActiveRequests(identity)
        memory.decrActiveRequests(identity)
        memory.decrActiveRequests(identity)
        expect(memory.getActiveRequests(identity)).toBe(0)
    })

    test("cooldown should be settable and retrievable", () => {
        const identity = "user5"
        const expiresAt = Date.now() + 10000

        memory.setCooldown(identity, "chat_completion", expiresAt)
        expect(memory.getCooldown(identity, "chat_completion")).toBe(expiresAt)
    })

    test("getCooldown returns 0 for unknown identity", () => {
        expect(memory.getCooldown("unknown", "default")).toBe(0)
    })
})
