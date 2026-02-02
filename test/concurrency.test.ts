import { describe, expect, test, beforeEach } from "bun:test"
import { MinoMemory } from "../server/core/memory"

describe("identity session", () => {
    let memory: MinoMemory

    beforeEach(async () => {
        memory = new MinoMemory()
    })

    test("tryRegisterRequest should register and return request ID", () => {
        const identity = "user1"
        const requestId = memory.tryRegisterRequest(identity, 5)
        expect(requestId).not.toBeNull()
        expect(memory.getActiveRequests(identity)).toBe(1)
    })

    test("tryRegisterRequest should increment existing value", () => {
        const identity = "user2"
        memory.tryRegisterRequest(identity, 5)
        memory.tryRegisterRequest(identity, 5)
        expect(memory.getActiveRequests(identity)).toBe(2)
    })

    test("unregisterRequest should decrement existing value", () => {
        const identity = "user3"
        const req1 = memory.tryRegisterRequest(identity, 5)
        const req2 = memory.tryRegisterRequest(identity, 5)
        expect(req1).not.toBeNull()
        expect(req2).not.toBeNull()
        memory.unregisterRequest(identity, req1!)
        expect(memory.getActiveRequests(identity)).toBe(1)
    })

    test("tryRegisterRequest should respect concurrency limit", () => {
        const identity = "user4"
        const limit = 2
        const req1 = memory.tryRegisterRequest(identity, limit)
        const req2 = memory.tryRegisterRequest(identity, limit)
        const req3 = memory.tryRegisterRequest(identity, limit)

        expect(req1).not.toBeNull()
        expect(req2).not.toBeNull()
        expect(req3).toBeNull() // Should fail at limit
        expect(memory.getActiveRequests(identity)).toBe(2)
    })

    test("unregisterRequest on nonexistent session returns 0", () => {
        const identity = "unknown"
        const result = memory.unregisterRequest(identity, "fake-request-id")
        expect(result).toBe(0)
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

    test("setRequestAllocatedKey and clearRequestAllocatedKey work correctly", () => {
        const identity = "user6"
        const requestId = memory.tryRegisterRequest(identity, 5)
        expect(requestId).not.toBeNull()

        memory.setRequestAllocatedKey(identity, requestId!, "test-key-123")

        const session = memory.getSession(identity)
        expect(session).not.toBeUndefined()
        const request = session!.activeRequests.get(requestId!)
        expect(request).not.toBeUndefined()
        expect(request!.allocatedKeyId).toBe("test-key-123")

        memory.clearRequestAllocatedKey(identity, requestId!)
        expect(request!.allocatedKeyId).toBeNull()
    })
})
